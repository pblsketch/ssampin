# 쌤도구 타이머 — 화면 디자인 설계

- 정본 요구사항: `.dryforge/spec.md` (특히 2·3·4·5·7·9), 인계: `.dryforge/handoff.md`
- 이 문서는 spec 9("디자인 협업")에 따라 프론트엔드 디자인 에이전트가 화면 모양(비율 값·토큰·부채꼴·교실 화면·단계 화면·탭 표시·종료 화면·좁은 창 배치)을 정한 결과다. 구현 전 이 문서를 기준으로 삼는다.
- spec과 이 문서가 다르면 **spec이 이긴다**. spec에 없는 세부(정확한 px, 토큰 이름, 문구)만 이 문서가 정한다.

## 0. 방향 — 새 브랜드가 아니라 기존 언어의 확장

이 작업은 새 제품이 아니라 **기존 쌤핀 대시보드 안의 한 도구**를 고치는 일이다. `docs/design-system.md`·`.impeccable.md`가 이미 정한 언어(다크 우선 13테마, `sp-*` 토큰, Pretendard 본문 + JetBrains Mono 숫자, `rounded-xl` 카드, 장식보다 정보)를 그대로 쓰고, 새 팔레트나 새 폰트를 들여오지 않는다. 이번 작업의 유일한 새 결정은 **"숫자를 교실 뒤에서도 읽히게 크게, 그러면서도 원을 뚫지 않게"** 하는 비율 계산과, 그 계산이 13개 테마에서 깨지지 않도록 하는 색 규칙이다.

새로 만드는 것은 2가지뿐이다.

1. **크기 계산 훅** — 기존 `src/widgets/hooks/useAutoFitLayout.ts`와 같은 `ResizeObserver` 패턴(새 CSS container query 문법 대신 기존 관례를 따름 — 이유는 1장 끝에).
2. **CSS 변수 `--sp-timer-ring-normal`** — 13테마 중 6개(선셋·크래프트·크래프트 다크·모노·뉴트럴 라이트/다크)에서 "평소 색"이 "경고색"과 구별되지 않는 문제를 sp-\* 토큰만으로 해결.

---

## 1. 원·부채꼴/숫자 크기 계산

### 1-1. 지금 무엇이 깨져 있나

`CircleProgress.tsx`는 `radius=140, stroke=6`(고정, `viewBox 300×300`)이고, `TimerMode.tsx`의 숫자는 `text-7xl md:text-8xl`(72/96px) `font-mono font-bold`다. 96px 기준 "05:00"의 실측 폭이 288px인데 원 안지름은 274px — 14px이 넘친다. 게다가 `CircleProgress.tsx`는 색을 `#f59e0b`/`#3b82f6`/`#ef4444` 하드코딩 HEX로 그린다(`sp-*` 토큰 미사용, 이번에 반드시 같이 고친다).

### 1-2. 측정 대상 — "스테이지" 박스

타이머·단계·발표 진행 화면 안에서 원(또는 부채꼴)+숫자만 차지하는 영역을 **스테이지**라 부른다. 위아래의 탭바·활동 이름 입력·프리셋 칩·시작/리셋 버튼·끝나는 시각 라벨은 `flex-shrink: 0`으로 자기 높이를 고정하고, 스테이지는 `flex: 1 1 auto; min-height: 0;`로 **남는 공간 전부**를 받는다. 크기 계산 훅은 창 전체가 아니라 **이 스테이지 요소 하나**를 관찰한다 — 그래야 주변 UI 높이를 일일이 빼는 계산 없이 "빈 공간"이 그대로 관찰값이 된다.

```
useTimerStageSize(stageRef, displayStyle) → { diameter, strokeWidth, digitFontSize, isNarrow }
```

기존 `src/widgets/hooks/useAutoFitLayout.ts`와 같은 `ResizeObserver` 기반 훅으로 새로 만든다(`src/adapters/components/Tools/Timer/useTimerStageSize.ts`). **CSS container query(`cqmin` 등)는 쓰지 않는다** — Electron 43 자체는 지원하지만, 이 저장소에 container query 사용례가 전혀 없고 `ResizeObserver` 기반 크기 훅은 이미 확립된 관례다(`useAutoFitLayout`). 새 문법을 하나 더 들여오는 대신 있는 패턴을 재사용한다.

### 1-3. 계산식 (원 모드)

상수(전부 조정 가능, 값 옆에 이유를 적는다):

| 상수                        | 값         | 이유                                                                                                              |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `MIN_DIAMETER`              | 200px      | spec 2-1의 최소값(옛 모바일 좁은 화면 기준)                                                                       |
| `MAX_DIAMETER`              | 640px      | 4K·초광폭 모니터에서 "짧은 변"이 과도하게 커지는 것을 막는 상한. 200~640 사이에서도 아래 비율식은 그대로 성립한다 |
| `STAGE_FILL_RATIO`          | 0.92       | 스테이지 짧은 변의 92%를 원이 차지, 8%는 상하좌우 여백                                                            |
| `STROKE_RATIO`              | 0.045      | 지름 대비 테두리 두께. 200px에서 9px, 480px에서 21.6px — 지금(6px 고정)보다 확실히 굵어짐                         |
| `STROKE_MIN` / `STROKE_MAX` | 8px / 24px | 아주 작거나 큰 지름에서 두께가 비례식을 벗어나지 않게                                                             |
| `DIGIT_RATIO_TARGET`        | 0.625      | spec 2-1의 60~65% 중간값                                                                                          |
| `DIGIT_CHAR_WIDTH_EM`       | 2.75       | JetBrains Mono Bold로 "00:00"을 그릴 때, 콜론을 2-2절 방식으로 좁힌 상태의 실측 근사 폭(em). 실기기 확인 때 보정  |

계산 순서:

```
available      = min(stageWidth, stageHeight)
diameter       = clamp(MIN_DIAMETER, available × STAGE_FILL_RATIO, MAX_DIAMETER)
strokeWidth    = clamp(STROKE_MIN, diameter × STROKE_RATIO, STROKE_MAX)
innerDiameter  = diameter − 2 × strokeWidth
digitFontSize  = innerDiameter × DIGIT_RATIO_TARGET / DIGIT_CHAR_WIDTH_EM   // ≈ innerDiameter × 0.227
isNarrow       = stageWidth < 560   // 1-5절
```

검증(설계 단계 계산, 구현 후 반드시 실측 재확인 — spec 10 "여러 창 크기에서 숫자 폭 ÷ 원 안지름을 잰다"):

| 스테이지 짧은 변 | diameter    | stroke | innerDiameter | digitFontSize | 숫자 폭 ÷ 안지름 |
| ---------------- | ----------- | ------ | ------------- | ------------- | ---------------- |
| 220px            | 202px       | 9px    | 184px         | 42px          | 0.62             |
| 320px            | 294px       | 13px   | 268px         | 61px          | 0.63             |
| 520px            | 478px       | 21.5px | 435px         | 99px          | 0.62             |
| 700px+           | 640px(상한) | 24px   | 592px         | 134px         | 0.62             |

식 자체가 선형이라 스테이지 크기가 달라져도 비율이 0.60~0.65 범위를 벗어나지 않는다. 옛 300px 고정 원 위치에 대입하면(대략 available≈300) `diameter≈276, digitFontSize≈57px` — 지금 96px보다 훨씬 작아지고 원을 뚫지 않는다(오너가 짚은 문제의 직접적 해결).

### 1-4. 부채꼴 모드의 크기

부채꼴은 숫자를 원(부채꼴) 안이 아니라 **아래**에 둔다(2-7절에서 이유 설명 — 채운 면 위에 숫자를 얹지 않기 위해서다). 그래서 스테이지 높이 중 일부를 숫자 줄이 먼저 가져간다.

```
digitBlockHeight ≈ diameter(1차 근사) × 0.34   // 숫자 줄 높이 + 위 여백
available_pie    = min(stageWidth, stageHeight − digitBlockHeight)
diameter_pie     = clamp(MIN_DIAMETER, available_pie × STAGE_FILL_RATIO, MAX_DIAMETER)
digitFontSize    = 원 모드와 같은 식으로, diameter_pie 를 "diameter"로 넣어 계산
```

1차 근사(`digitBlockHeight`를 `stageHeight` 그대로 썼을 때의 diameter)로 먼저 계산하고, 그 값으로 `digitBlockHeight`를 다시 구해 한 번 더 계산한다(2-패스). `ResizeObserver`는 레이아웃이 바뀔 때마다 다시 불리므로, 근사 오차가 있어도 다음 프레임에서 자연히 수렴한다 — 픽셀 단위로 완벽할 필요는 없다.

원↔부채꼴 토글 시 숫자 크기가 크게 요동치지 않도록, 두 모드는 같은 상수·같은 식을 공유한다(구현은 `computeTimerGeometry(stageSize, displayStyle)` 함수 하나로 통일).

### 1-5. 좁은 창 (<560px 스테이지 폭)

`NARROW_BREAKPOINT = 560`(조정 가능, spec이 예시로 든 "~560px"). **ToolLayout의 `isNarrow`(640px, 헤더 배율·단축키 안내 숨김용)와는 다른 값이며 다른 목적**이므로 섞지 않는다 — 헤더는 창 전체 폭, 이 값은 스테이지(원 영역)만의 폭이다.

- 넓을 때: `−` 버튼 4개(세로 스택) — 원/부채꼴 — `+` 버튼 4개(세로 스택), 가로 `flex` 한 줄.
- 좁을 때(팝업 최소 420px, 모바일 375px 포함): `−`/`+` 버튼을 원 아래로 내려 2행 4열 그리드로 배치.

```html
<!-- 좁은 창 -->
<div class="flex flex-col items-center gap-4 w-full">
  <div class="relative" style="width: {diameter}px; height: {diameter}px">...원/숫자...</div>
  <div class="grid grid-cols-4 gap-1.5 w-full max-w-[360px] px-2">
    <!-- -5분 -1분 -30초 -10초 | +10초 +30초 +1분 +5분: 2행 -->
  </div>
</div>
```

420px 폭에서: 그리드 4열 각 버튼 최소 폭 ~85px(`gap-1.5`=6px 포함 → (420−16(좌우 패딩)−3×6)/4 ≈ 97px) — 라벨 "10초"/"1분"이 줄바꿈 없이 들어간다. 버튼 자체는 `py-2 px-1 text-xs`로 높이를 줄여 세로 공간을 아낀다. 가로 스크롤은 어떤 경우에도 만들지 않는다(그리드가 폭을 초과하면 텍스트를 `truncate`하는 대신 아이콘만 남기고 라벨을 숨기는 `sr-only`로 전환 — 420px에서는 실측상 필요 없지만 375px 모바일 안전장치로 둔다).

---

## 2. 숫자 글꼴

### 2-1. 굵기 수정 (필수)

`index.html`의 JetBrains Mono `<link>` 2곳(프리로드 + 스타일시트, 현재 26·29행)에 **`;700`을 추가**한다.

```diff
- family=JetBrains+Mono:wght@400;500;600&display=swap
+ family=JetBrains+Mono:wght@400;500;600;700&display=swap
```

`mobile.html`에는 JetBrains Mono가 아예 없다. 모바일 타이머·스톱워치 숫자도 같은 폰트를 쓰므로 **700 한 굵기만** 새로 추가한다(모바일엔 kbd 요소가 없어 400/500/600은 불필요 — 페이로드 최소화).

```html
<link
  href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&display=swap"
  rel="stylesheet"
/>
```

숫자 요소는 `font-mono font-bold`(Tailwind `font-bold`=700, `tailwind.config.js`의 `fontFamily.mono`가 이미 JetBrains Mono를 가리킴)로 그대로 쓰되, 이제 실제로 불러온 700이 렌더링된다(지금까지는 브라우저가 600을 흉내 낸 가짜 굵기였다).

### 2-2. 콜론 좁히기

JetBrains Mono는 모노스페이스라 `:`도 숫자와 같은 자간을 먹는다(2-5절이 지적한 문제). 숫자 4자리는 모노스페이스 정렬을 유지하되(초가 바뀌어도 자리가 흔들리지 않게), 콜론만 별도 `<span>`으로 감싸 고정 폭을 줄인다.

```tsx
<div
  className="inline-flex items-baseline tabular-nums font-mono font-bold text-sp-text select-none"
  style={{ fontSize: digitFontSize }}
>
  <span>{mm}</span>
  <span className="inline-block text-center" style={{ width: '0.32em' }}>
    :
  </span>
  <span>{ss}</span>
</div>
```

`tabular-nums`는 JetBrains Mono에선 사실상 no-op(이미 고정폭)이지만, 폰트 로드 실패 시 대체 폰트(`ui-monospace` 등)에서도 자리 흔들림을 막는 안전장치로 남겨둔다. `0.32em` 폭이 1-3절의 `DIGIT_CHAR_WIDTH_EM=2.75`(숫자 4×0.6em + 콜론 0.32em ≈ 2.72em, 근사치) 산출 근거다.

---

## 3. 색 토큰 규칙

### 3-1. 기존 결함

`CircleProgress.tsx`가 `sp-*` 토큰을 전혀 쓰지 않고 `#3b82f6`/`#f59e0b`/`#ef4444`를 직접 쓴다 — 13개 테마 전환과 무관하게 항상 같은 파란/주황/빨강이 나온다는 뜻이다. 이번에 `sp-accent`/`sp-warning`/`sp-error` 기반으로 전면 교체한다.

### 3-2. 단계별 토큰 (2-3 표 그대로)

| 단계 | 조건                                            | 색 (링 stroke / 부채꼴 fill)                   |
| ---- | ----------------------------------------------- | ---------------------------------------------- |
| 평소 | 아래 둘이 아님                                  | `var(--sp-timer-ring-normal)` — 3-3절에서 정의 |
| 경고 | 남은시간 ≤ 경고기준 **and** 전체시간 > 경고기준 | `var(--sp-warning)`                            |
| 임박 | 남은시간 ≤ 10초 **and** 전체시간 > 10초         | `var(--sp-error)`                              |

트랙(배경 원/미완료 부채꼴)은 항상 `var(--sp-border)`. 짧은 타이머(전체시간 ≤ 경고기준)는 평소→임박으로 바로 건너뛴다(경고 단계 없음, spec 2-3 그대로).

### 3-3. `--sp-timer-ring-normal` — 사고 없이 6개 테마를 구제하는 계산 규칙

`sp-warning`/`sp-error`/`sp-info`는 (13개 프리셋과 무관하게) **배경 밝기 하나로만** 두 값을 오간다 — `useThemeApplier.ts`가 `.theme-light`/`.theme-dark` 클래스만 토글하고, `index.css`의 `.theme-light`/`.theme-dark` 블록이 그 고정값을 정의한다. 반면 `sp-accent`는 13개 프리셋마다 다르다. 그래서 "테마 색이 경고색과 구별되지 않는" 문제는 **accent와, 그 테마가 실제로 쓰게 될 고정 경고색 사이의 색상각(hue) 거리**로 판정할 수 있다.

**규칙** (accent의 HSL 기준):

- accent의 채도(S)가 12% 미만이면 → 무채색 테마로 보고 무조건 대체.
- 그 외에는 accent의 색상각(H)과, 이 테마가 쓰는 고정 경고색(라이트 배경이면 `#c2410c`≈15°, 다크 배경이면 `#fbbf24`≈43°)의 원형 hue 거리가 **35° 미만**이면 대체.
- 대체 시 평소 색은 `sp-accent` 대신 **`sp-info`**(라이트 `#7c3aed`·다크 `#a78bfa`, 보라 계열 — 웜톤 경고/위험색과 가장 멀리 떨어진 기존 의미 토큰)를 쓴다.

이 식을 13개 프리셋에 그대로 적용하면 spec 2-3이 예로 든 테마와 정확히 일치한다(검증):

| 테마              | accent              | 배경   | hue 거리(≈) | 판정               |
| ----------------- | ------------------- | ------ | ----------- | ------------------ |
| 다크              | `#3b82f6` 파랑      | 다크   | 174°        | 유지               |
| 라이트            | `#2563eb` 파랑      | 라이트 | 154°        | 유지               |
| 파스텔            | `#a855f7` 보라      | 라이트 | 104°        | 유지               |
| 네이비            | `#60a5fa` 파랑      | 다크   | 170°        | 유지               |
| 포레스트          | `#4ade80` 초록      | 다크   | 98°         | 유지               |
| **선셋**          | `#f97316` 주황      | 다크   | **19°**     | **대체 → sp-info** |
| **모노**          | `#ffffff` 무채색    | 다크   | 채도<12%    | **대체 → sp-info** |
| 노션              | `#2383e2` 파랑      | 라이트 | 190°        | 유지               |
| 노션 다크         | `#447acb` 파랑      | 다크   | 172°        | 유지               |
| **크래프트**      | `#c07830` 주황/갈색 | 라이트 | **15°**     | **대체 → sp-info** |
| **크래프트 다크** | `#d4943c` 주황/황토 | 다크   | **10°**     | **대체 → sp-info** |
| **뉴트럴**        | `#1c1c1e` 무채색    | 라이트 | 채도<12%    | **대체 → sp-info** |
| **뉴트럴 다크**   | `#fafafa` 무채색    | 다크   | 채도<12%    | **대체 → sp-info** |

spec이 예시로 든 "선셋·크래프트·크래프트 다크·모노·뉴트럴" 6개와 정확히 겹친다 — 임의의 목록이 아니라 계산으로 재현 가능하므로, 나중에 새 테마가 추가돼도 이 식이 자동으로 판정한다(커스텀 테마 포함).

**어디서 계산하나** — `src/adapters/hooks/useThemeApplier.ts`의 `applyThemeColors()` 안, 기존에 `--sp-accent-fg`를 `computeAccentFg()`로 계산해 넣는 바로 옆에 같은 방식으로 추가한다.

```ts
root.style.setProperty(
  '--sp-timer-ring-normal',
  needsTimerRingOverride(colors.accent) ? 'var(--sp-info)' : 'var(--sp-accent)',
);
```

`needsTimerRingOverride(hex)`는 위 hue/saturation 규칙을 구현한 순수 함수로 `DashboardTheme.ts`나 새 `timerColor.ts` 유틸에 둔다(단위 시험 대상 — spec 10 "색 단계: 짧은 타이머, 경고 꺼짐, 경계값"에 이 판정도 포함해 고정할 것을 권장). **HEX를 새로 도입하는 게 아니라 기존 `sp-info`/`sp-accent`를 가리키는 계산**이므로 "색은 sp-\* 토큰만 쓴다" 규칙을 어기지 않는다.

컴포넌트 쪽 사용:

```tsx
const ringColor =
  phase === 'critical'
    ? 'var(--sp-error)'
    : phase === 'warning'
      ? 'var(--sp-warning)'
      : 'var(--sp-timer-ring-normal)';
```

### 3-4. "채운 배경은 sp-accent만" 규칙과 부채꼴의 관계

`sp-warning`/`sp-error`는 글자·테두리로만 쓴다는 규칙은 **텍스트가 얹히는 면**을 겨냥한 것이다(짝 전경색이 없어 대비를 보장 못 하기 때문 — `feedback_only_sp_accent_has_paired_foreground.md`). 부채꼴은 spec 2-7이 이미 "숫자를 경고·위험색 위에 얹지 않는다"고 못 박아 텍스트-온-필 조합 자체를 금지했으므로, **부채꼴 wedge를 `sp-warning`/`sp-error`로 채우는 것은 이 규칙의 예외가 아니라 애초에 규칙이 막으려던 상황(텍스트 얹기)이 일어나지 않는 경우**다. 숫자는 4장에서 정할 별도의 sp-card 색 받침 위에만 둔다.

### 3-5. 라이트 모드 경고색 대비

`--sp-warning`(라이트) = `#c2410c`(orange-700)로 이미 `text-red-400`류 실패를 겪은 뒤 보정된 값이다(index.css 412행 주석 — sp-error 도입 배경과 동일 이유). 새로 만드는 원/부채꼴 stroke·fill에도 그대로 재사용하므로 별도 대비 조정은 필요 없다.

---

## 4. 부채꼴 표시 (2-7)

- **모양**: SVG로 그린다. 바깥 지름은 1-4절 `diameter_pie`. 배경 트랙(전체 원, `sp-border`)과 그 위에 12시 방향에서 시계 방향으로 그려지는 **남은 시간** wedge(`path`, `sp-timer-ring-normal`/`sp-warning`/`sp-error`)로 구성 — 오래된 "키친 타이머" 은유(줄어드는 파이)를 그대로 따른다.
- **숫자 위치**: **부채꼴 밖, 아래**에 둔다(2-7이 준 두 선택지 중 "카드색 원 위" 대신 이쪽을 고른 이유: 가운데 hub를 얹으면 파이가 도넛이 되어 "줄어드는 면적"이라는 은유가 옅어지고, 남은 시간이 적을수록 hub 테두리와 wedge 경계가 시각적으로 붙어버린다. 아래 배치는 원 모드와 숫자 위치만 다를 뿐 크기 계산식은 그대로 공유해 토글 시 숫자가 튀지 않는다).
- **레이아웃**:
  ```html
  <div class="flex flex-col items-center gap-3">
    <svg width="{diameter_pie}" height="{diameter_pie}">...트랙 + wedge...</svg>
    <div class="...콜론 좁힌 숫자, digitFontSize...">05:00</div>
  </div>
  ```
- **색**: 3장 규칙 그대로(평소/경고/임박).
- **설정 저장**: `displayStyle: 'ring' | 'pie'`는 `timerTool`(동기화 설정, spec 6-1)에 저장 — 토글 스위치는 알람음 패널 옆, "표시 방식" 라벨의 스위치(role="switch", 5-5 접근성 규칙과 동일 패턴)로 둔다. 라벨: "표시: 원" / "표시: 부채꼴".
- **모바일**: 이 토글 자체를 렌더하지 않는다(spec 1-1 — 모바일은 원 테두리 고정).

---

## 5. 상태 표시

### 5-1. 대기(idle)

± 버튼은 `disabled` 속성을 걸지 않는다(spec 3-2). 지금 코드의 `disabled={state === 'idle' || ...}` 조건에서 `state === 'idle'` 항을 제거한다. 대신 **"흐릿한 비활성"처럼 보이던 지금의 `disabled:opacity-20` 룩을 대기 중엔 쓰지 않는다** — 대기 중 ± 버튼은 `bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40`(진행 중과 동일한 "평소 활성" 스타일)로 그린다. 실제로 막아야 하는 경우(한도 초과, 범위 1초~99:59)만 `disabled:opacity-30`을 건다.

### 5-2. 일시정지(paused)

- 숫자에 **천천히 깜빡이는** CSS 애니메이션 클래스(`animate-sp-paused-blink`, `tailwind.config.js`에 새 keyframe 추가)를 건다. 지금의 `flashCount` 같은 JS `setInterval` 방식이 아니라 **CSS `animation`**으로 구현해야 `index.css`의 전역 `@media (prefers-reduced-motion: reduce)` 규칙(1267행)이 자동으로 무력화한다.
  ```js
  // tailwind.config.js keyframes
  spPausedBlink: {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.35' },
  },
  // animation
  'sp-paused-blink': 'spPausedBlink 1.8s ease-in-out infinite',
  ```
- 숫자 아래(또는 나란히)에 **"잠시 멈춤"** 텍스트를 `text-sp-muted text-sm font-medium`으로 표시 — 끝나는 시각 자리를 대신 차지한다(5-3절과 자리 공유).
- 교실 뒤에서도 보이도록 "잠시 멈춤" 옆에 `pause_circle` 아이콘(`text-icon-md text-sp-muted`)을 함께 둔다 — 깜빡임만으로는 색약·저시력 사용자에게 약하다.

### 5-3. 진행 중 — 끝나는 시각

- 위치: 원/부채꼴+숫자 블록 바로 아래, `text-sm text-sp-muted`.
- 문구: `오후 2:35에 끝나요`(조정 가능 — 12시간제 + 오전/오후, 한국어 관례). `Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true })`로 만들면 `"오후 2:35"`가 나온다(로케일이 자동으로 "오전/오후"를 앞에 붙임) → 뒤에 "에 끝나요"만 문자열로 이어 붙인다.
- 일시정지 중엔 이 자리에 "잠시 멈춤"이 대신 나온다(같은 슬롯, 조건부 렌더).

### 5-4. 활동 이름 (3-4)

원 위, 입력창:

```tsx
<input
  type="text"
  maxLength={20}
  value={activityName}
  onChange={...}
  placeholder="활동 이름(선택)"
  className="w-full max-w-[220px] text-center text-sm text-sp-text placeholder:text-sp-muted
             bg-transparent border-b border-transparent hover:border-sp-border
             focus:border-sp-accent focus:outline-none py-1.5 transition-colors"
/>
```

포커스 시 최근 이름 최대 8개를 드롭다운 칩으로 제안(`data-sp-floating` 필수 — 유리 모드에서 배경이 비지 않도록):

```tsx
<div data-sp-floating className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-sp-dropdown
     flex flex-wrap gap-1.5 justify-center max-w-[280px] p-2
     bg-sp-card border border-sp-border rounded-lg shadow-sp-md">
  {recentNames.map((name) => (
    <button key={name} className="px-2.5 py-1 rounded-full text-xs bg-sp-bg border border-sp-border
         text-sp-muted hover:text-sp-text hover:border-sp-accent/40" onClick={...}>{name}</button>
  ))}
</div>
```

교실 화면·팝업 창에서는 입력창 대신 **정적 텍스트**로 이름을 보여준다(9장 참고).

### 5-5. 음소거 안내 (5-1)

- 소리가 꺼진 동안, 타이머 탭의 "알람음: …" 토글 버튼 **오른쪽**에 상시 노출:
  ```tsx
  <span className="flex items-center gap-1 text-xs text-sp-error">
    <span className="material-symbols-outlined text-icon-sm">volume_off</span>
    소리 꺼짐 — 알람이 울리지 않아요
  </span>
  ```
- 예고 알림 배너(지금 `bg-amber-500` 하드코딩 필 배너)는 테두리형으로 바꾼다 — 채운 배경에 흰 글씨를 쓰려면 짝 전경색이 필요한데 `sp-warning`엔 없기 때문이다.
  ```tsx
  <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-sp-card border-2 border-sp-warning shadow-sp-md">
    <span className="material-symbols-outlined text-sp-warning text-icon-lg">notifications_active</span>
    <span className="text-sm font-bold text-sp-warning">{...} 남았어요! 마무리 준비~</span>
  </div>
  ```
- 시작 시 짧은 안내 1회: 기존 `useToastStore`(이미 `TimerMode.tsx`에서 import 중)로 `showToast('소리가 꺼져 있어요. 알람이 울리지 않아요.', 'info')`.
- 헤더의 🔊 버튼 타이틀(`ToolLayout.tsx` 240행 `title={soundEnabled ? '소리 끄기 (M)' : '소리 켜기 (M)'}`)을 아래처럼 바꾼다.
  ```
  title={soundEnabled ? '소리 끄기 — 타이머 알람도 함께 꺼져요 (M)' : '소리 켜기 (M)'}
  ```

---

## 6. 시간 종료 화면 (통합)

### 6-1. 공통 구조

`TimerEndOverlay` 컴포넌트 하나를 만들어 타이머·단계·발표가 공유한다(발표는 4-4/4-5 규칙에 따라 하단 버튼 영역만 다른 콘텐츠를 주입).

```tsx
<div
  className={`absolute inset-0 z-sp-modal rounded-2xl flex flex-col items-center justify-center gap-3
    transition-colors duration-200 ${isFlashing ? '' : ''}`}
  style={{
    backgroundColor: isFlashing
      ? 'color-mix(in srgb, var(--sp-error) 30%, var(--sp-bg))'
      : 'var(--sp-bg)',
  }}
>
  <p className="text-5xl md:text-7xl font-bold text-sp-error">
    {finishedEarly ? '발표 마침' : '시간 종료'}
  </p>
  {!hideOvertime && overtimeSeconds > 0 && (
    <p className="text-sm text-sp-muted tabular-nums">+{formatTime(overtimeSeconds)}</p>
  )}
  <div className="mt-4">{actions}</div>
</div>
```

- 배경은 **항상 인라인 `style`의 `var(--sp-bg)`**(REGRESSION #82 불변식 — `bg-sp-bg/90` 같은 Tailwind 투명도 수식은 클래스 자체가 안 만들어져 조용히 투명해진다). 깜빡임도 `color-mix()`로 항상 불투명하게 유지한다(기존 `bg-red-600/30` 하드코딩을 대체하면서 동시에 sp-토큰화).
- `actions` 슬롯: 타이머/단계는 `[확인]` 버튼 하나, 발표는 4-4 상태에 맞는 버튼(11장).
- `regression-grep-check.mjs`의 REGRESSION #82 검사가 이 컴포넌트의 파일을 새로 스캔하도록 스크립트의 대상 파일 목록을 갱신한다(handoff.md 7번 "검사를 새 파일로 옮기되 불변식은 지킨다").

### 6-2. 타이머·단계 — `[확인]`

```tsx
<button
  onClick={onConfirm}
  className="px-10 py-4 rounded-xl bg-sp-accent text-white text-xl font-bold hover:bg-sp-accent/80 transition-colors"
>
  확인
</button>
```

(이 버튼은 `sp-accent` 필 배경이라 규칙에 맞음. `hover:bg-sp-accent/80`처럼 accent 자기 자신에 거는 투명도는 Tailwind가 `--sp-accent`를 rgb 함수로 변환하지 못해 마찬가지로 깨진다 — 기존 코드에 이미 여러 곳 있는 문제이므로, 이 참에 `hover:brightness-90`으로 바꾸는 것을 권장한다: 밝기 필터는 임의의 배경색 위에서도 안전하게 동작한다.)

### 6-3. 발표 타이머 변형 (4-5)

- 큰 글씨는 상황에 따라 "시간 종료" 또는 "발표 마침"(4-4 표: 발표 끝 상태 진입 방법에 따라 결정).
- 초과 시간 `+MM:SS`는 `text-xs text-sp-muted`(작고 흐리게, 타이머 판의 `text-sm`보다 한 단계 더 작춤 — "학생을 망신 주지 않는다"는 ADR-134 원칙).
- 교실 화면 모드에서는 `hideOvertime=true`로 이 줄 자체를 렌더하지 않는다.
- `actions`에는 11-3절의 상태별 버튼이 들어간다.

---

## 7. 탭

### 7-1. 아이콘 (서로 다른 4개, Material Symbols)

| 탭          | 아이콘       | 이유                                                                          |
| ----------- | ------------ | ----------------------------------------------------------------------------- |
| 타이머      | `timer`      | 표준 카운트다운 아이콘(위쪽 두 꼭지)                                          |
| 스톱워치    | `av_timer`   | 스톱워치/다이얼 실루엣 — `timer`와 확실히 다른 모양                           |
| 발표 타이머 | `co_present` | 발표자+화면 아이콘 — 시계류 아이콘과 완전히 다른 카테고리라 가장 먼저 눈에 띔 |
| 단계 타이머 | `stairs`     | "단계"를 계단으로 직역 — 순서가 있다는 인상을 바로 줌                         |

지금 `ToolTimer.tsx`의 `TABS` 배열은 타이머·스톱워치가 똑같이 `⏱️` 이모지를 쓴다(결함). Material Symbols로 전면 교체한다.

### 7-2. 탭 바 마크업

```tsx
<div
  role="tablist"
  aria-label="타이머 도구"
  className="flex bg-sp-card rounded-xl p-1 border border-sp-border"
>
  {TABS.map((t) => (
    <button
      key={t.id}
      role="tab"
      aria-selected={tab === t.id}
      aria-controls={`timer-panel-${t.id}`}
      id={`timer-tab-${t.id}`}
      onClick={() => setTab(t.id)}
      className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        tab === t.id ? 'bg-sp-accent text-white shadow-sm' : 'text-sp-muted hover:text-sp-text'
      }`}
    >
      <span className="material-symbols-outlined text-icon-md">{t.icon}</span>
      {t.label}
      {t.badge && <TabRunningBadge {...t.badge} active={tab === t.id} />}
    </button>
  ))}
</div>
```

각 탭 콘텐츠 패널에는 `role="tabpanel" id="timer-panel-{id}" aria-labelledby="timer-tab-{id}"`를 붙인다.

### 7-3. 진행 중 배지 (5-2)

보이지 않는 탭에서도 돌고 있는 모드를 표시하는 작은 배지:

```tsx
function TabRunningBadge({ remainingSeconds, finished, active }) {
  const cls = finished
    ? 'bg-sp-error text-white'
    : active
      ? 'bg-white/25 text-white'
      : 'bg-sp-accent text-white';
  return (
    <span
      className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] leading-none font-bold tabular-nums ${cls}`}
    >
      {finished ? '종료' : formatTime(remainingSeconds)}
    </span>
  );
}
```

- 활성 탭 배경이 이미 `sp-accent`이므로, 그 위 배지는 `white/25`(흰 위 흰 반투명, 대비 문제 없음 — accent-fg가 자동 흰색인 테마 기준. `sp-accent-fg`가 어두운 색인 테마 대비도 고려해 실기기에서 재확인) 처리해 튀지 않게 하고, 비활성 탭 배지는 `sp-accent` 필로 눈에 띄게 한다. 종료(미확인) 배지는 항상 `sp-error` 필로 통일 — 활성/비활성 무관하게 "확인 필요"를 가장 강하게 표시한다.
- 문구는 남은 시간(`MM:SS`, 60분 미만) 또는 "종료". 남은 시간이 1시간을 넘는 경우는 실질적으로 없음(범위 상한 99:59).

### 7-4. 접근성

- 탭 목록: `role="tablist"`+각 탭 `role="tab"`+`aria-selected`(위 마크업대로).
- 스위치(표시 방식·예고 알림 켬끔·건너뛰기 옵션 등): `role="switch"`+`aria-checked`.
  ```tsx
  <button
    role="switch"
    aria-checked={enabled}
    onClick={toggle}
    className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-sp-accent' : 'bg-sp-border'}`}
  >
    <span
      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
    />
  </button>
  ```
  (지금 `TimerMode.tsx`의 예고 알림 스위치는 `<button>`에 `role`이 전혀 없다 — 이번에 추가.)

---

## 8. 프리셋·편집·±·표시 토글·알람 반복

### 8-1. 프리셋 칩

읽기 모드(평소)는 지금과 같은 알약 칩 목록 + 끝에 "직접 입력" 칩. 다른 점: 개수가 1~8개로 가변이고, 현재 총 시간이 프리셋 값과 같으면 그 칩이 선택 상태(`selectedPreset === totalSeconds`, `-1`은 커스텀).

### 8-2. 편집 모드

칩 목록 오른쪽 끝에 연필 아이콘 버튼(`edit`, `text-sp-muted hover:text-sp-text`)으로 진입. 편집 모드에서 각 칩은:

```tsx
<span className="group relative inline-flex items-center gap-1 pl-3.5 pr-1.5 py-1.5 rounded-full text-sm bg-sp-card border border-sp-border text-sp-text">
  {formatPresetLabel(seconds)}
  <button
    aria-label={`${formatPresetLabel(seconds)} 삭제`}
    className="w-4 h-4 rounded-full flex items-center justify-center text-sp-muted hover:text-sp-error hover:bg-sp-error/10"
  >
    <span className="material-symbols-outlined text-[12px]">close</span>
  </button>
</span>
```

편집 모드 하단에 분·초 두 입력(⁠`CustomTimeModal`과 같은 위젯 재사용) + "추가" 버튼, 그리고 오른쪽에 `[기본값으로]`(`text-sp-muted hover:text-sp-error` 텍스트 버튼 — 되돌릴 수 없는 동작이라 눈에 덜 띄는 톤 유지, 클릭 시 "기본 프리셋(1·3·5·10·15·30분)으로 되돌릴까요?" 확인 없이 즉시 적용 + 토스트 "기본 프리셋으로 되돌렸어요"로 실행취소 여지 안내).

- 8개 도달 시 "추가" 버튼 `disabled`, 안내 텍스트 "최대 8개까지 담을 수 있어요"(`text-xs text-sp-muted`).
- 중복 값 추가 시도 시 토스트 "이미 있는 시간이에요"(error 토스트).
- 저장은 즉시 반영(별도 "저장" 버튼 없이 변경 즉시 `timerTool.presets`에 커밋) — 이미 앱 전반의 설정 패널이 이런 즉시 반영 패턴을 쓴다(`updateSettings` 콜백들).

### 8-3. ± 버튼 스타일 정리

지금 버튼은 raw Tailwind 팔레트(`hover:text-red-400`, `hover:text-emerald-400`)를 쓴다 — `sp-*` 토큰 규칙 위반이자, 시맨틱 의미도 어긋난다("빼기=위험색, 더하기=성공색"은 사용자 조작에 옳은 은유가 아니다). 새 스타일: 부호와 무관하게 동일한 중립 스타일을 쓰고, **대기 중에도 항상 활성**(5-1절)으로 보이게 한다.

```tsx
<button
  className="group flex items-center gap-1 px-3 py-1.5 rounded-lg
    bg-sp-card border border-sp-border text-sp-muted
    hover:text-sp-text hover:border-sp-accent/50
    disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-medium"
>
  <span className="material-symbols-outlined text-icon-sm">{sign > 0 ? 'add' : 'remove'}</span>
  {label}
</button>
```

`disabled`는 오직 한도(1초~99:59) 초과분에만 건다(spec 3-2).

### 8-4. 표시 방식 토글(원/부채꼴)과 알람 반복

알람음 패널 안, 볼륨 슬라이더 아래에 같은 모양의 세그먼트 버튼 두 줄을 추가한다 — 라벨 텍스트(`text-sm text-sp-text`) + 오른쪽 `flex gap-1 p-0.5 bg-sp-bg rounded-lg border border-sp-border` 안에 옵션 버튼들(`aria-pressed`, 선택 시 `bg-sp-accent text-white`, 아니면 `text-sp-muted hover:text-sp-text`).

- **표시 방식**: `원` / `부채꼴` 2개.
- **알람 반복**: `ALARM_REPEAT_OPTIONS = [{id:'once', label:'한 번'}, {id:'three', label:'3번'}, {id:'untilConfirm', label:'확인할 때까지'}]` 3개.

데스크톱 전용 섹션이므로 모바일 알람음 패널에는 이 두 줄을 렌더하지 않는다(spec 1-1 — `timerTool` 자체를 모바일이 안 씀).

---

## 9. 교실 화면 모드 (5-5)

### 9-1. 진입 버튼

`ToolLayout` 헤더의 전체화면 버튼 왼쪽에 새 버튼 추가:

```tsx
<button
  onClick={enterClassroomMode}
  className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all"
  title="교실 화면 (F)"
  aria-label="교실 화면으로 보기"
>
  <span className="material-symbols-outlined text-icon-lg">cast_for_education</span>
</button>
```

단축키 `F`는 `ToolLayout`의 `allShortcuts` 목록(단축키 안내 패널)에 "F — 교실 화면"으로 추가한다. 스톱워치 탭에도 이 버튼이 보인다(적용 대상에 포함).

### 9-2. 화면 구성 (모드별)

교실 화면은 별도 풀스크린 오버레이 컴포넌트(`ClassroomModeOverlay`, `fixed inset-0 z-sp-modal bg-sp-bg`, `createPortal(document.body)`)로 그린다. 공통: 프리셋·±·설정·탭·도구 머리글 전부 숨김. 원/부채꼴 지름은 1장 식의 `available`을 **뷰포트 전체**(`window.innerWidth/innerHeight`에서 상하 여백만 뺀 값)로 키워 재계산 — `MAX_DIAMETER` 상한(640px)도 교실 화면에서는 더 크게(`960px`, 조정 가능) 풀어준다.

| 모드        | 보이는 것 (위→아래)                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 타이머      | 활동 이름(`text-2xl text-sp-text`, 없으면 숨김) · 원/부채꼴+숫자(초대형) · 끝나는 시각(`text-lg text-sp-muted`)                                        |
| 단계 타이머 | 단계 이름(`text-3xl font-bold`) · "2/3단계 · 다음: 발표"(`text-lg text-sp-muted`) · "2/4바퀴"(반복 있을 때만) · 원/부채꼴+숫자 · 전체 활동 끝나는 시각 |
| 발표 타이머 | 발표자 이름(`text-3xl font-bold`) · "3/25"(`text-lg text-sp-muted`) · 원/부채꼴+숫자 (초과 시간 없음)                                                  |
| 스톱워치    | 숫자만, 초대형(가능한 가장 큰 `digitFontSize`)                                                                                                         |

### 9-3. 자동 숨김 컨트롤 바

```tsx
<div
  className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3
    transition-opacity duration-300 ${barVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
>
  <button className="w-14 h-14 rounded-full bg-sp-card/90 border border-sp-border text-sp-text flex items-center justify-center backdrop-blur-sm">
    <span className="material-symbols-outlined text-2xl">{isPaused ? 'play_arrow' : 'pause'}</span>
  </button>
  {nextAction && (
    <button className="h-14 px-6 rounded-full bg-sp-accent text-white font-bold flex items-center gap-2">
      {nextAction.label}
    </button>
  )}
  <button className="w-14 h-14 rounded-full bg-sp-card/90 border border-sp-border text-sp-muted flex items-center justify-center backdrop-blur-sm">
    <span className="material-symbols-outlined text-2xl">close</span>
  </button>
</div>
```

- `bg-sp-card/90`는 예외적으로 허용 — 이 값은 sp-토큰에 Tailwind 투명도 수식이 아니라, 애초에 정적 유틸이 아닌 **인라인 `style={{ backgroundColor: 'color-mix(in srgb, var(--sp-card) 90%, transparent)' }}`**로 구현한다(Tailwind 클래스 `bg-sp-card/90`은 실제로 CSS를 만들지 않으므로 절대 그 클래스명 자체를 쓰지 않는다 — 위 스니펫의 `/90` 표기는 의도만 나타낸 것이고, 실제 구현은 인라인 `color-mix`).
- 마우스 이동·탭 1회 시 3초간 노출 후 자동으로 사라짐(타이머 리셋은 매 이동마다).
- `nextAction`: 발표는 11-3절 표, 단계는 "다음 단계"(마지막 단계에서는 버튼 자체를 렌더하지 않음 — 7-2절 비활성 조건과 동일).
- `[나중에]`·`[건너뛰기]`는 렌더하지 않는다(spec 5-5).

### 9-4. 전체화면·나가기

- 진입 시 `document.documentElement.requestFullscreen()`(본문/팝업 창 기준. 병렬 모드 슬롯이면 그 슬롯 컨테이너만 채우고 전체화면 API는 호출하지 않음).
- `Esc`와 `[나가기]`는 교실 화면만 닫는다(도구 자체는 유지) — `ToolLayout`의 `Esc`(뒤로가기/슬롯 닫기) 핸들러보다 **교실 화면 오버레이가 먼저** 키를 가로챈다(오버레이 마운트 중엔 `ToolLayout`의 `useToolKeydown`을 비활성화하거나, 오버레이 쪽 리스너가 `stopPropagation`).
- `fullscreenchange` 이벤트를 구독해 사용자가 브라우저 자체 단축키(F11 등)로 전체화면을 풀면 교실 화면도 함께 닫는다.

---

## 10. 단계 타이머 (7장)

### 10-1. 편집 화면

- 순서 이름 입력(`sp-input w-full text-lg font-bold`, maxLength 20).
- 단계 목록: 각 행은 `flex items-center gap-2 p-2.5 rounded-xl bg-sp-card border border-sp-border` 한 줄에 — 번호(`tabular-nums text-xs text-sp-muted`) · 이름 입력(`flex-1`, placeholder `N단계`, maxLength 20) · 분 입력(`w-12` 숫자) · "분" · 초 입력(`w-12`) · "초" · 위/아래 화살표(`keyboard_arrow_up`/`_down`, 첫/끝 행에서 `disabled`) · 삭제(`close`, 단계 1개 남으면 `disabled`).
- 하단에 점선 테두리 "단계 추가" 버튼(`border-dashed border-sp-border`, `add` 아이콘).
- "반복 횟수" 행: `NumberStepper`(1~10) — 8-3절 ± 버튼과 같은 톤.
- 반복 > 1이고 단계 ≥ 2일 때만 "마지막 바퀴의 마지막 단계 건너뛰기" 스위치 행(`role="switch"`, 7-4절 패턴) 노출.
- 하단 `[저장]`(`bg-sp-accent text-white font-bold`, 전체 폭).

- 20개 단계 상한 도달 시 "단계 추가" 버튼 `disabled` + "최대 20단계까지 만들 수 있어요" 안내.
- 조건이 깨지면(단계를 1개로 줄임) "마지막 바퀴…" 스위치는 자동으로 `false`가 되고 UI에서도 사라진다(spec 7-1 그대로).

### 10-2. 저장한 순서 목록 / 예시

편집 화면 진입 전, 저장한 순서가 있으면 카드 목록으로 먼저 보여준다(없으면 예시 2개를 "읽기 전용" 배지와 함께):

```tsx
<button className="w-full flex items-center justify-between p-4 rounded-xl bg-sp-card border border-sp-border hover:border-sp-accent/40 text-left">
  <div>
    <p className="text-sm font-bold text-sp-text">{seq.name}</p>
    <p className="text-xs text-sp-muted">
      {seq.steps.length}단계 · {seq.repeat > 1 ? `${seq.repeat}바퀴` : '1회'}
    </p>
  </div>
  <span className="material-symbols-outlined text-sp-muted">chevron_right</span>
</button>
```

예시 카드는 같은 모양에 `읽기 전용` 텍스트 배지(`text-caption text-sp-muted border border-sp-border rounded-full px-1.5`)를 붙이고, 열면 편집 가능하지만 "저장"을 눌러야 실제 내 목록에 들어간다("불러오기"가 아니라 "저장"이 최초 등록 행위).

### 10-3. 진행 화면

원 모드 기준 레이아웃(부채꼴도 4장 규칙대로 숫자 아래 배치):

```tsx
<div className="flex flex-col items-center gap-2">
  <p className="text-2xl md:text-3xl font-bold text-sp-text">{currentStep.name || `${stepIndex + 1}단계`}</p>
  <p className="text-sm text-sp-muted">
    {stepIndex + 1}/{totalSteps}단계 · 다음: {nextStepName ?? '없음'}
    {repeat > 1 && ` · ${round}/${repeat}바퀴`}
  </p>
</div>
{/* 원/부채꼴 + 숫자 — 1장 계산 그대로 */}
<p className="text-sm text-sp-muted">전체 {wholeActivityEndTime}에 끝나요</p>
<div className="flex items-center gap-4">
  <button disabled={isFirstStepOfFirstRound} title="이전 단계">
    <span className="material-symbols-outlined">skip_previous</span>
  </button>
  {/* 리셋(처음으로) · 시작/일시정지 — 기존 원형 버튼 패턴 재사용 */}
  <button disabled={isLastAdvanceableStep} title="다음 단계">
    <span className="material-symbols-outlined">skip_next</span>
  </button>
</div>
```

`[이전 단계]`/`[다음 단계]`는 `w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text` 원형 버튼(리셋 버튼과 동일 크기 계열), 재생/일시정지 버튼보다 좌우 바깥쪽에 배치해 "가운데=가장 중요한 조작"이라는 기존 위계를 유지한다.

---

## 11. 발표 타이머 추가 요소

### 11-1. 준비 화면 — 직접 입력·질문 시간

발표 시간 프리셋 칩(1·2·3·5분) 옆에 "직접 입력" 칩 추가(3장과 동일 컴포넌트 재사용, 범위만 5초~99:59로 공통).

질문 시간 섹션(`p-4 rounded-xl bg-sp-card border border-sp-border space-y-3`): "발표 뒤 질문 시간" 라벨 + `role="switch"` 스위치(7-4절 패턴). 켜졌을 때만 `30초·1분·2분` 세그먼트 버튼(8-4절과 같은 톤) + "직접 입력" 칩을 아래에 펼친다. 기본값: 꺼짐(spec 4-1).

### 11-2. 발표용 예고 알림 (4-3)

타이머 탭 예고 알림과 시각적으로 동일한 패턴이되 **독립된 상태**임을 라벨로 분명히 한다: "발표용 예고 알림"(타이머 탭은 "종료 전 예고 알림"). 기본 켜짐·30초 전.

### 11-3. 진행 중 조작 — 상태별 버튼

4-4의 상태표를 그대로 UI 위계로 옮긴다. **주(primary)**는 `bg-sp-accent text-white`, **보조(secondary)**는 `bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text`.

| 상태                | 주 버튼                                                                                 | 보조 버튼                                                                     |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 발표 중 / 발표 멈춤 | (일시정지·재개는 원형 아이콘 버튼, 상시 위치) `[발표 마침]`(flag 아이콘)                | `[나중에]`(move_down 아이콘, 조건부 표시) · `[건너뛰기]`(fast_forward 아이콘) |
| 발표 끝             | 질문 시간 켜짐 → `[질문 시간]`(forum 아이콘) / 꺼짐 → `[다음 발표자]`(skip_next 아이콘) | 질문 시간 켜짐이면 `[다음 발표자]`도 보조로 함께 노출                         |
| 질문 중 / 질문 멈춤 | `[질문 마침]`(check_circle 아이콘)                                                      | —                                                                             |
| 질문 끝             | `[다음 발표자]`                                                                         | —                                                                             |
| 발표 완료           | `[시간 기록 보기]`(list_alt 아이콘)                                                     | —                                                                             |

위쪽 줄: `[처음으로]`(리셋과 같은 `w-16 h-16 rounded-full bg-sp-card border border-sp-border text-sp-muted` 원형) — 재생/일시정지 원형 버튼 — 주 버튼(`h-16 px-6 rounded-full bg-sp-accent text-white font-bold`, 아이콘+라벨). 그 아래 줄에 보조 버튼들을 `bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text text-sm` 알약으로 가로 나열한다.

`[나중에]`가 보이지 않아야 하는 두 조건(이미 미룬 학생 / 남은 학생이 그 학생뿐)은 `secondaryActions` 계산 단계에서 걸러 배열에 아예 넣지 않는다(DOM에 `disabled`로 남기지 않음 — spec이 "보이지 않는다"고 명시).

### 11-4. `[명단 비우기]`

준비 화면 하단, 눈에 덜 띄는 텍스트 버튼: `text-sp-muted hover:text-sp-error text-xs flex items-center gap-1`, 아이콘 `delete_sweep`. 클릭 시 확인 다이얼로그("명단과 순서를 모두 지울까요? 되돌릴 수 없어요" / `[취소]` `[비우기]`(`bg-sp-error` 대신 `border border-sp-error text-sp-error` — 파괴적 동작이라 필 배경 대신 아웃라인으로 "신중한 강조"를 준다. 채운 배경은 sp-accent 전용이라는 규칙과도 맞음)).

### 11-5. `[시간 기록 보기]`

발표 완료 화면에 이 버튼 하나만 있다. 누르면 같은 화면 안에서 목록으로 전환한다(별도 모달 불필요 — 조회만 하는 화면이라 모달로 격리할 이유가 적음, 팝업 창 폭이 좁을 수 있어 세로 스크롤은 허용). 목록은 `divide-y divide-sp-border`로 구분된 한 줄씩(`flex items-center justify-between py-2.5 px-1`): 왼쪽 이름(`text-sm text-sp-text`), 오른쪽 `건너뜀` 또는 `MM:SS`(+초과 있으면 `+MM:SS`를 이어서), 둘 다 `text-sm tabular-nums text-sp-muted` 한 가지 색.

색·순위·정렬 없음(ADR-134). 초과 시간도 본문과 같은 `text-sp-muted`(강조 색 금지 — spec 4-6 "색 없이"). 줄 순서는 실제 발표 순서 그대로(배열을 정렬하지 않는다).

---

## 12. 화면 이동 안내 / 팝업 실패 안내 (5-3, 5-4)

### 12-1. 이동 안내 다이얼로그

기존 `CloseActionDialog.tsx`(창 X 처리)와 톤을 맞춘 새 `LeaveGuardDialog` — `role="dialog"`, `data-sp-overlay-surface`(유리 모드 규칙 적용 대상), `fixed inset-0 z-sp-modal bg-black/60` 배경 + 중앙 카드.

```tsx
<div
  className="bg-sp-card border border-sp-border rounded-2xl p-6 w-full max-w-sm"
  role="dialog"
  aria-modal="true"
>
  <div className="flex items-center gap-2 mb-2">
    <span className="material-symbols-outlined text-sp-warning">warning</span>
    <h3 className="text-lg font-bold text-sp-text">{modeLabel}이 돌고 있어요</h3>
  </div>
  <p className="text-sm text-sp-muted mb-5">이 화면을 나가면 어떻게 할까요?</p>
  <div className="flex flex-col gap-2">
    {canMoveToPopup && (
      <button className="py-2.5 rounded-lg bg-sp-accent text-white font-medium">
        팝업으로 옮기고 이동
      </button>
    )}
    <button className="py-2.5 rounded-lg border border-sp-error text-sp-error font-medium hover:bg-sp-error/10">
      끄고 이동
    </button>
    <button className="py-2.5 rounded-lg border border-sp-border text-sp-text hover:bg-sp-text/5">
      머무르기
    </button>
  </div>
</div>
```

- `[머무르기]`가 가장 안전한 기본 선택이므로 시각적 위계를 가장 낮은 강조(아웃라인, 중립 톤)로 두되 **키보드 포커스는 `[머무르기]`에 기본으로 가게** 한다(실수로 Enter를 눌러도 안전한 쪽이 실행되도록 — Esc 다이얼로그의 일반적 안전 원칙).
- 팝업으로 옮길 수 없는 상황(병렬 모드 등)에서는 `[팝업으로 옮기고 이동]` 버튼 자체를 렌더하지 않는다(회색 비활성이 아니라 미노출 — spec 5-3 "팝업으로 옮길 수 있을 때만 보인다").
- 다른 도구 팝업에서 [본문으로 가져오기]를 누를 때의 변형(3지선다: `[타이머를 팝업으로 옮기고 가져오기]`·`[타이머 끄고 가져오기]`·`[취소]`)도 같은 카드 틀, 버튼 라벨만 교체.

### 12-2. "팝업으로 옮기지 못했어요"

일시적 실패 안내이므로 다이얼로그가 아니라 **토스트**(기존 `useToastStore`, `'error'` 타입)로 충분하다: `"팝업으로 옮기지 못했어요. 타이머는 계속 돌고 있어요."` — 이동/숨김이 취소되고 제자리에 머무는 것 자체가 이미 안전한 결과이므로, 추가 확인을 요구하는 모달을 띄우지 않는다(handoff.md 11번 "타이머를 잃지 않는 것이 먼저다"와 일치 — 잃지 않았다는 사실을 안심시키는 톤).

---

## 13. 스톱워치

- 탭 아이콘만 신설(`av_timer`, 7-1절), 교실 화면 모드 지원(9장 표) 추가. **그 외 신규 기능 없음**(spec 1-2 — 새 기능은 넣지 않는다).
- 숫자 표시는 1장 계산식을 그대로 쓰되, 스톱워치는 경고/임박 개념이 없으므로 항상 `var(--sp-timer-ring-normal)` 상당의 색(다만 스톱워치는 원/부채꼴 진행 표시 자체가 없다 — 숫자만 존재하는 지금 구조 유지, 크기만 1장 식으로 키움).
- 랩 테이블 등 기존 기능은 그대로 두되, 랩 시간 `+MM:SS` 열의 `text-sp-accent`(현재 필 배경이 아니라 텍스트라 규칙 위반 아님) 색상은 유지.

---

## 14. 구현 체크리스트 (파일 단위 요약)

| 파일                                                                               | 변경                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                                                                       | JetBrains Mono 링크 2곳에 `;700` 추가                                                                                       |
| `mobile.html`                                                                      | JetBrains Mono `wght@700` 링크 신설                                                                                         |
| `tailwind.config.js`                                                               | `spPausedBlink` keyframe + `sp-paused-blink` animation 추가                                                                 |
| `src/index.css`                                                                    | (선택) `--sp-timer-ring-normal` 초기값을 `:root`에 `var(--sp-accent)`로 기본 선언해 두면 `useThemeApplier` 반영 전에도 안전 |
| `src/adapters/hooks/useThemeApplier.ts`                                            | `needsTimerRingOverride()` 계산 + `--sp-timer-ring-normal` 세팅                                                             |
| `src/domain/entities/DashboardTheme.ts` 또는 신규 `src/domain/rules/timerColor.ts` | hue/saturation 판정 순수 함수(단위 시험 대상)                                                                               |
| `src/adapters/components/Tools/Timer/useTimerStageSize.ts` (신규)                  | 1장 계산 훅                                                                                                                 |
| `src/adapters/components/Tools/Timer/CircleProgress.tsx`                           | `sp-*` 토큰화, 부채꼴 모드 추가, 크기 훅 연동                                                                               |
| `src/adapters/components/Tools/Timer/TimerEndOverlay.tsx` (신규)                   | 통합 종료 화면                                                                                                              |
| `src/adapters/components/Tools/Timer/ClassroomModeOverlay.tsx` (신규)              | 9장                                                                                                                         |
| `src/adapters/components/Tools/Timer/LeaveGuardDialog.tsx` (신규)                  | 12장                                                                                                                        |
| `src/adapters/components/Tools/Timer/CustomTimeModal.tsx`                          | `createPortal(document.body)`로 이동, Enter/Esc/자동 포커스, 범위 5초~99:59                                                 |
| `scripts/regression-grep-check.mjs`                                                | REGRESSION #82 대상 파일 목록에 `TimerEndOverlay.tsx` 추가                                                                  |

---

## 15. 디자인 우려 (spec을 그대로 따르되 남겨두는 메모)

1. **부채꼴 숫자 위치를 "아래"로 확정한 것은 이 문서의 선택이다.** spec 2-7은 "가운데 카드색 원" 또는 "부채꼴 밖" 둘 다 허용했다. 구현 중 실측(특히 최소 지름 200px 근처)에서 "숫자 아래 배치 + 부채꼴"이 세로로 너무 길어 보이면, `MIN_DIAMETER` 구간에 한해 가운데 hub 배치로 전환하는 것도 고려할 수 있다 — 지금은 은유의 일관성을 택했다.
2. **`sp-timer-ring-normal`의 hue 임계값(35°)·채도 임계값(12%)은 13개 현재 프리셋에서 정확히 spec의 예시와 일치하도록 역산한 값이다.** 커스텀 테마(사용자가 accent를 직접 고르는 경우)에서 경계값 근처 색을 고르면 오탐/누락이 생길 수 있다 — 완벽한 해가 아니라 "명시된 6개 테마를 정확히 잡아내는 가장 단순한 규칙"이다.
3. **교실 화면의 `MAX_DIAMETER` 상한을 640px(일반)과 960px(교실 화면)로 다르게 둔 것**은 spec에 없는 이 문서의 보완이다 — spec 2-1이 "최대는 영역의 짧은 변"이라고만 정해 상한을 두지 않았지만, 4K/8K 디스플레이에서 상한 없이 그대로 두면 숫자가 화면 절반을 넘는 등 통제 불능이 될 수 있어 문서 차원에서 안전판을 추가했다. 실기기 확인에서 너무 작다는 피드백이 나오면 이 숫자만 올리면 된다.
4. **활동 이름이 "팝업으로 옮길 때 함께 간다"(3-4)와 6-3의 `timer-countdown` 스냅샷("활동 이름, 끝난 시각")이 같은 값을 가리킨다.** 이 문서는 UI만 다루므로 상태 동기화 자체는 구현 단계(T2/T4)의 책임이지만, 활동 이름 입력창이 "대기 상태에서만 편집 가능"인지 "진행 중에도 편집 가능"인지 spec에 명시가 없다 — 이 문서는 **진행 중에도 편집 가능**(교사가 늦게 이름을 붙이는 경우가 흔함)으로 가정해 입력창을 `disabled` 처리하지 않았다. 다르게 결정되면 5-4절 마크업에 `disabled={state === 'running'}` 한 줄만 추가하면 된다.
