# 🏫 쌤핀 담임 업무 허브 — 최종 통합 기획서 (v2)

> 마지막 업데이트: 2026-03-11

---

## 1. 개요

"담임메모"를 **"담임 업무"**로 확장하여, 담임교사의 핵심 업무를 한 곳에서 관리합니다.

### 🔒 제1원칙: 학생·교사 정보를 서버에 수집하지 않는다

| 데이터 | 저장 위치 | 비고 |
|--------|----------|------|
| 학생 이름, 연락처 | **로컬만** | 절대 서버에 올리지 않음 |
| 학부모 이름, 연락처 | **암호화 후 서버** | adminKey로만 복호화 가능 |
| 설문 응답 데이터 | **번호+응답만 서버** | 이름 없이 번호만 (익명) |
| 상담 예약 슬롯 | **번호만 서버** | 이름은 교사 로컬에서 매칭 |
| 설문/상담 설정 | **서버** | 제목, 질문, 시간대 등 (개인정보 아님) |

서버에는 **"3번이 ○ 응답함"** 만 있고, 3번이 누구인지는 **교사 앱 로컬에서만** 알 수 있음.

### Before → After

```
[Before]                          [After]
담임메모 (독립, 1773줄 모놀리스)    담임 업무 (Homeroom Hub)
자리배치 (독립)                    ├── 📝 기록 (기존 담임메모)
                                   │   ├── 입력 / 통계 / 조회 서브탭
                                   │   └── 상담 완료 시 자동 기록 연동
                                   ├── 📋 설문/체크리스트 (신규) ⭐
                                   │   ├── 모드 A: 교사 직접 체크
                                   │   ├── 모드 B: 학생 자가 응답 (링크 공유)
                                   │   └── 내보내기 (클립보드/엑셀)
                                   ├── 📅 상담 예약 (신규) ⭐
                                   │   ├── 학부모/학생 상담
                                   │   ├── 외부 예약 페이지 (링크 공유)
                                   │   └── → 기록 탭 연동
                                   └── 🪑 자리배치 (기존 이동)
                                       └── 기존 Seating 컴포넌트 임베드
```

### 사이드바 변경
```
[Before]                    [After]
대시보드                     대시보드
시간표                       시간표
학급 자리 배치  ──┐          일정
일정              ├──→      담임 업무 ← 통합!
담임메모    ──────┘          메모
메모                         할 일
할 일                        수업 관리
수업 관리                    즐겨찾기
즐겨찾기                     쌤도구
쌤도구                       급식
급식
```
메뉴 2개 → 1개로 통합. 사이드바가 깔끔해짐.

---

## 2. 탭 구조

```
┌──────────────────────────────────────────────────────────────┐
│  👩‍🏫 담임 업무                                                 │
│                                                              │
│  ┌────────┬────────────────┬──────────────┬──────────────┐   │
│  │📝 기록  │📋 설문/체크리스트 │📅 상담 예약   │🪑 자리배치    │   │
│  └────────┴────────────────┴──────────────┴──────────────┘   │
│  ──────────────────────────────────────────────────────────── │
│  (탭 콘텐츠)                                                  │
└──────────────────────────────────────────────────────────────┘

모바일: 탭 텍스트 생략 → 아이콘만 표시, 또는 좌우 스크롤
```

---

## 3. 📝 기록 탭 (기존 담임메모 리팩토링)

### 변경사항
- 기존 `StudentRecords.tsx` 1,773줄 → **10개 파일로 분리**
- 기능 변경 없음, 구조만 정리

### 분리 후 파일 구조
```
Homeroom/
├── HomeroomPage.tsx              # 탭 컨트롤러 (~80줄)
├── HomeroomTabBar.tsx            # 상단 탭 바
├── Records/
│   ├── RecordsTab.tsx            # 메인 (서브탭: 입력/통계/조회)
│   ├── InputMode.tsx             # 입력 모드
│   ├── ProgressMode.tsx          # 통계 모드
│   ├── SearchMode.tsx            # 조회 모드
│   ├── StudentTimelineView.tsx   # 학생 타임라인
│   ├── DefaultRecordListView.tsx # 기록 리스트
│   ├── InlineRecordEditor.tsx    # 인라인 편집기
│   ├── RecordStatCards.tsx       # 통계 카드들
│   └── recordUtils.ts           # 유틸 함수
├── Survey/                       # 설문/체크리스트 (아래 참조)
├── Consultation/                 # 상담 예약 (아래 참조)
└── shared/
    ├── StudentGrid.tsx           # 학생 번호 그리드 (공용)
    ├── ExportModal.tsx           # 내보내기 공용 모달
    └── DateNavigator.tsx         # 날짜 네비게이터
```

---

## 4. 📋 설문/체크리스트 탭 ⭐ 핵심 신규 기능

### 4-1. 두 가지 모드

```
새 설문/체크리스트 만들기

응답 방식
┌──────────────────┬──────────────────┐
│ ✏️ 내가 직접 체크   │ 📱 학생 자가 응답  │
│                    │                    │
│ 조회 때 터치로      │ 링크/QR 공유 →     │
│ 빠르게 체크         │ 학생이 모바일 응답   │
└──────────────────┴──────────────────┘
```

| | 교사 직접 체크 | 학생 자가 응답 |
|---|-------------|-------------|
| **사용 시점** | 아침 조회, 현장에서 | 사전 조사, 원격 |
| **저장소** | 로컬 (localStorage) | Supabase (익명 경유) → 로컬 동기화 |
| **외부 페이지** | 불필요 | `ssampin.vercel.app/check/:id` |
| **실시간 동기화** | - | ✅ (익명 번호 기반) |
| **예시** | 출석 확인, 급식 인원 | 우유 신청, 교복 사이즈, 동의서 |

### ⚠️ 제1원칙: 학생·교사 정보를 서버에 수집하지 않는다

**학생 자가 응답 모드의 개인정보 보호 설계:**

Supabase에는 **번호 + 응답값만** 저장. **이름은 절대 서버에 올라가지 않음.**

```
[서버 (Supabase)]                [교사 로컬 (localStorage)]
survey_responses:                 학생 명단:
  student_number: 3               3번 = 박지민
  answers: ["○", "초코"]          5번 = 정수빈
  student_number: 5               ...
  answers: ["×"]
                    ↘ 매칭 ↙
              [교사 앱 화면]
              3번 박지민 — ○, 초코
              5번 정수빈 — ×
```

- **서버**: "3번이 ○" → 3번이 누구인지 모름
- **교사 로컬**: 3번 = 박지민 → 서버에 안 올라감
- **결합은 교사 앱에서만** 발생 → 개인정보 보호 ✅

학생이 외부 페이지에서 응답할 때도 **번호만 선택** (이름 입력 없음):
```
학생 번호를 선택해주세요
┌────────────────────────┐
│ ▼ 3번                  │  ← 번호만, 이름 노출 없음
└────────────────────────┘
```

### 4-2. 질문 유형 (3가지)

| 유형 | 사용 예시 | 교사 체크 UI | 학생 응답 UI |
|------|----------|------------|------------|
| **○/×** | 우유 신청, 동의서 제출 | 그리드 탭 (○→×→미응답) | 토글 버튼 |
| **선택형** | 교복 사이즈, 교통편 | 그리드 탭 (옵션 순환) | 라디오 버튼 |
| **텍스트** | 알레르기, 특이사항 | 리스트 + 인라인 입력 | 텍스트 입력창 |

### 4-3. 도메인 설계

```typescript
// domain/entities/Survey.ts

/** 설문/체크리스트 */
export interface Survey {
  readonly id: string;
  readonly title: string;                    // "우유 급식 신청 (3월)"
  readonly description?: string;
  readonly mode: SurveyMode;                 // 'teacher' | 'student'
  readonly questions: readonly SurveyQuestion[];
  readonly dueDate?: string;                 // 마감일
  readonly isArchived: boolean;
  readonly categoryColor: string;
  readonly shareUrl?: string;                // 학생 응답 모드일 때만
  readonly adminKey?: string;
  readonly createdAt: string;
}

export type SurveyMode = 'teacher' | 'student';

/** 질문 */
export interface SurveyQuestion {
  readonly id: string;
  readonly type: QuestionType;
  readonly label: string;                    // "우유 급식을 신청하시겠습니까?"
  readonly options?: readonly string[];      // 선택형일 때
  readonly required: boolean;
}

export type QuestionType = 'yesno' | 'choice' | 'text';

/** 학생 응답 (로컬 — 교사 체크 모드) */
export interface SurveyLocalEntry {
  readonly studentId: string;
  readonly questionId: string;
  readonly value: string | boolean;
  readonly updatedAt: string;
}

/** 학생 응답 (서버 — 학생 응답 모드) */
export interface SurveyResponse {
  readonly id: string;
  readonly surveyId: string;
  readonly studentNumber: number;
  // ⚠️ studentName 없음! 서버에 이름 저장 안 함 (제1원칙)
  readonly answers: readonly SurveyAnswer[];
  readonly submittedAt: string;
}

export interface SurveyAnswer {
  readonly questionId: string;
  readonly value: string | boolean;
}
```

### 4-4. UI — 목록 화면

```
┌──────────────────────────────────────────────┐
│ 📋 설문/체크리스트                [+ 새로 만들기] │
│                                              │
│  ── 진행 중 ──                               │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🟢 우유 급식 신청 (3월)        23/30명  │  │
│  │    📱 학생 응답 · ○/× · 마감 3/15      │  │
│  │    ████████████████░░░░ 77%            │  │
│  │    [링크 공유]                          │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🔵 현장학습 동의서              18/30명  │  │
│  │    📱 학생 응답 · ○/× · 마감 3/20      │  │
│  │    ███████████░░░░░░░░░ 60%            │  │
│  │    [링크 공유]                          │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🟡 오늘 급식 인원 확인          28/30명  │  │
│  │    ✏️ 교사 체크 · ○/× · 오늘 생성       │  │
│  │    ██████████████████░░ 93%            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ── 완료/보관 ──                    [펼치기]  │
└──────────────────────────────────────────────┘
```

카드에서 **모드 표시**: `📱 학생 응답` vs `✏️ 교사 체크`로 구분.
학생 응답 모드일 때만 [링크 공유] 버튼 표시.

### 4-5. UI — 교사 직접 체크 상세 (기존 계획 유지)

```
┌──────────────────────────────────────────────┐
│ ← 오늘 급식 인원 확인           [내보내기] [⋮] │
│   ✏️ 교사 체크 · 28/30명 완료                 │
│                                              │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┐      │
│  │ 1 ○ │ 2 ○ │ 3 × │ 4 ○ │ 5 ○ │ 6 ○ │      │
│  │김민지│이서연│박지민│최예은│정수빈│강민수│      │
│  ├─────┼─────┼─────┼─────┼─────┼─────┤      │
│  │ 7 ○ │ 8 - │ 9 ○ │10 × │11 ○ │12 ○ │      │
│  │ ...                                │      │
│  └─────┴─────┴─────┴─────┴─────┴─────┘      │
│                                              │
│  ○ 신청: 23명  × 미신청: 5명  - 미응답: 2명   │
└──────────────────────────────────────────────┘
```

### 4-6. UI — 학생 자가 응답 상세 (교사 화면)

```
┌──────────────────────────────────────────────┐
│ ← 우유 급식 신청 (3월)   [링크 공유] [내보내기] │
│   📱 학생 응답 · 23/30명 응답 · 마감 3/15     │
│                                              │
│  ── 실시간 응답 현황 ──                       │
│                                              │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┐      │
│  │ 1 ○ │ 2 ○ │ 3 × │ 4 ○ │ 5 ○ │ 6 ○ │      │
│  │김민지│이서연│박지민│최예은│정수빈│강민수│      │
│  │11:02│11:05│11:03│10:58│11:10│(미응)│      │
│  ├─────┼─────┼─────┼─────┼─────┼─────┤      │
│  │ ...                                │      │
│  └─────┴─────┴─────┴─────┴─────┴─────┘      │
│                                              │
│  각 셀에 응답 시간 표시                        │
│  미응답 학생: 회색 + "(미응)" 표시              │
│                                              │
│  ┌──────────────────────────────────┐        │
│  │ 📊 요약                          │        │
│  │ ○ 신청: 23명 (77%)               │        │
│  │ × 미신청: 5명 (17%)              │        │
│  │ 미응답: 2명 (7%) — 6번, 17번     │        │
│  │                                  │        │
│  │ [미응답 학생에게 알림]             │        │
│  └──────────────────────────────────┘        │
└──────────────────────────────────────────────┘
```

### 4-7. UI — 학생 외부 응답 페이지 (모바일) ⭐

`ssampin.vercel.app/check/:id`

```
┌──────────────────────────────────────┐
│                                      │
│  📋 우유 급식 신청 (3월)              │
│  온양여자고등학교 1학년 2반            │
│  마감: 3월 15일                       │
│                                      │
│  ─────────────────────────────       │
│                                      │
│  학생 번호                           │
│  ┌────────────────────────────┐     │
│  │ ▼ 1번                     │     │  ← 번호만! 이름 노출 없음
│  └────────────────────────────┘     │
│                                      │
│  ─────────────────────────────       │
│                                      │
│  Q1. 우유 급식을 신청하시겠습니까?     │
│                                      │
│  ┌─────────────┬─────────────┐      │
│  │   ○ 신청    │   × 미신청   │      │
│  └─────────────┴─────────────┘      │
│                                      │
│  ─────────────────────────────       │
│  (선택형 질문이 있으면)                │
│                                      │
│  Q2. 희망 우유 종류를 선택해주세요     │
│                                      │
│  ○ 흰 우유                           │
│  ○ 초코 우유                         │
│  ○ 딸기 우유                         │
│  ○ 바나나 우유                        │
│                                      │
│  ─────────────────────────────       │
│  (텍스트 질문이 있으면)                │
│                                      │
│  Q3. 알레르기가 있다면 적어주세요      │
│  ┌────────────────────────────┐     │
│  │                            │     │
│  └────────────────────────────┘     │
│                                      │
│          [제출하기 ✓]                 │
│                                      │
│  ⚠️ 제출 후 수정은 담임선생님께       │
│     문의해주세요.                     │
└──────────────────────────────────────┘
```

**인터랙션:**
- 번호 선택 → 질문 응답 → 제출
- 이미 응답한 번호는 "이미 응답하셨습니다" 메시지
- 마감일 지나면 "마감되었습니다" 표시
- 모바일 최적화 (큰 터치 타겟, 간결한 UI)

### 4-8. 새 설문 생성 모달

```
┌──────────────────────────────────────────────┐
│  📋 새 설문/체크리스트 만들기                    │
│                                              │
│  제목                                        │
│  │ 우유 급식 신청 (3월)               │       │
│                                              │
│  응답 방식                                    │
│  ┌──────────────────┬──────────────────┐     │
│  │ ✏️ 내가 직접 체크   │ 📱 학생 자가 응답  │     │
│  └──────────────────┴──────────────────┘     │
│                                              │
│  질문 추가                                    │
│  ┌────────────────────────────────────┐      │
│  │ Q1. 우유 급식 신청 여부        ○/×  │      │
│  │                            [삭제]  │      │
│  ├────────────────────────────────────┤      │
│  │ Q2. 희망 우유 종류          선택형  │      │
│  │   [흰 우유] [초코] [딸기] [바나나]  │      │
│  │                            [삭제]  │      │
│  └────────────────────────────────────┘      │
│  [+ 질문 추가]                                │
│                                              │
│  마감일 (선택)                                │
│  │ 2026-03-15                       │        │
│                                              │
│  색상                                        │
│  (●) 🟢 🔵 🟡 🟣 🔴 ⚫                      │
│                                              │
│                     [취소]  [만들기]           │
└──────────────────────────────────────────────┘
```

**핵심: 질문을 여러 개 추가 가능!**
- 구글 설문지처럼 질문 리스트를 자유롭게 구성
- 간단한 건 질문 1개 (우유 ○/×), 복잡한 건 여러 개 (사이즈 + 색상 + 기타)
- 교사 직접 체크 모드에서 질문이 1개면 → 기존 그리드 UI
- 교사 직접 체크 모드에서 질문이 여러 개면 → 질문별 탭 전환

### 4-9. 내보내기

```
내보내기 형식:

📋 클립보드 (카톡 전달용):
──────────────────
[우유 급식 신청 (3월)]
Q1. 우유 급식 신청 여부
○ 신청 (23명): 1김민지, 2이서연, 4최예은...
× 미신청 (5명): 3박지민, 10임도윤...
미응답 (2명): 8윤서준, 17권진우

Q2. 희망 우유 종류
흰 우유 (8명): 1김민지, 7조현우...
초코 (10명): 2이서연, 4최예은...
딸기 (3명): ...
바나나 (2명): ...
──────────────────

📊 엑셀(CSV):
번호, 이름, Q1.신청여부, Q2.우유종류
1, 김민지, ○, 흰 우유
2, 이서연, ○, 초코
3, 박지민, ×, -
...
```

---

## 5. 📅 상담 예약 탭

### 5-1. 핵심 기능

| 기능 | 설명 |
|------|------|
| 일정 생성 | 날짜별 시간 슬롯 설정, 상담 유형/방식 선택 |
| 링크 공유 | `ssampin.vercel.app/booking/:id` + QR 코드 |
| 예약 현황 | 날짜별 슬롯 → 예약자 확인, 미신청 학생 파악 |
| 내보내기 | 클립보드/CSV |
| 기록 연동 | 상담 완료 → 기록 탭에 자동 연결 |

### 5-2. 상담 유형

```
┌────────────┬────────────┐
│ 👨‍👩‍👧 학부모 상담 │ 🧑‍🎓 학생 상담 │
└────────────┴────────────┘
```

코드 95% 공유, `type: 'parent' | 'student'`로 분기.

### 5-3. 교사 측 — 일정 생성

```
제목: 1학기 학부모 상담
유형: 학부모 상담
방식: ☑ 대면  ☑ 전화  ☐ 화상
시간 단위: 15분

날짜별 설정:
📅 3/17(월) 14:00~17:00  → 12슬롯 자동 생성
📅 3/18(화) 14:00~17:00  → 12슬롯
📅 3/19(수) 09:00~12:00  → 12슬롯
                         총 36슬롯
```

### 5-4. 교사 측 — 예약 현황

```
← 1학기 학부모 상담          [공유] [내보내기]
  28/36 예약 (78%)

  [3/17] [3/18] [3/19]

  14:00 ✅ 1번 김민지 학부모 (대면)
  14:15 ✅ 3번 박지민 학부모 (전화) 📞
  14:30 ⬜ 빈 슬롯
  14:45 ✅ 5번 정수빈 학부모 (대면)
  ...

  ⚠️ 미신청: 6번, 17번, 22번
```

### 5-5. 학부모/학생 측 — 외부 예약 페이지

`ssampin.vercel.app/booking/:id` — 4단계 흐름:
1. **정보 입력**: 학생 번호 선택 + 학부모 이름/연락처 (⚠️ 이 정보는 adminKey로 암호화되어 서버에 저장됨 — 교사만 복호화 가능)
2. **방식 선택**: 대면 / 전화 / 화상
3. **시간 선택**: 날짜 탭 → 가능한 슬롯 터치 (마감 슬롯 회색)
4. **확인 & 예약**: 예약 내용 확인 → 확정

**개인정보 보호**: 학부모가 입력한 이름·연락처는 **adminKey로 AES 암호화** 후 서버에 저장. 서버에서는 복호화 불가, 교사 앱에서만 볼 수 있음.

### 5-6. 동시 예약 방지

```sql
-- Supabase DB 함수: 원자적 예약
CREATE FUNCTION book_consultation_slot(...)
  SELECT ... FOR UPDATE;  -- 행 잠금
  -- 슬롯 상태 확인 → 예약 생성 → 슬롯 마감
```

### 5-7. 기록 탭 연동

상담 예약 상세에서 [✍️ 상담 기록 작성] 버튼:
```
→ 기록 탭으로 전환
→ 학생/날짜/방식 자동 입력
→ 내용만 작성하면 끝
```

---

## 6. 🪑 자리배치 탭

### 변경사항
- 기존 `Seating.tsx` 컴포넌트를 **탭 안에 그대로 임베드**
- 추가 개발 최소화
- Seating 헤더(제목) 제거 (HomeroomPage 헤더와 중복 방지)
- 사이드바에서 `seating` 독립 메뉴 제거

---

## 7. Supabase 스키마 (설문 + 상담 공통)

```sql
-- ═══════════════════════════════════
-- 설문/체크리스트 (학생 응답 모드)
-- ═══════════════════════════════════

CREATE TABLE surveys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  questions jsonb NOT NULL DEFAULT '[]',     -- SurveyQuestion[]
  target_class_name text NOT NULL,
  target_students jsonb NOT NULL DEFAULT '[]',
  due_date date,
  category_color text DEFAULT 'blue',
  admin_key text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE survey_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id uuid REFERENCES surveys(id) ON DELETE CASCADE,
  student_number int NOT NULL,
  -- ⚠️ student_name 없음! 제1원칙: 서버에 이름 저장 안 함
  answers jsonb NOT NULL DEFAULT '[]',       -- SurveyAnswer[]
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(survey_id, student_number)          -- 학생당 1회 응답
);

-- ═══════════════════════════════════
-- 상담 예약
-- ═══════════════════════════════════

CREATE TABLE consultation_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('parent', 'student')),
  methods text[] NOT NULL DEFAULT '{"face"}',
  slot_minutes int NOT NULL DEFAULT 15,
  dates jsonb NOT NULL DEFAULT '[]',
  target_class_name text NOT NULL,
  target_students jsonb NOT NULL DEFAULT '[]',
  message text,
  admin_key text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE consultation_slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid REFERENCES consultation_schedules(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'available'
);

CREATE TABLE consultation_bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid REFERENCES consultation_schedules(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES consultation_slots(id) ON DELETE CASCADE,
  student_number int NOT NULL,
  -- ⚠️ 이름/연락처는 서버에 저장 안 함 (제1원칙)
  -- 학부모 이름·연락처는 암호화된 별도 필드에 저장
  -- 또는 교사 로컬에서만 관리
  booker_info_encrypted text,  -- 교사 adminKey로 암호화된 학부모 정보
  method text NOT NULL,
  memo_encrypted text,         -- 암호화된 메모
  created_at timestamptz DEFAULT now(),
  UNIQUE(schedule_id, slot_id)
);

-- RLS 정책
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_bookings ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 + 응답 생성 (외부 페이지용)
CREATE POLICY "Public read" ON surveys FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON survey_responses FOR SELECT TO anon USING (true);
CREATE POLICY "Public insert" ON survey_responses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public read" ON consultation_schedules FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON consultation_slots FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON consultation_bookings FOR SELECT TO anon USING (true);
CREATE POLICY "Public insert" ON consultation_bookings FOR INSERT TO anon WITH CHECK (true);

-- 교사(service_role) 전체 권한
CREATE POLICY "Service all" ON surveys FOR ALL TO service_role USING (true);
CREATE POLICY "Service all" ON survey_responses FOR ALL TO service_role USING (true);
CREATE POLICY "Service all" ON consultation_schedules FOR ALL TO service_role USING (true);
CREATE POLICY "Service all" ON consultation_slots FOR ALL TO service_role USING (true);
CREATE POLICY "Service all" ON consultation_bookings FOR ALL TO service_role USING (true);

-- 동시 예약 방지 함수
CREATE OR REPLACE FUNCTION book_consultation_slot(
  p_schedule_id uuid, p_slot_id uuid,
  p_student_number int, p_student_name text,
  p_booker_name text, p_booker_phone text,
  p_method text, p_memo text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE v_status text; v_booking_id uuid;
BEGIN
  SELECT status INTO v_status FROM consultation_slots
  WHERE id = p_slot_id AND schedule_id = p_schedule_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN '{"success":false,"error":"not_found"}'::jsonb; END IF;
  IF v_status != 'available' THEN RETURN '{"success":false,"error":"already_booked"}'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM consultation_bookings WHERE schedule_id = p_schedule_id AND student_number = p_student_number)
  THEN RETURN '{"success":false,"error":"student_already_booked"}'::jsonb; END IF;
  INSERT INTO consultation_bookings (schedule_id,slot_id,student_number,booker_info_encrypted,method,memo_encrypted)
  VALUES (p_schedule_id,p_slot_id,p_student_number,p_booker_info,p_method,p_memo)
  RETURNING id INTO v_booking_id;
  UPDATE consultation_slots SET status='booked' WHERE id=p_slot_id;
  RETURN jsonb_build_object('success',true,'bookingId',v_booking_id);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 8. 기존 요소 재활용 맵

| 재활용 대상 | 원래 위치 | 활용처 |
|-----------|----------|-------|
| **Student 엔티티** | `domain/entities/Student.ts` | 설문, 상담 모두 |
| **useStudentStore** | `stores/useStudentStore.ts` | 학생 명단 |
| **출결 학생 그리드** | `AttendanceTab.tsx` | 설문 교사 체크 UI |
| **Assignment 아키텍처** | `Tools/Assignment/` | 설문·상담의 "링크 공유→외부 접속→결과" 흐름 |
| **ShareLinkModal** | `Assignment/ShareLinkModal.tsx` | QR + 링크 복사 |
| **Seating 컴포넌트** | `Seating/Seating.tsx` | 자리배치 탭 (그대로 임베드) |
| **Export 프레임워크** | `Export/Export.tsx` | 내보내기 기능 |
| **카테고리 색상** | `CATEGORY_COLOR_PRESETS` | 설문 카드 색상 |
| **Toast** | `common/Toast` | 저장/복사 알림 |
| **DateNavigator** | `StudentRecords/DateNavigator.tsx` | 마감일 UI |

---

## 9. 파일 구조 (전체)

```
src/
├── domain/
│   ├── entities/
│   │   ├── Survey.ts                          # 🆕 설문/체크리스트
│   │   ├── Consultation.ts                    # 🆕 상담 예약
│   │   └── (기존: Student, StudentRecord, Attendance...)
│   ├── rules/
│   │   ├── surveyRules.ts                     # 🆕 집계/필터/내보내기
│   │   └── consultationRules.ts               # 🆕
│   └── repositories/
│       ├── ISurveyRepository.ts               # 🆕
│       └── IConsultationRepository.ts         # 🆕
│
├── usecases/
│   ├── survey/
│   │   ├── ManageSurveys.ts                   # 🆕 CRUD
│   │   └── ExportSurvey.ts                    # 🆕 내보내기
│   └── consultation/
│       ├── CreateConsultation.ts              # 🆕
│       ├── GetConsultations.ts               # 🆕
│       └── ExportConsultation.ts             # 🆕
│
├── adapters/
│   ├── stores/
│   │   ├── useSurveyStore.ts                  # 🆕 (로컬 + Supabase 하이브리드)
│   │   └── useConsultationStore.ts            # 🆕
│   └── components/
│       └── Homeroom/                          # 📁 리네임: StudentRecords → Homeroom
│           ├── HomeroomPage.tsx               # 🆕 탭 컨트롤러
│           ├── HomeroomTabBar.tsx             # 🆕
│           ├── Records/                       # ✏️ 기존 분리
│           │   ├── RecordsTab.tsx
│           │   ├── InputMode.tsx
│           │   ├── ProgressMode.tsx
│           │   ├── SearchMode.tsx
│           │   └── (서브 컴포넌트들...)
│           ├── Survey/                        # 🆕
│           │   ├── SurveyTab.tsx              # 목록
│           │   ├── SurveyDetail.tsx           # 상세 (교사 체크 + 학생 응답 현황)
│           │   ├── SurveyCreateModal.tsx      # 생성
│           │   └── SurveyExportModal.tsx      # 내보내기
│           ├── Consultation/                  # 🆕
│           │   ├── ConsultationTab.tsx
│           │   ├── ConsultationDetail.tsx
│           │   ├── ConsultationCreateModal.tsx
│           │   └── ConsultationExportModal.tsx
│           └── shared/
│               ├── StudentGrid.tsx            # 🆕 공용 학생 그리드
│               ├── ExportModal.tsx            # 🆕 공용 내보내기
│               └── DateNavigator.tsx
│
├── infrastructure/
│   └── supabase/
│       ├── SurveySupabaseClient.ts            # 🆕
│       └── ConsultationSupabaseClient.ts      # 🆕
│
└── widgets/items/
    ├── SurveyWidget.tsx                       # 🆕 설문 위젯
    └── (기존 위젯들...)

landing/
├── src/app/
│   ├── check/[id]/page.tsx                    # 🆕 학생 설문 응답
│   └── booking/[id]/page.tsx                  # 🆕 상담 예약
├── src/components/
│   ├── check/                                 # 🆕 설문 응답 컴포넌트들
│   └── booking/                               # 🆕 상담 예약 컴포넌트들
└── supabase/migrations/
    └── 008_survey_consultation_tables.sql     # 🆕
```

---

## 10. 실행 순서

### Phase 1: 구조 정리 (기능 변경 없음)
```
프롬프트 1: StudentRecords.tsx → Homeroom/ 폴더 10개 파일로 분리
프롬프트 2: HomeroomPage 탭 컨트롤러 + 사이드바 변경 + 자리배치 탭 임베드
프롬프트 3: StudentGrid 공용 컴포넌트 추출
```

### Phase 2: 설문/체크리스트
```
프롬프트 4: Survey 도메인 + 스토어 + SurveyTab 목록
프롬프트 5: SurveyCreateModal (질문 추가, 모드 선택)
프롬프트 6: SurveyDetail — 교사 직접 체크 (StudentGrid 활용)
프롬프트 7: Supabase 테이블 + 학생 외부 응답 페이지 (landing/check/[id])
프롬프트 8: SurveyDetail — 학생 응답 현황 실시간 + 내보내기 + 위젯
```

### Phase 3: 상담 예약
```
프롬프트 9: Consultation 도메인 + Supabase 스키마 + 스토어
프롬프트 10: ConsultationCreateModal + ConsultationTab
프롬프트 11: ConsultationDetail (예약 현황 + 내보내기)
프롬프트 12: 외부 예약 페이지 (landing/booking/[id])
프롬프트 13: 상담 → 기록 연동 브릿지 + 위젯
```

**총 예상: 13개 프롬프트, 4~5일 작업**

---

## 11. 외부 페이지 공통 패턴

설문 응답(`/check/:id`)과 상담 예약(`/booking/:id`)은 동일한 패턴:

```
[공통 구조]
1. Supabase에서 데이터 조회 (id로)
2. 학생 번호 선택
3. 폼 입력
4. 확인 단계
5. 제출 → Supabase에 저장
6. 완료 화면

[공통 컴포넌트]
- StudentSelector (번호 선택 드롭다운)
- ConfirmStep (제출 전 확인)
- CompleteScreen (완료 메시지)
- ErrorScreen (만료/없는 페이지)

[공통 스타일]
- 라이트 테마 (공개 페이지)
- 모바일 최적화
- 큰 터치 타겟
- 한국어 UI
```

---

## 12. 위험 요소 & 대응

| 위험 | 대응 |
|------|------|
| 1,773줄 분리 시 import 누락 | Phase 1에서 빌드 통과 확인 후 다음 단계 |
| localStorage→Supabase 하이브리드 복잡 | 교사 체크=로컬, 학생 응답=서버로 명확 분리 |
| 탭 4개 모바일 좁음 | 아이콘만 표시 or 스크롤 가능 탭 |
| 자리배치 임베드 시 헤더 중복 | Seating에 `embedded` prop 추가 → 헤더 숨김 |
| 설문 질문 여러 개일 때 교사 체크 UI 복잡 | 질문별 탭 전환으로 해결 |
| 동시 예약 충돌 | DB `FOR UPDATE` 행 잠금 |