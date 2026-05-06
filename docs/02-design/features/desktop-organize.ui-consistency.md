# desktop-organize 위젯 카드 UI 일관성 가이드

> **목적**: 신규 `DesktopOrganize` 카드가 기존 22개 위젯 카드와 시각적·인터랙션 일관성을 유지하도록, 카드 코드를 직접 분석해 추출한 공통 패턴과 적용 규칙을 정의한다.
>
> **분석 대상**: `MiniCalendar`, `BookmarksWidget`, `DashboardMemo`(Memo 위젯), `DDayCounter`, `FavoriteTools`, `ImageStickerWidget`, `Events`(DashboardEvents), `TodoWidget`(DashboardTodo) — 8개
>
> **작성일**: 2026-05-07
> **적용 대상**: `src/widgets/items/DesktopOrganize/` 전 파일

---

## 1. 분석 요약

분석한 카드 수: 8개 (직접 구현된 독립 파일 기준. `Memo`, `Events`, `TodoWidget`은 re-export이므로 실제 구현 파일 `DashboardMemo`, `DashboardEvents`, `DashboardTodo`를 참조)

핵심 발견:

1. **카드 루트 패턴이 완전히 일치한다** — 모든 카드가 `rounded-xl bg-sp-card p-4 h-full flex flex-col`을 루트 클래스로 사용한다. 예외 없음.
2. **헤더 구조가 표준화되어 있다** — `flex items-center justify-between` + 좌측 `text-sm font-bold text-sp-text` 제목 + 우측 아이콘 버튼. 레이아웃은 전 카드가 동일.
3. **호버/포커스는 `transition-colors`와 sp-* 색상 변화 조합이 표준이다** — `hover:bg-sp-accent/10` 또는 `hover:bg-sp-surface/50`, `hover:text-sp-accent`, duration 미명시(기본 150ms).
4. **빈 상태는 항상 3종 세트다** — 이모지 + 안내 텍스트 + (옵션) CTA 버튼. `items-center justify-center h-full text-center` 컨테이너.
5. **편집 모드 진입 패턴은 카드마다 다르지만 공통점이 있다** — 헤더 우상단에 `material-symbols-outlined` 아이콘 버튼 배치, 클릭 → 상태 토글 → 내부 뷰 전환.
6. **`rounded-sp-*` 위반 사례가 존재한다** — `ImageStickerWidget`에서 `borderRadius` 인라인 스타일 사용 (설정값 px 직접 적용). 역사적 부채로 기록.

---

## 2. 카드별 패턴 매트릭스

| 카드 | 루트 클래스 | 헤더 구조 | 헤더 패딩 | 본문 패딩/gap | 빈 상태 | 편집 모드 진입 | sp-* 토큰 |
|------|------------|----------|----------|-------------|---------|--------------|---------|
| **MiniCalendar** | `rounded-xl bg-sp-card p-4 h-full flex flex-col` | 좌: 이모지+제목 / 우: 월 네비 버튼 | `mb-3` | 그리드 내부 무패딩 | 없음 | 없음 | card, border, accent, muted, text |
| **BookmarksWidget** | `rounded-xl bg-sp-card p-4 h-full flex flex-col` | 좌: 이모지+제목 / 우: edit 아이콘 | `mb-2` | `flex-1 flex gap-6` | 이모지+안내문 | 헤더 edit 버튼 → showPicker 상태 토글 | card, border, accent, muted, text, surface |
| **DashboardMemo** | `rounded-xl bg-sp-card p-4 h-full flex flex-col` | 좌: 이모지+제목 | `mb-3` | `grid` (ResizeObserver 동적) | 이모지+안내문 | 없음(메모 카드 직접 클릭) | card, border, accent, muted, text |
| **DDayCounter** | `rounded-xl bg-sp-card p-4 h-full flex flex-col min-h-0 overflow-auto` | 좌: 이모지+제목 / 우: 없음 | `mb-2 shrink-0` | `space-y-0.5` | 이모지+안내문 | 없음(추가 버튼으로 인라인 폼 노출) | card, border, accent, muted, text, surface, highlight |
| **FavoriteTools** | `rounded-xl bg-sp-card p-4 h-full flex flex-col` | 좌: 이모지+제목 / 우: edit 아이콘 | `mb-3` | `grid grid-cols-4 gap-2` | 없음(추가 버튼이 역할) | 헤더 edit 버튼 → showPicker 상태 토글 | card, border, accent, muted, text, bg |
| **ImageStickerWidget** | 없음 (루트 `h-full flex flex-col overflow-hidden group/img relative`) | 없음 | — | `flex-1 min-h-0` | SVG + "이미지 추가" 텍스트 | hover overlay → 버튼 클릭 | card, border, muted, accent (부분) |
| **Events** | re-export DashboardEvents | 이모지+제목 / 우: 네비 버튼 | `mb-2~3` | `space-y-0.5~1` | 이모지+안내문 | 없음 | card, border, accent, muted, text |
| **TodoWidget** | re-export DashboardTodo | 좌: 이모지+제목 / 우: 필터+추가 | `mb-2` | `space-y-1` | 이모지+안내문 | 없음(인라인 input) | card, border, accent, muted, text |

---

## 3. 공통 패턴 (Do)

### 3.1 카드 루트 구조

모든 카드는 다음 루트 패턴을 공유한다:

```tsx
<div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
  {/* 헤더 */}
  {/* 본문 (flex-1) */}
</div>
```

규칙:
- `rounded-xl` 고정 — 카드 외곽 라운딩은 반드시 이 값
- `bg-sp-card` — 카드 배경
- `p-4` — 카드 내부 여백 (16px)
- `h-full flex flex-col` — 부모 셀 높이를 채우고 세로 레이아웃

**desktop-organize는 예외** — 카드 루트가 DesktopOrganize 위젯 자체 구조인데, 내부 박스들이 `bg-sp-card/40` 반투명 배경을 사용하므로 카드 루트는 `rounded-xl bg-sp-card/80` 정도로 불투명도를 낮출 수 있다. 단, `h-full flex flex-col`은 유지한다.

### 3.2 헤더 영역 구조

```tsx
<div className="flex items-center justify-between mb-2 shrink-0">
  <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
    <span>📌</span>바탕화면 정리
  </h3>
  <div className="flex items-center gap-1">
    {/* 우측 액션 버튼들 */}
  </div>
</div>
```

규칙:
- 제목: `text-sm font-bold text-sp-text` — 8개 카드 모두 동일
- 이모지: `<span>` 분리, `gap-1.5` 간격
- 헤더 하단 마진: `mb-2` (DDayCounter, BookmarksWidget) 또는 `mb-3` (MiniCalendar, FavoriteTools) — 본문 밀도에 따라 선택
- `shrink-0` — 헤더가 스크롤/축소되지 않도록

### 3.3 헤더 우측 액션 버튼

```tsx
<button
  onClick={() => setIsEditMode(!isEditMode)}
  className="text-sp-muted hover:text-sp-text transition-colors"
  title="편집"
>
  <span className="material-symbols-outlined text-sm">
    {isEditMode ? 'close' : 'edit'}
  </span>
</button>
```

규칙:
- 기본 색상: `text-sp-muted`
- 호버: `hover:text-sp-text`
- 트랜지션: `transition-colors`
- 아이콘 크기: `text-sm` (≈ 18px)
- `material-symbols-outlined` 사용 — `edit`, `close`, `settings` 등
- 활성 상태(toggle ON): `text-sp-accent` 또는 `hover:text-sp-accent` 로 구분

### 3.4 본문 레이아웃 패턴

리스트형:
```tsx
<div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
```

그리드형:
```tsx
<div className="grid grid-cols-4 gap-2 flex-1 content-start">
```

규칙:
- `flex-1` — 헤더 제외 남은 공간 채움
- 오버플로우가 필요한 경우 `min-h-0 overflow-y-auto`를 함께 사용
- gap: 그리드는 `gap-2` (8px), 리스트는 `space-y-0.5` (2px) ~ `space-y-1` (4px)
- 내부 아이템 패딩: `px-2 py-1.5` ~ `px-2.5 py-2`

### 3.5 호버/포커스 효과

| 대상 | 패턴 |
|------|------|
| 리스트 행 호버 | `hover:bg-sp-surface/50 transition-colors` |
| 그리드 셀(클릭 가능) 호버 | `hover:bg-sp-accent/10 transition-colors` |
| 드롭 대상 영역 | `bg-sp-accent/10 ring-1 ring-sp-accent/30` |
| 선택된 항목 | `bg-sp-accent/15 ring-1 ring-sp-accent/30` |
| 버튼(텍스트) 호버 | `hover:text-sp-accent transition-colors` |
| 버튼(배경) 호버 | `hover:bg-sp-card transition-colors` |
| 호버 시 보조 요소 나타남 | `group-hover:opacity-100 opacity-0` |

규칙:
- `transition-colors`만 사용, `duration-*`는 명시하지 않음 (Tailwind 기본 150ms 사용)
- `ring-*` 선택 상태는 `ring-sp-accent` 계열로만 — `ring-blue-*` 하드코딩 금지
- `prefers-reduced-motion: reduce` → `motion-reduce:transition-none` 추가 필수

### 3.6 편집 모드 진입 패턴

기존 카드 중 편집 모드가 있는 카드(BookmarksWidget, FavoriteTools)는 공통적으로:

1. 헤더 우상단에 `edit` / `close` 토글 버튼
2. 버튼 클릭 → `useState` 로컬 상태 토글
3. 조건부 렌더링으로 뷰 전환: 주 뷰 ↔ 편집 뷰 (완전 교체)

**desktop-organize의 차이점**: 편집 모드에서도 그리드가 유지되고(완전 교체 아님), 박스 제목만 `<span>` → `<input>` 전환. 이는 MiniCalendar가 선택된 날짜의 이벤트를 이이서 보여주는 방식과 유사한 "인플레이스 전환" 패턴이다.

인라인 편집 input 규칙(DDayCounter `DDayForm` 참조):
```tsx
<input
  className="w-full rounded-lg bg-sp-card border border-sp-border px-3 py-2
             text-sm text-sp-text placeholder-sp-muted
             focus:border-sp-accent focus:outline-none"
  autoFocus
/>
```
- `rounded-lg` (버튼/입력 표준)
- `bg-sp-card`, `border-sp-border`
- `focus:border-sp-accent focus:outline-none`
- autoFocus 적용

### 3.7 빈 상태 표시

```tsx
<div className="flex flex-col items-center justify-center h-full text-center py-4">
  <span className="text-3xl mb-2">🎯</span>
  <p className="text-sm text-sp-muted">
    안내 문구
  </p>
</div>
```

규칙:
- 이모지 크기: `text-3xl` (8개 카드 모두 동일)
- 이모지-텍스트 간격: `mb-2`
- 안내 텍스트: `text-sm text-sp-muted`
- 컨테이너: `flex flex-col items-center justify-center h-full text-center`
- 추가 CTA 버튼은 `mt-2` 간격

### 3.8 sp-* 토큰 사용 규칙

| 토큰 | 용도 | 사용 예 |
|------|------|--------|
| `bg-sp-card` | 카드 루트 배경, 인라인 폼 배경, 호버 배경 | `bg-sp-card`, `hover:bg-sp-card` |
| `bg-sp-surface` | 섹션 구분용 보조 배경, 중첩 폼 | `bg-sp-surface border-sp-border` |
| `bg-sp-bg` | 툴 피커 등 최하단 배경 레이어 | `bg-sp-bg` |
| `border-sp-border` | 모든 테두리 | `border border-sp-border` |
| `text-sp-text` | 주요 텍스트, 제목 | `text-sm text-sp-text` |
| `text-sp-muted` | 보조 텍스트, 플레이스홀더, 버튼 기본 | `text-xs text-sp-muted` |
| `text-sp-accent` | 강조, 호버 텍스트, 링크 | `hover:text-sp-accent` |
| `bg-sp-accent/10~20` | 선택/호버 배경 | `hover:bg-sp-accent/10`, `bg-sp-accent/15` |
| `ring-sp-accent/30` | 선택 링 | `ring-1 ring-sp-accent/30` |
| `bg-sp-border/30~50` | 비활성 버튼 배경 | `bg-sp-border/30` |

**금지**: 하드코딩 hex (`#3b82f6` 등), 표준 Tailwind 색상 직접 사용(`bg-blue-500` 등), `bg-white/*` (ImageStickerWidget 예외는 이미지 오버레이 버튼 한정).

### 3.9 rounded-* 사용 규칙

| 용도 | 클래스 | px 환산 |
|------|--------|--------|
| 카드 루트 외곽 | `rounded-xl` | 12px |
| 팝오버/모달 | `rounded-xl` | 12px |
| 내부 섹션/하위 카드 | `rounded-lg` | 8px |
| 버튼 / 인라인 input | `rounded-lg` | 8px |
| 태그/뱃지/소형 | `rounded` | 4px |
| 도트/원형 표시 | `rounded-full` | — |

**desktop-organize 박스**: `rounded-xl` 사용 (Plan §8.2, Design §6.2에 명시된 `rounded-2xl` → 아래 §5에서 수정 권고)

**절대 금지**: `rounded-sp-*` 커스텀 토큰 (메모리 정책 위반)

### 3.10 padding / gap 표준

| 위치 | 값 | 비고 |
|------|------|------|
| 카드 루트 내부 전체 | `p-4` (16px) | 기준값 |
| 헤더 하단 마진 | `mb-2` ~ `mb-3` | 본문 밀도에 따라 |
| 섹션 구분선 위/아래 | `mt-2 pt-2` / `pt-1` | |
| 리스트 행 내부 | `px-2 py-1.5` ~ `px-2.5 py-2` | |
| 그리드 셀 간격 | `gap-2` | 8px |
| 리스트 행 간격 | `space-y-0.5` ~ `space-y-1` | 2~4px |
| 소형 아이콘 버튼 | `p-0.5` ~ `p-1` | |

---

## 4. 이상 패턴 (Don't)

기존 카드 코드에서 발견한 부조화 사례. **desktop-organize 구현 시 따라가면 안 된다.**

### 4.1 ImageStickerWidget — 카드 루트 누락

`ImageStickerContent`의 루트는 `h-full flex flex-col overflow-hidden group/img relative`다. `rounded-xl`과 `bg-sp-card`가 없다. 이 카드는 "이미지만 꽉 채우는" 특수 케이스로 WidgetGrid의 외부 셀이 라운딩을 담당하지만, 일반 카드 패턴 위반이다.

→ **desktop-organize는 반드시 `rounded-xl bg-sp-card`를 카드 루트에 유지한다.**

### 4.2 ImageStickerWidget — 인라인 스타일 borderRadius

```tsx
style={{ borderRadius: `${widgetData.borderRadius}px`, ... }}
```

설정 가능한 라운드 값이기 때문에 동적 처리가 필요해서 인라인 스타일을 사용한 것이지만, 디자인 토큰을 우회한다.

→ **desktop-organize에서 라운딩은 Tailwind 기본 키만 사용한다.** 동적 라운딩 불필요.

### 4.3 하드코딩 색상 혼용

`ImageStickerWidget`의 오버레이 버튼:
```tsx
className="bg-white/90 text-gray-700 rounded-lg px-3 py-1.5 ..."
```

이미지 위에 노출되는 버튼이므로 흰색이 의도적인 설계지만, `sp-*` 토큰을 우회한다.

→ **desktop-organize에서 모든 색상은 sp-* 토큰만 사용한다.**

### 4.4 DDayCounter — 중첩 `<button>` 문제

`DDayRow` 내부에서 외부 row가 div인데 hover 액션 영역에 다수 `<button>`을 nest하는 방식은 문제없지만, `e.stopPropagation()`이 필요한 경우 이벤트 전파 관리가 복잡해진다.

→ **desktop-organize 박스는 `<button>` 루트를 사용하지 않는다.** view 모드에서 NoOp이고, 편집 모드 input이 별도 관리된다.

### 4.5 FavoriteTools — `style={{ maxHeight: 'calc(...)' }}` 인라인

```tsx
style={{ maxHeight: 'calc(100% - 60px)' }}
```

Tailwind arbitrary value로 대체 가능한데 인라인을 사용. 일관성 저해.

→ **desktop-organize에서 높이 계산이 필요하면 `min-h-0` + `overflow-y-auto`의 flexbox 조합을 사용한다.**

### 4.6 transition-all 사용

`FavoriteTools` 그리드 셀에 `transition-all`이 있다 (`hover:scale-105 active:scale-95 transition-all`). `scale` 변환이 포함되기 때문이지만, transition-all은 성능에 부정적일 수 있고 `prefers-reduced-motion`과 충돌한다.

→ **desktop-organize에서 `transition-all` 금지.** `transition-colors` 또는 `transition-opacity`만 사용.

---

## 5. desktop-organize 카드 적용 권장사항

Mockup 3종(`view-mode.html`, `edit-mode.html`, `grid-settings-popover.html`)을 기존 패턴 기준으로 평가한다.

### 5.1 기존 패턴과 일치하는 부분

| 항목 | 위치 | 평가 |
|------|------|------|
| 카드 헤더 구조 | view-mode: `📌 바탕화면 정리` + 우측 버튼 | 표준 패턴 일치 |
| 헤더 버튼 크기 | 28×28px, `border-radius: 6px` (rounded) | 기존 패턴 일치 |
| sp-* 색상 | HTML 파일의 Tailwind config가 정확히 동일 | 일치 |
| 박스 배경 alpha | `rgba(26, 35, 50, 0.42)` = `bg-sp-card/40` 근사 | 일치 |
| `prefers-reduced-motion` 처리 | 두 파일 모두 CSS 미디어쿼리로 `transition: none` | 일치 |
| 편집 모드 input | `title-input-idle`, `title-input-active` 구분 | DDayCounter 패턴과 일치 |
| 팝오버 배경 | `bg-sp-card` (#1a2332) | 일치 |
| 팝오버 rounded | `border-radius: 12px` = `rounded-xl` | 일치 |
| transition 속도 | 120ms ease | 기본 150ms와 근사, 허용 범위 |

### 5.2 기존 패턴과 어긋나는 부분 (수정 권고)

**[경고 1] view-mode 카드 루트 rounded 과다 — `rounded-2xl` vs 표준 `rounded-xl`**

view-mode.html:
```html
<div class="rounded-2xl shadow-2xl ...">
```

기존 모든 카드는 `rounded-xl`(12px)을 사용한다. `rounded-2xl`(16px)은 표준 위반.

수정 권고: **`rounded-xl`로 교체.** Plan §8.2에서 명시한 `rounded-2xl`(박스)는 카드 루트가 아니라 내부 박스(organize-box)에만 적용되어야 한다.

> **round 정리**:
> - 카드 전체 외곽: `rounded-xl`
> - 내부 organize 박스: `rounded-xl` (기존 Design 문서의 `rounded-2xl` → `rounded-xl`로 하향 권고)
> - 팝오버: `rounded-xl`
> - 버튼/input: `rounded-lg`

내부 박스 라운딩을 `rounded-2xl`로 하면 카드 루트(`rounded-xl`)보다 더 크게 되어 시각적으로 어색하다. **내부 박스도 `rounded-xl`로 통일하는 것을 권고한다.**

**[경고 2] view-mode 카드 헤더에 ⚙️ 버튼만 있어 편집 모드 진입 방법이 불분명**

```html
<button class="icon-btn" title="그리드 설정">⚙️</button>
```

편집 모드 진입이 ⚙️ 하나로만 되어 있는데, 기존 카드(Bookmarks, FavoriteTools)의 패턴은 `edit` 아이콘으로 편집 모드를 토글하고, 그 안에서 ⚙️가 나타나는 2단계다. Design 문서(§4.3)도 `[✏️] [⚙️]` 두 버튼으로 정의했다.

수정 권고: view 모드에서는 ✏️ 버튼만 노출, ⚙️는 편집 모드 진입 후에만 표시.

**[경고 3] edit-mode.html — `edit-banner` 서브헤더 패턴이 기존 카드에 없음**

```html
<div class="edit-banner shrink-0">✏️ 편집 중 — 박스를 클릭해 제목을 수정하세요</div>
```

기존 카드 8개 중 어느 것도 편집 모드 전환 시 별도 배너를 삽입하지 않는다. `FavoriteTools`와 `Bookmarks`는 헤더 버튼 색상 변화만으로 편집 모드를 표시한다.

수정 권고: edit-banner 제거. 대신 헤더의 ✏️ 버튼을 **active 상태**(`text-sp-accent` 또는 `bg-sp-accent/15 rounded-lg`)로 강조해 편집 모드를 표현한다. 박스 제목이 `<input>`으로 전환되는 것 자체가 충분한 편집 모드 시각 피드백이다.

다만, 코치마크("Enter로 저장 · Esc로 취소")는 첫 활성화 시 1회성으로 허용된다(Design §4.7 참조).

**[경고 4] grid-settings-popover.html — `backdrop-filter: blur` 적용된 전체화면 오버레이**

```html
<div style="background: rgba(0,0,0,0.3); backdrop-filter: blur(1px); ..."></div>
```

기존 카드들의 팝오버(예: DDayCounter의 form, Bookmarks의 picker)는 전체화면 오버레이를 쓰지 않는다. `fixed inset-0` 클릭 감지 backdrop은 `ImageStickerWidget`의 설정 팝오버가 사용하나, `backdrop-filter: blur`는 없다.

수정 권고: 전체화면 backdrop blur 제거. 팝오버 외부 클릭 감지는 `useEffect + mousedown EventListener` 또는 portal 외부 click으로 처리한다.

**[경고 5] view-mode.html — 박스 외곽 `rounded-xl relative overflow-hidden flex flex-col`에 `overflow-hidden`**

박스에 `overflow-hidden`이 있는데, 편집 모드에서 input의 focus ring이나 ⚙️ 팝오버 arrow가 잘릴 수 있다.

수정 권고: 박스 자체의 `overflow-hidden` 제거. 제목 영역(`box-title-bar`)의 border-bottom만 있으면 시각적으로 충분하다. 팝오버는 body portal이므로 관계없지만, focus ring 잘림 방지를 위해 `overflow-visible`이 안전하다.

**[경고 6] 헤더 ⚙️ 아이콘 — 이모지 vs material-symbols-outlined 불일치**

```html
<button class="icon-btn" title="그리드 설정">⚙️</button>
<button class="icon-btn" title="편집 모드 켜짐">✏️</button>
```

기존 카드는 `material-symbols-outlined` 아이콘 폰트를 일관되게 사용한다:

```tsx
<span className="material-symbols-outlined text-sm">edit</span>
<span className="material-symbols-outlined text-sm">settings</span>
```

이모지 사용은 크기 조절이 불가능하고 OS별 렌더링이 다르다.

수정 권고: `material-symbols-outlined`로 교체.
- ✏️ → `<span className="material-symbols-outlined text-sm">edit</span>`
- ⚙️ → `<span className="material-symbols-outlined text-sm">settings</span>`

### 5.3 추가로 적용해야 할 패턴

**패턴 A — 카드 하단 footer 구조**

edit-mode.html에는 카드 하단 footer:
```html
<div style="border-top: 1px solid rgba(42,53,72,0.4);">
  박스 위에 바탕화면 아이콘을 직접 올려두세요 / 아이콘 위치는 Windows 탐색기가 관리합니다
</div>
```

기존 MiniCalendar가 유사한 패턴을 가진다:
```tsx
<div className="mt-1 pt-1 border-t border-sp-border/20 text-center">
  <span className="text-caption text-sp-muted">이번 달 일정 N건</span>
</div>
```

Tailwind로 일관성 있게 구현:
```tsx
<div className="mt-1 pt-1.5 border-t border-sp-border/20 flex justify-between shrink-0">
  <span className="text-xs text-sp-muted/50">박스 위에 아이콘을 직접 올려두세요</span>
  <span className="text-xs text-sp-muted/50">아이콘 위치는 탐색기가 관리합니다</span>
</div>
```

**패턴 B — 선택/활성 상태 버튼**

편집 모드 ON 상태의 ✏️ 버튼:
```tsx
<button
  className={`p-1 rounded transition-colors ${
    isEditMode
      ? 'text-sp-accent bg-sp-accent/15'
      : 'text-sp-muted hover:text-sp-text'
  }`}
>
  <span className="material-symbols-outlined text-sm">
    {isEditMode ? 'close' : 'edit'}
  </span>
</button>
```

이 패턴은 `FavoriteTools`와 `Bookmarks`가 동일하게 사용한다.

**패턴 C — isLoading 상태**

기존 카드들(`BookmarksWidget`: `useEffect loadAll`, `DDayCounter`: `useEffect load`)은 로딩 중 별도 skeleton을 보여주지 않는다. `null` 반환 또는 조건부 렌더링으로 처리.

`ImageStickerContent`: `if (!loaded) return null;`

desktop-organize도 `config === null`일 때 `return null`(혹은 최소한의 skeleton) 처리를 일관되게 적용한다.

**패턴 D — 대시보드 미리보기 전용 안내**

Design §4.6의 비-Windows 안내와 유사하게, 대시보드(메인 윈도우)에서의 "위젯 모드에서 동작" 안내는 기존 빈 상태 패턴을 따른다:

```tsx
{isDashboard && (
  <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
    <span className="text-xs text-sp-muted/50 whitespace-nowrap">
      위젯 모드에서 바탕화면 정리가 활성화됩니다
    </span>
  </div>
)}
```

---

## 6. 체크리스트 (PR 자가 검증)

### 6.1 디자인 토큰 준수

- [ ] `grep -r 'rounded-sp-' src/widgets/items/DesktopOrganize/` 결과 **0건**
- [ ] `grep -rE '#[0-9a-fA-F]{3,6}' src/widgets/items/DesktopOrganize/` 결과 **0건** (mockup 제외)
- [ ] `grep -r 'rounded-2xl' src/widgets/items/DesktopOrganize/` 결과 **0건** (카드 루트 및 박스 모두 `rounded-xl` 사용)
- [ ] `grep -r 'transition-all' src/widgets/items/DesktopOrganize/` 결과 **0건** (`transition-colors` 또는 `transition-opacity`만 허용)

### 6.2 카드 루트 구조

- [ ] `DesktopOrganize.tsx` 루트 div에 `rounded-xl bg-sp-card p-4 h-full flex flex-col` 포함 확인
- [ ] 카드 헤더 제목이 `text-sm font-bold text-sp-text` 클래스를 가짐
- [ ] 헤더 우측 버튼이 `text-sp-muted hover:text-sp-text transition-colors` 기본 스타일 가짐
- [ ] 아이콘이 `material-symbols-outlined text-sm` 사용 (이모지 아닌 아이콘 폰트)

### 6.3 편집 모드 UX

- [ ] view 모드에서 ✏️ 버튼만 노출, ⚙️는 편집 모드 진입 후 추가 노출
- [ ] 편집 모드 배너(edit-banner) **없음** — 헤더 버튼 `text-sp-accent bg-sp-accent/15`로 상태 표시
- [ ] 편집 모드 ON → 박스 제목이 `<span>` → `<input>` 전환, `autoFocus` 적용
- [ ] input 클래스: `rounded-lg bg-transparent border border-sp-border focus:border-sp-accent focus:outline-none text-sm font-bold text-sp-text`
- [ ] Enter 시 IME `isComposing` 확인 후 저장 처리
- [ ] Escape 시 이전 값 복원

### 6.4 호버/포커스/모션

- [ ] 박스 hover: `hover:bg-sp-card/60 hover:border-sp-accent/25 transition-colors` (view 모드 최소 효과)
- [ ] 박스 hover: 편집 모드에서 `hover:ring-1 hover:ring-sp-accent/40` 추가
- [ ] `motion-reduce:transition-none` 모든 animated 요소에 적용
- [ ] 팝오버 enter/exit 애니메이션에도 `motion-reduce` 적용

### 6.5 빈 상태 / 로딩 상태

- [ ] `config === null` 일 때 최소 skeleton 또는 `return null` 처리
- [ ] 대시보드 미리보기 모드에서 "위젯 모드에서 활성화" 안내가 `text-xs text-sp-muted/50` 스타일로 표시됨
- [ ] 비-Windows 안내가 `bg-sp-highlight/10 border-sp-highlight/30 text-sp-highlight` 스타일로 표시됨

### 6.6 팝오버/모달

- [ ] 팝오버 루트: `rounded-xl bg-sp-card border border-sp-border shadow-2xl`
- [ ] 팝오버에 전체화면 backdrop blur 없음 (외부 클릭 감지는 mousedown listener로)
- [ ] 팝오버 [취소] 버튼: `text-sp-muted hover:text-sp-text` 스타일
- [ ] 팝오버 [적용] 버튼: `bg-sp-accent text-white hover:brightness-110 rounded-lg`
- [ ] 잘림 경고 박스: `bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg` (sp-* 대체 불가한 의미론적 색상 허용)
- [ ] ConfirmGridResizeModal에서 기존 `Modal.tsx` 컴포넌트(focus-trap-react 기반) 재사용

### 6.7 접근성

- [ ] 박스 제목 input에 `aria-label="박스 N 제목"` 적용
- [ ] ✏️/⚙️ 버튼에 `title` 속성 또는 `aria-label` 적용
- [ ] 키보드 Tab으로 박스 간 순회 가능 (input `tabIndex` 순서 정상)
- [ ] 헤더 액션 버튼 클릭 영역 ≥ 24×24px (WCAG 2.5.5)

---

## 부록 A — 라운딩 정책 요약 (이 카드에 적용)

| 위치 | 클래스 | 비고 |
|------|--------|------|
| 카드 외곽 | `rounded-xl` | 기존 22개 카드 표준 |
| 내부 organize 박스 | `rounded-xl` | Design 문서의 `rounded-2xl` → `rounded-xl`로 수정 권고 |
| 그리드 설정 팝오버 | `rounded-xl` | |
| 버튼 / input | `rounded-lg` | |
| preview-tag 같은 소형 태그 | `rounded` | 4px |
| 색상 선택 원형 | `rounded-full` | |

## 부록 B — rounded-sp-* 위반 사례 현황 (역사적 부채, 참고용)

2026-05-07 기준으로 분석한 8개 카드 내에서 `rounded-sp-*` 직접 위반은 0건이다. 단, 다음 안티패턴이 존재한다:

- `ImageStickerWidget`: `style={{ borderRadius: \`${widgetData.borderRadius}px\` }}` — 동적 설정값이므로 불가피한 인라인 스타일. `rounded-sp-*` 위반 아님, 단 토큰 우회.
- `WidgetGrid`: `style={{ borderRadius: '0 0 var(--sp-card-radius, 12px) var(--sp-card-radius, 12px)' }}` — CSS 변수를 직접 참조. `rounded-sp-*` 위반 아님, Tailwind 유틸리티 대신 직접 CSS 변수 사용.

---

*이 문서는 2026-05-07 기준 코드 분석을 토대로 작성되었다. 추후 디자인 시스템 변경 시 업데이트 필요.*
