# 쌤핀 AI 지원봇 구축 계획서

> **목표**: 쌤핀 레포지토리를 학습한 RAG 기반 AI 챗봇으로 Tawk.to를 대체
> **작성일**: 2026-03-07

---

## 1. 프로젝트 개요

### 1.1 목적
- 사용자(교사)의 사용법 질문에 AI가 즉시 자동 응답
- AI가 해결할 수 없는 요청(버그 신고, 기능 제안)은 개발자 이메일로 전달
- Tawk.to 제거, 자체 챗봇 위젯으로 대체

### 1.2 핵심 요구사항
| 항목 | 설명 |
|------|------|
| **답변 정확도** | 레포지토리 + 사용 가이드 기반 RAG, 환각 최소화 |
| **사용자 친화 UX** | 교사가 편하게 쓸 수 있는 깔끔한 채팅 UI |
| **보안** | 소스코드 직접 노출 금지, 임베딩만 저장 |
| **에스컬레이션** | AI 한계 시 이메일 전달 (Gmail API) |
| **비용** | 무료/최소 비용 (Gemini 무료 티어 활용) |

### 1.3 적용 위치
- **A) 랜딩페이지** (ssampin.vercel.app) — 웹 채팅 위젯
- **B) 쌤핀 앱 내부** — 도움말 패널 (Electron)

---

## 2. 아키텍처

### 2.1 전체 구조

```
┌──────────────────────────────────────────────────────────┐
│  프론트엔드 (채팅 위젯)                                      │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │ 랜딩페이지(Next.js)│  │ Electron 앱 내부  │                │
│  └────────┬────────┘  └────────┬────────┘                │
│           └────────┬───────────┘                          │
│                    ▼                                      │
│  ┌─────────────────────────────────────┐                  │
│  │  Supabase Edge Function (API)       │                  │
│  │  POST /functions/v1/ssampin-chat    │                  │
│  │                                     │                  │
│  │  1. 사용자 질문 수신                   │                  │
│  │  2. 질문 임베딩 생성 (Gemini)          │                  │
│  │  3. 벡터 검색 (pgvector)              │                  │
│  │  4. 관련 문서 + 질문 → LLM 답변 생성   │                  │
│  │  5. 에스컬레이션 판단                   │                  │
│  │     → AI 답변 가능: 응답 반환           │                  │
│  │     → AI 한계: 이메일 전달 + 안내       │                  │
│  └──────────┬──────────────────────────┘                  │
│             │                                             │
│  ┌──────────▼──────────────────────────┐                  │
│  │  Supabase PostgreSQL (pgvector)     │                  │
│  │  - documents 테이블 (임베딩 저장)      │                  │
│  │  - conversations 테이블 (대화 로그)    │                  │
│  │  - feedback 테이블 (에스컬레이션)      │                  │
│  └─────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
[사용자 질문]
    ↓
[임베딩 생성] — gemini-embedding-001 (outputDimensionality: 768)
    ↓
[벡터 유사도 검색] — pgvector (상위 5개 문서)
    ↓
[컨텍스트 조합] — 관련 문서 + 시스템 프롬프트 + 질문
    ↓
[LLM 답변 생성] — gemini-2.5-flash-lite (무료 티어)
    ↓
[에스컬레이션 판단]
    ├── 답변 가능 → 사용자에게 응답
    └── 한계 → 이메일 폼 표시 → Gmail API로 전달
```

---

## 3. 기술 스택

| 분류 | 기술 | 이유 |
|------|------|------|
| **벡터 DB** | Supabase pgvector | 이미 Supabase 사용 중, 무료 티어 |
| **임베딩** | gemini-embedding-001 | 3072차원 (조절 가능), 무료 티어, 한국어 우수 |
| **LLM** | gemini-2.5-flash-lite | 무료 티어, 초저가 ($0.10/$0.40 per 1M), 빠름 |
| **API** | Supabase Edge Functions (Deno) | 서버리스, 무료 50만 호출/월 |
| **이메일** | Gmail API (또는 Resend) | 에스컬레이션 알림 |
| **프론트** | React 컴포넌트 | 랜딩(Next.js) + 앱(Electron) 공유 |

> ⚠️ **모델 변경 이력 (2026-03-07)**
> - ~~text-embedding-004~~ → **gemini-embedding-001** (text-embedding-004는 2026-01-14 폐기)
> - ~~Gemini 2.0 Flash~~ → **gemini-2.5-flash-lite** (더 저렴하고 무료 티어 지원)
> - 임베딩 차원: 768 → **768 (outputDimensionality 지정)** 또는 기본 3072

### 3.1 비용 추정 (월)

| 항목 | 무료 한도 | 예상 사용량 | 비용 |
|------|----------|-----------|------|
| Gemini API (LLM) | 무료 티어 RPM 제한 | 하루 ~50건 | **$0** |
| Gemini API (임베딩) | 무료 티어 | 문서 업데이트 시만 | **$0** |
| Supabase DB | 500MB, 50만 Edge 호출 | ~1,500건/월 | **$0** |
| Vercel | 무료 플랜 | 현재 사용 중 | **$0** |
| **합계** | | | **$0/월** |

---

## 4. 임베딩 데이터 전략

### 4.1 임베딩 대상 (보안 고려)

**✅ 포함 (사용자 가이드 성격)**
| 소스 | 설명 | 우선순위 |
|------|------|---------|
| FAQ 데이터 | `landing/src/components/FAQ.tsx`의 Q&A | P0 |
| README.md | 프로젝트 소개, 기능 목록, 설치 방법 | P0 |
| 사용 가이드 (신규 작성) | 기능별 상세 사용법 문서 | P0 |
| CLAUDE.md (일부) | 기능 목록, 아키텍처 개요 (코드 규칙 제외) | P1 |
| 릴리즈 노트 | 버전별 변경사항 | P1 |
| 에러 메시지 목록 | 앱 내 에러 문구 + 해결 방법 | P2 |

**❌ 제외 (보안)**
| 소스 | 제외 이유 |
|------|----------|
| 소스코드 전체 | 코드 직접 노출 방지 |
| .env, API 키 | 보안 |
| electron/ 메인 프로세스 | 내부 구현 |
| 테스트 코드 | 불필요 |

### 4.2 청크 전략

```
- 청크 크기: 500~800 토큰
- 오버랩: 100 토큰
- 메타데이터: { source, category, title, version }
- 카테고리: 'faq' | 'guide' | 'feature' | 'troubleshoot' | 'release'
```

### 4.3 사용 가이드 문서 구조 (신규 작성 필요)

```markdown
# 쌤핀 사용 가이드

## 시작하기
- 설치 방법 (다운로드, 설치 경고 해결)
- 온보딩 마법사 (학교 설정, 시간표)
- 초기 화면 설명

## 시간표
- NEIS 자동 연동
- 직접 입력
- 시간표 수정/삭제

## 자리 배치
- 학생 명단 등록
- 랜덤 배치
- 드래그 앤 드롭 이동
- 내보내기 (한글, 엑셀)

## 위젯 & 대시보드
- 위젯 추가/제거/배치
- 위젯 모드 (항상 위)
- 프리셋

## 쌤도구
- 타이머, 랜덤뽑기, 점수판, 룰렛 등
- 각 도구 사용법

## 메모 & 할일
- 담임 메모 작성
- 할 일 관리
- D-Day 설정

## 일정 관리
- 학급 행사 등록
- 구글 캘린더 연동

## 설정
- PIN 잠금 설정
- 데이터 백업/복원
- 앱 업데이트

## 문제 해결
- 설치 오류 해결
- NEIS 연동 안 됨
- 화면 깨짐
```

---

## 5. 데이터베이스 스키마

### 5.1 Supabase 테이블

```sql
-- 벡터 확장 활성화
create extension if not exists vector;

-- 1. 문서 임베딩 테이블
create table ssampin_docs (
  id bigserial primary key,
  content text not null,                    -- 원본 텍스트 청크
  embedding vector(768) not null,           -- gemini-embedding-001 (outputDimensionality: 768)
  metadata jsonb default '{}',              -- { source, category, title, version }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 벡터 검색 인덱스
create index on ssampin_docs 
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- 2. 대화 로그 테이블
create table ssampin_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,                 -- 브라우저 세션 ID
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb default '[]',               -- 참조된 문서 ID 목록
  created_at timestamptz default now()
);

create index on ssampin_conversations (session_id, created_at);

-- 3. 에스컬레이션 (이메일 전달) 테이블
create table ssampin_escalations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  type text not null check (type in ('bug', 'feature', 'other')),
  summary text not null,                    -- AI가 요약한 내용
  user_email text,                          -- 사용자가 입력한 이메일 (선택)
  user_message text not null,               -- 원본 메시지
  conversation_context jsonb default '[]',  -- 직전 대화 맥락
  email_sent boolean default false,
  created_at timestamptz default now()
);

-- 4. 벡터 검색 함수
create or replace function match_ssampin_docs(
  query_embedding vector(768),  -- outputDimensionality: 768로 맞춤
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    sd.id,
    sd.content,
    sd.metadata,
    1 - (sd.embedding <=> query_embedding) as similarity
  from ssampin_docs sd
  where 1 - (sd.embedding <=> query_embedding) > match_threshold
  order by sd.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

---

## 6. API 설계

### 6.1 Edge Function: `ssampin-chat`

```
POST /functions/v1/ssampin-chat
Content-Type: application/json

Request:
{
  "message": "시간표 연동은 어떻게 해요?",
  "sessionId": "uuid-session-id",
  "history": [                          // 최근 3턴 (선택)
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}

Response (AI 답변):
{
  "type": "answer",
  "message": "시간표 연동 방법을 안내드릴게요!\n\n1. 설정(⚙️)...",
  "sources": ["시간표 연동 가이드", "FAQ"],
  "confidence": 0.92
}

Response (에스컬레이션):
{
  "type": "escalation",
  "message": "이 문제는 개발자에게 직접 전달해 드릴게요. 이메일을 남겨주시면 답변드릴게요!",
  "escalationType": "bug"
}
```

### 6.2 Edge Function: `ssampin-escalate`

```
POST /functions/v1/ssampin-escalate
Content-Type: application/json

Request:
{
  "sessionId": "uuid",
  "type": "bug",               // bug | feature | other
  "message": "자리배치표 좌우 반전됨",
  "email": "user@school.go.kr" // 선택
}

Response:
{
  "ok": true,
  "message": "개발자에게 전달했어요! 빠르게 확인하겠습니다."
}
```

### 6.3 Edge Function: `ssampin-embed` (관리용)

```
POST /functions/v1/ssampin-embed
Authorization: Bearer <admin-key>

Request:
{
  "action": "upsert",
  "documents": [
    {
      "content": "시간표 연동은 설정 > 시간표 설정에서...",
      "metadata": { "source": "guide", "category": "timetable", "title": "시간표 연동" }
    }
  ]
}
```

---

## 7. 시스템 프롬프트

```
당신은 '쌤핀(SsamPin)' 교사용 데스크톱 앱의 AI 도우미입니다.

## 역할
- 쌤핀의 기능과 사용법에 대한 질문에 친절하고 정확하게 답변합니다.
- 제공된 컨텍스트(문서) 기반으로만 답변합니다.
- 모르는 내용은 솔직히 "아직 그 부분은 정보가 없어요"라고 말합니다.

## 규칙
1. 한국어로 답변합니다. 존댓말(~해요, ~드릴게요)을 사용합니다.
2. 답변은 간결하게, 필요하면 단계별로 안내합니다.
3. 소스코드나 내부 구현은 언급하지 않습니다.
4. 다음 경우 에스컬레이션합니다:
   - 버그 신고
   - 기능 제안/요청
   - 개인정보 관련 문의
   - 답변 확신이 50% 미만인 경우
5. 에스컬레이션 시 사용자에게 친절히 안내합니다.
6. 이모지를 적절히 사용해 친근한 분위기를 만듭니다.

## 컨텍스트
{context}

## 대화 히스토리
{history}
```

---

## 8. 프론트엔드 채팅 위젯

### 8.1 공유 컴포넌트 구조

```
ssampin-chat-widget/
├── ChatWidget.tsx          # 메인 위젯 (플로팅 버튼 + 채팅창)
├── ChatWindow.tsx          # 채팅창 UI
├── ChatMessage.tsx         # 메시지 버블
├── ChatInput.tsx           # 입력창 + 전송 버튼
├── EscalationForm.tsx      # 에스컬레이션 폼 (이메일 + 유형 선택)
├── TypingIndicator.tsx     # AI 타이핑 애니메이션
├── useChatbot.ts           # 채팅 로직 훅
├── types.ts                # 타입 정의
└── styles.css              # 위젯 전용 스타일
```

### 8.2 위젯 UI 설계

```
┌─────────────────────────────┐
│  🤖 쌤핀 도우미        ─  ✕ │  ← 헤더 (최소화/닫기)
├─────────────────────────────┤
│                             │
│  👋 안녕하세요!              │  ← AI 인사
│  쌤핀 사용법이 궁금하시면     │
│  편하게 물어봐 주세요!        │
│                             │
│  [시간표 연동] [자리배치]     │  ← 빠른 질문 버튼
│  [쌤도구] [설치 문제]         │
│                             │
│  ─────────────────────────  │
│                             │
│  👤 시간표 연동 어떻게 해요? │  ← 사용자 메시지
│                             │
│  🤖 시간표 연동 방법을       │  ← AI 답변
│     안내드릴게요!            │
│     1. 설정(⚙️) 클릭        │
│     2. 시간표 설정 선택      │
│     3. NEIS 자동 연동 클릭   │
│     ...                     │
│                             │
│  [👍 도움됐어요] [👎 아니요] │  ← 피드백 버튼
│                             │
├─────────────────────────────┤
│  메시지를 입력하세요...  [▶]  │  ← 입력창
└─────────────────────────────┘

         [💬 도움이 필요하세요?]  ← 플로팅 버튼
```

### 8.3 에스컬레이션 UI

AI가 해결 불가 판단 시:

```
┌─────────────────────────────┐
│  📮 개발자에게 전달하기       │
│                             │
│  유형 선택:                  │
│  ● 🐛 버그 신고              │
│  ○ 💡 기능 제안              │
│  ○ 💬 기타 문의              │
│                             │
│  이메일 (선택):              │
│  ┌─────────────────────┐    │
│  │ teacher@school.go.kr│    │
│  └─────────────────────┘    │
│                             │
│  [📮 전달하기]  [취소]       │
└─────────────────────────────┘
```

### 8.4 디자인 토큰

랜딩페이지 + 앱의 기존 디자인 시스템 사용:
```css
--sp-bg: #0f1117;
--sp-card: #1a1d27;
--sp-surface: #14161e;
--sp-border: #2a2d3a;
--sp-text: #e4e4e7;
--sp-muted: #71717a;
--sp-accent: #3b82f6;
```

---

## 9. 보안 설계

### 9.1 API 보안

| 위협 | 대책 |
|------|------|
| **API 남용** | Rate limiting: IP당 10req/min, 세션당 50req/day |
| **프롬프트 인젝션** | 시스템 프롬프트에 가드레일, 입력 길이 제한 (500자) |
| **소스코드 유출** | 임베딩에 코드 미포함, 시스템 프롬프트에 코드 노출 금지 명시 |
| **DDoS** | Supabase Edge Function 자체 보호 + Vercel 방화벽 |
| **개인정보** | 이메일 외 개인정보 수집 안 함, 대화 로그 30일 후 자동 삭제 |

### 9.2 임베딩 데이터 보안

```
✅ 허용: 기능 설명, 사용법, FAQ, 에러 해결법
❌ 금지: 소스코드, API 키, 내부 아키텍처 상세, 사용자 데이터
```

### 9.3 에스컬레이션 이메일 보안
- Gmail API OAuth2 (서비스 계정 또는 Resend API)
- 이메일 내용: AI 요약 + 원본 메시지 + 대화 맥락
- 사용자 이메일은 선택적 수집, 암호화 저장

---

## 10. 구현 단계

### Phase 1: 기반 구축 (2~3일)
- [ ] Supabase 테이블 생성 (ssampin_docs, conversations, escalations)
- [ ] pgvector 확장 + 검색 함수 생성
- [ ] 사용 가이드 문서 작성 (마크다운)
- [ ] 임베딩 생성 스크립트 (문서 → 청크 → Gemini 임베딩 → DB 저장)

### Phase 2: API 개발 (2~3일)
- [ ] Edge Function: `ssampin-chat` (RAG 파이프라인)
- [ ] Edge Function: `ssampin-escalate` (이메일 전달)
- [ ] Edge Function: `ssampin-embed` (관리용, 문서 업데이트)
- [ ] 시스템 프롬프트 튜닝
- [ ] Rate limiting 구현

### Phase 3: 프론트엔드 — 랜딩페이지 (2~3일)
- [ ] 채팅 위젯 컴포넌트 개발 (Next.js)
- [ ] Tawk.to 스크립트 제거
- [ ] 채팅 위젯 삽입
- [ ] 에스컬레이션 폼 UI
- [ ] 반응형 디자인 (모바일 대응)
- [ ] Feedback 섹션 업데이트 ("AI 채팅" 연동)

### Phase 4: 프론트엔드 — Electron 앱 (1~2일)
- [ ] 앱 내 도움말 패널에 동일 위젯 삽입
- [ ] 오프라인 폴백 (기본 FAQ 로컬 표시)
- [ ] 앱 버전/설정 정보 자동 첨부

### Phase 5: 튜닝 & 배포 (1~2일)
- [ ] 답변 품질 테스트 (주요 Q&A 20개 기준)
- [ ] 프롬프트 최적화
- [ ] 에스컬레이션 플로우 테스트
- [ ] 프로덕션 배포
- [ ] 모니터링 (대화 로그 리뷰)

---

## 11. 파일 변경 요약

### 신규 생성

| 파일 | 설명 |
|------|------|
| `supabase/migrations/001_ssampin_chat.sql` | DB 스키마 |
| `supabase/functions/ssampin-chat/index.ts` | 메인 RAG API |
| `supabase/functions/ssampin-escalate/index.ts` | 에스컬레이션 |
| `supabase/functions/ssampin-embed/index.ts` | 임베딩 관리 |
| `docs/user-guide.md` | 사용 가이드 (임베딩 소스) |
| `scripts/embed-docs.ts` | 문서 임베딩 스크립트 |
| `landing/src/components/ChatWidget.tsx` | 채팅 위젯 |
| `landing/src/components/ChatWindow.tsx` | 채팅창 |
| `landing/src/components/ChatMessage.tsx` | 메시지 버블 |
| `landing/src/components/ChatInput.tsx` | 입력창 |
| `landing/src/components/EscalationForm.tsx` | 에스컬레이션 폼 |
| `landing/src/hooks/useChatbot.ts` | 채팅 로직 훅 |
| `src/components/HelpChat/` | Electron 앱용 위젯 (동일 구조) |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `landing/src/app/layout.tsx` | Tawk.to 스크립트 제거, ChatWidget 삽입 |
| `landing/src/types/tawk.d.ts` | 삭제 |
| `landing/src/components/Feedback.tsx` | "채팅 시작" → ChatWidget 연동 |

---

## 12. 임베딩 업데이트 전략

### 자동 업데이트 (CI/CD)
```yaml
# GitHub Actions: 문서 변경 시 자동 재임베딩
on:
  push:
    paths:
      - 'docs/user-guide.md'
      - 'landing/src/components/FAQ.tsx'
      - 'README.md'
```

### 수동 업데이트
```bash
# 전체 재임베딩
npx ts-node scripts/embed-docs.ts --all

# 특정 문서만
npx ts-node scripts/embed-docs.ts --file docs/user-guide.md
```

---

## 13. 성공 지표

| 지표 | 목표 |
|------|------|
| AI 자동 응답률 | 70%+ (에스컬레이션 30% 이하) |
| 답변 만족도 | 👍 비율 80%+ |
| 평균 응답 시간 | < 3초 |
| 에스컬레이션 이메일 전달 성공률 | 99%+ |
| 월 비용 | $0 (무료 티어 내) |

---

## 14. 향후 확장

- **PBL스케치 적용**: 동일 RAG 구조 재사용
- **다국어 지원**: Gemini 다국어 능력 활용
- **대화 분석**: 자주 묻는 질문 자동 추출 → 가이드 보완
- **스트리밍 응답**: SSE로 타이핑 효과
- **이미지 인식**: 스크린샷 첨부 → 문제 자동 파악
