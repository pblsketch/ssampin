---
template: ops-checklist
version: 0.1
feature: collab-board
phase: 1a → 1b graduation
date: 2026-04-21
status: ready
related:
  - docs/01-plan/features/collab-board-phase1b.plan.md §6 Q7
  - docs/04-report/features/collab-board.report.md
  - docs/03-analysis/collab-board.qa-checklist.md
---

# 협업 보드(Collab Board) Phase 1a 베타 졸업 체크리스트

> **목적**: Phase 1a MVP가 v1.10.3에서 BETA 배지로 출시된 후, Phase 1b 완료 시점에 베타 졸업 조건을 명확히 정의한다.
>
> **배경**: ToolCollabBoard.tsx line 55-74 및 FeedbackWallView.tsx line 102-119에 BETA 배지와 Google Form 피드백 링크가 있다. 현재는 피드백 수집 단계이며, Phase 1b 착수 전에 졸업 기준을 사전 정의함으로써 1b 완료 후 신속한 배지 제거를 지원한다.
>
> **적용 범위**: 협업 보드 기능만. 발제피드백(FeedbackWallView)은 Phase 3 대기 상태이므로 별도 판단.

---

## 1. 기능 안정성 (MUST)

### 1.1 치명적 버그 0건

- [ ] **크래시/앱 강제 종료**: 세션 시작 → 학생 10명 이상 드로잉 → 30분 유휴 시 앱 비정상 종료 없음 (교사 Windows 환경 + 학생 iOS/Android)
- [ ] **데이터 손실**: 자동 저장 실패 후 세션 재진입 시 이전 드로잉 모두 복원 확인. `userData/data/boards/*.ybin` 파일 존재 및 크기 증가 추적
- [ ] **학생 진입 불가**: QR 스캔 직후 이름 입력 모달 표시되고, 입력 후 "이름 저장"/"취소" 버튼 클릭 가능. WebSocket close 1008/1013 발생 시 "연결할 수 없습니다" 오버레이 노출

### 1.2 Step 8 수동 QA 체크리스트 MUST 항목 전부 PASS

- [ ] **섹션 1 (Happy Path)**: 보드 생성 → 세션 시작(5초) → QR 스캔 → 이름 입력 → 드로잉(200ms 동기화) → 30초 자동 저장 → 종료 → 재진입 완벽 동작
- [ ] **섹션 2 (인증)**: 잘못된 토큰/코드/기종료 세션 재접속 시 모두 1008 close 코드 발생
- [ ] **섹션 3.2 (서버 레벨 터널 배타)**: 투표 도구 실행 중 보드 시작 → `BOARD_TUNNEL_BUSY` Toast 발생 및 세션 거부
- [ ] **섹션 4.1/4.2 (자동·수동 저장)**: "마지막 자동 저장" 문구가 30초마다 갱신되고, "지금 저장" 버튼 클릭 시 즉시 반영
- [ ] **섹션 5.2/5.3 (이름 거부·접속자 실시간)**: 빈 이름 입력 시 "이름을 입력해주세요" 경고. 학생 입장/퇴장 시 1초 내 교사 UI 칩 업데이트
- [ ] **섹션 7 (heartbeat)**: 학생 기기 유휴 60초 후에도 연결 끊김 배지 없음 (25초 heartbeat 동작 확인)
- [ ] **섹션 10 (회귀)**: 투표, 설문, 워드클라우드, 토론, 멀티설문 5개 도구 모두 독립적 동작. 협업 보드 진행 중 다른 도구 종료 시 기존 도구 비정상 종료 없음

### 1.3 실제 교실 수업 3회 이상 사용 검증

- [ ] **기간**: 베타 배포 후 2~4주 (2026-04-20 ~ 2026-05-10)
- [ ] **사용자**: 초·중·고 교사 최소 3명 (각 1회 이상)
- [ ] **규모**: 학생 10명 이상 동시 접속 (또는 최대 교실 인원)
- [ ] **결과 기록**: 각 수업마다 "사용 대상 / 학생수 / 사용 시간 / 발생 이슈" 간단히 기록. 큰 문제 발생 시 즉시 보고, 경미한 불편은 Form 응답으로 수집

---

## 2. 피드백 수집 (MUST)

### 2.1 Google Form 응답 최소 3건 이상

- [ ] **수집 경로**: `ToolCollabBoard.tsx` 줄 65 및 `FeedbackWallView.tsx` 줄 112의 Google Form 링크(`https://forms.gle/o1X4zLYocUpFKCzy7`)
- [ ] **응답 확인**: Google Form 응답 탭에서 "협업 보드" 관련 응답 3건 이상 존재. 응답 타입(버그/개선 요청/기능 제안) 무관
- [ ] **최소 인원**: 응답자 최소 2명 이상 (중복 제출 제외)

### 2.2 Form 응답 수동 분류 완료

- [ ] **분류 기준**: Phase 1b Plan §6 Q7 결정안 "C안 수동" 적용 — Google Form 응답을 아래 3가지로 분류
  - **bug-hotfix**: 세션 진입 불가 / 데이터 손실 / 앱 크래시 등 기능 미충족 버그 → 즉시 해결 필요
  - **collab-board-ux**: "드로잉이 늦게 반영됨" / "QR이 작아서 스캔 힘듦" / 페이지 시스템 요청 등 협업 보드 UX 개선
  - **other**: 발제피드백·기타 기능 제안·칭찬 등
- [ ] **수동 분류 위치**: `docs/03-analysis/collab-board-form-responses.md` 생성 후 응답 원문 + 분류 기록
- [ ] **분류 검증**: bug-hotfix 0건 또는 전부 해결 상태여야 진행 가능

---

## 3. Phase 1b 완료 요건 (MUST)

### 3.1 Must-have 3개 구현 완료

Phase 1b Plan §3.1 기본 포함 항목. 각 항목별 구현 완료 신호:

- [ ] **팜 리젝션 (pointerType 필터)**
  - 구현: `src/adapters/components/Tools/Board/BoardCanvas.tsx` (신규 컴포넌트)에 pointerType 필터 추가 또는 기존 generateBoardHTML 학생 HTML에 `pointerType === 'pen'` 체크 추가
  - 검증: iPad + Apple Pencil 환경에서 손바닥 터치 시 drawingMode 무시, 펜 입력만 인식
  - 매칭 기준: Design v0.3에서 "옵션" 토글 UI 포함

- [ ] **학생 입장 화면 다듬기**
  - 구현: generateBoardHTML 내 입력 폼에 중복 이름 감지, 기종료 세션 안내, WebSocket 연결 끊김 시 자동 재연결 토스트 추가
  - 검증: 같은 이름 2명 입장 시 "이미 사용 중인 이름입니다" 안내 표시. 종료된 세션 접속 시 명확한 에러 메시지
  - 매칭 기준: Design v0.3 §5.3 "학생 입장 흐름" 준수

- [ ] **학생용 에러 처리 UI**
  - 구현: WebSocket 끊김(close 1000~1013) / 보드 종료 / 인증 실패 시 학생 캔버스 상단에 오버레이 메시지 표시
  - 검증: 교사가 세션 "종료" 버튼 클릭 후 학생 화면에 "발표가 종료되었습니다" 메시지 표시. "처음으로" 버튼 클릭 시 QR 입력 화면 복귀
  - 매칭 기준: Design v0.3 §8.1 에러 처리 섹션

### 3.2 Should-have 최소 1개 구현

Phase 1b Plan §3.2 조건부 포함 항목 중 1개 이상 선택:

- [ ] **커스텀 좌측 툴바 (Jamboard 6개 도구)** — OR
- [ ] **스티키 노트 기능** — OR
- [ ] **색상 팔레트 단순화 (6색)**

선택한 항목: __________________ (선택하지 않았다면 "없음")

### 3.3 Match Rate 90% 이상

- [ ] **측정 방법**: `docs/03-analysis/collab-board.analysis.md` v0.4 재생성하여 Phase 1b 설계 대비 일치도 계산
- [ ] **기준**: Design Match Rate ≥ 90%, Architecture Compliance ≥ 90%, Convention Compliance ≥ 90%
- [ ] **결과 기록**: 분석 문서에 match rate 숫자 명시 (예: "Design 92% / Architecture 93% / Convention 96% → Overall 93.7%")

---

## 4. 문서 & 사용자 커뮤니케이션 (SHOULD)

### 4.1 노션 사용자 가이드 업데이트

- [ ] **위치**: Notion "쌤핀 사용 가이드" > "쌤도구" > "협업 보드" 섹션
- [ ] **내용**: 
  - "BETA 기능에서 정식 기능으로 변경" 문구 추가
  - Phase 1a의 스크린샷을 1b 베타 배지 제거 후 버전의 이미지로 교체
  - "가능한 기능" / "아직 준비 중" 섹션 재정리
- [ ] **검증**: Notion 문서 공개 링크로 외부 접근 가능 확인

### 4.2 AI 챗봇 KB 갱신

- [ ] **파일**: `scripts/ingest-chatbot-qa.mjs` + Supabase 벡터 스토어
- [ ] **작업**: Phase 1b 새 기능(팜 리젝션 / 향상된 에러 처리 등)을 Q&A 3~5건 추가
  - 예: "Q: 아이패드에서 손바닥이 화면을 건드려요 → A: 팜 리젝션 옵션이 자동으로 켜져 있어요. 펜 입력만 감지합니다"
  - 예: "Q: 협업 보드가 안 열려요 → A: 다음을 확인해주세요: 1) 인터넷 연결 2) 다른 쌤도구가 실행 중은 아닌지..."
- [ ] **실행**: `SUPABASE_URL=... EMBED_AUTH_TOKEN=... node scripts/ingest-chatbot-qa.mjs` 실행하여 재임베딩 완료 확인
- [ ] **검증**: 임베딩 후 ssampin-chat Edge Function에서 새 Q&A 응답 가능 확인

### 4.3 release-notes.json 업데이트

- [ ] **파일**: `public/release-notes.json`
- [ ] **작업**: 졸업 버전(예: v1.12.0)에서 "협업 보드 정식 출시" highlights 추가
  - 예: `"highlights": ["협업 보드 정식 출시 — 팜 리젝션·향상된 에러 처리·접속 안내 개선"]`
  - changes 배열에 구체 항목 3~4건 추가 (type: "new" 또는 "improve")
- [ ] **검증**: 앱 실행 후 "앱 정보" 또는 업데이트 알림 카드에서 해당 내용 노출 확인

---

## 5. 코드 정리 (SHOULD)

### 5.1 ToolCollabBoard.tsx 베타 배지 제거

- [ ] **파일**: `src/adapters/components/Tools/ToolCollabBoard.tsx` 줄 55-74
- [ ] **작업**: 다음 div 블록 제거
  ```tsx
  <div className="bg-sp-card/60 border border-amber-400/30 rounded-xl p-3.5 flex items-start gap-2.5">
    <span className="material-symbols-outlined text-amber-400 text-icon-sm mt-0.5">science</span>
    <div className="text-[13px] text-sp-text leading-relaxed">
      <span className="inline-block text-[10px] font-extrabold tracking-wider px-2 py-[3px] mr-2 rounded bg-amber-400 text-amber-950 align-middle">
        BETA
      </span>
      아직 개선 중인 기능이라 ...
    </div>
  </div>
  ```
- [ ] **검증**: `npm run build` 성공, `npx tsc --noEmit` 0 error
- [ ] **주의**: BoardControls 컴포넌트는 유지 (기능 레이아웃)

### 5.2 FeedbackWallView.tsx 베타 배지 상태 별도 판단

- [ ] **파일**: `src/adapters/components/Tools/FeedbackWall/FeedbackWallView.tsx` 줄 102-119
- [ ] **현재 상태**: 발제피드백은 Phase 3 대기 상태이므로 본 체크리스트 범위 밖
- [ ] **판단 시점**: Phase 3 착수 시 별도 졸업 체크리스트 작성
- [ ] **현재 조치**: 변경 없음 (유지)

### 5.3 Code Review 체크리스트

- [ ] **TypeScript**: `npx tsc --noEmit` 0 error 유지
- [ ] **빌드**: `npm run build` 성공
- [ ] **포맷**: `prettier` 통과 (기존 lint 규칙 준수)
- [ ] **Clean Architecture**: domain 외부 의존 확인 필수 (특히 팜 리젝션 추가 시)

---

## 6. 성능 & 보안 (SHOULD)

### 6.1 실기기 동시 접속 성능 검증

- [ ] **측정**: 학생 기기 10대 동시 접속 후 각 기기에서 초당 3회 도형 추가
- [ ] **기준**: 교사 PC에서 학생 드로잉이 p50 ≤ 500ms 내 반영 (Design §8.2 p50 200ms → Phase 1b 상향 조정 가능)
- [ ] **측정 도구**: Chrome DevTools Performance 또는 간이 Node 스크립트로 performance.now() 기록
- [ ] **통과 신호**: 지연이 2초 이상 누적되지 않음 (30분 세션 동안 프레임 드롭 무시할 수 있는 수준)

### 6.2 세션 토큰 보안 재확인

- [ ] **확인 사항**: 
  - URL params의 authToken이 매 세션마다 새로운 32자 hex (crypto.randomBytes(16))
  - sessionCode가 6자 고유 코드 (0/O/1/I/L 제외 규칙)
- [ ] **인증 검증**: 잘못된 토큰/코드로 WebSocket 접속 시 즉시 close 1008 발생
- [ ] **로그 확인**: cloudflared 터널 로그에서 학생 IP 기록 없음 (PIPA 준수)

### 6.3 PIPA 준수 재확인

- [ ] **IP 비로깅**: Electron main process stdout에서 학생 IP 주소 로깅 없음 (grep `BoardServer\|collab-board` 확인)
- [ ] **접속 로그**: 학생 이름/접속 시간은 로컬 파일(`userData/data/boards/{boardId}.participants`)에만 저장, 외부 전송 없음
- [ ] **cloudflared 로그**: 터널 로그에서 endpoint IP 기록이 있어도 학생 식별 불가능한 형태 (generic CF tunnel logs)

---

## 7. 졸업 판정 프로세스

**베타 졸업 조건**: 다음을 모두 충족할 때 사용자가 최종 판정 후 PR 생성

### 7.1 필수 조건 (MUST 전부)

1. **섹션 1 (기능 안정성)** — 1.1, 1.2, 1.3 ✅ 체크
2. **섹션 2 (피드백 수집)** — 2.1, 2.2 ✅ 체크
3. **섹션 3 (Phase 1b 완료)** — 3.1, 3.2, 3.3 ✅ 체크

### 7.2 권장 조건 (SHOULD 70% 이상)

4. **섹션 4 (문서·커뮤니케이션)** — 4.1, 4.2, 4.3 중 최소 2개 ✅ 체크
5. **섹션 5 (코드 정리)** — 5.1, 5.3 ✅ 체크 (5.2는 별도 관할)
6. **섹션 6 (성능·보안)** — 6.1, 6.2, 6.3 중 최소 2개 ✅ 체크

### 7.3 졸업 승인 절차

1. **사용자 확인**: 위 조건 1~6을 한국어로 읽고 최종 선택
2. **PR 생성**: `feature/collab-board-graduation` 브랜치에서
   - `src/adapters/components/Tools/ToolCollabBoard.tsx` 베타 배지 제거
   - `docs/ops/collab-board-beta-graduation-checklist.md` 본 파일 체크 결과 기록
   - `docs/03-analysis/collab-board-form-responses.md` Form 응답 분류 결과 첨부
   - `docs/03-analysis/collab-board.analysis.md` v0.4 Match Rate 재측정 (3.3)
3. **PR 설명**: "Phase 1b 완료. 베타 졸업 체크리스트 섹션 1~3 MUST + 섹션 4~6 SHOULD 70% 이상 통과"
4. **병합**: main 브랜치에 merge (이 때 v1.12.0 bump 포함)

### 7.4 실패 시 처리

- **MUST 항목 미달**: Phase 1b 반복(iter) 필요
  - 예: "기능 안정성 1.2 섹션 7 heartbeat 실패" → 터널 유지 로직 재검증 후 재테스트
  - 예: "피드백 3건 미만" → 2주 연장 수집
- **SHOULD 항목 부족**: 선택 가능 (권장일 뿐)
  - 예: "문서 2개만 완료" → 업데이트 카드는 나중에 추가 가능

---

## 체크리스트 사용 가이드

### 인쇄용 / 협업 추적

이 문서를 다음과 같이 활용하세요:

1. **Phase 1b 착수 시** (2026-04-25~): 이 문서를 프린트하거나 GitHub Issue로 변환
2. **2주 단위 진도 확인**: 각 주마다 체크 현황을 다시 읽어 착수 여부 판단
3. **졸업 시점 (예상 2026-05-20~)**: 모든 MUST 체크 완료 시 섹션 7.3 절차 실행

### 문서 개정

- **v0.1** (2026-04-21): 초안 작성 — Phase 1b 착수 전 사전 정의
- **v0.2** (필요시): Phase 1b 피드백 반영 — "Q1~Q5 답변" 또는 "실제 교사 사용" 결과 추가

---

## 참고 문서

| 문서 | 용도 |
|------|------|
| [collab-board-phase1b.plan.md](../../01-plan/features/collab-board-phase1b.plan.md) | Phase 1b 범위 및 Open Questions |
| [collab-board.report.md](../../04-report/features/collab-board.report.md) | Phase 1a 완료 보고서 (97.5% match rate) |
| [collab-board.qa-checklist.md](../../03-analysis/collab-board.qa-checklist.md) | 수동 QA 13개 섹션 (섹션 1.2 기준) |
| [collab-board.analysis.md](../../03-analysis/collab-board.analysis.md) | 설계 일치도 분석 (섹션 3.3 기준) |

---

*Last updated: 2026-04-21 — Phase 1a 베타 배포 직후 초안 작성*
