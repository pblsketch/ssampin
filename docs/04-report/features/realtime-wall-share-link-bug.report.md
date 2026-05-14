# Report — realtime-wall-share-link-bug (P0 Hotfix)

> Phase: Report · Match Rate 100% · main 머지 대기 (사용자 검수 후)
> Branch: `feat/realtime-wall-share-fix` (worktree `e:/github/ssampin-wall-fix`)
> Plan / Design / Analysis: [plan](../../01-plan/features/realtime-wall-share-link-bug.plan.md) · [design](../../02-design/features/realtime-wall-share-link-bug.design.md) · [analysis](../../03-analysis/realtime-wall-share-link-bug.analysis.md)

---

## 1. 근본 원인 (1줄)

v2.0.0 "교사 보드 풀-사이즈화" 회귀 — 라이브 시작 후 공유 드로어가 **자동으로 열리지 않고**, 학생 접속 URL/QR 진입점이 우측 56px 슬림 ActionBar 의 share 아이콘 하나뿐이라 사용자가 발견하지 못해 "공유 UI 가 전혀 없다"고 인식.

IPC / preload / main 처리 / `isLiveMode` 전파 / `connectTunnel` 모두 정상 작동. 순수 **UX 발견성(discoverability) 회귀**.

---

## 2. 수정 내역

### 2.1 코드 변경 (2 파일)

| 파일 | 변경 라인 | 변경 요지 |
|-----|---------|---------|
| `src/adapters/components/Tools/ToolRealtimeWall.tsx` | `handleStartLive` (line ~334-365) | `setIsLiveMode(true)` 직후 `setBoardSettingsDrawer('share')` 추가 — 라이브 진입 즉시 공유 드로어 자동 슬라이드인. try/catch 에 `console.error` + 사용자 친화적 메시지. |
| `src/adapters/components/Tools/ToolRealtimeWall.tsx` | `handleStopLive` (line ~366-388) | `setBoardSettingsDrawer(null)` 추가 — 라이브 종료 시 잔존 드로어 자동 정리. |
| `src/adapters/components/Tools/ToolRealtimeWall.tsx` | live 보드 영역 상단 (line ~1420-1487) | **신규 슬림 상태 칩 (36px h)**: dot + "라이브 · 학생 N명" + 학생 접속 URL truncate + 복사 + "공유 보기" + "종료". `tunnelLoading` / `tunnelError` / `displayUrl` 분기. ActionBar 의 share 아이콘이 묻히는 발견성 문제 영구 해소. |
| `src/adapters/components/Tools/RealtimeWall/RealtimeWallTeacherActionBar.shareUx.test.tsx` | (신규) | 3 회귀 방지 테스트 — pre-live 에서 share 버튼 `disabled`, live 에서 enabled, 4 layoutMode 모두에서 share 버튼 존재. SSR(`react-dom/server.renderToString`) 기반 — vitest `environment: 'node'` 와 정합. |

### 2.2 가설 검증 vs 실제 원인

5가설 매트릭스 중 H2 ("공유 UI 진입점 UX 회귀") 단일 원인 확정. H4 ("connectTunnel 실패") 는 H2 의 부산물 — 드로어가 안 열려서 에러 안내조차 보이지 않는 구조였음. 이번 fix 의 상태 칩이 H4 에러 경로도 자연스럽게 사용자에게 노출.

### 2.3 자동 검증

| 검증 | 결과 |
|-----|-----|
| TypeScript strict (`tsc --noEmit`) | ✅ 0 errors |
| Vitest 전체 (`72 files · 1091 tests`) | ✅ 100% pass |
| 신규 회귀 방지 테스트 3건 | ✅ all pass |
| ESLint 수정 파일 | ✅ 0 errors (warnings 2건은 본 PR 무관 기존 architecture warning) |

---

## 3. 사용자 RG 시나리오 (수동 검수)

`docs/03-analysis/realtime-wall-share-link-bug.analysis.md` §5 참조. P0 3건 + P1 4건 + P2 2건 = 총 9개. RG-01 (라이브 시작 → 공유 드로어 자동 노출) 이 사용자 신고와 1:1 매핑된 원본 시나리오.

---

## 4. 회귀 방지 안전망

### 4.1 메타 테스트 (신규)

`RealtimeWallTeacherActionBar.shareUx.test.tsx` — 향후 누군가가 ActionBar 에서 share 버튼을 제거하거나 `disabled` 가드를 잘못 바꾸면 즉시 실패. 4 layoutMode 모두에서 share 진입점 보장.

### 4.2 코드 주석

`ToolRealtimeWall.tsx` `handleStartLive` / `handleStopLive` / 새 상태 칩 섹션에 **인라인 주석으로 "사용자 발견성 회귀 fix"** 라고 명시 — 향후 리팩토링 시 이 의도가 보존되도록.

### 4.3 발견성 이중화

- §0 공유 드로어 (라이브 시작 시 자동 오픈) — 1차 진입점
- 보드 위 슬림 상태 칩 — 2차 진입점 (드로어가 닫혀도 항상 노출)
- 우측 56px ActionBar share 아이콘 — 3차 진입점 (기존 유지)

→ 사용자가 한 진입점을 놓쳐도 다른 둘이 보호.

---

## 5. 남은 부채 / 후속 작업

- **F-1 의 design 가드 §3 일부 회귀 위험 잔존**: live 진입 직후 사용자가 export/columns drawer 를 의도하여 열었지만 share 가 강제 오픈됨 → 라이브 진입 시점에는 사용자 의도가 "공유" 이외일 가능성 사실상 0 (Padlet 동일 UX) 이라 수용. 만일 후속 신고가 들어오면 `boardSettingsDrawer` initial 만 'share' 로 set 하고 사용자가 한 번이라도 다른 섹션을 열면 share auto-open 안 하는 "first-time only" 게이트로 후퇴 가능.
- **번들 릴리즈는 별도 시점에 묶음 처리** (사용자 명시 — MEMORY.md "Active Features" 참조). 본 PDCA 는 main 머지까지만.
- **ssampin-wall-fix worktree 의 `node_modules` 는 ssampin 메인 워크트리로의 junction**. 청소 시 `rmdir /e/github/ssampin-wall-fix/node_modules` 후 `git worktree remove`.

---

## 6. 사용자에게 보고할 핵심 요약

1. **근본 원인**: 라이브 시작 후 공유 UI 가 자동으로 열리지 않고, 보이는 진입점이 56px 슬림 ActionBar 의 share 아이콘 하나뿐이라 사용자가 발견 못 함.
2. **수정**: (1) 라이브 시작 시 공유 드로어 자동 오픈, (2) 보드 위 슬림 라이브 상태 칩 신설(접속 URL + 복사 + 공유 보기 + 종료), (3) 에러 로깅/메시지 명확화, (4) `handleStopLive` 시 드로어 자동 close, (5) ActionBar share 버튼 회귀 방지 메타 테스트 3건.
3. **검증**: TypeScript 0 errors · 1091 tests pass · ESLint clean · 워크트리 격리.
4. **RG**: 사용자가 직접 RG-01 (실시간 담벼락 → 보드 시작 → 학생 참여 시작 → 공유 드로어 자동 오픈 + QR/URL 표시) 만 확인하면 종결.

---

## 7. 머지 안내

- 브랜치: `feat/realtime-wall-share-fix`
- HEAD 베이스: origin/main `f253241`
- 변경 파일: 2 (코드 1 + 테스트 1) + 4 PDCA 문서
- 머지 방식: 사용자 PR 또는 squash merge — 사용자 결정 대기.
