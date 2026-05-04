# 바탕화면 작업판 (native-desktop-mode) Planning Document

> **Summary**: Windows 전용으로 위젯 BrowserWindow를 Explorer의 WorkerW 레이어에 attach하고, 위젯 안의 "바탕화면 아이콘 구역 카드(`desktop-icon-zone`)" 영역만 마우스 이벤트를 Explorer로 통과시켜, 사용자가 실제 Windows 바탕화면 아이콘을 `작업 전 / 작업 중 / 작업 완료` 같은 칸반 카드 위에 직접 배치할 수 있게 한다. 쌤핀은 파일/아이콘 데이터를 보유·저장하지 않고 "투명한 작업 구역"만 제공한다.
>
> **Project**: SsamPin
> **Version**: v2.1.0 (예정, 사용자 결정에 따라 변동)
> **Author**: pblsketch
> **Date**: 2026-05-04
> **Status**: Draft v0.1

---

## 1. 개요

### 1.1 목적

이 기능이 해결하는 문제:

1. **교사 사용자는 바탕화면 파일을 "작업 진행 단계"로 정리하고 싶어함** — 시험문제, 결재 서류, 학생 자료 등이 바탕화면에 흩어지는데, 이를 쌤핀 앱 안으로 옮기면 윈도우 탐색기/Office와의 호환성이 떨어짐.
2. **쌤핀이 파일을 직접 관리하면 책임이 너무 커짐** — 파일 인덱싱, 권한, 안티바이러스 스캔, 파일명 변경 추적 등 OS-level 책임을 떠안게 됨.
3. **이상적인 해법은 Explorer의 바탕화면 아이콘은 그대로 두되, 쌤핀이 "그 위에 투명한 작업 구역만 그려주는" 것** — 책임 분리가 깨끗하고 데이터 손실 위험이 0이다.

### 1.2 배경

스쿨보드 등 경쟁 앱은 바탕화면 위에 핀 가능한 영역을 제공하지만 다음 한계가 있다:
- 핀 영역 = 단일 평면 (작업 단계 분류 없음)
- 마우스 hit-test 정책 = 아이콘 위만 통과 (빈 공간 클릭이 어색)

쌤핀은 **"카드 단위로 나누어 칸반 형태로 영역화"** 하는 차별화 포지션이 가능하다. 이는 교사의 "단계별 처리" 멘탈 모델과 잘 맞는다.

기술 검토 결과:
- Win32 공개 API(`Progman` → `WorkerW` 메시지 트릭, `SetParent`, `WH_MOUSE_LL`)로 외부 코드 복제 없이 독립 구현 가능
- `electron/main.ts`(약 3,587 lines)는 위젯 모드/Win+D 복구/트레이가 모두 모여있어 Win32 native는 별도 모듈로 분리 필수
- `koffi` FFI는 native build 불필요(prebuilt 바이너리 제공)이라 macOS/Linux 빌드 안정성 영향 적음

UX 검토 결과:
- 일반 쌤핀 카드와 `desktop-icon-zone` 카드의 시각 구분이 결정적 — 후자는 "아이콘 드롭 영역"임을 한눈에 알아야 함
- 안내 문구·편집 버튼은 pass-through 영역 밖에 두어야 클릭 가능

### 1.3 관련 문서

- 사용자 제공 컨텍스트: 본 세션 프롬프트 (2026-05-04, "쌤핀 바탕화면 작업판 구현")
- 가까운 구현 템플릿:
  - [`electron/main.ts`](e:/github/ssampin/electron/main.ts) — `createWidgetWindow`, `window:applyWidgetSettings`, `window:toggleWidget`, `startWinDRecovery`
  - [`electron/preload.ts`](e:/github/ssampin/electron/preload.ts) — contextBridge 노출 패턴
  - [`src/domain/entities/Settings.ts`](e:/github/ssampin/src/domain/entities/Settings.ts) — `WidgetDesktopMode` 정의 지점
  - [`src/adapters/components/Widget/Widget.tsx`](e:/github/ssampin/src/adapters/components/Widget/Widget.tsx) — `rgba(0,0,0,0.01)` 배경 (pass-through와 충돌 가능성 점검 필요)
  - [`src/adapters/components/Widget/WidgetContextMenu.tsx`](e:/github/ssampin/src/adapters/components/Widget/WidgetContextMenu.tsx) — 위젯 설정 진입점
  - [`scripts/build-electron.mjs`](e:/github/ssampin/scripts/build-electron.mjs) — esbuild external 추가 지점
  - [`electron-builder.yml`](e:/github/ssampin/electron-builder.yml) — native module unpack 설정
- 라운드 정책: `feedback_rounding_policy.md` — `rounded-sp-*` 금지, Tailwind 기본 키 사용
- 프론트 협업 정책: `feedback_frontend_agent_collaboration.md` — UI 작업은 `frontend-design`/`bkit:frontend-architect`와 협업
- 가까운 PDCA 선례: [`docs/01-plan/features/icon-mode.plan.md`](../../01-plan/features/icon-mode.plan.md) — Electron BrowserWindow 추가 + IPC 4채널 + Settings 마이그레이션 패턴

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

- [ ] `WidgetDesktopMode` 타입에 `'native-desktop'` 추가 (`'normal' | 'topmost' | 'native-desktop'`)
- [ ] `DesktopIconZoneSettings` 타입 신설 (`{ id, name, enabled, order }`)
- [ ] `settings.widget.desktopIconZones` 필드 추가 + 마이그레이션 (기존 사용자 무영향, `desktopMode` 기본값은 `'normal'`)
- [ ] 최초 활성화 시 기본 프리셋 3개 (`작업 전`, `작업 중`, `작업 완료`) 제안 — **기존 사용자 설정 덮어쓰기 금지**
- [ ] `electron/desktopWidgetManager.ts` 신설 — Win32 attach/disable/healthCheck/updateBounds/setPassThroughZones 캡슐화
- [ ] `electron/desktopIconZoneTypes.ts` 신설 — main/preload/renderer 공유 순수 타입
- [ ] `electron/platform/win32Desktop.ts` 신설 — `koffi` 기반 Win32 FFI wrapper (Progman/WorkerW/DefView/ListView, mouse hook)
- [ ] 비Windows no-op manager — macOS/Linux에서 안전한 fallback (`desktopMode='native-desktop'`이면 `'normal'`로 회귀)
- [ ] `src/adapters/components/Widget/DesktopIconZoneCard.tsx` 신설 — 카드 UI (제목 + 점선 테두리 + 반투명 배경 + 안내 문구)
- [ ] `src/adapters/components/Widget/DesktopIconZoneSettings.tsx` 신설 (또는 `WidgetContextMenu.tsx` 확장) — 구역 추가/삭제/이름 변경 UI (1~6개 제한)
- [ ] Renderer ResizeObserver + debounce/throttle — zone DOM rect 측정 후 `desktopIconZones:updateBounds` IPC로 main 전송
- [ ] Preload `window.electronAPI.desktopIconZones.updateBounds(zones)` / `clearBounds()` 안전 노출
- [ ] `window:applyWidgetSettings` 정규화 수정 — `'native-desktop'` 값을 `'normal'`로 버리지 않게 (현재 코드의 잠재 버그)
- [ ] `createWidgetWindow` 후 ready/show 시점에 manager `enable()` 호출 + 실패 시 fallback 적용
- [ ] `window:toggleWidget` destroy 전 manager `disable()` 호출 (cleanup)
- [ ] `window:setWidgetLayout`, `window:resizeWidget`, move/resize 이벤트 후 manager `updateWidgetBounds()` 호출
- [ ] Win+D 복구·display/session 이벤트 후 manager `healthCheck()` 또는 re-enable
- [ ] DPI 보정 — Renderer CSS px / Electron DIP / Win32 physical px 변환 (devicePixelRatio + display scaleFactor)
- [ ] 다중 모니터 안전망 — `screen.getDisplayNearestPoint` 활용
- [ ] mouse hook 정책: `desktop-icon-zone` 영역 = `CallNextHookEx`로 통과(빈 공간 포함), 일반 위젯 영역 = Electron HWND 자체 처리(가능하면 재전송 없이)
- [ ] cleanup 다중 호출 안전성 (위젯 destroy/closed, app quit, mode 변경, Explorer 재시작)
- [ ] `koffi` 의존성 추가 + `scripts/build-electron.mjs` external 등록 + `electron-builder.yml` `asarUnpack` 검토
- [ ] 설정 UI 안내 문구 (Windows 전용 표기, 보안 안내 문구)
- [ ] release-notes.json 항목 추가 + AI 챗봇 KB Q&A 추가 + 노션 가이드 갱신

### 2.2 제외 범위 (Out of Scope)

- macOS / Linux 네이티브 구현 — Windows 전용 기능 (no-op fallback만 제공)
- 모바일 앱(`src/mobile/`) — 데스크톱 Electron 전용
- 바탕화면 파일/아이콘 데이터의 쌤핀 측 저장·인덱싱·업로드
- 바탕화면 아이콘 자동 분류 / AI 추천 / OCR
- 카드 영역의 자동 스크롤·스마트 스냅·아이콘 정렬
- 일반 쌤핀 카드 영역에서 바탕화면 아이콘이 보이게 하는 "전역 호환 모드" (이번 방향은 zone 한정)
- 라우팅 정책 사용자 커스터마이징 (YAGNI — 기본 정책만)
- 자동 로그인·인증정보 수집·외부 전송 (보안 이슈 회피)

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 사용자는 위젯 설정에서 "바탕화면 작업판" 모드를 켜고 끌 수 있다 | Must | Pending |
| FR-02 | 활성화 시 위젯 BrowserWindow가 Explorer WorkerW에 attach되고 `alwaysOnTop=false`가 된다 | Must | Pending |
| FR-03 | `desktop-icon-zone` 카드 내부에서는 마우스 클릭/드래그가 Explorer로 통과되어 바탕화면 아이콘을 직접 조작할 수 있다 (빈 공간 포함) | Must | Pending |
| FR-04 | 일반 쌤핀 카드/버튼/메모 영역은 기존처럼 Electron 위젯이 클릭을 받는다 | Must | Pending |
| FR-05 | 사용자는 구역 카드의 개수(1~6개)와 이름을 자유롭게 변경할 수 있다 | Must | Pending |
| FR-06 | 최초 활성화 시 기본 프리셋 3개(`작업 전`, `작업 중`, `작업 완료`)가 제안된다. 기존 사용자 설정은 덮어쓰지 않는다 | Must | Pending |
| FR-07 | 위젯 이동/리사이즈/Win+D/디스플레이 변경 후 zone pass-through 좌표가 자동으로 갱신된다 | Must | Pending |
| FR-08 | Explorer 재시작 후 native-desktop attach가 자동 재부착된다 | Should | Pending |
| FR-09 | macOS/Linux에서는 `native-desktop` 옵션이 숨김 또는 disabled 상태로 표시되며, 모드 값이 들어와도 안전하게 `'normal'`로 fallback된다 | Must | Pending |
| FR-10 | DPI 100% / 125% / 150% 모두에서 zone 좌표가 시각적으로 일치한다 | Must | Pending |
| FR-11 | 다중 모니터에서 위젯이 어느 모니터에 있든 zone 좌표가 정확하다 | Must | Pending |
| FR-12 | 절전/잠금 복귀 후에도 attach 상태가 유지되거나 healthCheck로 자동 복구된다 | Should | Pending |
| FR-13 | 기능 OFF 시 즉시 기존 `'normal'` 또는 `'topmost'` 위젯 모드로 되돌아간다 (cleanup 보장) | Must | Pending |
| FR-14 | manager `enable()` 실패 시 사용자에게 토스트로 알림 + 자동 fallback (앱이 죽으면 안 됨) | Must | Pending |
| FR-15 | 새 IPC 채널 2개 노출: `desktopIconZones:updateBounds(zones)`, `desktopIconZones:clearBounds()` | Must | Pending |
| FR-16 | 설정 UI에 보안/동작 안내 문구 표시: "Windows 창 계층과 마우스 이벤트를 제어합니다. 문제 시 일반 위젯 모드로 즉시 되돌릴 수 있습니다." | Must | Pending |
| FR-17 | 쌤핀은 바탕화면 파일 경로/이름/아이콘 데이터를 저장하지 않는다 (구역 이름·개수·레이아웃만 저장) | Must | Pending |
| FR-18 | 카드 내부의 안내 문구·편집 버튼은 pass-through 영역 밖이거나 별도 편집 모드에서만 클릭 가능하도록 설계 | Must | Pending |
| FR-19 | release-notes.json에 v2.1.0 항목 추가 + AI 챗봇 KB Q&A 추가 + 노션 가이드 갱신 | Must | Pending |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| ID | 분류 | 요구사항 | 검증 방법 |
|----|------|----------|-----------|
| NFR-01 | 안정성 | manager `enable()` 실패 시 앱이 죽지 않는다 | unit test + 실기 검증 |
| NFR-02 | 안정성 | cleanup이 여러 번 호출되어도 예외가 없다 | unit test |
| NFR-03 | 성능 | mouse hook 콜백 평균 처리 시간 < 0.5ms (zone bounds 캐시 hit-test만) | dev tools 측정 |
| NFR-04 | 성능 | zone bounds 갱신 IPC 빈도 ≤ 30Hz (debounce/throttle) | renderer 측정 |
| NFR-05 | 보안 | 외부 네트워크 호출 없음 | 코드 grep |
| NFR-06 | 보안 | 민감 정보(API key/token/credential) 코드/로그 미포함 | 코드 grep |
| NFR-07 | 호환성 | Windows 10 21H2+ 및 Windows 11 모두 동작 | 실기 검증 |
| NFR-08 | 호환성 | 비Windows 환경에서 빌드/실행 정상 (no-op fallback) | CI typecheck + macOS 빌드 |
| NFR-09 | 회귀 안전성 | 기존 `normal`/`topmost` 위젯 모드 / 아이콘 모드 / Win+D 복구 / 트레이가 깨지지 않는다 | 수동 회귀 체크리스트 |
| NFR-10 | 코드 품질 | TypeScript strict 위반 0 (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`) | `npm run typecheck` |
| NFR-11 | 모듈성 | Win32/FFI 코드는 `electron/platform/` 하위로 분리, `electron/main.ts`는 manager만 import | 코드 리뷰 |

---

## 4. 사용자 시나리오 (User Stories)

### Story 1: 첫 활성화

> 김 교사는 위젯 모드에서 우클릭 → "바탕화면 작업판" 메뉴를 클릭한다.
> 쌤핀이 "Windows 바탕화면 아이콘을 위젯 위에 배치할 수 있는 모드입니다" 안내 후 활성화된다.
> 위젯에 `작업 전`, `작업 중`, `작업 완료` 3개 카드가 점선 테두리로 나타난다.
> 김 교사는 바탕화면 `시험문제.hwpx`를 마우스로 끌어 `작업 중` 카드 위에 놓는다.
> 다음 날 같은 위치에 `시험문제.hwpx` 파일이 그대로 있다.

### Story 2: 단계 이동

> 박 교사는 `작업 중` 카드의 `결재서류.pdf`를 마우스로 끌어 `작업 완료` 카드로 옮긴다.
> 시각적으로는 카드가 바뀐 것처럼 보이지만, 실제로는 Windows Explorer가 아이콘 위치를 옮긴 것이다.

### Story 3: 구역 커스터마이징

> 이 교사는 "구역 이름이 마음에 안 들어" 라며 설정을 연다.
> `작업 전` → `결재 대기`, `작업 중` → `검토 중`, `작업 완료` → `결재 끝`으로 이름을 바꾼다.
> 추가로 `폐기 예정` 구역을 하나 더 만든다.
> 위젯에 4개 카드가 정상 표시된다.

### Story 4: 일반 쌤핀 카드와의 공존

> 시간표 위젯·메모 카드·할일 카드는 그대로 클릭/입력이 가능하다.
> `desktop-icon-zone` 카드 내부에서만 마우스가 Explorer로 통과한다.

### Story 5: 비활성화·되돌리기

> 안티바이러스 경고 또는 동작 이상 시 사용자는 설정에서 모드를 OFF한다.
> 즉시 위젯이 일반 `'normal'` 모드로 복귀하고 zone 카드는 사라진다. 쌤핀 동작은 정상이다.

### Story 6: 비Windows 환경

> macOS 사용자가 위젯 설정을 열면 "바탕화면 작업판" 항목이 회색으로 비활성화되어 있고 "Windows에서만 사용할 수 있습니다" 안내가 보인다.

---

## 5. 성공 기준

이 기능이 "성공"했다고 판단하는 정량/정성 기준:

### 5.1 정량 기준

- ✅ `npm run typecheck` 통과 (0 errors)
- ✅ `npm run build:electron` 통과
- ✅ `npm run build` 통과
- ✅ 단위 테스트 신규 추가 (타입 정규화, no-op manager fallback, invalid rect 무시) ≥ 5개, 모두 PASS
- ✅ Windows 실기 검증 체크리스트 17항목 모두 PASS
- ✅ Match Rate ≥ 90% (gap-detector 기준)
- ✅ 회귀 테스트 — 기존 `normal`/`topmost`/`icon` 위젯 모드, Win+D 복구, 트레이 동작 모두 정상

### 5.2 정성 기준

- ✅ 사용자가 별도 설명 없이도 "이 카드 위에 바탕화면 아이콘을 놓으면 되겠구나"를 인지할 수 있는 시각 디자인
- ✅ 일반 쌤핀 영역과 zone 카드의 시각 구분이 명확
- ✅ 안티바이러스 false-positive 발생 시 즉시 OFF 가능 + 안내 문구가 충분
- ✅ Windows 외 환경에서 옵션이 자연스럽게 숨겨지거나 disabled

### 5.3 비-성공 기준 (이 단계에서 시도하지 않음)

- ❌ 일반 쌤핀 영역에서도 바탕화면 아이콘이 보이게 하는 전역 호환 모드
- ❌ 바탕화면 아이콘 자동 분류 / AI 추천
- ❌ macOS Stage Manager 등 비-Windows 동등 기능

---

## 6. 위험 및 대응

| 위험 | 발생 가능성 | 영향도 | 대응 |
|------|-------------|--------|------|
| WorkerW/DefView 구조가 Windows 버전·Explorer 상태에 따라 다름 | 중 | 중 | EnumWindows 기반 다중 후보 탐색, fallback 로직, healthCheck 주기적 재탐색 |
| DPI 125%/150% 또는 다중 모니터에서 zone 좌표 어긋남 | 중 | 중 | `screen.getDisplayNearestPoint` + scaleFactor + devicePixelRatio 조합 검증, 실기 체크리스트 명시 |
| `WH_MOUSE_LL` low-level hook이 안티바이러스 false-positive 유발 | 중 | 중 | 사용자 토글 + 안내 문구 + 즉시 OFF 가능 + 보안 안내 문서 |
| mouse hook 콜백이 무거워 시스템 전반 lag | 낮 | 높 | hook 콜백은 zone bounds 배열 hit-test만, 무거운 작업 main process 큐로 이관 |
| `koffi` native binary가 설치본에서 누락 | 낮 | 높 | `electron-builder.yml` `asarUnpack` 명시, 설치본 실기 검증 필수 |
| `Win+D` 복구 로직과 WorkerW parent attach 충돌 | 중 | 중 | startWinDRecovery에서 manager.healthCheck() 호출, parent 변경 후 ensureWidgetOnScreen 재호출 |
| 위젯 destroy 시 manager cleanup 누락 → handle leak | 중 | 중 | `window:toggleWidget` destroy 전 disable, app quit 시에도 disable, 다중 호출 안전 |
| `Widget.tsx`의 `rgba(0,0,0,0.01)` 배경이 zone pass-through와 충돌 | 중 | 중 | 실기 검증 시 명시 항목, 충돌 시 zone 영역만 완전 transparent로 분리 |
| 카드 내 안내 문구·편집 버튼이 pass-through 영역에 있어 클릭 불가 | 중 | 중 | UI 설계 시 안내·편집을 별도 레이어/편집 모드로 분리 (FR-18) |
| native attach 실패 시 사용자가 영문 모르고 "쌤핀 망가짐"으로 인식 | 낮 | 중 | 실패 시 토스트 + 자동 fallback + 설정에 상태 표시 |
| Settings 마이그레이션 실패로 기존 사용자의 zone 데이터가 손실 | 낮 | 높 | 마이그레이션 시 unknown 값 → `'normal'` 정규화, 기본값 보강만 (덮어쓰기 금지) |

---

## 7. 아키텍처 고려사항

### 7.1 의존성 방향 (Clean Architecture 준수)

```
infrastructure (electron/main.ts, electron/desktopWidgetManager.ts, electron/platform/win32Desktop.ts)
        ↓
adapters (DesktopIconZoneCard.tsx, DesktopIconZoneSettings.tsx, WidgetContextMenu.tsx)
        ↓
domain (Settings.ts, DesktopIconZoneSettings 타입)
```

- domain에는 **순수 타입만** (Electron/Node 의존성 없음)
- `electron/desktopIconZoneTypes.ts`는 domain에서 재export하거나 별도 공유 모듈
- `electron/platform/win32Desktop.ts`는 `koffi` 사용 — Win32 세부 격리

### 7.2 IPC 표면 (preload contextBridge)

| 채널 | 방향 | 페이로드 | 비고 |
|------|------|----------|------|
| `desktopIconZones:updateBounds` | renderer → main | `DesktopIconZoneBounds[]` | renderer 측 입력 검증 (id/name/rect numeric) |
| `desktopIconZones:clearBounds` | renderer → main | `void` | 위젯 hide / mode OFF 시 |
| `window:applyWidgetSettings` (수정) | renderer → main | `{ opacity, desktopMode }` | `'native-desktop'` 값 보존하도록 정규화 수정 |

### 7.3 새 파일·수정 파일 매핑

| 파일 | 종류 | 비고 |
|------|------|------|
| `electron/desktopWidgetManager.ts` | 신규 | enable/disable/healthCheck/updateBounds/setPassThroughZones API |
| `electron/desktopIconZoneTypes.ts` | 신규 | main/preload/renderer 공유 순수 타입 |
| `electron/platform/win32Desktop.ts` | 신규 | koffi 기반 Win32 FFI wrapper |
| `electron/main.ts` | 수정 | manager import + lifecycle 통합, applyWidgetSettings 정규화 수정 |
| `electron/preload.ts` | 수정 | desktopIconZones API 노출 |
| `src/domain/entities/Settings.ts` | 수정 | WidgetDesktopMode 확장 + DesktopIconZoneSettings 타입 |
| `src/adapters/components/Widget/DesktopIconZoneCard.tsx` | 신규 | 카드 UI |
| `src/adapters/components/Widget/DesktopIconZoneSettings.tsx` | 신규 | 구역 추가/삭제/이름 변경 UI |
| `src/adapters/components/Widget/Widget.tsx` | 수정 | zone 카드 렌더링 + ResizeObserver bounds 측정 |
| `src/adapters/components/Widget/WidgetContextMenu.tsx` | 수정 | 바탕화면 작업판 ON/OFF + 설정 진입 |
| `scripts/build-electron.mjs` | 수정 | esbuild external에 `'koffi'` 추가 |
| `electron-builder.yml` | 수정 | `asarUnpack`에 `**/node_modules/koffi/**` 추가 검토 |
| `package.json` | 수정 | `koffi` runtime dependency 추가 |
| `public/release-notes.json` | 수정 | v2.1.0 항목 추가 |
| `scripts/ingest-chatbot-qa.mjs` | 수정 | Q&A 추가 |

### 7.4 단계 분리 (Phase 1 / Phase 2)

PDCA Do 단계는 두 단계로 분리한다:

| Phase | 범위 | 검증 환경 |
|-------|------|-----------|
| Phase 1 (Safe) | 타입·설정·UI·no-op manager·`applyWidgetSettings` 정규화 수정 | `npm run typecheck` + `npm run build` (비Windows에서도 통과) |
| Phase 2 (Win32) | `koffi` 도입 + WorkerW attach + mouse hook + zone pass-through + healthCheck | Windows 실기 검증 17항목 |

이렇게 분리해야 native 코드 버그가 위젯 모드 전체를 깨뜨리는 위험을 격리할 수 있다.

---

## 8. 컨벤션 사전 검토

### 8.1 CLAUDE.md 준수

- ✅ TypeScript strict, `any` 금지
- ✅ Path alias 사용 (`@domain/`, `@adapters/`, `@infrastructure/`)
- ✅ Tailwind 유틸리티 클래스, `rounded-sp-*` 금지(`feedback_rounding_policy.md`)
- ✅ 모든 UI 텍스트 한국어
- ✅ DI 컨테이너 → Repository → IStoragePort 경로 (Settings 저장)
- ✅ 디자인 토큰 (`sp-bg`, `sp-card`, `sp-border`, `sp-accent`, `sp-text`, `sp-muted`)
- ✅ 프론트 작업은 `frontend-design` / `bkit:frontend-architect`와 협업 (`feedback_frontend_agent_collaboration.md`)

### 8.2 현 코드베이스 확장 패턴

- icon-mode가 신설한 IPC 채널 패턴 (`icon:show`, `icon:hide`, `icon:set-bounds`, `icon:expand`)을 그대로 따라 `desktopIconZones:updateBounds`/`desktopIconZones:clearBounds` 명명
- `executeWindowTransition` Promise chain 큐잉 패턴은 재사용 (모드 전환 race 방지)
- `lastUserMode` 추적 패턴은 `desktopMode`에도 동일 적용 (사용자가 OFF 시 직전 모드 복원)

---

## 9. 다음 단계

1. **Design 문서 작성** (`/pdca design native-desktop-mode`) — 본 Plan 기반으로 IPC/타입/Win32 함수 시그니처/DPI 변환식/마우스 라우팅 정책을 코드 레벨까지 명세
2. **Phase 1 Do (Safe)** — 타입·설정·UI·no-op manager 구현, typecheck/build 통과까지
3. **Phase 2 Do (Win32)** — `koffi` 도입, WorkerW attach, mouse hook, zone pass-through. **Windows 실기에서 진행**
4. **gap-detector 분석** (`/pdca analyze native-desktop-mode`) — Match Rate ≥ 90% 목표
5. **report-generator** (`/pdca report native-desktop-mode`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-04 | 초안 — 사용자 제공 프롬프트(2026-05-04) 기반 PDCA Plan 작성 | pblsketch / Claude |
