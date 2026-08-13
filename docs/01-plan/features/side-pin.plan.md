# 옆핀(SidePin) v0.4 확정 기획서

- 상태: **정식 기획서 확정** — 구현 전 Windows·성능 decision gate 포함
- 확정일: 2026-08-13
- 범위: 기획만 수행, 구현 없음 (현재 `src/`·`electron/`에 SidePin 코드 0건)
- 계보: v0.2 초안(`side-pin-v0.plan.md`, 보관) → v0.3 합의안 → **v0.4 코드 대조 QA 반영본(이 문서)**
- 이 문서가 유일한 구현 기준이다. QA에서 바뀐 항목은 §20에 모아 두었다.

## 1. RALPLAN-DR 요약

### Principles

1. 옆핀은 기존 모드를 대체하지 않고 항상 병행 가능한 보조 창이어야 한다.
2. 위젯·메모 데이터는 기존 저장소를 정본으로 사용하고 옆핀용 복제본을 만들지 않는다.
3. 호버는 포커스를 빼앗지 않고, 클릭·편집처럼 사용자가 의도를 보인 상태만 포커스를 가진다.
4. 동기화할 사용자 선호와 기기별 창 위치를 분리한다.
5. 상시 손잡이의 편의는 회귀·개인정보·메모리 측정 기준을 통과할 때만 출시한다.

### Decision Drivers

1. 사용자가 확정한 세 동작: 호버 펼침, 클릭 고정, 옆핀 안 메모 작성·편집, 상시 손잡이.
2. 현재 구조와의 적합성: `WindowMode` 상호 배타 구조와 별도 창·브로드캐스트 선례.
3. Windows에서의 예측 가능성: 포커스, 다중 모니터, DPI, Win+D, 잠금 복귀, 상시 렌더러 비용.

### Viable Options

#### Option A — 전용 단일 BrowserWindow + 기존 기능의 옆핀 표시 계약

- 방식: 하나의 전용 창에 위젯·메모 영역을 두고, `WidgetCard`에는 기능 허용 정책을, `MemoEditor`에는 편집 활동 계약을 주입해 재사용한다.
- 장점: 두 영역의 포커스·z-order·수명을 한곳에서 관리하고 기존 저장소를 재사용할 수 있다.
- 단점: 렌더러 프로세스가 하나 늘고, WidgetCard·MemoEditor에 작은 확장 계약이 필요하다.

#### Option B — 기존 widgetWindow를 오른쪽 패널로 재사용

- 방식: 현재 위젯 창의 레이아웃과 위치를 바꿔 옆핀처럼 사용한다.
- 장점: 새 창 생성 코드가 적다.
- 단점: `WindowMode` 전환·데스크톱 배치·크기 조절과 결합되어 메인·위젯·아이콘과 병행한다는 요구를 훼손한다. 기존 위젯 모드 회귀 위험이 크다.

#### Option C — 위젯 창과 메모 창을 분리

- 방식: 오른쪽에 두 BrowserWindow를 붙여 각각 독립적으로 펼친다.
- 장점: 각 영역을 독립적으로 개발할 수 있다.
- 단점: 포커스, z-order, 모니터 이동, 영역 경계, 두 렌더러 메모리와 종료 순서가 복잡해진다.

#### Option D — 경량 상시 rail + 필요할 때만 생성하는 단일 panel renderer

- 방식: 16 DIP rail을 최소 렌더러 또는 native host로 상주시킨다. pointer-enter 즉시 보이지 않는 panel prewarm을 시작하고 180ms dwell 시 표시하며, collapse 뒤 10초 동안 재진입이 없으면 panel을 파기한다.
- 장점: 대부분의 collapsed 시간에 위젯·메모 React 트리와 민감 데이터를 메모리에 두지 않는다.
- 단점: rail과 panel 두 창의 z-order·위치·복원·포커스를 맞춰야 하고, panel 준비가 180ms를 넘는 저사양 장비에서는 skeleton 또는 reveal 지연이 생길 수 있다. 따라서 실제 reveal 시간도 host gate에서 측정한다.

### Recommendation

Option A를 **성능 조건부로 채택**한다. 구현 첫 단계에서 `SidePinWindowHost` 경계 뒤에 단일 창 spike를 만들고 release build 성능 gate를 통과하면 Option A를 확정한다. gate를 통과하지 못하면 Domain·UseCase·UI 계약은 유지한 채 host만 Option D로 교체해 다시 측정한다. Option B는 병행 창이라는 핵심 요구와 충돌하고, Option C는 영역별 두 창이라 사용 흐름과 창 수명 복잡성이 가장 크다.

WidgetCard 재사용 방식은 화면명 기반 mode를 넣지 않고 `interactionPolicy`를 주입한다. 옆핀 정책은 `allowModal=false`, `primaryAction='navigate'`, `allowedInlineActions=[]`, `unavailableAction='disable'`로 고정한다. 카드 본문은 `onNavigate`로만 위임하며, 기존 분기는 이미 존재한다(`src/widgets/components/WidgetCard.tsx:68-77`).

## 2. Requirements Summary

확정 요구사항은 7개다.

1. 위젯 영역에 마우스를 올리면 펼쳐진다.
2. 손잡이·영역 헤더·고정 아이콘을 클릭하면 해당 영역을 고정할 수 있다.
3. 옆핀 안에서 메모를 새로 작성하고 기존 메모를 전체 편집할 수 있다.
4. 앱 실행 후 오른쪽 가장자리에 접힌 손잡이가 계속 보인다.
5. 위젯과 메모는 하나의 창 안에서 시각·스크롤·데이터 흐름이 분리된다.
6. 옆핀은 `main`, `widget`, `icon`과 병행하고 `WindowMode`에 추가하지 않는다. 현재 타입은 세 값뿐이다(`src/domain/valueObjects/WindowMode.ts:10`).
7. 화면·문구·동작은 쌤핀 디자인 시스템과 자체 상태 모델로 독립 설계한다.

## 3. 범위 결정

### 1차 포함

- 앱 시작 시 접힌 오른쪽 손잡이 표시
- 위젯 호버 펼침, 클릭 고정, 고정 해제
- 사용자가 고른 적격 위젯 기본 3개·최대 4개 표시
- 메모 최근 수정순 목록, 새 작성, 편집, 색상, 글자 크기, 이미지, 삭제, 보관
- 메모 편집 중 자동 접힘 방지와 저장 실패 표시
- 단일·다중 모니터, 100/125/150% DPI, 모니터 제거 fallback
- typed preload IPC, 창 간 `data:changed` 동기화
- 설정에서 옆핀 완전 끄기, 위젯 선택·순서 설정
- 개인정보 잠금 상태에서 메모 미리보기 가림
- **기존 메모 저장 경로의 `MemoMutationCoordinator` 이전**(§7) — 옆핀 전용 작업이 아니라 기존 메모 기능 전체에 영향을 주는 항목이므로 범위에 명시한다(QA-03)

> ⚠️ 마지막 항목의 무게를 축소하지 않는다. `memos`는 Drive 동기화 대상 도메인이고(`src/usecases/sync/syncRegistry.ts:127-129`), `useMemoStore`의 create/update/color/font/image/delete/archive/restore와 `data:write('memos')` bulk replace가 모두 새 queue를 지난다. 즉 **옆핀을 끈 사용자도 메모 저장 경로가 바뀐다.** 과거 관찰기록 파일 LWW로 사용자 데이터가 소실된 사고와 같은 계열의 위험이므로, 구현 순서상 §9-8(메모 zone)에 앞서 기존 메모 회귀 스위트를 먼저 통과시키고, 이 이전 작업만 단독 커밋으로 분리해 되돌릴 수 있게 한다. 일정 압박이 생기면 옆핀 편집만 coordinator를 쓰고 기존 경로 이전은 후속 작업 단위로 미루는 축소안을 사용자에게 먼저 제안한다.

### 1차 제외

- 메모 `pinned` 필드와 스키마 마이그레이션
- 메모 제목 필드 추가
- 위젯 추가·삭제·자유 배치·옆핀 안 확장 모달
- 위젯/메모 높이 구분선 드래그
- 두 개 이상의 panel 콘텐츠 창(Option D의 손잡이 전용 rail 창은 제외)
- 각 Windows 가상 데스크톱마다 rail을 복제하거나 자동 이동하는 기능

### 독자 설계·권리 기준

- 명칭은 `옆핀`, 화면은 쌤핀 `sp-*` 토큰, 정보 구조는 `위젯 영역 + 메모 영역`, 동작은 이 문서의 상태 모델을 기준으로 설계한다.
- 화면·문구·아이콘·애니메이션은 쌤핀 제품 언어와 디자인 시스템 안에서 새로 제작한다.
- 소스·DOM·CSS·이미지 등 제3자 에셋을 제품 코드나 기획 산출물에 포함하지 않는다.
- 디자인 검수는 쌤핀 요구사항·디자인 시스템·접근성 기준으로만 수행한다.
- 의사결정 기록에는 자체 요구사항, 초안, 수정 이력만 남긴다. `옆핀` 명칭은 공개 전 KIPRIS 상표 검색과 필요 시 전문가 검토를 별도 진행한다.

## 4. 데이터 결정

### 메모 목록

- 현재 `Memo`는 `content`, `updatedAt`, `archived` 등을 가지지만 `pinned`와 `title`은 없다(`src/domain/entities/Memo.ts:5-19`).
- 1차 목록은 보관되지 않은 메모를 `updatedAt` 내림차순으로 정렬해 최대 5개 표시한다.
- 표시 라벨은 첫 번째 비어 있지 않은 본문 줄을 40자로 자른 값이다. 빈 메모는 `새 메모`로 표시한다.
- 나머지 본문은 최대 2줄 미리보기로 표시한다.
- `고정 메모 우선`은 후속 기능으로 분리하고 v0.3에서 `memoScope: 'pinned-first'`를 삭제한다.
- `메모 추가`의 기본 색상은 `yellow`로 고정하고, 생성 직후 편집기에서 변경할 수 있다. `addMemo`가 색상을 요구하는 현재 계약과 맞춘다.

### 위젯 적격성

`src/widgets/registry.ts`의 각 항목에 optional `sidePin` 메타데이터를 둔다.

```ts
type SidePinWidgetMetadata =
  | { eligible: true; navigationTarget: SidePinNavigationTarget }
  | { eligible: false; unavailableReason: string };
```

명시적으로 `eligible:true`이고 allowlisted navigation target이 있는 위젯만 1차 옆핀 카드가 될 수 있다. 기본 선택은 적격 registry 순서의 첫 3개이며 적격 위젯이 적으면 실제 개수만 표시한다. 설정 목록에는 부적격 위젯도 disabled 상태와 한국어 사유로 보여 준다. 저장된 ID가 삭제되거나 부적격으로 바뀌면 runtime에서는 제외하고 다음 적격 위젯으로 빈 자리를 채우되, 저장값을 조용히 덮어쓰지 않고 설정에 교정 안내를 표시한다.

### 동기화 설정과 기기 설정

동기화되는 `Settings.sidePin`:

- `enabled`: 성능 출시 게이트를 통과한 배포본에서만 기본 `true`; 개발·내부 검증 중에는 feature flag 기본 `false`
- `widgetItemIds`: 표시 위젯과 순서
- `memoSort`: 1차에서는 `'recent'` 단일 값
- `schemaVersion`

기기 전용 `side-pin-device-state.json`:

- `schemaVersion: 1`
- `displayId`
- `panelWidth`: 기본 400, 최소 360, 최대 460 DIP

기기 전용 파일은 Electron main이 `app.getPath('userData')` 아래에서 소유한다. 쓰기는 단일 직렬 큐에서 primary temp와 backup temp를 각각 작성·fsync·검증한 뒤 처리한다. Windows에서 기존 primary 교체는 새 Win32 atomic writer의 `ReplaceFileW`, 최초 생성은 `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` 경계로 고정한다. primary 교체 성공 뒤 last-good backup 교체가 실패해도 primary를 rollback하지 않고 남은 backup temp를 보존한다.

저장 결과는 `saved | saved-with-backup-warning | failed`다. primary 실패만 `failed`이며 기존 primary를 유지한다. primary 성공·backup 실패는 `saved-with-backup-warning`으로 설정 UI에 재시도 가능한 경고를 보낸다. 파일 누락은 기본값, 파손·구버전·범위 밖 값은 마이그레이션 또는 last-good 복구 뒤 기본값 정규화를 적용한다. 저장된 `displayId`는 창을 펼칠 때마다 현재 display 목록에 다시 대조한다. `displayId`를 동기화 Settings에 넣지 않는 이유는 기기 전용 값을 일반 설정 정본에 두지 말라는 기존 교훈과 같다(`src/domain/entities/Settings.ts:365-373`).

기존 사용자에게 `enabled=true`를 넣는 Settings 마이그레이션은 Option A 또는 D가 아래 성능 게이트를 통과한 출시 후보에서만 활성화한다. 따라서 제품 요구인 “기본 상시 rail”과 검증 전 내부 빌드의 안전한 기본값을 구분한다.

`pinnedZone`은 실행 중 상태이며 저장하지 않는다. 앱을 다시 시작하면 항상 접힌 손잡이로 시작한다.

## 5. 상태 모델

하나의 열거형에 모든 경우를 넣지 않고 서로 다른 축으로 표현한다.

> 🔧 **구현 정정 IMP-03.** 아래 타입은 v0.3 원안이며, 구현 중 세 가지가 추가됐다(자세한 이유는 §21).
> ① `SidePinSurface`에 `'opening'` ② `SidePinRuntimeState`에 `enabled`·`protectedReason`
> ③ `SidePinPendingTransition`에 `'show-timeout'`, `SidePinPendingHostOperation`에 `userInitiated`.
> 또한 **같은 종류의 창 조작은 하나만 대기한다**(새 요청이 지난 요청을 밀어냄)는 불변식이 추가됐다.
> 실제 정의는 `src/domain/entities/SidePinRuntimeState.ts`가 정본이다.

```ts
type SidePinSurface = 'collapsed' | 'expanded';
type SidePinOpenReason = 'hover' | 'click' | 'shortcut' | null;
type SidePinZone = 'widget' | 'memo' | 'both';
type SidePinPinnedZone = 'none' | SidePinZone;
type SidePinPointerRegion = 'outside' | 'rail-widget' | 'rail-memo' | 'panel-widget' | 'panel-memo';
type SidePinPanelLifecycle = 'absent' | 'preparing' | 'ready' | 'visible' | 'cooldown';
type MemoEditorActivity = 'idle' | 'editing' | 'saving' | 'dialog-open' | 'save-error';

interface SidePinPendingTransition {
  type: 'reveal' | 'collapse' | 'dispose-panel';
  scheduledRevision: number;
  dueAtMs: number;
}

type SidePinHostOperationKind =
  | 'ensure-rail'
  | 'prepare-panel'
  | 'show-panel'
  | 'collapse-panel'
  | 'dispose-panel'
  | 'hide-all'
  | 'reposition-all'
  | 'focus-panel'
  | 'destroy-all';

interface SidePinPendingHostOperation {
  operationId: string;
  kind: SidePinHostOperationKind;
  requestedRevision: number;
}

interface SidePinRuntimeState {
  surface: SidePinSurface;
  openReason: SidePinOpenReason;
  activeZone: SidePinZone | null;
  pinnedZone: SidePinPinnedZone;
  pointerRegion: SidePinPointerRegion;
  panelLifecycle: SidePinPanelLifecycle;
  pendingTransition: SidePinPendingTransition | null;
  pendingHostOperations: readonly SidePinPendingHostOperation[];
  hostError: { operationId: string; code: string } | null;
  hasWindowFocus: boolean;
  editorActivity: MemoEditorActivity;
  revision: number;
}
```

Electron main에서 생성되는 application `SidePinController` 한 개가 runtime aggregate와 `revision`의 유일한 정본이다. controller는 주입된 `SidePinScheduler`로 180/400ms 타이머와 취소를 모두 소유하고, 순수 domain 전이 함수를 호출한 뒤 `SidePinWindowHost`에 적용 명령을 보낸다. Electron host와 renderer는 독자적인 전이 규칙이나 타이머를 갖지 않는다.

renderer의 `useSidePinStore`는 controller가 보낸 state snapshot을 표시하는 mirror다. pin toggle·editor activity 같은 제품 intent만 controller command로 보낸다. DOM pointer/focus telemetry는 preload의 host-internal bridge를 통해 `SidePinWindowHost`가 sender 역할과 region을 정규화한 뒤 `SidePinHostEvent` 한 경로로만 controller에 전달한다. 각 처리 결과는 증가한 `revision`과 함께 `sidePin:state-changed`로 돌아온다. 지연 콜백은 **`pendingTransition`이 아직 살아 있고 그 예약이 맞을 때만** 실행하고, 비동기 host 완료는 `operationId + requestedRevision`이 `pendingHostOperations`의 현재 항목과 모두 일치할 때만 적용한다.

> 🔧 **구현 정정 IMP-01.** v0.3은 여기를 "`scheduledRevision`과 현재 revision이 다르면 폐기"로 적었으나, 그대로 구현하면 **호버로 패널이 절대 열리지 않는다.** 손잡이 진입 시 180ms 예약과 `prepare-panel`이 동시에 나가는데, 창 준비 응답이 180ms 안에 돌아오면 그 처리로 revision이 올라가 방금 건 예약이 스스로 무효가 된다. 창 준비라는 내부 사정이 사용자 의도를 취소하는 셈이다. 취소 의미는 `pendingTransition` 대조로 충분히 지켜진다 — 사용자 의도가 바뀌는 지점(포인터 이탈·고정·편집 시작)에서 이 필드를 반드시 지우거나 교체하기 때문이다. 반례는 `src/domain/services/resolveSidePinTransition.test.ts`의 "창 준비 응답이 먼저 와도 펼침 예약이 살아남는다"가 지킨다. `pointerRegion`, transition, host operation도 aggregate에 포함하므로 controller 바깥의 숨은 상태로 전이를 결정하지 않는다.

### 상태 전이 규칙

| 시작                           | 이벤트                                      | 결과                                                                                            |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 앱 시작 + enabled              | 창 준비                                     | 오른쪽 손잡이 `collapsed`, `pinnedZone=none`                                                    |
| collapsed                      | pointerRegion=`rail-widget                  | rail-memo`                                                                                      | controller가 현재 revision에 180ms reveal 예약, Option D host는 panel prepare 시작           |
| reveal 예약                    | 180ms 경과, pointer 유지, 예약 유효(IMP-01) | correlation 포함 `showPanel` 요청, surface=`collapsed`와 lifecycle=`preparing                   | ready`유지; matching`panelPainted(applied)`수신 때만`expanded`, reason=`hover`, 두 영역 표시 |
| reveal 예약                    | pointer leave 또는 더 새 intent             | 예약 취소, `collapsed` 유지                                                                     |
| panel preparing                | pointer leave·reveal 취소                   | 새 revision으로 collapse/dispose 명령, lifecycle=`cooldown                                      | absent`; 이전 ready 완료는 stale 폐기                                                        |
| hover-expanded                 | 전체 창 pointer leave                       | 400ms 접힘 타이머 시작                                                                          |
| 접힘 타이머 중                 | pointer re-enter                            | 타이머 취소                                                                                     |
| Option D rail leave            | 400ms 안 panel enter                        | `outside`를 거쳐도 같은 옆핀 내부 이동으로 합쳐 collapse 예약 취소                              |
| Option D panel leave           | 400ms 안 rail enter                         | 같은 내부 이동으로 합쳐 rail 유지, panel은 필요 시 cooldown                                     |
| expanded                       | 손잡이·영역 헤더·고정 아이콘 클릭           | 해당 영역 pinned, 창 focus, reason=`click`                                                      |
| pinned                         | 같은 고정 지점 클릭                         | 해당 영역 unpin. pointer 밖이면 400ms 후 접힘                                                   |
| 어떤 expanded                  | WidgetCard 본문 클릭                        | 고정 상태 불변. 옆핀 모달 억제 후 메인 대상 화면으로 이동                                       |
| memo 목록                      | `메모 추가`                                 | yellow 빈 메모 생성 후 editor activity=`editing`                                                |
| memo 목록                      | 메모 카드 클릭                              | 해당 메모 editor activity=`editing`                                                             |
| editor activity가 idle 아님    | pointer leave/blur                          | 접힘 금지                                                                                       |
| editing                        | 이미지 파일 대화상자/뷰어                   | `dialog-open`, 접힘 금지                                                                        |
| dialog-open                    | 대화상자/뷰어 닫힘                          | `editing`, 접힘 금지                                                                            |
| editing                        | Esc 1회                                     | `MemoEditor`가 이벤트를 소비하고 저장 시도. 성공하면 idle·목록 복귀, 실패하면 `save-error` 유지 |
| saving                         | Esc/key repeat                              | 무시, 기존 저장 promise 하나만 유지                                                             |
| focused 또는 pinned, 편집 아님 | Esc                                         | pin 해제 후 collapsed                                                                           |
| hover-expanded                 | Esc/바깥 클릭                               | 무포커스이므로 의존하지 않음. pointer leave만 사용                                              |
| focused, unpinned, 편집 아님   | 바깥 클릭                                   | collapsed                                                                                       |
| pinned                         | 바깥 클릭                                   | 유지                                                                                            |
| Option D collapsed             | panel hidden                                | lifecycle=`cooldown`, 현재 revision에 10초 dispose 예약                                         |
| Option D cooldown              | 10초 경과·예약 유효(IMP-01)                 | panel destroy, lifecycle=`absent`                                                               |
| Option D cooldown              | rail 재진입                                 | dispose 취소, 준비된 panel 재사용                                                               |
| ensureRail fatal 실패          | operation/revision이 현재와 일치            | session에서 옆핀 비활성, hostError 기록, 기본 ON/release gate 실패                              |
| preparePanel 실패              | operation/revision이 현재와 일치            | lifecycle=`absent`, surface=`collapsed`, rail 유지, hostError 표시                              |
| showPanel/panelPainted 실패    | operation/revision이 현재와 일치            | expanded 확정 금지, 새 collapse 명령 후 rail로 복구                                             |
| repositionAll 실패             | operation/revision이 현재와 일치            | 마지막 유효 layout 유지; 안전 display를 판정할 수 없으면 `hideAll` 후 오류                      |
| 늦은 ready/paint/result        | operation 또는 requestedRevision 불일치     | state 변경 없이 폐기, host가 숨은 잔여 panel 정리                                               |

Esc 소유권은 DOM event 단위로 고정한다. MemoEditor가 idle이 아닐 때 첫 Esc에서 `preventDefault`, React `stopPropagation`, native `stopImmediatePropagation`을 호출한 뒤 `onRequestClose`를 한 번만 await한다. activity=`saving` 동안 key repeat와 추가 Esc는 무시한다. 전이는 `dialog-open → editing`, `editing → saving → idle|save-error`만 허용하고, 저장 성공 후 발생한 **새 keydown**만 부모 `SidePinPanel`에 도달한다. `MemoEditor.onRequestClose`는 editor의 Esc·목록·닫기 버튼이 호출하고, IPC `sidePin:request-close`는 editor activity가 idle일 때 SidePinPanel의 닫기·두 번째 Esc만 호출한다. lock/suspend는 사용자 닫기와 별개인 controller 강제 보호 event로 처리한다.

`surface='expanded'`는 180ms dwell 완료가 아니라 현재 show operation의 `panelPainted(applied)`를 받은 시점에만 확정한다. 그 전에는 lifecycle=`preparing|ready`인 collapsed 상태이므로 host 실패가 canonical expanded 상태를 남기지 않는다.

> 🔧 **구현 정정 IMP-02.** 위 규칙과 "operation 결과가 오면 `pendingHostOperations`에서 제거"를 같이 적용하면 패널이 영영 안 열린다. host는 보통 `showPanel`의 **요청 접수(applied)를 먼저** 답하고 그린 뒤 `panelPainted`를 따로 보내는데, 앞 응답에서 대기 항목을 지워버리면 뒤이은 `panelPainted`가 짝을 잃고 stale로 버려진다. 패널은 화면에 떠 있는데 상태만 `collapsed`로 남는다. 따라서 **kind가 `show-panel`인 대기 항목은 `panelPainted`가 올 때까지 제거하지 않는다.** 이 결함은 도메인 단위 테스트로는 드러나지 않았고(그 순서를 재현하지 않아서), 가짜 host가 실제 순서를 흉내 낸 `SidePinController.test.ts`에서 잡혔다. 지금은 양쪽 테스트에 모두 순서를 넣어 두 겹으로 막는다.

메모 탐색 상태는 위젯 60%·메모 40% 고정 비율이다. 메모 편집 시 위젯 영역은 48 DIP 요약 헤더로 접히고 메모 편집기가 나머지 높이를 사용한다. 최소 너비 360 DIP는 `MemoEditor`의 최대 420px 계약과 함께 검증한다(`src/adapters/components/Memo/MemoEditor.tsx:194`).

## 6. Clean Architecture 4계층

### Domain

새 파일 후보:

- `src/domain/entities/SidePinPreferences.ts`: 동기화 가능한 사용자 선택만 소유
- `src/domain/entities/SidePinDeviceState.ts`: schemaVersion·displayId·panelWidth
- `src/domain/entities/SidePinRuntimeState.ts`: surface·reason·zone·editorActivity·revision
- `src/domain/events/SidePinEvent.ts`: renderer intent와 시스템 event의 닫힌 union
- `src/domain/valueObjects/SidePinWidth.ts`: 360~460 DIP 정규화
- `src/domain/services/resolveSidePinTransition.ts`: Electron·React 없는 순수 전이 규칙
- `src/domain/repositories/SidePinDeviceStateRepository.ts`: 기기 설정 읽기·쓰기 포트
- `src/domain/repositories/IMemoRepository.ts`: coordinator가 사용할 현재 snapshot 읽기·원자적 whole-file 쓰기 port 추가

`WindowMode`는 수정하지 않는다. `WidgetLayoutMode`의 `sidebar-right`도 그대로 둔다(`src/domain/entities/Settings.ts:119`). `Memo` 스키마도 1차에서 수정하지 않는다.

### UseCases

새 파일 후보:

- `src/usecases/sidePin/SidePinController.ts`: runtime aggregate·revision의 단일 소유자, intent 직렬 처리, host 명령 생성
- `src/usecases/sidePin/SidePinScheduler.ts`: clock·timeout을 주입하는 port; 180/400ms 예약과 취소를 controller에 집중
- `src/usecases/sidePin/SidePinWindowHost.ts`: A/D 모두가 구현할 rail·panel lifecycle port와 host event
- `src/usecases/sidePin/UpdateSidePinPreferences.ts`: 동기화 설정 변경
- `src/usecases/sidePin/LoadSidePinDeviceState.ts`
- `src/usecases/sidePin/SaveSidePinDeviceState.ts`
- `src/usecases/sidePin/SelectSidePinMemos.ts`: 최근·비보관 메모 선별과 표시 라벨 파생
- `src/usecases/sidePin/ReconcileMemoChange.ts`: 외부 변경 revision과 로컬 editor activity를 비교해 reload·conflict·deleted 결과 결정
- `src/usecases/memo/MemoMutationCoordinator.ts`: process-wide queue, expectedUpdatedAt CAS, monotonic updatedAt/changeRevision, bulk diff, envelope 순서를 단독 소유

위젯 React 컴포넌트 조합은 usecase에서 하지 않는다. 위젯 ID·순서 선별만 순수 규칙으로 두고 실제 registry·React 조합은 adapter에서 한다.

host-neutral 계약은 다음 capability를 모두 표현한다.

```ts
interface SidePinHostCommandContext {
  operationId: string;
  requestedRevision: number;
}

type SidePinHostCommandResult =
  | { status: 'applied'; operationId: string; requestedRevision: number }
  | { status: 'stale'; operationId: string; requestedRevision: number }
  | {
      status: 'failed';
      operationId: string;
      requestedRevision: number;
      code: string;
      recoverable: boolean;
    };

interface SidePinWindowHost {
  ensureRail(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult>;
  preparePanel(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult>;
  showPanel(
    ctx: SidePinHostCommandContext,
    options: { focus: boolean },
  ): Promise<SidePinHostCommandResult>;
  collapsePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  disposePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  hideAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  repositionAll(
    ctx: SidePinHostCommandContext,
    layout: SidePinLayout,
  ): Promise<SidePinHostCommandResult>;
  focusPanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  destroyAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  subscribe(listener: (event: SidePinHostEvent) => void): () => void;
}
```

`panelReady`, `railPainted`, `panelPainted`, command 유래 `visibilityChanged` event는 같은 `operationId + requestedRevision`을 반드시 돌려준다. pointer/focus/OS visibility처럼 물리 입력인 event는 operation 완료가 아니므로 별도 `hostEventId`를 가지며 controller에 들어가는 유일한 physical-input 경로가 된다. host는 가장 최근 accepted revision보다 오래된 command의 비동기 side effect를 노출하지 않고, 생성된 hidden panel이 있으면 정리한 뒤 `stale`을 반환한다.

Option A는 rail과 panel을 한 BrowserWindow의 두 surface로, Option D는 rail 창과 panel 창으로 구현하지만 동일 controller contract suite를 통과해야 한다. 어느 쪽이든 위젯과 메모는 **하나의 panel 콘텐츠 창 안에 함께 존재**하며, Option D의 rail 창에는 손잡이 외 콘텐츠나 메모 데이터가 없다.

### Adapters

새 디렉터리:

```text
src/adapters/components/SidePin/
├── SidePinApp.tsx
├── SidePinRail.tsx
├── SidePinPanel.tsx
├── SidePinWidgetZone.tsx
├── SidePinMemoZone.tsx
└── SidePinMemoEditor.tsx
```

- `src/App.tsx`: query **`mode=sidePin`**을 판별하는 renderer 분기 추가. 이것은 `WindowMode`가 아니다. 기존 분기는 모두 camelCase(`widget`·`quickAdd`·`stickerPicker`·`icon`·`msShare`, `src/App.tsx:140-165`)이므로 v0.3의 kebab 표기 `side-pin`을 쓰지 않는다(QA-06).
- `src/adapters/stores/useSidePinStore.ts`: controller snapshot mirror와 intent 전송만 담당하며 자체 전이·timeout을 두지 않는다.
- `src/adapters/stores/useSidePinMemoDraftStore.ts`: canonical memo 목록과 분리된 편집 session snapshot·baseUpdatedAt·pending reload 소유
- `src/widgets/components/WidgetCard.tsx`: optional `WidgetInteractionPolicy`를 받는다. 옆핀은 `allowModal=false`, `primaryAction='navigate'`, `allowedInlineActions=[]`, `unavailableAction='disable'`로 주입해 기존 클릭 모달 분기(`:68-77`, `:95-97`)를 억제한다.
- `src/widgets/components/WidgetGrid.tsx`: interaction policy와 선택 ID를 전달한다. 실제 설정 훅은 `src/widgets/useDashboardConfig.ts`다.
- `src/adapters/components/Memo/MemoEditor.tsx`: optional `onActivityChange(MemoEditorActivity)`, `onDraftChange`, `onRequestClose(): Promise<'closed' | 'blocked' | 'failed'>`를 추가한다. 현재 내부 편집 상태(`:76`)와 Esc 저장(`:108-117`)을 단일 계약으로 끌어올리고 SidePin wrapper가 draft snapshot을 보존하게 한다.
- `src/adapters/stores/useMemoStore.ts`: 저장소 API를 그대로 사용하며 옆핀 전용 복제 상태를 만들지 않는다.
- 옆핀 renderer도 기존 `onDataChanged → reloadStores` fallback을 구독하되, 활성 메모에는 아래 typed change envelope와 충돌 정책을 먼저 적용한다. 이 fallback은 renderer **세 곳**에 각각 있다 — `QuickAddApp`(`src/App.tsx:601-603`), `WidgetApp`(`:655-657`), `MainApp`(`:939-941`). §7의 coordinator 이전은 세 곳 모두의 회귀 대상이다(QA-07).

### Infrastructure

새 파일 후보:

- `electron/sidePinWindow.ts`: `SidePinWindowHost`의 Option A 구현
- `electron/sidePinSplitWindow.ts`: 성능 gate 실패 때만 사용하는 Option D rail/panel 구현
- `electron/sidePinGeometry.ts`: workArea 기반 collapsed/expanded bounds 순수 계산
- `electron/sidePinIpc.ts`: 목적별 command 검증, controller 호출, state event 송수신
- `electron/sidePinDeviceStateRepository.ts`: versioned JSON, 원자적 저장, 기본값 복구
- `electron/sidePinScheduler.ts`: controller가 사용하는 clock·timeout port 구현
- `electron/memoMutationIpc.ts`: command 검증, coordinator 호출, 결과 응답과 창 broadcast만 담당
- `electron/memoFileRepository.ts`: coordinator port의 atomic snapshot read/write와 파일 잠금 구현
- `electron/platform/windowsWorkspaceAwareness.ts`: fullscreen·Win+D·virtual desktop visibility 판정 adapter
- `electron/platform/win32AtomicFileWriter.ts`: ReplaceFileW/MoveFileExW 기반 device-state 원자 교체

기존 파일 연결:

- `electron/main.ts`: `sidePinWindow`을 `getAllAppWindows()`에 포함한다. 현재 함수는 앱 데이터 창을 열거한다(`electron/main.ts:110-131`). 이때 **함수 위 주석도 함께 고친다** — 주석은 "포함: mainWindow, widgetWindow", "향후 iconWindow 추가 시 한 줄만 추가"라고 돼 있으나 실제 코드는 이미 `iconWindow`를 포함한다(`:126`). 주석이 실제와 어긋난 채로 남으면 다음 세션이 브로드캐스트 대상을 잘못 판단한다(QA-08).
- `data:changed` 브로드캐스트(`electron/main.ts:2617`)가 옆핀에도 도달해야 한다.
- `screen.on('display-added|removed|metrics-changed')`(`electron/main.ts:5070-5078`)에서 위치 재계산을 호출한다.
- `electron/preload.ts`: raw ipcRenderer 대신 아래 목적별 typed bridge만 노출한다. 기존 `onDataChanged` 해제 함수 패턴은 `electron/preload.ts:1048-1052`를 따른다.

공통 창 옵션:

- frameless, transparent, skipTaskbar BrowserWindow. A는 단일 창, D는 rail 1개+panel 1개지만 panel 콘텐츠는 한 창에만 둔다.
- `screen-saver` always-on-top level은 사용하지 않는다. 기존 quickAdd가 이를 쓰는 위치는 `electron/main.ts:634-635`지만 옆핀은 전체 화면을 덮지 않아야 한다.
- hover reveal은 `showInactive`로 포커스를 빼앗지 않는다.
- 클릭·단축키·메모 편집에서만 focus한다.
- 손잡이 16 DIP는 실제 배경·테두리를 가지며 hit target을 완전 투명으로 만들지 않는다.
- Option A가 gate를 통과하면 enabled=true인 동안 단일 창이 상주한다. 통과하지 못하면 같은 `SidePinWindowHost` port의 Option D 구현으로 rail만 상주하고 panel renderer는 prewarm·지연 파기한다. enabled=false이면 모든 옆핀 창을 destroy한다.

## 7. IPC 계약

Renderer → Main의 목적별 command:

- `sidePin:get-snapshot`
- `sidePin:toggle-pin`
- `sidePin:set-editor-activity`
- `sidePin:request-close`
- `sidePin:set-panel-width`
- `sidePin:select-display`
- `sidePin:open-main-target`

Main → Renderer:

- `sidePin:state-changed`
- `sidePin:memo-change`
- 기존 payload 없는 `data:changed` fallback
- `sidePin:lock-state-changed`

모든 command는 `{ requestId, payload }`를 받고 `{ requestId, ok, revision, value? } | { requestId, ok:false, code, message }`를 돌려준다. main은 호출 sender가 host가 등록한 sidePin webContents 집합인지와 역할(`combined|rail|panel`)을 확인한다. requestId 중복·destroy된 창·알 수 없는 필드·runtime schema 불일치·zone/width/display 범위 오류를 거부한다. renderer는 BrowserWindow bounds를 직접 정하거나 generic event를 dispatch하지 않는다.

pointer/focus는 제품 command 목록과 분리한 `sidePinHost:report-input` bridge 하나만 사용한다. D의 rail sender는 rail region, panel sender는 panel region만 보고할 수 있고 host가 `hostEventId`를 붙여 controller event로 변환한다. renderer가 같은 이동을 `sidePin:*` command로 다시 보내는 경로는 두지 않는다.

`open-main-target`의 대상은 문자열 임의 전달이 아니라 기존 `AppPage`와 widget registry에서 생성한 `SidePinNavigationTarget` allowlist만 허용한다. 1차 WidgetCard의 inline action은 전부 비활성이고 카드 본문 navigation만 허용한다. `onStateChanged`, `onMemoChange`, `onLockStateChanged`는 모두 unsubscribe 함수를 반환하고 renderer unmount와 window destroy에서 해제한다.

`sidePin:request-close`는 controller의 canonical editorActivity가 idle일 때만 성공한다. renderer snapshot이 늦어도 main이 다시 guard하며, lock/suspend의 `force-protect` system event만 draft view model clear와 즉시 collapse를 우선한다.

### 메모 변경 envelope와 충돌 정책

`revision`은 창 간 event 순서용이고 원자적 저장 조건으로 사용하지 않는다. Electron main에서 한 번 생성되는 application `MemoMutationCoordinator`가 `memos` process-wide 직렬 queue, CAS 판단, monotonic updatedAt·changeRevision, envelope 발행 순서를 소유한다. Infrastructure repository는 snapshot read와 atomic write/file lock만 구현하고 정책을 결정하지 않으며, Electron main은 IPC wiring과 broadcast만 담당한다.

```ts
interface MemoMutationCommand {
  requestId: string;
  memoId: string;
  operation: 'create' | 'update' | 'delete' | 'archive' | 'restore';
  expectedUpdatedAt: string | null;
  patch?: MemoEditablePatch;
}

type MemoMutationResult =
  | { status: 'saved'; memo?: Memo; changeRevision: number }
  | { status: 'conflict'; current: Memo; changeRevision: number }
  | { status: 'not-found' | 'archived'; changeRevision: number }
  | { status: 'failed'; code: string };
```

편집 시작 시 `baseUpdatedAt`을 session에 보관하고 모든 저장에 `expectedUpdatedAt`으로 보낸다. coordinator는 queue 안에서 repository로 현재 파일을 다시 읽어 비교한 뒤에만 쓰며, 성공한 `updatedAt`은 이전 값보다 반드시 큰 값으로 부여한다. 불일치하면 파일을 쓰지 않고 `conflict`를 반환한다. `useMemoStore`의 create/update/color/font/image/delete/archive/restore도 이 기능 작업에서 같은 coordinator IPC로 이동시켜 창별 read-modify-write 우회를 없앤다. 기존 `data:write('memos')`와 cloud bulk replace는 같은 queue의 `replace-all` 작업으로 직렬화한다.

```ts
interface MemoEntityChangeEnvelope {
  kind: 'entity-change';
  changeId: string;
  entityType: 'memo';
  entityId: string;
  operation: 'create' | 'update' | 'delete' | 'archive' | 'restore';
  sourceWindowId: string;
  updatedAt: string;
  changeRevision: number;
}

interface MemoInvalidationEnvelope {
  kind: 'invalidation';
  changeId: string;
  entityType: 'memo';
  operation: 'replace-all';
  sourceWindowId: string;
  affectedEntityIds: readonly string[] | null;
  changeRevision: number;
}

type MemoChangeEnvelope = MemoEntityChangeEnvelope | MemoInvalidationEnvelope;
```

- coordinator가 process-local `changeRevision`을 단조 증가시키고 저장 성공 뒤 main broadcaster가 모든 앱 창에 envelope를 보낸다. 기존 payload 없는 `data:changed`는 다른 데이터 종류와 구버전 발신자의 전체 reload fallback으로 유지한다.
- `replace-all`은 queue 안에서 이전/다음 snapshot을 ID+내용으로 비교해 `affectedEntityIds`를 만든다. 안전하게 diff할 수 없으면 `null`로 보내 모든 memo session을 invalidation 대상으로 삼는다. 활성 memo ID가 목록에 없으면 draft는 그대로 두고, 포함되거나 `null`이면 최신 entity를 읽어 update/conflict/delete/archive 규칙을 적용한다.
- payload 없는 fallback이 editor activity가 idle이 아닐 때 오면 활성 메모 draft만 reload 대상에서 제외하고 `외부 데이터 변경 감지`를 표시한다. editor가 idle이 된 뒤 보류한 전체 reload를 한 번 실행한다.
- 자신의 `changeId`가 돌아오면 저장 확인으로 처리하고 중복 reload하지 않는다. 편집 중이 아니면 마지막 적용 changeRevision보다 새 envelope만 읽는다.
- 같은 메모를 옆핀에서 편집하는 중 외부 update 또는 저장 시 `conflict`가 오면 로컬 draft를 유지하고 `다른 창에서 변경됨` 배너를 표시한다. `다른 창 내용 불러오기`는 로컬 draft 폐기 확인 후 current memo로 session을 다시 열고, `내 내용 유지`는 current.updatedAt을 새 expectedUpdatedAt으로 삼는 명시적 재저장 확인을 거친다. 확인 뒤에도 다른 저장이 먼저 완료되면 다시 conflict가 나며 자동 덮어쓰지 않는다.
- 편집 중인 메모가 외부에서 delete/archive되면 같은 ID 저장을 막고 `새 메모로 복사` 또는 `편집 닫기`만 제공한다.
- persist 직후 파일 읽기 경합이 생기면 250ms, 1s, 3s로 최대 3회 reload한다. 모두 실패하면 기존 화면 데이터를 유지하고 복구 가능한 오류를 표시한다.

`SidePinMemoEditor`는 canonical `useMemoStore`와 분리된 `MemoDraftSession`(`memoId`, `baseMemo`, `draft`, `baseUpdatedAt`, `activity`, `pendingGenericReload`)을 소유한다. canonical store 전체 reload가 일어나도 editor는 이 snapshot으로 계속 렌더하고, reload 뒤 entity 존재·archived·updatedAt을 session과 조정한다. delete/archive가 확인되면 conflict보다 우선해 `orphaned` 상태로 바꾸고 같은 ID 저장을 막는다. editor가 idle이 되면 보류한 전체 reload는 정확히 한 번 실행한다.

## 8. Windows·개인정보·성능 정책

- 저장된 display가 없으면 primary display로 이동하고 width를 360~460으로 clamp한다.
- 모니터 연결 해제·DPI·workArea 변경 시 500ms debounce 후 오른쪽 가장자리로 재배치한다.
- rail은 일반 창 위에 남도록 `setAlwaysOnTop(true, 'normal')`만 사용한다. `screen-saver` level은 금지하고 선택 display의 외부 전체 화면 창을 감지하면 rail·panel을 먼저 숨긴다.
- Win+D는 기존 `minimize`/visibility 경로와 `electron/main.ts:1978-2008`의 복원 poll을 **선례로 참고만 하고, 기존 위젯 복원 코드는 이동·수정하지 않는다**(QA-01). 현행 `startWinDRecovery`는 `currentWindowMode !== 'widget'`이면 즉시 반환하는 위젯 전용 경로이고 간격 1000ms·`recoverWidget` 500ms dedup으로 v2.3.7 바탕화면 모드 수정(ADR-042·043)과 얽혀 있다. 옆핀은 별도 OS adapter에 자체 poll을 신설한다. poll 간격은 250ms이고, 수동/E2E 측정은 “Win+D 키 입력 직전”부터 복원 paint까지 잰다. 위젯 Win+D 복원 회귀 테스트를 옆핀 작업의 회귀 범위에 포함한다.
- 1차 가상 데스크톱 정책은 “쌤핀 창이 생성된 데스크톱에만 옆핀도 존재”다. Windows가 다른 데스크톱으로 전환하면 rail이 보이지 않아야 하며, 원래 데스크톱으로 돌아오면 복원한다. Windows에서 no-op인 all-workspaces 호출에 의존하거나 데스크톱마다 창을 복제하지 않는다.
- `lock-screen` 수신 즉시 panel을 닫고 renderer의 메모 view model을 비운다. `unlock-screen` 후 잠금 guard를 다시 확인해 1초 안에 안전한 rail만 복원한다. `powerMonitor.resume` 뒤에는 같은 절차를 2초 안에 끝낸다.
- 잠금된 메모 상태에서는 제목 파생·미리보기·이미지를 렌더하지 않는다.
- 출시 후 `memorySaverMode`와 무관하게 enabled 옆핀 rail은 상주한다. Option A에서는 panel까지 같은 renderer에 상주하고, Option D에서는 rail만 상주한다. 기존 main 창은 memory saver에서 destroy하는 선례가 있다(`electron/main.ts:1103-1108`).

### Windows 신호 adapter와 선행 feasibility gate

`src/usecases/sidePin/WindowsWorkspaceAwarenessPort.ts`는 `showDesktopSuspected`, `selectedDisplayFullscreenChanged`, `virtualDesktopVisibilityChanged`, `adapterHealthChanged`, `lock`, `unlock`, `suspend`, `resume`만 controller에 전달한다. 구현은 다음 경계를 사용한다.

- Electron: `BrowserWindow`의 minimize/visibility/focus, `screen`의 display events, `powerMonitor`의 lock/unlock/suspend/resume.
- Win32 전용 `electron/platform/windowsWorkspaceAwareness.ts`: 250ms마다 `EnumWindows`로 visible top-level window를 z-order 순으로 열거한다. own pid, shell/desktop, `WS_CHILD`, `IsIconic`, DWM cloaked window만 제외하고, `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)`가 선택 monitor의 `GetMonitorInfo.rcMonitor`를 ±2px 안에서 덮는 외부 창이 하나라도 있으면 fullscreen으로 판정한다. owned presentation window도 제외하지 않으므로 다른 display의 창이 foreground여도 선택 display fullscreen을 놓치지 않는다.
- 같은 250ms poll에서 rail HWND를 `IVirtualDesktopManager::IsWindowOnCurrentVirtualDesktop`로 검사한다. 결과 변화만 port event로 controller에 보내며, `false`이면 rail·panel을 숨기고 `true`가 2회 연속 확인되면 원래 데스크톱 rail을 복원한다.
- Win32/COM 호출이 오류·권한 실패·unknown을 반환하면 controller는 즉시 `hideAll`하는 안전 방향을 택한다. 3회 연속 실패 또는 20회 gate 중 1회 실패면 adapter health=`failed`로 기록하고 기본 ON 출시를 중단한다. 오류 상태에서 rail을 추측으로 다시 표시하지 않는다.

구현 1단계에서 Win+D, borderless fullscreen, 독점 fullscreen, **선택 display fullscreen을 유지한 채 다른 display 창을 foreground로 전환**, 가상 데스크톱 왕복을 20회씩 수행한다. 전체 화면 오탐/미탐, poll 오류, rail 복원 누락이 한 번이라도 있으면 기본 ON 진행을 중단한다. 신뢰 가능한 adapter가 없을 때 `alwaysOnTop=false`로 조용히 낮추는 것은 상시 손잡이 요구를 어기므로 출시 fallback으로 인정하지 않는다.

Win32 호출은 새 native addon을 만들지 않고 이미 `dependencies`와 `asarUnpack`에 포함된 `koffi` 경계를 재사용한다(`package.json:73`, `electron-builder.yml`의 koffi unpack). user32/dwmapi/kernel32/ole32 함수와 `IVirtualDesktopManager` COM vtable binding은 이 adapter 파일 안에 격리한다. 현재 Windows builder 대상은 x64 하나이므로(`electron-builder.yml`), SidePin도 Windows x64만 release gate 대상으로 삼고 native ARM64 지원을 새로 주장하지 않는다.

패키지 gate는 x64 release artifact 설치 후 `resources/app.asar.unpacked/node_modules/koffi`에서 module load, 모든 DLL symbol binding, COM `CoCreateInstance`, fullscreen enumeration, atomic writer smoke를 실행한다. production 서명 artifact에서는 기존 배포 절차의 `signtool verify /pa /all`을 통과해야 한다. 향후 Windows ARM64 target을 추가할 때는 해당 arch의 Koffi binary/rebuild·서명·동일 smoke 결과 없이는 SidePin을 enable하지 않는다.

성능 출시 게이트:

- 같은 Windows 11 장비·동일 release build·동일 fixture에서 feature flag OFF/ON을 교대로 짝지어 각각 5회 측정한다. DevTools·HMR·백신 검사 변동을 제외하고 매 회 30초 warm-up 뒤 `getAppMetrics()`를 한 번 호출해 CPU 첫 0값을 버리고, collapsed idle을 60초간 1Hz로 표본화한다.
- sidePin webContents의 OS pid와 creationTime으로 `app.getAppMetrics()`의 renderer를 식별한다. `memory.privateBytes`와 `workingSetSize`는 API의 KB 값을 1024로 나눈 MiB, CPU는 `cpu.percentCPUUsage`의 API 백분율 단위로 기록한다.
- 각 표본의 전체 앱 privateBytes는 `app.getAppMetrics()`에 속한 모든 process의 privateBytes 합이다. 각 run에서 60개 합계 표본의 median을 구하고, `ON run i - OFF run i`를 run delta로 삼는다. 5개 run delta의 median은 150MiB 이하, max는 180MiB 이하여야 한다. Option A에서는 sidePin renderer 자체 값도 별도로 기록한다.
- CPU는 각 ON run의 60개 전체 앱 CPU 합계 표본에 대해 산술평균을 먼저 구한다. 5개 run 평균의 median은 1.0% 이하, max는 2.0% 이하여야 한다.
- 시작 시간은 `app.whenReady()` resolve, 종료 시간은 sidePin renderer의 첫 `requestAnimationFrame` 뒤 `sidePin:rail-painted` 수신으로 정의한다. 5회 모두 2초 이하여야 한다.
- 실제 pointer-enter부터 expanded panel 첫 RAF까지 5회 모두 300ms 이하여야 하고, 180ms dwell 전에는 panel을 표시하지 않는다. Option D는 panel webContents destroy+host registry 제거 확인 뒤 cold reveal 5회와 panel cooldown 생존 중 warm reveal 5회를 따로 측정해 둘 다 통과해야 한다.
- Option A가 하나라도 실패하면 release stop 후 `SidePinWindowHost`만 Option D로 교체해 같은 절차를 다시 실행한다. A 또는 D가 모두 통과하기 전에는 기존 사용자 migration과 신규 기본값을 `enabled=true`로 바꾸지 않는다.
- **실패 항목별 대응을 구분한다(QA-02).** A→D 교체는 상시 renderer 비용을 줄이는 조치이므로 `privateBytes` 실패에만 유효하다. CPU 실패의 주 소비자는 host가 아니라 250ms Win32 `EnumWindows`+`IVirtualDesktopManager` poll이므로 host를 바꿔도 같은 실패가 반복된다. 따라서 CPU 게이트 실패 시 순서는 ① adapter poll을 250ms→500ms로 완화하고 §11 AC-25의 20회 매트릭스를 다시 통과시킨다 ② 그래도 CPU 게이트를 넘지 못하면 event 기반 신호(`EVENT_SYSTEM_FOREGROUND` 훅 등)를 새 ADR로 검토한다 ③ 둘 다 실패하면 기본 ON 출시를 중단한다. poll 완화로 AC-22(Win+D 1초)·AC-25 재표시 시간을 못 지키면 완화안을 채택하지 않는다.
- 성능 측정 시 sidePin renderer와 별개로 **Windows adapter poll의 CPU 기여분을 따로 기록**한다(adapter만 켠 run 5회). 실패 원인을 host와 poll 중 어느 쪽으로 돌릴지 증거 없이 판단하지 않는다.

계측 필드의 단위와 의미는 Electron `MemoryInfo`·`CPUUsage` 공식 계약을 기준으로 한다.

## 9. 구현 단계

1. **브라운필드 통합 게이트**
   - 실제 widget registry·잠금 guard·Win+D 복원·창 종료 열거 경로를 확인하고 파일 목록을 고정한다.
   - 기존 변경과 충돌 여부를 확인하고 feature OFF release baseline 5회를 먼저 기록한다.
   - WindowsWorkspaceAwareness spike로 Win+D·display별 fullscreen·가상 데스크톱을 각 20회 검증한다. 한 번이라도 오탐/미탐/복원 누락이면 기본 ON 경로를 중단한다.
   - 기존 Koffi FFI 방식과 Windows x64 지원 경계를 고정하고 installed release에서 unpack load·DLL/COM symbol·서명 smoke를 통과시킨다.
2. **Domain·UseCases와 단위 테스트**
   - 분리된 preferences/device/runtime/event, pointerRegion/pendingTransition, width, 메모 라벨 파생, 최근순 선별, 전이 reducer를 추가한다.
   - fake scheduler·fake host로 controller의 revision, 180/400ms 예약 취소, rail↔panel 이동, stale callback 폐기를 검증한다.
3. **WindowHost 성능 spike와 구조 확정**
   - A/D가 correlation 포함 ensure/prepare/show/collapse/dispose/hide/reposition/destroy와 host event 공통 contract suite를 먼저 통과하게 한다.
   - Option A `SidePinWindowHost`에 실제 sidePin bundle과 대표 위젯·메모 fixture를 연결해 collapsed 5회 gate를 실행한다.
   - 통과하면 A를 확정하고, 실패하면 host만 D로 바꿔 재측정한다. 둘 다 실패하면 기본 ON 구현을 중단하고 기획으로 되돌린다.
4. **기기 설정 저장과 geometry**
   - versioned JSON adapter, 직렬 write queue, temp+rename, last-good 복구, rename 실패, monitor fallback, negative coordinate, DPI 테스트를 구현한다.
5. **Electron 창·목적별 IPC·동기화**
   - controller·scheduler·확정된 host를 Electron main에서 조립한다.
   - sender 검증·requestId·typed result/error·subscription cleanup을 갖춘 preload를 추가한다.
   - 모든 useMemoStore mutation과 `data:write('memos')` bulk replace를 application `MemoMutationCoordinator` queue로 연결한다.
   - `getAllAppWindows`, typed memo envelope, payload 없는 `data:changed` fallback, screen/power/Windows workspace events를 연결한다.
6. **Rail·Panel과 상태 전이 UI**
   - App renderer branch와 snapshot mirror를 만들고 pin/editor 제품 intent는 controller command로, pointer/focus telemetry는 host event 단일 경로로 보낸다.
   - click pin, focus·Esc·outside click 규칙을 구현하되 renderer timeout과 독립 reducer는 만들지 않는다.
7. **Widget zone**
   - registry 적격성 메타데이터, `WidgetInteractionPolicy`, 선택 최대 4개, modal 억제, 허용된 main navigation, 부적격 사유를 구현한다.
8. **Memo zone와 전체 편집**
   - 최근 5개, 라벨 파생, yellow quick add, 별도 MemoDraftSession, `MemoEditorActivity`, 조건부 save, dialog hold, DOM 단일 Esc owner, 외부 변경 충돌·삭제 대응을 구현한다.
9. **설정·잠금·복원·최종 성능**
   - 설정 UI, 민감 메모 guard, Win+D·잠금·절전·fullscreen·가상 데스크톱 대응을 추가한다.
   - 완성 release build에서 OFF/ON 5회 gate를 반복 통과한 뒤에만 `enabled=true` migration을 활성화한다.
10. **회귀 검증과 문서화**

- 자동 검증 4종과 Windows 수동 매트릭스를 실행한다.
- 사용자 동작이 바뀌므로 구현 릴리즈 시 `/docs` 가이드 갱신 범위를 확인한다.

## 10. Acceptance Criteria

### 기능

- AC-01 성능 게이트를 통과한 release 기본 설정에서 `app.whenReady()` resolve부터 renderer 첫 RAF 뒤 `sidePin:rail-painted`까지 5회 모두 2초 이하이고, 선택 display 오른쪽에 16 DIP rail이 나타난다.
- AC-02a fake clock에서 pointerRegion이 rail로 바뀐 뒤 179ms에는 show operation이 없고 180ms에 correlation 포함 show가 요청된다. matching `panelPainted` 전에는 collapsed, 이후에만 expanded다.
- AC-02b 실제 Windows release build에서 rail hover 전후 foreground HWND가 같아 다른 앱 focus가 유지된다.
- AC-03 unpinned·idle 상태에서 전체 창 pointer-leave 뒤 399ms에는 expanded이고 400ms에 collapsed가 된다.
- AC-04 400ms 안 재진입 또는 새 intent가 오면 이전 revision의 close callback은 적용되지 않는다. Option D의 rail↔panel 경계 이동도 collapse 없이 같은 결과다.
- AC-04b 취소된 prepare/show/reposition의 늦은 result/event는 operationId·requestedRevision 불일치로 state를 바꾸지 않는다. 현재 operation failure는 expanded를 남기지 않고 rail 또는 마지막 유효 layout으로 복구된다.
- AC-05 손잡이·영역 헤더·고정 아이콘 클릭만 pin을 바꾸고 WidgetCard 본문 클릭은 pin을 바꾸지 않는다.
- AC-06 pinned 영역은 바깥 클릭과 pointer-leave에도 유지되고 같은 고정 지점 또는 편집기가 idle인 상태의 Esc로 해제된다.
- AC-07 설정된 적격 위젯 최대 4개가 순서대로 보이고, 카드 본문은 옆핀 modal·inline action 없이 registry의 allowlisted main target으로만 이동한다. 부적격 저장 ID는 runtime 제외·대체되고 설정에 사유가 보인다.
- AC-08 위젯 영역과 메모 영역은 한 panel 안에서 구분되고, 메모 목록은 active memo 최대 5개를 updatedAt 내림차순으로 표시한다.
- AC-09 빈 메모 추가는 yellow로 생성되고 즉시 editor activity=`editing`이 된다.
- AC-10 본문·색상·글자 크기·이미지·삭제·보관은 expectedUpdatedAt 조건부 coordinator를 거쳐 기존 store에 반영되고 typed memo envelope로 다른 창에 전달된다.
- AC-11 editor activity가 editing/saving/dialog-open/save-error 중 하나면 pointer-leave·blur가 와도 panel이 닫히지 않는다.
- AC-12 편집 중 첫 Esc는 MemoEditor만 소비한다. 저장 성공 후 idle·목록으로 돌아오며, 별도의 다음 Esc 입력이 panel을 접는다.
- AC-13 저장 실패 시 activity=`save-error`, draft와 오류가 유지되고 close 요청 결과는 `failed`다.
- AC-14 편집 중 동일 메모의 외부 update 또는 조건부 저장 conflict는 draft를 덮지 않고 reload/keep-local 선택을 표시한다. keep-local 재시도 전 또 변경되면 다시 conflict가 나며 자동 overwrite하지 않는다.
- AC-15 편집 중 동일 메모의 외부 delete/archive는 기존 ID 저장을 막고 새 메모 복사/닫기만 허용한다.
- AC-16 잠금 상태에서 메모 라벨·본문·이미지가 rail과 panel에 노출되지 않고 renderer view model에도 남지 않는다.

### 환경·회귀

- AC-17 단일·음수 좌표 보조 모니터와 100/125/150%에서 rail과 panel이 선택 display workArea 밖으로 나가지 않는다.
- AC-18 저장된 display의 `display-removed` event 수신부터 500ms debounce를 포함해 1초 안에 primary display 오른쪽 재배치와 device state 교정이 완료된다.
- AC-19 main/widget/icon 전환 중 옆핀 rail이 병행되고 `WindowMode` 값은 세 기존 값 밖으로 변하지 않는다.
- AC-20 옆핀↔main/widget 메모 create/update/delete/archive/restore/replace-all이 증가 changeRevision 순서로 반영되고 자신의 changeId는 중복 reload하지 않는다.
- AC-21 device state 누락·파손·구버전은 기본값/last-good으로 복구된다. primary 교체 실패는 기존 파일+`failed`, primary 성공 뒤 backup 교체 실패는 새 primary+`saved-with-backup-warning`을 반환한다.
- AC-22 첫 Win+D(Show Desktop 진입) 키 입력 직전부터 1초 안에 다른 일반 창은 숨은 채 collapsed rail paint가 복원된다. 두 번째 Win+D(Show Desktop 해제) 뒤에도 1초 안 rail이 유지된다. 진입·해제 각 20회 누락 0회다.
- AC-23 `unlock-screen` 수신부터 1초 안에 잠금 guard를 거친 안전한 rail이 나타나고 민감 내용은 보이지 않는다.
- AC-24 `powerMonitor.resume` 수신부터 2초 안에 같은 안전 상태로 복원된다.
- AC-25 250ms EnumWindows 판정에서 선택 display를 덮는 외부 visible top-level fullscreen이 하나라도 있으면 rail·panel이 숨는다. 선택 display fullscreen을 유지한 채 다른 display 창을 foreground로 바꿔도 숨김이 유지되고, 다른 display에만 fullscreen이면 rail은 유지된다. virtual-desktop poll false에서는 숨고 true 2회 연속 확인 뒤 1초 안 재표시된다. 각 시나리오 20회 오탐/미탐 0회다.
- AC-26 옆핀 OFF 뒤 100ms polling 기준 3초 안에 `webContents.isDestroyed=true`, SidePinWindowHost registry 0개, `getAllAppWindows()` 제외를 모두 만족한다. pid+creationTime 소멸은 진단값으로만 기록해 PID 재사용을 실패로 오인하지 않는다. D의 일반 collapse는 10초 cooldown+1초 안 panel webContents destroy·registry 제거를 별도 확인한다.
- AC-27 동일 release build의 paired OFF/ON 각 5회에서 60개 표본 run delta 기준 privateBytes median≤150MiB·max≤180MiB, 60개 CPU 합계 표본 run-average의 median≤1.0%·max≤2.0%, rail 표시 5회 모두≤2초를 만족한다. A reveal 5회 또는 D cold/warm reveal 각 5회는 모두≤300ms다.

## 11. Verification Steps

자동 검증:

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run regression-check
```

추가 자동 테스트:

- domain transition table 전 행 단위 테스트
- fake scheduler로 179/180ms reveal, 399/400ms close, rail↔panel 경계 이동, 재진입 취소, stale revision callback 폐기 테스트
- pointer telemetry가 host event 한 경로로만 controller revision을 한 번 증가시키는 테스트
- width clamp, missing display, negative coordinate, 100/125/150% geometry 테스트
- device JSON 정상·누락·파손·구버전·동시 쓰기 직렬화, primary/backup 교체 실패별 saved/warning/failed, last-good 복구 테스트
- WidgetInteractionPolicy에서 modal/inline action 미호출·allowlisted navigate 호출·미지원 action disabled 테스트
- MemoEditor activity 전이, requestClose success/blocked/failed, 단일 Esc owner 테스트
- application memo coordinator queue에서 expectedUpdatedAt 성공/conflict/재충돌, bulk replace diff/null invalidation, envelope changeRevision/source/changeId, own echo, 외부 delete/archive, 250ms/1s/3s retry 테스트
- main broadcaster에 sidePin 포함, 목적별 command requestId/result/error, 잘못된 sender·schema·target 거부 테스트
- preload subscription unsubscribe와 window destroy cleanup 테스트
- Option A/D host contract test를 같은 suite로 실행해 controller가 host 종류에 의존하지 않음을 확인
- prepare/show/reposition의 늦은 completion, operationId 불일치, requestedRevision 불일치, typed failure를 주입해 stale 폐기·rail 복구·마지막 layout 유지 확인
- release 성능 harness가 paired OFF/ON run, 첫 CPU 표본 discard, process privateBytes 합, run delta/median/max, D cold/warm reveal을 산식대로 기록하는 snapshot test
- installed Windows x64 release에서 Koffi unpack load, user32/dwmapi/kernel32/ole32 binding, COM CoCreateInstance, atomic writer, production 서명 smoke

host contract 공통표:

| 시나리오                  | Option A 기대                                           | Option D 기대                                                |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `ensureRail`              | combined 창 collapsed surface 준비                      | rail 전용 창 준비, panel pid 없음                            |
| `preparePanel`            | 기존 renderer가 correlation 포함 `panelReady` 발행      | 숨은 panel renderer 생성 후 correlation 포함 `panelReady`    |
| `showPanel`               | 같은 창 bounds 확장·accepted `panelPainted` 뒤 expanded | panel showInactive/focus·accepted `panelPainted` 뒤 expanded |
| rail→panel pointer        | region 연속 갱신, collapse 없음                         | 두 sender event를 controller가 합쳐 collapse 없음            |
| `collapsePanel`           | 같은 창 rail bounds로 축소                              | panel hide, rail 유지, cooldown 시작                         |
| `disposePanel`            | panel view model clear, 창 유지                         | panel 창 destroy, rail 유지                                  |
| `hideAll`/`repositionAll` | combined 창 전체 적용                                   | rail·panel 원자적 순서 적용                                  |
| stale/failure 주입        | 이전 operation은 무시, failure는 rail/last layout 복구  | 생성 중 panel 정리, failure는 rail/last layout 복구          |
| `destroyAll`              | combined pid 3초 내 소멸                                | rail·panel pid 모두 3초 내 소멸                              |

Windows 수동 시나리오:

| 준비                                                 | 행동                             | 기대 결과                                             |
| ---------------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| 다른 앱에 커서·포커스                                | rail 호버                        | 다른 앱 focus 유지, 180ms 후 펼침                     |
| unpinned expanded                                    | pointer leave 후 200ms 내 재진입 | 접히지 않음                                           |
| widget pinned                                        | 바깥 클릭                        | 유지                                                  |
| memo editing                                         | 이미지 파일 선택창 열기·취소     | 패널 유지, 입력 유지                                  |
| memo save 실패 주입                                  | Esc                              | 오류 표시, 편집 유지                                  |
| main에서 같은 memo 수정                              | 옆핀 편집 유지                   | 충돌 배너, reload/keep-local 선택                     |
| main에서 같은 memo 삭제                              | 옆핀 편집 유지                   | 기존 ID 저장 차단, 새 메모 복사/닫기                  |
| 2개 모니터·보조 음수 좌표                            | display 제거                     | primary 오른쪽으로 이동                               |
| 125% DPI                                             | panel open/close                 | workArea 경계 일치                                    |
| main/widget/icon 각각                                | 메모 양방향 수정                 | 세 모드와 옆핀 내용 일치                              |
| Win+D 첫 입력/둘째 입력 각 20회                      | Show Desktop 진입/해제           | 각 입력부터 1초 이내 rail 복원·유지                   |
| 잠금·해제                                            | unlock-screen                    | 1초 이내 민감 내용 없이 rail 복원                     |
| 절전·복귀                                            | powerMonitor.resume              | 2초 이내 민감 내용 없이 rail 복원                     |
| 선택 display fullscreen 유지+다른 display foreground | rail 상태 관찰                   | 선택 display rail 숨김 유지                           |
| 다른 display만 fullscreen·가상 데스크톱 왕복         | rail 상태 관찰                   | 선택 display 오탐 없음, 원래 desktop 복귀 1초 내 표시 |

## 12. Risks and Mitigations

| Risk                            | Mitigation / Stop rule                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 상시 렌더러 메모리 증가         | Option A 5회 gate 실패 시 D로 교체·재측정, D도 실패하면 기본 ON 출시 중지                                 |
| 상태 전이 이중 소유             | SidePinController만 runtime·timer·revision 소유, renderer/host는 mirror·effect로 제한                     |
| A/D host 교체가 설명에 그침     | rail/panel lifecycle+event 전체를 port에 포함하고 두 구현에 같은 contract suite 적용                      |
| 늦은 host 완료가 새 상태를 덮음 | 모든 command/result/event에 operationId+requestedRevision, stale side effect 정리와 failure recovery test |
| WidgetCard 동작 회귀            | optional policy 기본값은 기존 동작, 옆핀 정책 contract test 추가                                          |
| 메모 편집 중 입력 유실·덮어쓰기 | 별도 draft session, application coordinator queue+CAS, conflict UI, 실패 시 draft 유지                    |
| 무포커스 창 닫힘 불일치         | hover는 pointer leave만, focused는 Esc/outside click만                                                    |
| 다중 모니터 밖 배치             | workArea 순수 계산, display fallback, screen event 테스트                                                 |
| 기기 설정 손상·경합             | 별도 versioned JSON, 단일 write queue, temp+rename, last-good, typed error                                |
| IPC 권한 확대                   | 목적별 command, sender webContents·schema·allowlist 검증, requestId dedupe                                |
| fullscreen/Win+D 오탐           | Windows adapter 선행 20회 gate, 실패 시 기본 ON release stop                                              |
| 민감 메모 노출                  | lock guard와 lifecycle 복귀 시 content clear                                                              |
| main.ts 비대화                  | sidePinWindow/Geometry/Ipc 모듈 분리, main은 wiring만                                                     |

## 13. ADR

### Decision

옆핀은 `WindowMode` 밖에서 application `SidePinController`가 pointerRegion·pendingTransition을 포함한 상태, revision, timer를 단독 소유하고 rail/panel lifecycle 전체를 표현하는 `SidePinWindowHost`를 통해 표시한다. 1차 후보는 전용 단일 BrowserWindow(Option A)지만 Windows signal·release 성능 게이트 통과를 결정 조건으로 둔다. 실패하면 Domain·UseCase·renderer 계약을 유지한 채 경량 rail+지연 panel host(Option D)로 교체한다. 위젯은 optional 기능 정책, 메모는 optional 편집 활동·닫기 계약과 application 조건부 mutation coordinator로 재사용한다.

### Drivers

- 기존 모드와 병행해야 한다.
- 위젯·메모 저장소를 복제하지 않아야 한다.
- 호버와 편집의 포커스 규칙을 예측 가능하게 만들어야 한다.

### Alternatives considered

- 기존 widgetWindow 재사용
- 위젯·메모 두 창 분리
- 경량 상시 rail + 필요 시 panel renderer 생성
- always-on-top을 끄고 수동으로만 여는 안전 fallback(상시 손잡이 요구와 충돌해 기각)
- 메모 pinned/title 스키마를 1차에 추가

### Why chosen

전용 단일 창이 병행 요구를 지키면서 창 간 복잡성을 최소화하는 가장 단순한 후보지만, 상시 renderer 비용은 측정 전 확정할 수 없다. host port와 조기 spike를 두면 단순한 A를 우선 검증하면서도 D로 전환할 수 있다. 최근순·본문 파생 라벨은 데이터 마이그레이션 없이 사용자 요구인 작성·편집을 제공한다.

### Consequences

- A에서는 renderer 하나가 상주하고 D에서는 rail/panel 창 조정 비용이 생기므로 동일한 성능·복원 게이트가 필요하다.
- WidgetCard와 MemoEditor에 backward-compatible optional policy/activity 계약이 추가된다.
- 기기 전용 설정 저장소와 IPC가 새로 필요하다.
- 기존 memo store mutation도 조건부 application coordinator로 이동하므로 옆핀 밖 메모 회귀 테스트 범위가 넓어진다.
- 기본 ON migration은 A 또는 D의 완성 release build가 게이트를 통과한 뒤에만 활성화된다.
- pinned 메모는 후속 기능이 된다.

### Follow-ups

- 실제 사용 데이터로 pinned 메모 필요성 판단
- A 성능 gate 실패 시 D로 전환; D도 실패하면 native rail 또는 기존 renderer 통합안을 새 ADR로 검토
- 메모 영역 높이 조절과 빠른 편집 UX 후속 평가

## 14. 검증 자료

- [저작권법 제2조 — 저작물 정의](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033074243)
- [대법원 2009도291 — 아이디어와 창작적 표현 구분](https://www.law.go.kr/LSW/precInfoP.do?evtNo=2009%EB%8F%84291)
- [부정경쟁방지법 제2조 — 표지 혼동·성과 무단사용](https://law.go.kr/LSW/lsEfInfoP.do?lsiSeq=271245)
- [Electron MemoryInfo](https://www.electronjs.org/docs/latest/api/structures/memory-info)
- [Electron CPUUsage](https://www.electronjs.org/docs/latest/api/structures/cpu-usage)

## 15. Agent roster와 구현 인력 구성

v0.3의 `lazycodex-*` 명칭은 이 저장소 환경에 존재하지 않아 실제 사용 가능한 역할로 교체했다(QA-04).

| 역할          | 담당                                                                                                     | 권한          |
| ------------- | -------------------------------------------------------------------------------------------------------- | ------------- |
| 선례 조사     | `oh-my-claudecode:explore` 또는 `Explore`                                                                | 읽기 전용     |
| **화면 설계** | **`frontend-design` 스킬 (1순위) 또는 `oh-my-claudecode:designer`**                                      | 디자인 산출물 |
| 구현          | `oh-my-claudecode:executor` — controller·Electron·memo coordinator를 단계별로 구현하는 **유일한 writer** | 코드 수정     |
| 코드 검토     | `oh-my-claudecode:code-reviewer`                                                                         | 읽기 전용     |
| Windows QA    | `oh-my-claudecode:qa-tester` — release build 시나리오와 증거 수집                                        | QA 산출물만   |
| 게이트 감사   | `oh-my-claudecode:verifier` — 자동·수동·성능 증거 최종 재감사                                            | 읽기 전용     |

**화면 설계는 단독 진행하지 않는다(QA-05).** 옆핀은 rail·panel이라는 새 화면 두 개를 만드는 작업이므로, 사용자가 확정한 규칙에 따라 UI/UX는 `frontend-design`을 1순위로 협업해 진행한다. 색상은 하드코딩 HEX 없이 `sp-*` 토큰만 쓰고, 라운드는 `rounded-sp-*` 금지·Tailwind 기본 키만 사용하며, 라이트 모드 실렌더로 `text-white` 잔존을 확인한다.

이 저장소는 main 단일 워킹트리를 기본으로 하므로 병렬 code writer를 두지 않는다. 권장 순서는 `조사 → 화면 설계 → 구현 → 코드 검토 → Windows QA → 게이트 감사`다. Domain·UseCases, Electron, UI를 서로 다른 writer가 동시에 수정하지 않는다.

## 16. 실행 힌트

순차 구현 권장:

```text
$ralph "Implement .omx/plans/side-pin-v03-consensus.md sequentially on main. Stop first at the Windows-awareness and Option A performance decision gate. Do not enable SidePin by default before the gate passes. Preserve unrelated changes and record concrete evidence."
```

장기 goal mode 권장:

```text
$ultragoal "Deliver the approved SidePin v0.3 plan with one code writer and Windows, privacy, performance, and regression gates. Stop at every decision gate."
```

사용자가 명시적으로 Team을 요청한 경우에만 다음 topology를 사용한다.

```text
$team 4:executor "Execute SidePin v0.3 with exactly one code writer; the other three lanes are read-only review, Windows QA, and gate audit. Follow .omx/plans/side-pin-v03-consensus.md."
```

## 17. Team verification path

1. Writer가 각 구현 단계의 targeted test와 변경 파일 목록을 제출한다.
2. Code reviewer가 단일 상태 소유, operation correlation, 목적별 IPC, memo CAS, device atomic write를 diff로 확인한다.
3. QA executor가 설치된 x64 release build에서 Windows signal 20회 matrix, OFF/ON 5회 성능, 다중 모니터·DPI·잠금 시나리오를 기록한다.
4. Gate reviewer는 `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run regression-check`, 수동 표, 성능 원시값이 모두 있을 때만 승인한다.
5. gate 실패는 같은 writer에게 최소 범위 수정으로 돌려보낸다. A→D처럼 설계 결정이 바뀌면 구현을 멈추고 ADR부터 갱신한다.

## 18. Goal-mode follow-up

- 기본 장기 실행: `$ultragoal`
- 첫 선행 성능 결정만 별도 수행: `$performance-goal`
- host 결정 이후 짧은 순차 구현: `$ralph`
- Team이 필요해도 one-writer topology 유지
- `$autoresearch-goal`은 사용하지 않는다. 현재 제품·기술 결정은 수용 기준까지 닫혀 있다.

## 19. 합의 검토 이력

- Claude Fable5 QA: v0.2 조건부 승인. pinned/title 부재, 창 간 동기화, 기기 설정, WidgetCard·MemoEditor 충돌을 발견했다.
- RALPLAN Architect 1차: Option D fallback, 단일 controller, 목적별 IPC, 성능 gate를 요구했다.
- Architect 재검토: pointerRegion, host lifecycle, Windows signal, memo 조건부 저장, 비동기 operation correlation까지 보강했다.
- RALPLAN Critic: 180ms 시점의 `expanded` 표기와 `panelPainted` 확정 규칙 한 건만 불일치로 판정했다.
- 최종 반영: 180ms에는 correlation 포함 `showPanel`만 요청하고 matching `panelPainted(applied)` 뒤에만 expanded로 확정하도록 상태표·AC를 통일했다.

## 20. v0.4 확정 QA (2026-08-13)

기획 문장을 실제 코드와 1:1 대조하는 방식으로 검증했다. 판단 근거를 코드에서 직접 확인했고, 문서 주장만으로 통과시키지 않았다.

### 20.1 근거 인용 정확도 — 14건 전부 일치

v0.3이 인용한 `파일:줄번호` 근거를 모두 열어 확인했다. **틀린 인용 0건**이다.

| 인용                                                                     | 실제 확인                             |
| ------------------------------------------------------------------------ | ------------------------------------- |
| `WindowMode.ts:10` 세 값뿐                                               | 일치 — `'icon' \| 'widget' \| 'main'` |
| `Memo.ts:5-19`에 `pinned`·`title` 없음                                   | 일치                                  |
| `Settings.ts:119` `sidebar-right`                                        | 일치                                  |
| `Settings.ts:365-373` 기기 전용 값 분리 교훈                             | 일치 — `lastSyncedAt` deprecated 주석 |
| `WidgetCard.tsx:68-77`, `:95-97` 모달/navigate 분기                      | 일치                                  |
| `MemoEditor.tsx:76` 편집 상태, `:108-117` Esc 저장, `:194` max-w-420px   | 일치                                  |
| `main.ts:110-131` `getAllAppWindows`                                     | 일치                                  |
| `main.ts:634-635` quickAdd `screen-saver`                                | 일치                                  |
| `main.ts:1103-1108` memory saver destroy                                 | 일치                                  |
| `main.ts:1978-2008` Win+D 복원 poll                                      | 일치                                  |
| `main.ts:2617` `data:changed` 브로드캐스트                               | 일치                                  |
| `main.ts:5070-5078` display 이벤트                                       | 일치                                  |
| `preload.ts:1048-1052` 해제 함수 패턴                                    | 일치                                  |
| `package.json:73` koffi, `electron-builder.yml` unpack·win x64 단일 arch | 일치                                  |
| `addMemo(content, color)` 색상 필수                                      | 일치                                  |

### 20.2 반영한 지적 8건

| ID    | 등급 | 지적                                                                                                                                                                               | 반영                                                                                                          |
| ----- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| QA-01 | 높음 | Win+D 복원 poll을 "분리된 OS adapter로 **옮긴다**"는 문장이, v2.3.7에서 막 고친 위젯 바탕화면 모드(ADR-042·043)를 건드린다. 기존 코드는 위젯 전용·1000ms·500ms dedup으로 얽혀 있다 | §8 — 기존 코드 이동·수정 금지, 옆핀 전용 poll 신설, 위젯 Win+D 회귀를 범위에 포함                             |
| QA-02 | 높음 | 성능 게이트 실패 대응이 A→D 교체 하나뿐인데, D는 메모리 대책이다. CPU의 주 소비자는 250ms Win32 poll이라 host를 바꿔도 같은 실패가 반복된다                                        | §8 — 실패 항목별 대응 분리(메모리는 A→D, CPU는 poll 완화 → event 방식 ADR → 중단), adapter 단독 CPU 측정 추가 |
| QA-03 | 높음 | 기존 메모 저장 경로 전체를 coordinator로 옮기는 작업이 §7 본문에만 있고 "1차 포함" 목록에 없다. `memos`는 Drive 동기화 대상이라 **옆핀을 끈 사용자도 저장 경로가 바뀐다**          | §3 — 1차 포함에 명시, 되돌릴 수 있게 단독 커밋 분리, 축소안(옆핀 편집만 coordinator) 명문화                   |
| QA-04 | 중간 | roster의 `lazycodex-*` 에이전트가 이 환경에 존재하지 않아 그대로 실행 불가                                                                                                         | §15 — 실제 사용 가능한 역할로 교체                                                                            |
| QA-05 | 중간 | 새 화면 2개를 만드는데 roster에 디자인 담당이 없다. 사용자 확정 규칙(디자인 단독 진행 금지)과 충돌                                                                                 | §15 — `frontend-design` 1순위 협업 + `sp-*` 토큰·라운드·라이트 모드 규칙 명시                                 |
| QA-06 | 낮음 | `mode=side-pin`은 기존 renderer 분기 표기(camelCase)와 어긋남                                                                                                                      | §6 — `mode=sidePin`으로 통일                                                                                  |
| QA-07 | 낮음 | `onDataChanged` fallback을 두 곳만 인용했으나 실제로는 QuickAdd·Widget·Main 세 곳                                                                                                  | §6 — 세 지점 명시, 회귀 범위 포함                                                                             |
| QA-08 | 낮음 | `getAllAppWindows` 주석이 실제 코드와 어긋난 상태(주석엔 iconWindow 미포함, 코드엔 포함)                                                                                           | §6 — 옆핀 추가 시 주석 동시 수정 지시                                                                         |

### 20.3 확정 시 남겨 두는 미결 항목

- `옆핀` 명칭의 KIPRIS 상표 검색은 공개 전 별도 진행한다(§3).
- 담임 아닌 교사처럼 표시할 위젯이 부족한 사용자의 빈 옆핀 경험은 §4 "적격 위젯이 적으면 실제 개수만 표시" 규칙에 맡기고, 실사용 데이터로 재평가한다.
- 고정(pinned) 메모와 메모 제목 필드는 v0.4에서도 1차 제외를 유지한다.

## 21. 구현 진행 상황 (2026-08-13 갱신)

### 끝난 단계 — §9-1, §9-2

`main`에서 순차로 구현했고 code writer는 1명이다.

| 파일                                                       | 역할                                    |
| ---------------------------------------------------------- | --------------------------------------- |
| `src/domain/valueObjects/SidePinWidth.ts`                  | 너비 360~460 정규화, 손잡이 16 DIP 상수 |
| `src/domain/entities/SidePinPreferences.ts`                | 동기화 설정 + 정규화 (외부 import 0)    |
| `src/domain/entities/SidePinDeviceState.ts`                | 기기 전용 상태 + 정규화                 |
| `src/domain/entities/SidePinRuntimeState.ts`               | §5 실행 중 상태 타입                    |
| `src/domain/events/SidePinEvent.ts`                        | 사건·명령 닫힌 union                    |
| `src/domain/services/resolveSidePinTransition.ts`          | **순수 전이 규칙 (핵심)**               |
| `src/domain/repositories/ISidePinDeviceStateRepository.ts` | 기기 상태 저장 포트                     |
| `src/usecases/sidePin/SelectSidePinMemos.ts`               | 메모 선별·라벨 파생·잠금 가림           |
| `src/usecases/sidePin/SidePinScheduler.ts`                 | 시계·타이머 포트                        |
| `src/usecases/sidePin/SidePinWindowHost.ts`                | 창 조작 포트 (A안·D안 공통 계약)        |
| `src/usecases/sidePin/SidePinController.ts`                | 상태·revision 단일 소유자               |

테스트 5개 파일, 옆핀 테스트 118개 통과. 이번 단계에서 기획서 결함 2건(IMP-01·IMP-02)을 찾아 위 §5에 반영했다.

### 상태 모델 보강 (구현 중 추가)

기획서 §5에 없던 두 가지를 추가했다. 둘 다 없으면 사용자가 스스로 회복할 수 없는 상태에 빠진다.

- **`show-timeout` 예약 (3초).** "보여줘"라고 한 뒤 `panelPainted`가 끝내 오지 않으면(렌더러 사망·그리기 실패) 패널은 화면에 떠 있는데 상태는 영영 `collapsed`로 남는다. 감시 시간을 걸어 손잡이 상태로 복구한다. 3초는 성능 게이트 상한 300ms보다 훨씬 넉넉하게 잡은 값이다 — 여기 걸린다는 건 느린 게 아니라 고장이라는 뜻이다.
- **`layout-changed` 이벤트.** §5 이벤트 목록에 없어 `repositionAll`이 도달 불가능한 상태였다. 모니터 연결·해제·배율 변경을 받는 통로를 만들었다.
- **`SidePinPendingHostOperation.userInitiated`.** 자동 접힘과 사용자가 직접 닫은 것을 구분한다. 접히는 도중 커서가 돌아오면 다시 열어 주는 게 맞지만, **Esc·단축키로 닫을 때 커서는 대개 방금 작업하던 패널 위에 있다.** 구분이 없으면 사용자가 닫은 창이 즉시 되살아나 "Esc가 안 먹는다"가 된다.
- **`show-timeout`은 `collapsePanel`을 `userInitiated`로 보낸다.** 여기에는 함정이 둘 있어 둘 다 피해야 한다. ① 접기 완료 처리는 "커서가 안에 있으면 다시 열기"로 이어지므로, 그냥 접으면 그리기가 계속 실패하는 상황에서 열기→3초→접기→열기가 3.18초 주기로 무한 반복된다. ② 그렇다고 `disposePanel`만 보내면, 손잡이와 패널이 한 창인 A안에서 파기는 "내용만 비우고 창은 유지"(§11 host contract)라 **창이 펼친 크기 그대로 화면에 남는다.** 손잡이 크기로 되돌리는 것은 접기뿐이다. 그래서 접되 `userInitiated`로 표시해 되열기를 막는다.
- **`repositionAll` 실패 시 `hideAll` + `protectedReason='adapter-unhealthy'`.** 어디에 그릴지 모르는 채로 띄워 두면 화면 밖이나 엉뚱한 모니터에 걸쳐 남는다. 다만 **숨기기만 하면 손잡이가 사라진 채 다시 나타날 길이 없어져** §2 요구 4번("접힌 손잡이가 계속 보인다")이 영구히 깨진다. 보호 상태로 표시해 두면 기존 `protect-released` 채널이 `ensureRail`을 다시 발행해 복구된다.

### 교차 모델 검토 (Codex gpt-5.6-sol) — 상태 모델 보강

Claude 계열 리뷰어가 3라운드를 끝낸 뒤, **다른 모델 계열**로 한 번 더 봤다. 같은 계열은 같은 맹점을 공유하기 때문이다. 결과적으로 앞선 3라운드가 놓친 결함이 나왔고, 그중 5건을 직접 재현해 확인했다. 그에 따라 상태 모델을 세 곳 보강했다.

- **`surface`에 `'opening'` 추가.** 그전에는 "여는 중"을 `collapsed`로 표현했는데, 그러면 "아직 안 열림"과 "열려던 걸 그만둠"을 구분할 수 없다. 취소해야 할 지점을 빠뜨려도 드러나지 않아 여러 결함의 공통 뿌리가 됐다. 여는 중을 눈에 보이는 상태로 만들면 그 의도를 어디서 취소하는지 한눈에 보인다.
- **런타임에 `enabled` 축 추가.** 없으면 사용자가 옆핀을 끈 뒤에도 마우스를 가져다 대는 것만으로 창 만들기가 다시 시작된다(AC-26 위반).
- **창 조작은 종류당 하나만 대기.** 새 요청이 같은 종류의 지난 요청을 밀어낸다. 대기 목록이 무한히 자라지 않고, 취소된 요청의 늦은 응답은 짝을 잃어 자동으로 버려진다.

가장 심각했던 것은 **잠금 중 재노출 경로**다. `panelPainted`에는 보호 검사를 넣었는데 **접힘 완료 처리에는 빠져 있어**, 잠금 직전에 예약된 접힘이 완료되면서 "커서가 안에 있으니 다시 열자"로 이어졌다. 화면 배선이 붙으면 잠금 화면 위로 메모가 노출되는 길이다. 보호·꺼짐 판단을 `isSidePinResponsive` 한 곳으로 모으고 모든 입력·타이머·완료 처리에서 통과시키도록 바꿨다.

컨트롤러에는 **처리 직렬화**를 넣었다. 창은 명령을 처리하면서 그 자리에서 "그렸다"·"마우스가 나갔다"를 보고할 수 있는데, 처리가 중첩되면 안쪽이 먼저 끝나 바깥이 낡은 예약으로 최신 예약을 덮어써 **타이머가 통째로 사라진다.** `dispose()` 이후 도착하는 응답도 차단한다.

### 세 라운드 적대적 검토에서 배운 것

이 상태 기계는 **수정 하나가 다음 라운드의 결함이 되는 일이 두 번 반복**됐다.

| 라운드 | 고친 것                                              | 그 수정이 만든 다음 결함                                    |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| 1 → 2  | 접히는 도중 커서가 돌아오면 다시 연다                | Esc·단축키로 닫아도 되열림 (커서는 대개 패널 위에 있으므로) |
| 2 → 3  | 무한 반복을 피하려 `show-timeout`을 `disposePanel`로 | A안에서 창이 펼친 크기로 남아 클릭을 삼킴                   |

두 번 모두 **조건을 새로 넣을 때 그 조건이 다른 경로에서 어떤 값이 되는지**를 전부 훑지 않은 것이 원인이었다. 그리고 세 라운드 모두, 코드만 읽는 검토였다면 통과했을 것이다 — 결함은 전이 함수를 실제로 실행해 상태를 찍어 봐야 드러났다. §9-3 이후 단계에서도 **재현 기반 검증**을 유지한다.

### 검증 게이트가 통과시킨 결함 — 다음 단계에서 되풀이하지 말 것

1차 구현이 tsc 0오류·lint 0오류·테스트 103개 통과·회귀 39/39를 모두 통과한 상태에서, 적대적 검토가 **높음 3건**을 찾았다.

- 손잡이를 스치고 지나가면 패널이 혼자 열린 채 안 닫힘
- 창 준비 실패 후 180ms 예약이 살아남아 없는 패널에 `showPanel` 요청 → `expanded`
- 잠금 중 늦은 `panelPainted`가 상태를 `expanded`로 되살림 (§9-8 화면 배선이 들어가면 실제 메모 노출)

**통과한 테스트가 왜 못 잡았는지가 핵심이다.** "취소된 요청의 늦은 응답" 테스트가 취소 방법으로 가장 관대한 경로(`enabled-changed:false` — 유일하게 대기 목록을 통째로 교체하는 분기)를 골라 통과했다. 실제 사용자 행동인 "포인터 이탈"로 바꾸자 즉시 빨간불이 됐다. 앞으로 취소·중단 테스트를 쓸 때는 **가장 관대한 경로가 아니라 사용자가 실제로 하는 행동**으로 취소시킨다.

2차 검토에서는 **그 수정 자체가 만든 회귀**가 나왔다. "접히는 도중 커서가 돌아오면 다시 연다"를 사용자가 Esc로 닫은 경우까지 적용해 Esc가 무력화됐다. 조건 하나를 새로 넣을 때는 그 조건이 **실제 사용 맥락에서 어떤 값을 갖는지** 확인해야 한다 — 커서 위치는 자동 접힘에서는 유용한 신호지만 사용자가 직접 닫는 순간에는 정반대 신호다. 두 라운드 모두, 고치기 전에 테스트를 먼저 넣어 빨간불을 확인하고, 고친 뒤 조건을 되돌려 **그 테스트만 빨간불이 되는지** 실증했다.

### 다음 세션이 여기서부터 시작한다 — §9-3

**§9-3(WindowHost 성능 spike)은 AI가 단독으로 통과 판정할 수 없다.** 게이트 기준이 다음을 요구하기 때문이다.

- Win+D 키를 실제로 20회 누르고 손잡이 복원을 눈으로 확인
- 전체화면 앱·가상 데스크톱 왕복을 실제 기기에서 각 20회
- 설치된 x64 release build에서 feature OFF/ON을 짝지어 각 5회, 매회 60초 표본

즉 **준일님(또는 실기기에 접근할 수 있는 사람)이 실행해야 하는 단계**다. 그 전까지 `enabled` 기본값은 `false`로 두었고, 코드도 그 기본값을 강제한다.

### 아직 손대지 않은 것 (의도적)

- `Settings.ts`에 `sidePin` 필드 — 엔티티 새 필드는 `ENTITY_FIELD_CONTRACT` 갱신이 함께 가야 하므로 §9-5 배선 단계에서 한다.
- `src/widgets/types.ts`의 위젯 적격성 메타 — §9-7 범위.
- 기존 메모 저장 경로의 coordinator 이전(QA-03) — 되돌릴 수 있게 단독 작업 단위로 분리한다.
- Electron 창·IPC·React 컴포넌트 — 전부 §9-3 이후.
