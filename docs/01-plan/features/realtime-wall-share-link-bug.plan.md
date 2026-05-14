# Plan — realtime-wall-share-link-bug

> Phase: Plan (PDCA Team Mode) · Owner: CTO Lead + developer + frontend + qa
> Branch: `feat/realtime-wall-share-fix` (worktree `e:/github/ssampin-wall-fix`)
> Status: P0 hotfix (핵심 사용자 시나리오 차단)

---

## 1. Incident (1-pager)

사용자 신고:
> 쌤핀 — 쌤도구 — 실시간 담벼락에서 "학생 참여 시작"을 누르면 학생들에게 공유할 링크와 QR 코드 등을 확인할 수 있어야 하는데, 전혀 안 보이는 버그가 있어.

영향: 실시간 담벼락 라이브 진입 후 학생 안내 100% 차단. 교사 입장에서 "기능이 동작하지 않음"으로 인식.

---

## 2. 5-가설 Matrix (사전 진단)

| # | 가설 | 판정 결과 | 근거 |
|---|-----|---------|------|
| H1 | `handleStartLive` 자체가 실패 (boardSession 가드 / IPC 누락 / try-catch silent) | ❌ 기각 | `electron/preload.ts:339-352` 노출 정상 · `electron/main.ts:4265` `registerRealtimeWallHandlers` 호출 정상 · `electron/ipc/realtimeWall.ts:887` 핸들러 등록 정상. IPC 경로 단절 없음 |
| H2 | 공유 UI 진입점 UX 회귀 (사용자가 못 찾음) | ✅ **CONFIRMED** | v2.0.0 "교사 보드 풀-사이즈화"로 인라인 `RealtimeWallLiveSharePanel` 제거 → 56px 슬림 우측 ActionBar의 `share` 아이콘으로만 진입. 라이브 시작 시 **자동으로 공유 패널이 열리지 않음**. 사용자는 보드만 보이고 공유 UI를 찾을 단서가 없음 |
| H3 | `isLiveMode` 미전파로 `share` prop 가드(`isLiveMode ? share : undefined`)가 false 평가 | ❌ 기각 | `ToolRealtimeWall.tsx:352` `setIsLiveMode(true)` 직접 호출. 정상 동작 시 share prop 정상 전달됨 |
| H4 | `connectTunnel` 실패로 `tunnelUrl/shortUrl` 모두 null | ⚠️ 부수적 위험 | 가능하지만 ShareSectionBody가 `tunnelError`/`tunnelLoading` 상태를 명시적으로 렌더링하므로 사용자에게 노출됨 — **단 drawer 자체가 안 열리면 이 안내도 안 보임**. H2의 부산물 |
| H5 | security-hardening / tool-randomness 회귀 | ❌ 기각 | origin/main HEAD `f253241` 에서 preload/main/IPC 모두 정상 등록 |

**결론: H2 단일 원인. H4는 H2의 부산물 (drawer가 자동으로 안 열려서 에러 안내조차 보이지 않음).**

---

## 3. 근본 원인 한 줄

라이브 시작(`handleStartLive`) → `setIsLiveMode(true)` → tunnel 연결 시점에 **공유 드로어를 자동으로 여는 로직이 없어서**, 교사 화면에는 새 보드만 풀-사이즈로 표시되고 56px 슬림 ActionBar의 `share` 아이콘을 클릭하기 전까지 학생 접속 URL/QR이 어디에도 노출되지 않는다.

코드 단서:
- `src/adapters/components/Tools/ToolRealtimeWall.tsx:118` — `boardSettingsDrawer` 초기값 `null` (드로어 닫힘)
- `src/adapters/components/Tools/ToolRealtimeWall.tsx:334-358` — `handleStartLive` 안에서 `setBoardSettingsDrawer('share')` 호출 없음
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallTeacherActionBar.tsx:84-90` — share 버튼은 `disabled: !isLiveMode` 로 라이브 전엔 회색, 라이브 진입 후에야 활성화되지만 클릭하지 않으면 패널이 열리지 않음
- 코드 주석 `RealtimeWallTeacherActionBar.tsx:5-8` 가 이 회귀의 의도(보드 풀-사이즈화)를 명시적으로 기록 — 누락된 건 "auto-open" 후속 작업

---

## 4. 영향 범위

| 영역 | 영향 | 비고 |
|-----|------|------|
| 데스크톱 Electron (설치판 v2.0.5 + dev 모드) | ❌ 차단 | 핵심 시나리오 |
| 모바일 PWA | 비대상 | 실시간 담벼락은 데스크톱 전용 |
| 다른 도구 (실시간 투표/설문/슬라이드) | 영향 없음 | 각자 독립 컴포넌트 |
| 데이터 무결성 | 영향 없음 | UI-only |

---

## 5. 수정 범위 (Plan)

1. **F-1 (필수)** — 라이브 시작 직후 `setBoardSettingsDrawer('share')` 자동 호출
2. **F-2 (필수)** — 라이브 모드에서 보드 위쪽에 슬림 정보 칩(접속 학생 수 + "공유 보기" 액션) 노출. 사용자가 드로어를 닫더라도 즉시 재진입 가능
3. **F-3 (방어선)** — `handleStartLive` 의 silent try/catch 에서 에러를 console 로 남기고 `liveError` 토스트 메시지를 더 명확하게 ("학생 접속 주소를 만드는 동안 문제가 발생했어요" — 사용자가 어디서 막혔는지 알 수 있도록)
4. **F-4 (안전망)** — 메타 테스트: `RealtimeWallTeacherActionBar` 의 share 버튼 `disabled` 가 `isLiveMode` 와 동기, 그리고 ToolRealtimeWall 의 `handleStartLive` 가 drawer 를 'share' 로 열도록 회귀 방지 unit test

---

## 6. 가드레일

- Clean Architecture 4-레이어 의존성 규칙 (UI-only fix → adapters 레이어 1~2 파일 수정)
- TypeScript strict / `any` 금지
- 한국어 UI 문구
- 머지까지만 (사용자 명시 — 릴리즈는 별도 시점 묶음)
- 다른 세션 충돌 회피: `worktree` 사용 (origin/main 기준)

---

## 7. 다음 단계

→ `/pdca design realtime-wall-share-link-bug`
