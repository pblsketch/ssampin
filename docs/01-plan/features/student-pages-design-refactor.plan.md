# Plan — 학생/보호자 접속 페이지 디자인 리팩토링 (student-pages-design-refactor)

- 작성일: 2026-06-12
- 상태: v1.0 초안 (사용자 승인 대기)
- 근거 분석: `docs/03-analysis/student-pages-design-audit.analysis.md` (+ 상세 감사 4건 `.omc/tmp/design-audit/01~04*.md`)

## 1. 배경 / 문제

교사가 링크를 만들면 학생/보호자가 휴대폰으로 접속하는 페이지 8종이 사실상 8개 서비스처럼 보인다.

- **Electron 인라인 HTML 6종**: 객관식(`liveVoteHTML.ts`) · 주관식(`liveSurveyHTML.ts`) · 복합(`liveMultiSurveyHTML.ts`) · 워드클라우드(`liveWordCloudHTML.ts`) · 가치수직선(`discussionValueLineHTML.ts`) · 신호등(`discussionTrafficLightHTML.ts`)
- **Next.js 웹 2종**: 과제 수합(`landing/src/components/submit/`) · 담임 설문/체크리스트(`landing/src/components/check/`)

핵심 결함 (분석 문서 F1~F7 요약):

1. 도구 6종 전부 브랜드 폰트 미선언 (시스템 폰트 의존)
2. "쌤핀 파랑" 3중 정의(#3b82f6 / #2563eb / #60a5fa), 카드색·radius 표류, `injectDesignTokens()` 인프라 존재하나 전 페이지 미사용
3. 학생 신뢰 직결 피드백 공백 — 전 페이지 "전송 중" 없음, 가치수직선 연결 끊김 화면 부재(치명), 워드클라우드 invalid 무반응, check 네트워크 오류 오표시
4. 페이지 간 비일관 — 찬성색(파랑 vs 초록), 완료 그래픽 4종, disabled/placeholder/로고 제각각
5. 접근성 — 줌 차단(`user-scalable=no`) 6종 공통, focus-visible 전무, 신호등 선택 상태 색 의존
6. 보호자 신뢰 — 로고 없는 이모지 헤더, 개인정보 안내 0건
7. 버그 — submit 성공 화면 "학년 반 7번" 깨진 문장, 10MB 초과 후 같은 파일 재선택 불가

## 2. 목표 / 비목표

### 목표

- G1. 8개 페이지가 **하나의 디자인 언어**(색·폰트·radius·상태 화면·완료 문구)를 공유한다
- G2. 학생이 자기 행동의 결과를 항상 안다 — 전송 중/실패/끊김/마감 상태가 모든 페이지에서 보인다
- G3. 접근성 기본기 충족 — 줌 허용, focus-visible, 비색상 선택 표식, aria 핵심 마크업
- G4. 보호자 첫인상 — 공통 로고 헤더 + 개인정보 한 줄 안내
- G5. 표류 재발 방지 — 공용 셸 + 회귀 메타테스트로 구조적으로 고정

### 비목표 (이번 PDCA에서 안 함)

- check PIN 보안 재설계(무염 SHA-256 → Edge Function) — **보안 트랙 별도 PDCA**
- 신호등 "다른 학생 분포 표시" 같은 기능 추가 — 디자인 리팩토링 범위 밖
- 실시간 담벼락/학급규칙/서명받기 학생 페이지(`src/student/`) — 별도 React SPA 계열, 이번 범위 밖
- 본체 앱(교사 화면) UI 변경 — 없음

## 3. 결정 필요 사항 (계획 승인 시 함께 확정)

| #   | 결정                | 권고안                                                                                                                                                                                              | 근거                                                                                                                                            |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 쌤핀 파랑 단일화    | **다크 화면(도구 6종) `#3b82f6`, 라이트 화면(landing 2종) `#2563eb` 유지** — "같은 브랜드 파랑의 다크/라이트 변형"으로 ADR 기록. `_studentPageChrome.ts` 토큰 기본값 `#60a5fa`는 `#3b82f6`으로 정정 | 어두운 배경에선 #3b82f6, 밝은 크림 배경에선 #2563eb가 각각 대비 우수. 본체 라이트 테마도 이미 #2563eb 사용 중                                   |
| D2  | 폰트 로딩 전략      | **CDN 웹폰트(Pretendard) + `font-display: swap` + 시스템 폴백 스택** (`'Pretendard Variable', Pretendard, 'Noto Sans KR', -apple-system, ...`)                                                      | 학생 페이지는 교사 PC LAN 서빙 — 폰트 파일 동봉은 한글 용량(MB급) 때문에 비현실적. CDN 실패 시 현재와 동일한 시스템 폰트로 자연 폴백되므로 무해 |
| D3  | 복합 설문 작업 순서 | **Phase 2에서 복합 설문은 마지막 + 착수 전 multisurvey-v2-renewal 세션 진행 상태 확인.** v2가 학생 step 모드를 갈아엎는 중이면 셸 적용을 v2 쪽에 위임                                               | 다른 세션 충돌 방지 (세션 프로토콜)                                                                                                             |
| D4  | 카드색 기준         | 페이지 실사용 값 `#1a2332`(본체 sp-card와 동일)로 통일, chrome 토큰 기본값 `#1a1f2e`를 정정                                                                                                         | 본체 디자인 시스템 문서 기준이 #1a2332                                                                                                          |

## 4. 작업 분해 (3 Phase, 순차 / main 단일 워킹트리)

### Phase 1 — 공용 셸 구축 (`_studentPageChrome.ts` 확장)

> 산출물: 셸 모듈 + 메타테스트. 이 단계만으로는 화면 변화 없음(기존 칩 동작 불변).

- 1-1. 토큰 정정: `getDesignTokenDefaults()` 값을 D1/D4 확정값으로 수정 (`--color-accent: #3b82f6`, `--color-card: #1a2332`, highlight `#f59e0b` 추가)
- 1-2. `getStudentBaseCSS()` 신설: 폰트 스택(D2) + reset + radius 스케일(카드 12 / 버튼·입력 8) + 공통 버튼/카드/입력/placeholder/disabled + `:focus-visible` 링 + `:active scale(0.97)` 통일
- 1-3. `getStatusScreens()` 신설: 연결 중(스피너) / 연결 끊김 / 마감 / 완료 4종 상태 화면의 CSS+HTML+JS(`show()` 헬퍼). 완료 그래픽은 SVG 체크 1종 + 통일 문구
- 1-4. `getSubmitFeedbackJS()` 신설: "전송 중…" 버튼 상태 + ack 타임아웃 시 재시도 안내 + WS 미연결 탭 시 인라인 안내 문구(공통)
- 1-5. viewport 정책: 셸이 제공하는 표준 viewport 메타(`user-scalable=no` 제거, safe-area 대응)
- 1-6. 회귀 메타테스트 확장: REGRESSION #22 패턴에 "6개 페이지가 셸 함수를 호출하는가" 검사 추가 (Phase 2에서 페이지별로 켬)
- 디자인 시안: **frontend-design 에이전트와 협업**으로 공통 컴포넌트(버튼·카드·상태 화면·완료 SVG) 시안 확정 후 CSS 반영

### Phase 2 — Electron 6종 이관 + 결함 수술

> 페이지당 1커밋, 작은 단위 순차. 각 페이지에서 자체 CSS 중 셸과 중복되는 부분 제거.

| 순서 | 페이지                                    | 셸 이관 + 고유 수술                                                                                                                                                                                                             |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2-1  | 객관식 (`liveVoteHTML.ts`)                | 셸 적용 + WS 미연결 silent fail → 인라인 안내 + 교사 지정 색 대비 보정(밝은 색이면 텍스트를 흰/검 자동 선택)                                                                                                                    |
| 2-2  | 주관식 (`liveSurveyHTML.ts`)              | 셸 적용 + WS 안내를 placeholder 교체 → 인라인 배너로 + 카운터 aria-live                                                                                                                                                         |
| 2-3  | 워드클라우드 (`liveWordCloudHTML.ts`)     | 셸 적용 + invalid 응답 피드백(shake+문구) + 연타 중복 전송 잠금 + 남은 횟수 도트 시각화 + 칩 컬러화(앰버 포인트)                                                                                                                |
| 2-4  | 가치수직선 (`discussionValueLineHTML.ts`) | 셸 적용 + **연결 끊김 화면 추가(P0)** + 라운드 전환 안내 + 위치 확정 피드백 + 핸들 키보드/aria-slider                                                                                                                           |
| 2-5  | 신호등 (`discussionTrafficLightHTML.ts`)  | 셸 적용 + **선택 상태 비색상 표식(체크 아이콘, P0)** + 찬성색 통일(D1 파랑 — 단, 신호등 메타포상 초록 유지가 자연스러우므로 "선택 표식으로 구분, 색은 신호등 고유 유지"로 절충) + `100vh→100dvh` + safe-area + 말풍선 직각 제거 |
| 2-6  | 복합 (`liveMultiSurveyHTML.ts`)           | **D3 확인 후 착수.** 셸 적용 + scroll 모드 진행률 바 + 미답 필수 문항 스크롤 안내 + step 진행바 3px→6px + 척도 버튼 최소 44px + 닉네임 제출 로딩 표시                                                                           |

### Phase 3 — landing 2종 (submit / check)

- 3-1. check를 sp-\* 토큰으로 이관 (raw gray/blue → 토큰, rounded-2xl→xl, xl→lg) + 그림자 언어 submit과 통일
- 3-2. check 오프라인/네트워크 오류 구분 — submit `OfflineNotice` 재사용, "찾을 수 없음"과 분리. `verifyPin` 네트워크 실패 메시지 분리
- 3-3. submit 버그 2건 — 성공 화면 학년/반 빈값 처리("{number}번 {name}"만), 파일 초과 시 input value 리셋
- 3-4. 공통 `PublicPageHeader` 컴포넌트 — 로고(`/icon.png`) + 서비스명 + **개인정보 한 줄 안내**("입력한 내용은 선생님에게만 전달됩니다") — 두 페이지 공용
- 3-5. check 접근성 — role=status/alert, 뒤로가기·PIN aria-label, 선택 버튼 aria-pressed, ○/× 에 텍스트 라벨
- 3-6. 학생/보호자 페이지에서 ChatWidget 비노출 (경로 조건)

## 5. 검증 게이트

각 Phase 종료 시:

```
npx tsc --noEmit && npm run lint && npm run test && npm run regression-check
```

추가 게이트 (인라인 HTML 특성상 tsc가 못 잡는 영역):

- **인라인 JS 구문검사**: 협업보드에서 쓴 패턴(`.omc/tmp/check-*-html.mjs`)을 6종 학생 페이지에 적용 — 생성된 HTML의 `<script>`를 추출해 `new Function()` 파싱
- **Playwright 모바일 스크린샷**: 390×844 뷰포트로 8종 × 상태별(입장/응답/완료/끊김/마감) 캡처 → 전후 비교
- landing은 `cd landing && npx tsc --noEmit` + Vercel preview 확인

## 6. 리스크 / 대응

| 리스크                                                      | 대응                                                                                                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| multisurvey-v2-renewal 세션과 `liveMultiSurveyHTML.ts` 충돌 | D3 — 2-6을 마지막에 배치, 착수 전 HANDOFF/PROGRESS 확인. 충돌 시 셸 적용을 v2 PDCA에 위임하고 이번엔 skip                                       |
| 셸 CSS가 기존 페이지 레이아웃을 깨뜨림                      | 페이지당 1커밋 + Playwright 스크린샷 전후 비교. 셸 클래스는 `sps-*` prefix로 기존 클래스와 격리                                                 |
| REGRESSION #22 메타테스트 실패                              | 칩 구조(`sp-conn-chip` + role/aria)는 변경하지 않음 — 셸은 추가만                                                                               |
| CDN 폰트가 교실 폐쇄망에서 실패                             | `font-display: swap` + 시스템 폴백 — 실패해도 현재 상태와 동일, 악화 없음                                                                       |
| 찬성색 통일이 신호등 메타포와 충돌                          | 2-5 절충안(색 유지 + 비색상 표식) — 디자인 시안 단계에서 frontend-design 에이전트와 확정                                                        |
| 다른 세션 작업 파일                                         | `generateBoardHTML.ts`/`BoardQRCard.tsx`(협업보드), NEIS Schedule, Widget·Settings·RealtimeWall 파일 **불가침**. 이번 범위와 겹치지 않음 확인됨 |

## 7. 성공 기준 (Check 단계에서 측정)

- [ ] 8종 페이지 색·radius가 단일 소스(셸 토큰/sp-\* 토큰)에서 나옴 — 하드코딩 잔존 grep 0건 (도구 고유색 제외 허용 목록 명시)
- [ ] 6종 도구 페이지 폰트 스택에 Pretendard/Noto Sans KR 선언
- [ ] `user-scalable=no` 잔존 0건
- [ ] 8종 모두 "전송 중" 상태 + 끊김 화면 + 통일 완료 화면 보유
- [ ] 신호등 선택 상태 비색상 표식, 가치수직선 끊김 화면 — 수동 시나리오 통과
- [ ] check 페이지 sp-\* 토큰 100%, 오프라인 안내 동작
- [ ] submit "학년 반" 빈값 케이스 단위 테스트 통과
- [ ] 검증 게이트 4종 + 인라인 JS 구문검사 + Playwright 스크린샷 세트 PASS

## 8. 예상 작업량

- Phase 1: 세션 1회 (셸 + 시안 협업 + 메타테스트)
- Phase 2: 세션 2~3회 (페이지당 0.5세션, 복합은 1세션)
- Phase 3: 세션 1회
- 릴리즈: 기능 변경이 아닌 품질 개선이므로 다음 묶음 릴리즈(v2.1.2 예정)에 포함 권장
