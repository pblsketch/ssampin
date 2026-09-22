---
template: design
version: 1.0
feature: observation-cheer
date: 2026-09-23
author: pblsketch
project: ssampin
plan: ../../../.dryforge/001/spec.md
---

# 관찰 기록 응원(잔디) 1차 — UI 설계서

> **요약**: `.dryforge/001/spec.md`(관찰 기록 응원 1차, 개발 도구 폴더 — 결정은 [ADR-135](../../03-decisions/ADR-135.md))를 만족시키는 화면 설계. 계산 로직(내 잔디·연속 주·바퀴·알림 공백일)은 스펙 §1~9·§13이 이미 확정했으므로 이 문서는 다시 정의하지 않는다. 이 문서는 **화면·컴포넌트·문구**만 다룬다.
>
> **비주얼 방향**: 새 팔레트·새 폰트를 들이지 않는다. 기존 쌤핀 다크 대시보드(`sp-*` 토큰, Noto Sans KR, `rounded-xl` 카드)를 그대로 연장한다 — 이 기능은 이미 자리 잡은 도구에 붙는 한 칸이지, 새 브랜드 선언이 아니다.
> **Status**: Draft

---

## 0. 전제 — 언제 보이고 언제 전부 사라지는가

두 조건을 모든 화면이 공유한다.

```ts
const hasAnyRoster = hasHomeroom || activeTeachingClasses.length > 0;
const showCheer = hasAnyRoster && (settings.recordReminder?.cheerEnabled ?? true);
```

- `showCheer === false`(스위치 꺼짐) → 압축 카드의 핀 줄, 확장 뷰의 탭 두 개, 핀 응원 토스트가 전부 사라진다. 확장 뷰는 지금처럼 `StudentRecordsEditor`(또는 안내)만 보여준다.
- `hasAnyRoster === false`(담임 명렬도 수업반도 없음) → 스위치 값과 무관하게 위와 동일하게 사라진다.
- 담임 명렬이 없고 수업반만 있는 교과 선생님도 `hasAnyRoster === true`이므로 잔디·카드 그리드를 본다. [담임 기록] 탭은 기존 안내 화면 그대로다.

---

## 1. 압축 카드 (대시보드 '학생 빠른 기록')

핀 줄은 카드 **맨 위**, 기존 `👩‍🏫 학생 빠른 기록` 헤더보다 위에 한 줄 추가한다. 스크롤 영역(`flex-1 min-h-0 overflow-auto`) 밖에 고정해, 카드가 아무리 눌려도 없어지지 않게 한다.

```tsx
{
  showCheer && (
    <div className="mb-2 flex items-center gap-2 py-1">
      <PinDisc state={pinState} size={24} />
      <p className="flex-1 truncate text-xs text-sp-muted">{message}</p>
    </div>
  );
}
```

- **핀 크기**: 24px (`size={24}`, §11 참고 — `PinDisc`에 `size` prop을 추가해 재사용). `imageRendering: pixelated`는 크기와 무관하게 항상 유지 — 픽셀아트를 축소해도 흐려지지 않고 작은 배지처럼 또렷하게 보인다.
- **줄 높이**: 아이콘 24px + 상하 padding으로 총 ~36px. 기존 헤더 줄(24px 아이콘 폰트 + gap)과 리듬이 맞는다.
- **문구**: `message`는 스펙 §8 우선순위 문구(예: "N주째 꾸준히", §10.3) 또는 응원 문구(§10.1·§10.2) 중 하나. 응원이 떠 있는 동안은 응원이 우선, 없으면 §8 문구. 한 줄 `truncate` — 절대 줄바꿈하지 않는다.
- **최소 카드 크기(w:1 h:2, 세로 약 176px)**: 핀 줄은 항상 그대로 둔다. 그 아래 "기록 남기기" 검색 버튼·수업 블록 목록은 기존처럼 `overflow-auto`로 잘리므로, 카드가 아무리 작아져도 핀 줄만은 보장된다 — 이 카드에서 유일하게 "잘리지 않는 한 줄"이라는 뜻이다.
  - **왜**: 최소 크기에서 다른 요소를 지키느라 핀 줄까지 스크롤 밑으로 밀리면, 좁은 위젯 사용자만 응원을 못 보게 된다. 응원은 이 기능의 핵심 표시라 예외를 두지 않는다.

---

## 2. 확장 뷰 — 탭 바

`ExpandedStudentRecords`(현재 무조건 `StudentRecordsEditor`만 렌더)를 탭 두 개로 감싼다. `showCheer === false`면 탭 없이 지금처럼 바로 `StudentRecordsEditor`/안내를 렌더한다(기존 동작 100% 보존).

```tsx
type CheerTab = 'grass' | 'homeroom';
const [tab, setTab] = useState<CheerTab>('grass'); // 잔디가 기본
```

- 탭 라벨: **[잔디]** · **[담임 기록]**. `role="tablist"` + 각 버튼 `role="tab"` `aria-selected`, 패널은 `role="tabpanel"`.
- 스타일은 압축 카드 내부 탭(`WidgetTab` 버튼)과 같은 톤: 선택 `bg-sp-accent/20 text-sp-accent`, 비선택 `text-sp-muted hover:text-sp-text hover:bg-sp-text/5`, `rounded-lg`.
- [잔디] 탭 내용: `ObservationCheerTab`(§3+§4). [담임 기록] 탭 내용: 지금의 `ExpandedStudentRecords` 분기(담임 명렬 있으면 `StudentRecordsEditor`, 없으면 안내) 그대로 이식 — 로직 변경 없음.
- 메인 창·위젯 창 양쪽에서 같은 컴포넌트를 쓴다(스펙 §10).

---

## 3. 확장 뷰 — 내 잔디 블록

[잔디] 탭 맨 위, 반 카드 그리드보다 먼저 나온다.

```
┌ 내 기록 ──────────────────────────────────────────┐
│  월 ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢                          │
│  화 ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢                          │
│  수 ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢   (약 20열 = 학기 주 수)  │
│  목 ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢                          │
│  금 ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢                          │
│                                                    │
│  9주째 꾸준히                                       │
└────────────────────────────────────────────────────┘
```

- **행**: 월~금 5행만(스펙 §8 — 주말 기록은 칸으로 안 보이지만 연속 셈에는 들어간다). 왼쪽에 12px 폭짜리 요일 라벨(`text-[10px] text-sp-muted`).
- **열**: 이번 학기 시작일부터 학기 끝까지의 주 수(대략 20열, 학교 일정에 따라 14~22열 가변). 열 수를 하드코딩하지 않고 `학기 주 수`만큼 렌더한다.
- **셀 크기**: 14×14px, `rounded-sm`(4px), `gap-0.5`(2px). 20열 기준 전체 폭 약 320px — lg 모달에도, 위젯 창 좁은 폭에도 넉넉히 들어간다. 폭이 더 좁으면(w:1 카드) 셀이 아니라 `overflow-x-auto`로 가로 스크롤 허용(스펙이 가로 스크롤을 금지한 곳은 '반 카드 그리드'뿐, 잔디는 대상이 아니다 — 단, lg 모달 안에서는 항상 들어간다).
- **진하기 4단계** — 구현 방법은 §9 참고. 0단계는 채우지 않고 `border border-sp-border`만, 1~2명은 `bg-sp-accent opacity-30`, 3~5명은 `bg-sp-accent opacity-70`, 6명 이상은 `bg-sp-accent opacity-100`(불투명).
- **오늘 뒤 날짜**: 같은 빈 칸 모양에 `opacity-40`을 통째로 얹어 "아직 오지 않음"으로 옅게 비워 둔다.
- **칸에 텍스트 없음**: 숫자·이름을 적지 않는다(스펙 §8). 대신 각 칸에 `aria-label="9월 22일 · 기록 4명"`(보조기기 전용, 화면엔 안 보임) — 오늘 뒤 날짜는 `aria-label="9월 30일 · 아직 오지 않음"`.
- **문구 자리**: 그리드 아래 한 줄, `text-sm font-medium text-sp-text`. 응원이 떠 있으면(§7) 이 자리를 응원 문구가 대신한다(스펙 §8 마지막 줄). 우선순위·문구는 §10.3 목록을 그대로 쓴다.

---

## 4. 확장 뷰 — 반 카드 그리드

내 잔디 아래, 세로로 쌓이는 카드 목록(담임반 1장 + 보관하지 않은 수업반 순서대로). **가로 스크롤은 절대 없다** — lg 모달 폭(`max-w-4xl` ≈ 896px, 안쪽 여백 제외 실사용 폭 ≈ 848px) 안에서 카드 자체가 풀 폭을 쓰고, 카드 안 학생 칸만 자동으로 줄바꿈한다. 카드가 8장이면 세로로 길어지고, 탭 패널이 세로 스크롤을 갖는다(허용됨).

```tsx
<div className="space-y-3">
  {' '}
  {/* 카드 사이 12px */}
  {cards.map((card) => (
    <ClassLapCard key={card.key} {...card} />
  ))}
</div>
```

### 4.1 카드 한 장

```
┌ 3학년 2반 (담임)                         한 바퀴까지 4명 ┐
│ 1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 │
│ 20 21 22 23 24 25 26 27 28 29 30                        │
└───────────────────────────────────────────────────────┘
```

- 카드 컨테이너: `rounded-xl bg-sp-card p-3`. 헤더 줄: 반 이름(`text-sm font-sp-semibold text-sp-text`) + 오른쪽에 "한 바퀴까지 N명" 또는 "한 바퀴 완료"(§5).
- **학생 칸 그리드**: `grid-template-columns: repeat(auto-fill, minmax(36px, 1fr))`, `gap: 4px`(`gap-1`), 각 칸 정사각형(`aspect-square`). 848px 폭 기준 약 21열 → 학생 30명이면 2행으로 끝난다.
- **여러 학급 섞인 수업반**(명단에 "3-15"처럼 반-번호 표기가 필요한 경우, 스펙 §5): 칸을 정사각형 대신 `min-width 44px, height 32px`로 넓혀 4자리 라벨이 잘리지 않게 하고, 글자 크기를 `10px`(`text-[10px]`)로 낮춘다. 정렬은 반 → 번호 순.
- **칸 순서**: 번호(또는 반-번호) 오름차순, 왼쪽 위부터 오른쪽으로.
- **구성원 0명**(전원 빠짐·명렬 없음): 카드 헤더의 바퀴 문구를 아예 숨긴다(스펙 §5).

---

## 5. 칸 상태

| 상태      | 배경                                         | 텍스트                                                            | 테두리                                  |
| --------- | -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| 칠해짐    | `bg-sp-accent` (불투명, opacity 수정자 없음) | `text-sp-accent-fg`                                               | 없음                                    |
| 빈칸      | `bg-transparent`                             | `text-sp-text`                                                    | `border border-sp-border`               |
| 빈칸 + 종 | `bg-transparent`                             | `text-sp-text` (번호) + 우상단 작은 종 아이콘 `text-sp-highlight` | `border border-sp-border`               |
| 빠짐('–') | `bg-transparent`                             | `text-sp-muted` (숫자 대신 '–')                                   | `border border-dashed border-sp-border` |

칸은 `<button>` 하나 + 겹쳐지는 배지 두 개(`⋯` 메뉴, 종)로 구성한다. 공통 클래스는 `group relative aspect-square rounded-md text-[11px] font-medium`에 상태별로 `bg-sp-accent text-sp-accent-fg`(칠해짐) / `border border-sp-border text-sp-text`(빈칸) / `border border-dashed border-sp-border text-sp-muted`(빠짐)를 더한다. 내용은 `cell.state==='excluded' ? '–' : cell.label`(번호 또는 "3-15"), 종은 우상단 겹침 배지, `onClick`은 항상 `openQuickRecord(cell)`.

- **종**: 채운 배경이 아니라 빈칸 위에 얹는 **작은 텍스트색 아이콘**뿐이다(스펙 하드 제약). `text-sp-highlight`(앰버) — 배경도 테두리도 바뀌지 않는다.
- **빠짐 칸도 클릭 가능**: 눌러도 빠른 기록이 열린다(스펙 §5). 시각적으로만 "임시로 빠진 자리"로 점선 처리해 빈칸과 구분한다.
  - **왜 점선인가**: 빈칸(아직 안 씀)과 빠짐(당분간 뺌)을 색으로 구분하려면 경고색이 필요해지는데 ADR-134가 경고색 채움을 금지한다. 테두리 스타일(실선/점선) 차이는 색이 아니라서 규칙을 건드리지 않는다.
- **머리글 문구**:
  - 기본: `"한 바퀴까지 {아직 안 칠한 구성원 수}명"` — 예: "한 바퀴까지 4명". 기록 건수·바퀴 차수는 절대 넣지 않는다.
  - 막 끝났을 때(스펙 §5): `"한 바퀴 완료"` — `text-sp-accent`로 살짝 강조하되 채운 배지는 아니다(텍스트색만).

### 5.1 호버 · 포커스 · 이름표(툴팁)

- **호버**: 칠해짐은 `hover:brightness-110`, 빈칸/빠짐은 `hover:bg-sp-surface`. 커서는 `cursor-pointer`.
- **포커스**: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-1` — 13개 테마 어디서도 accent 색은 항상 정의돼 있으므로 안전하다.
- **이름표(툴팁)**: 네이티브 `title` 속성은 키보드 포커스로 안 뜨는 브라우저가 많아 쓰지 않는다. 대신 칸 자체에 `group relative`를 주고, 이름을 담은 `<span role="tooltip" className="pointer-events-none absolute -top-7 ... opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">`를 칸 위에 겹쳐 마우스·키보드 둘 다 같은 CSS로 처리한다. 이름은 '학생 이름 표시' 설정(실명/이니셜/표시 안 함)을 따르고, '표시 안 함'이면 이 `<span>`을 아예 렌더하지 않는다 — `aria-label`도 이름 없이 번호만 읽는다(§10.5).

---

## 6. 칸 메뉴 — [당분간 빼기] / [다시 넣기]

**트리거는 하나로 못박는다: 칸에 초점이 있거나 마우스를 올리면 나타나는 작은 '⋯' 버튼.** 우클릭·Context Menu 키는 별도 구현하지 않는다 — Electron 앱에서 우클릭은 OS/앱 기본 컨텍스트 메뉴와 자주 충돌하고, '⋯' 버튼 하나면 마우스·키보드 양쪽을 이미 다 만족한다.

- **왜**: 세 가지 트리거를 다 만들면 "칸을 누르면 기록, 우클릭하면 메뉴, ⋯를 눌러도 메뉴"처럼 경로가 갈라져 셋 다 유지보수 대상이 된다. 하나로 좁히면 칸의 클릭 핸들러가 "기록 쓰기"라는 뜻 하나만 갖게 되어 스펙 §7의 "칸을 누르면 바로 기록"과 절대 충돌하지 않는다.

`<span role="button" tabIndex={0} aria-haspopup="menu">` 하나를 칸 우상단에 절대 위치(`absolute -top-1 -right-1 h-4 w-4 rounded-full bg-sp-surface`)로 겹친다. `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100`으로 평소엔 숨고 호버·포커스에서 나타나며, `onClick`/`Enter`·`Space` 모두 `e.stopPropagation()` 뒤 `<ObservationCellMenu>`를 연다.

- `stopPropagation`으로 부모 칸의 클릭(기록 열기)이 같이 터지지 않게 막는다.
- 항상 DOM에 있고 `opacity-0`으로만 숨기므로 Tab으로 도달 가능 — 키보드 사용자는 칸(Tab) → ⋯(Tab) 순서로 자연히 만난다.

### 6.1 메뉴 내용 — `ObservationCellMenu`

`WidgetContextMenu.tsx`(`src/adapters/components/Widget/WidgetContextMenu.tsx`)가 이미 쓰는 패턴을 그대로 따른다: `ReactDOM.createPortal(menu, document.body)` + `fixed` 위치 + 뷰포트 클램핑 + 바깥 클릭/`Escape` 닫기.

- **왜 포털인가**: lg 모달은 유리 모드에서 `backdrop-filter`를 쓰는데, 이게 조상 트리 안의 `position: fixed`를 가둔다(하드 제약). 메뉴를 모달 DOM 밖, `document.body` 바로 아래로 옮겨야 유리 모드에서도 칸 옆에 정확히 뜬다.
- z-index는 `z-sp-tooltip`(80) — 모달 자체가 `z-sp-modal`(50)이므로 그보다 위 레이어가 필요하다.

```
일반 칸(칠해짐/빈칸):        빠진 칸('–'):
┌ 당분간 빼기 ▸ ┐            ┌ 다시 넣기      ┐
│  2주          │            └────────────────┘
│  한 달        │
│  이번 학기 끝까지│
└───────────────┘
```

- 방향키(↑↓)로 항목 이동, `Enter`로 선택, `Escape`로 닫기(기존 팝오버 관행).
- 선택 즉시 저장(스펙 §11 — 설정 화면의 [저장] 버튼을 기다리지 않음). 저장 성공 시 메뉴 닫고 토스트 없이 칸만 바로 점선/일반으로 바뀐다(과한 알림 자제 — 시각적 변화 자체가 피드백이다).
- **칸을 누르는 것과 메뉴는 완전히 분리된 동작이다**: 칸 본문(번호 텍스트가 있는 큰 영역) 클릭/Enter → 빠른 기록(스펙 §7 그대로, ADR-122 예외). '⋯' 클릭/Enter → 이 메뉴. 서로의 이벤트를 침범하지 않는다.

---

## 7. 핀 응원 토스트

기존 `useToastStore`(`src/adapters/components/common/Toast.tsx`)를 확장한다 — 새 토스트 컴포넌트를 만들지 않는다. 이미 있는 `bottom-6 right-6`, `z-sp-toast`, 슬라이드 인 애니메이션, `durationMs` 파라미터를 그대로 재사용한다.

`ToastData.type`에 `'cheer'`를 추가하고 `pinState?: 'wave' | 'celebrate'` 필드를 더한다(`type==='cheer'`일 때만 사용). `ToastItem`의 아이콘 분기에서 `toast.type==='cheer'`이면 기존 `material-symbols` 대신 `<PinDisc state={toast.pinState ?? 'wave'} size={28} />`를 그린다.

- 호출: `useToastStore.getState().show(message, 'cheer', undefined, 4000)` + `pinState` — `show()` 시그니처에 다섯 번째 인자(또는 옵션 객체 리팩터)로 `pinState`를 추가한다.
- **길이**: 4000ms(기본 성공 토스트 3000ms보다 살짝 길게 — 핀 동작을 눈에 담을 시간). 버튼(액션)이 없으므로 8000ms까지 늘릴 필요는 없다.
- **동작 편집 감소(`prefers-reduced-motion`)**: 토스트 등장 자체는 기존과 같이 `motion-reduce:animate-none`으로 슬라이드를 끈다. 핀 스프라이트는 `PinDisc` 내부에서 `window.matchMedia('(prefers-reduced-motion: reduce)')`가 참이면 프레임 전진 `setInterval`을 아예 돌리지 않고 각 동작의 1번 프레임(가만히 있는 자세)에 고정한다 — **왜**: 지금 `PinDisc`는 이 검사가 전혀 없다(코드 확인됨). 토스트·카드 핀 줄 둘 다 이 컴포넌트를 재사용하므로, 여기서 한 번 고치면 두 곳 모두 하드 제약을 만족한다.
- 첫 기록 응원은 `pinState: 'wave'`, 바퀴 완료 응원은 `pinState: 'celebrate'`(스펙 §9 — 기존 손 흔들기/만세 동작 그대로 매칭).
- 별도 빠른 기록 창(팝업)에서 저장했을 때는 토스트를 띄우지 않는다(스펙 §9) — 카드 핀 줄에만 다음 응원/다음 날까지 남는다.

---

## 8. 설정 — '관찰 기록 알림' 화면

`RecordReminderSection.tsx`에 섹션 두 개를 더한다. **둘 다 알림 마스터 스위치를 감싸는 `opacity-60 pointer-events-none` 래퍼 밖**에 둔다 — 지금 그 래퍼는 마스터 `alarm.enabled`가 꺼지면 아래 전부를 흐리게 막는데, 스펙 §11은 응원·잔디 스위치와 제외 학생 목록이 그 영향을 받지 않아야 한다고 못박는다. 두 섹션은 기존 "마스터 on/off" `SettingsSection`과 그 아래 래퍼 `<div>` **사이**에 끼워 넣는다.

### 8.1 '응원·잔디' 섹션

기존 `SettingsSection`(`icon="park"`, `title="응원·잔디"`, `description="기록이 쌓인 모습을 보여주고, 핀이 응원해요."`) 안에 다른 스위치 줄과 같은 모양(`flex items-center justify-between` + 왼쪽 라벨/도움말 + 오른쪽 `<Toggle>`)으로 `응원·잔디 표시` 하나만 넣는다. `checked={cheerEnabled}` `onChange={(v) => patchRR({ cheerEnabled: v })}`. 기본값 켜짐(스펙 §11 — 값이 없어도 켜짐으로 본다).

### 8.2 '제외 학생' 섹션 — 새 컴포넌트 `ExclusionListSection`

기존 "제외/관심 학생" `SettingsSection`은 **'관심 학생'만 남기고** 계속 "추후 지원" 비활성 버튼으로 래퍼 **안**에 그대로 둔다(스펙 §11). 실제로 동작하는 목록은 별도 섹션으로 래퍼 **밖**에 새로 만든다.

`<SettingsSection icon="person_off" title="제외 학생">` 안에 `exclusions.length === 0`이면 빈 상태 문구(§10.6) 한 줄, 아니면 `<ul className="divide-y divide-sp-border/40">`로 행을 나열한다. 한 행은 `flex items-center gap-3 py-2 text-sm`에 반(`w-16 text-sp-muted`) · 번호(`w-10 text-sp-muted`) · 이름(`flex-1 truncate text-sp-text`) · "{다시 들어오는 날짜}까지"(`text-xs text-sp-muted`) · `다시 넣기` 버튼(`rounded-lg border border-sp-border px-2.5 py-1 text-xs hover:border-sp-accent`, `onClick={() => returnStudent(row.key)}`) 순서로 놓는다.

- 열: 반 / 번호 / 이름(이름 표시 설정 적용 — '표시 안 함'이면 이름 칸 생략) / 다시 들어오는 날짜 / [다시 넣기].
- **항상 펼쳐짐** — `<details>`나 아코디언으로 접지 않는다(스펙 §11 "늘 펼쳐 보인다").
- [다시 넣기] 클릭 즉시 저장(설정 화면의 전역 [저장] 버튼과 무관) — §6.1과 같은 규칙. 그 사이 카드·위젯 창에서 바뀐 목록을 화면 [저장]이 덮어쓰지 않아야 한다(구현 시 draft 병합 주의 — 이 문서 범위 밖의 데이터 계약이지만 UI가 즉시-저장 버튼을 별도 액션으로 둬야 하는 이유이므로 표시).

---

## 9. 색상·강도 구현 방법 (하드 제약 대응 요약)

| 필요                           | 방법                                                                                                 | 이유                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 칠해진 칸(숫자 있음)           | `bg-sp-accent` (수정자 없음) + `text-sp-accent-fg`                                                   | 채운 배경으로 쓸 수 있는 유일한 토큰 쌍                                                                                                                                                                 |
| 잔디 진하기 4단계(텍스트 없음) | `bg-sp-accent` + Tailwind **`opacity-*` 엘리먼트 유틸리티**(`opacity-30`/`opacity-70`/`opacity-100`) | `bg-sp-accent/40`처럼 색 토큰에 붙는 `/NN` 수정자는 CSS를 아예 안 만든다(런타임 CSS 변수라 Tailwind가 알파를 못 섞음). 반면 `opacity`는 별개의 CSS 속성(`opacity: 0.x`)이라 값이 무엇이든 항상 동작한다 |
| 미래 날짜 옅게                 | 같은 빈 칸에 `opacity-40`                                                                            | 위와 동일 원리                                                                                                                                                                                          |
| 종 아이콘                      | `text-sp-highlight`(텍스트색만, 배경 없음)                                                           | 의미색은 배경 금지, 테두리·글자만 허용                                                                                                                                                                  |
| 반투명 유리 위 배경            | `color-mix(in srgb, var(--sp-token) X%, transparent)` (인라인 style 또는 `index.css`에 추가)         | 기존 유리 모드가 이미 쓰는 패턴(`index.css` 참고) — 이 기능에서는 잔디·칸에는 안 쓰지만, 카드 헤더 hover 배경처럼 "배경색 자체를 섞어야" 하는 자리가 생기면 이 방법을 쓴다                              |

---

## 10. 문구 (한국어, 따뜻하고 짧게 — 건수·비교·꾸중 없음)

### 10.1 첫 기록 응원 (오늘 이 컴퓨터에서 처음 저장 · `pinState: 'wave'`, 6개 중 무작위)

1. 오늘 기록, 남겼어요!
2. 좋은 시작이에요
3. 오늘도 기록으로 하루를 열었네요
4. 잊지 않고 남겨줬네요
5. 오늘의 관찰을 붙잡아 뒀어요
6. 기록을 시작했어요, 오늘도 힘내요

### 10.2 바퀴 완료 응원 (`pinState: 'celebrate'`, 4개 중 무작위)

1. 우리 반, 한 바퀴 돌았어요!
2. 한 바퀴 완주! 고생 많았어요
3. 모두를 한 번씩 만났네요
4. 한 바퀴를 마쳤어요, 멋져요

### 10.3 내 잔디 문구 (스펙 §8 순서 그대로, 뜻·우선순위 고정)

- 이번 학기 기록 0건: **"첫 기록을 남겨 볼까요?"**
- 연속 1주 이상: **"{N}주째 꾸준히"**
- 그 외: **"이번 학기 기록한 주 {N}주"**

### 10.4 카드 머리글

- 기본: **"한 바퀴까지 {N}명"**
- 막 끝남: **"한 바퀴 완료"**

### 10.5 툴팁 · aria-label 템플릿

- 이름 툴팁: `{표시이름}` (설정이 '표시 안 함'이면 렌더 안 함)
- 칠해짐: `"{번호}번 {표시이름}, 이번 바퀴 기록 완료"` (이름 없으면 `"{번호}번 학생, 이번 바퀴 기록 완료"`)
- 빈칸: `"{번호}번 {표시이름}, 아직 기록 전"`
- 빈칸+종: `"{번호}번 {표시이름}, 아직 기록 전 · 한동안 비어 있어요"`
- 빠짐: `"{번호}번 {표시이름}, 지금 빠져 있음"`
- 여러 학급 섞인 카드: `{번호}` 자리에 `{반}-{번호}`(예: "3-15") 그대로.
- 잔디 칸: `"{M}월 {D}일 · 기록 {N}명"` / 미래: `"{M}월 {D}일 · 아직 오지 않음"`.
- 칸 메뉴 트리거: `"{번호}번 칸 메뉴 열기"`.

### 10.6 메뉴·설정 라벨

- 메뉴: `당분간 빼기` ▸ `2주` / `한 달` / `이번 학기 끝까지`, `다시 넣기`
- 설정 스위치: `응원·잔디 표시` — 도움말 "학생별 기록 수나 순위는 보여주지 않아요. 선생님이 쌓아온 기록만 응원해요."
- 제외 목록 섹션: `제외 학생` — 빈 상태 "아직 뺀 학생이 없어요. 반 카드의 칸 메뉴에서 뺄 수 있어요."
- 제외 목록 행 버튼: `다시 넣기`
- 탭: `잔디` / `담임 기록`

---

## 11. 컴포넌트 분해

| 파일                                                                         | 종류 | 설명                                                                                                                 |
| ---------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| `src/adapters/components/Icon/PinDisc.tsx`                                   | 수정 | `size?: number`(기본 56) prop 추가, `DISPLAY` 상수를 prop 파생값으로. `prefers-reduced-motion` 검사 추가(§7)         |
| `src/adapters/components/common/Toast.tsx`                                   | 수정 | `ToastData.type`에 `'cheer'` 추가, `pinState` 필드, `ToastItem` 아이콘 분기에 `PinDisc` 렌더                         |
| `src/adapters/components/Dashboard/DashboardStudentRecords.tsx`              | 수정 | 압축 카드 최상단에 핀 줄(§1) 삽입. `ExpandedStudentRecords`를 탭 바(§2)로 감싸고 기존 내용을 `담임 기록` 탭으로 이동 |
| `src/adapters/components/Dashboard/ObservationCheer/ObservationCheerTab.tsx` | 신규 | [잔디] 탭 패널 — `MyGrassSection` + `ClassLapCardGrid` 세로 배치                                                     |
| `src/adapters/components/Dashboard/ObservationCheer/MyGrassSection.tsx`      | 신규 | §3. Props: `weeks: GrassWeek[]`, `streakText: string`                                                                |
| `src/adapters/components/Dashboard/ObservationCheer/GrassCell.tsx`           | 신규 | §3 셀 하나. Props: `level: 0\|1\|2\|3`, `isFuture: boolean`, `ariaLabel: string`                                     |
| `src/adapters/components/Dashboard/ObservationCheer/ClassLapCardGrid.tsx`    | 신규 | §4. Props: `cards: ClassLapCardViewModel[]`                                                                          |
| `src/adapters/components/Dashboard/ObservationCheer/ClassLapCard.tsx`        | 신규 | §4.1 카드 한 장. Props: `title, headerText, cells, mixedClass: boolean`                                              |
| `src/adapters/components/Dashboard/ObservationCheer/StudentLapCell.tsx`      | 신규 | §5. Props: `cell: LapCellViewModel`, `onRecord, onExclude, onReturn`                                                 |
| `src/adapters/components/Dashboard/ObservationCheer/CellMenuTrigger.tsx`     | 신규 | §6 '⋯' 버튼                                                                                                          |
| `src/adapters/components/Dashboard/ObservationCheer/ObservationCellMenu.tsx` | 신규 | §6.1 포털 메뉴. `WidgetContextMenu.tsx` 패턴 재사용                                                                  |
| `src/adapters/components/Settings/RecordReminderSection.tsx`                 | 수정 | §8.1·§8.2 섹션 삽입, 기존 '제외/관심 학생' 섹션을 '관심 학생'만 남기도록 축소                                        |
| `src/adapters/components/Settings/ExclusionListSection.tsx`                  | 신규 | §8.2. Props: `exclusions: ExclusionRow[]`, `onReturn(key)`                                                           |

> 잔디·바퀴·연속 주 계산은 `src/domain/rules/`(순수 함수) + 이를 조립하는 `src/adapters/hooks/`의 데이터 훅이 맡는다. 알고리즘은 스펙 §1~9·§13이 이미 완결된 규격이므로 이 UI 설계서가 다시 규정하지 않는다 — 위 컴포넌트들은 전부 **뷰모델을 입력으로 받는 순수 표시 컴포넌트**로 설계했다(그래야 계산 로직 테스트와 화면 렌더 테스트가 분리된다).

---

## 12. 접근성 체크리스트

- [ ] 모든 학생 칸에 번호(+ 마스킹된 이름)·상태가 담긴 `aria-label` (§10.5)
- [ ] 칸 메뉴 트리거는 `tabIndex=0` + `Enter`/`Space`로 열림, 메뉴 내부 방향키 이동
- [ ] 모든 인터랙티브 요소에 `focus-visible:outline` (accent 색, 13개 테마 공통 안전)
- [ ] `PinDisc`가 `prefers-reduced-motion: reduce`에서 프레임 전진을 멈춤
- [ ] 토스트 등장 애니메이션은 `motion-reduce:animate-none`(기존 Toast 패턴 그대로)
- [ ] 잔디 칸은 시각적으로 숫자가 없어도 `aria-label`로 날짜·인원을 읽을 수 있음
- [ ] 이름 표시 '표시 안 함' 설정일 때 툴팁·aria-label 모두 이름을 담지 않음

> 그 밖의 "왜"는 각 섹션에 바로 옆에 있다: 핀 줄 고정 위치(§1), 메뉴 트리거를 하나로 좁힌 이유(§6), 포털 이유(§6.1), 토스트를 재사용한 이유(§7), 점선 테두리 이유(§5), 색·강도 방법 전체 근거(§9).

---

## Version History

| Version | Date       | Changes                                                                      | Author    |
| ------- | ---------- | ---------------------------------------------------------------------------- | --------- |
| 1.0     | 2026-09-23 | 초기 설계 — 압축 카드/확장 뷰/칸 상태/칸 메뉴/토스트/설정/문구/컴포넌트 분해 | pblsketch |
