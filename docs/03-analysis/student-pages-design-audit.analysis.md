# 학생/보호자 접속 페이지 디자인 점검 — 종합 분석

- 작성일: 2026-06-12
- 목적: 교사가 링크를 만들면 학생/보호자가 휴대폰으로 접속하는 페이지 8종의 디자인 리팩토링 사전 점검
- 상세 근거: `.omc/tmp/design-audit/01~04*.md` (파일별 줄번호 인용 포함, 병렬 감사 4건)

## 1. 점검 대상 (8개 페이지, 2개 기술 계열)

| #   | 페이지                       | 구현 위치                                             | 계열                     |
| --- | ---------------------------- | ----------------------------------------------------- | ------------------------ |
| 1   | 객관식 설문                  | `electron/ipc/liveVoteHTML.ts` (312줄)                | Electron 인라인 HTML     |
| 2   | 주관식 설문                  | `electron/ipc/liveSurveyHTML.ts` (381줄)              | Electron 인라인 HTML     |
| 3   | 복합 유형 설문               | `electron/ipc/liveMultiSurveyHTML.ts` (1,961줄)       | Electron 인라인 HTML     |
| 4   | 워드클라우드                 | `electron/ipc/liveWordCloudHTML.ts` (387줄)           | Electron 인라인 HTML     |
| 5   | 가치수직선 토론              | `electron/ipc/discussionValueLineHTML.ts` (786줄)     | Electron 인라인 HTML     |
| 6   | 신호등 토론                  | `electron/ipc/discussionTrafficLightHTML.ts` (726줄)  | Electron 인라인 HTML     |
| 7   | 과제 수합 (쌤도구+담임 공용) | `landing/src/components/submit/` (ssampin.com/submit) | Next.js (라이트 크림 톤) |
| 8   | 담임 설문/체크리스트         | `landing/src/components/check/` (ssampin.com/check)   | Next.js (raw Tailwind)   |

- Electron 6종은 교사 PC의 로컬 서버가 HTML 문자열을 통째로 생성해 학생 휴대폰에 보내는 구조. 공용 모듈은 `electron/ipc/_studentPageChrome.ts`(연결 상태 칩)뿐.
- 공용 모듈 안에 `injectDesignTokens()`라는 색 토큰 주입 장치가 **이미 만들어져 있으나 6개 페이지 모두 사용하지 않음**.

## 2. 핵심 발견 — 횡단 문제 7가지

### F1. 브랜드 폰트 부재 (Electron 6종 전부)

`font-family: -apple-system, ... Roboto, sans-serif` 시스템 스택만 선언. Noto Sans KR/Pretendard 없음 → 안드로이드 기기에서 한글이 기기 기본 폰트로 렌더되어 본체 앱과 첫인상부터 다름. landing 2종만 Noto Sans KR 적용됨.

### F2. "쌤핀 파랑"이 3가지로 존재

- 본체 앱 토큰: `#3b82f6`
- 랜딩 토큰(`globals.css`): `#2563eb`
- `_studentPageChrome.ts` 토큰 기본값: `#60a5fa`
  카드색도 표류: 페이지 하드코딩 `#1a2332` vs chrome 토큰 `#1a1f2e`. check 페이지는 sp-\* 토큰 0회(raw gray/blue-500). **단일 정의 ADR 필요.**

### F3. 모서리 반경 표류

브랜드 기준은 카드 12px / 버튼·입력 8px인데, 실제로는 16/14/12/10px가 페이지마다·요소마다 혼재. check는 rounded-2xl(16px). 신호등 채팅 말풍선은 좌상단 직각(`0 10px 10px 10px`) — "직각 금지" 직접 위반.

### F4. 줌 차단 — 접근성 공통 위반

Electron 6종 모두 `maximum-scale=1.0, user-scalable=no` → 저시력 학생 핀치 줌 불가(WCAG 1.4.4 위반). focus-visible 스타일 전 페이지 전무, aria(radiogroup/progressbar/pressed) 미흡, 10~13px 텍스트 다수.

### F5. 상태 피드백 공백 (학생 신뢰 직결)

- **전 페이지 "전송 중" 표시 없음** — 제출 후 ack까지 무반응.
- 객관식: WS 미연결 시 탭이 **조용히 무시**(안내 문구 없음).
- 워드클라우드: 서버가 invalid 응답을 보내도 **무반응** — 단어가 왜 안 올라가는지 모름.
- **가치수직선: 연결 끊김 화면 자체가 없음** (치명) — 와이파이 끊겨도 화면 그대로, 학생이 핸들을 움직여도 전부 유실. 신호등에는 있음.
- check: 네트워크 오류를 "설문을 찾을 수 없습니다"/"PIN이 올바르지 않습니다"로 **오표시**. 오프라인 감지 없음(submit에는 있음).

### F6. 같은 역할, 다른 구현 — 페이지 간 비일관

- "찬성" 색: 가치수직선 파랑 vs 신호등 초록.
- 완료 그래픽: ✓ 텍스트 / ✅ / 🌸 / 🎉 4종 혼재. 완료 문구 문체도 제각각.
- disabled 버튼·placeholder 색·h1 크기·:active 스케일·로고 마크업이 페이지마다 다름 (상세 표: 감사 01 §5, 감사 03 §E — 토론 2종만 15건).
- check ↔ submit: 디자인 시스템 자체가 다름(토큰 vs raw), 그림자 언어·확인 단계 유무·마감 아이콘 불일치.

### F7. 브랜드 온기·신뢰 요소 빈약

- 로고가 전부 이모지+텍스트(📊📝☁️📏🚦📋). SVG/이미지 로고 0건.
- 그림자 거의 0, 앰버(#f59e0b) 포인트 거의 미사용 → 파랑 단색의 평면적 화면. "따뜻함" 축이 이모지에만 의존.
- **보호자 화면에 개인정보 안내 0건** — 실명+파일을 올리는 화면인데 "선생님에게만 전달됩니다" 한 줄이 없음. 운영 주체/문의처 없음.

## 3. 페이지별 고유 이슈 (요약)

| 페이지       | 고유 이슈                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 객관식       | 교사 지정 원색을 알파 합성해 텍스트색으로 사용 — 밝은 색 선택 시 대비 미보장                                                                       |
| 주관식       | WS 안내가 placeholder 교체 방식 — 이미 글 쓴 학생은 안내를 못 봄                                                                                   |
| 복합         | scroll 모드 진행률·미답 문항 안내 부재(긴 설문에서 눈으로 찾아야 함), step 진행바 3px, 척도 버튼 폭 36px 터치 미달, 닉네임 제출 후 무반응 구간     |
| 워드클라우드 | 제출 칩 무채색(도구 성격과 반대), 연타 중복 전송 가능, 남은 횟수 시각화 없음                                                                       |
| 가치수직선   | 연결 끊김 화면 없음(F5), 라운드 전환 시 위치 무음 리셋, 슬라이더 키보드/스크린리더 조작 불가, 피어 핸들 겹침 처리 없음                             |
| 신호등       | 선택 상태가 색 변화뿐 — 적록색약 학생 식별 곤란(버튼 자체는 이모지+텍스트 병기로 양호), 100vh+음수 마진 핵·safe-area 미대응, 다른 학생 분포 비표시 |
| submit       | 성공 화면 "학년 반 7번 김철수" 깨진 문장(빈값 미처리), 10MB 초과 후 같은 파일 재선택 불가, ChatWidget이 학생 화면에 노출                           |
| check        | 접근성 마크업 전무, PIN 무염 SHA-256 클라이언트 비교(보안 — 별도 트랙), 번호 그리드 5열 고정                                                       |

## 4. 개선 방안 (제안)

### 방향: "학생 페이지 공용 셸" 구축 후 8종 이관

개별 페이지를 각각 손보면 표류가 재발한다. `_studentPageChrome.ts`(이미 4페이지 공용 + REGRESSION #22 보호)를 확장해 공용 디자인 셸을 만들고 페이지들이 가져다 쓰는 구조가 근본 해법.

**Phase 1 — 토대 (공용 셸)**

1. 쌤핀 파랑/카드색 단일 정의 ADR (#3b82f6 vs #2563eb vs #60a5fa)
2. `_studentPageChrome.ts` 확장: ①폰트 스택(Pretendard/Noto Sans KR 우선) ②`injectDesignTokens()` 실사용 전환 ③radius 스케일(카드 12/버튼·입력 8) ④공통 컴포넌트 CSS(버튼·카드·입력·완료/마감/연결끊김/연결중 4종 상태 화면·"전송 중" 스피너) ⑤viewport에서 `user-scalable=no` 제거, safe-area/dvh 대응
3. 완료 그래픽·문구 통일 (1종 SVG 체크 + 통일 문체)

**Phase 2 — Electron 6종 이관 + 페이지별 결함 수술**

- P0: 가치수직선 연결 끊김 화면(신호등 패턴 이식), 객관식 silent fail 안내, 워드클라우드 invalid 피드백, 전 페이지 전송 중 표시
- P1: 신호등 선택 상태 비색상 표식(체크 아이콘), 찬성색 통일, 복합 scroll 진행률+미답 문항 스크롤 안내, focus-visible/aria 보강
- P2: 앰버 포인트·칩 컬러화 등 시각적 온기 (네온/글로우 금지 기조 유지)

**Phase 3 — landing 2종**

- P0: check를 sp-\* 토큰으로 이관 + 오프라인/네트워크 오류 구분(submit OfflineNotice 재사용)
- P1: submit "학년 반" 빈값 렌더 수정, 두 페이지 공통 헤더(로고)+개인정보 한 줄 안내 컴포넌트, check 접근성 마크업
- P2: ChatWidget 학생 페이지 비노출, check PIN 구조 재설계(보안 트랙 별도)

### 검증 방법 제안

- 인라인 HTML이라 tsc/lint가 CSS/JS 내부에 닿지 않음 → 기존 패턴(`.omc/tmp` 구문검사 mjs + REGRESSION 메타테스트)으로 셸 주입 여부를 회귀 테스트로 고정
- Playwright 모바일 뷰포트(390×844) 스크린샷으로 8종 상태별 시각 비교

## 5. 주의사항 (다른 세션 충돌)

- **`liveMultiSurveyHTML.ts`는 multisurvey-v2-renewal 세션의 영향권일 수 있음** — v2 리뉴얼(G002~)이 학생 step 모드를 다룰 가능성. 복합 설문 이관은 해당 PDCA와 순서 조율 필요.
- 구현 시 frontend-design 에이전트 협업 의무(feedback_frontend_agent_collaboration).
