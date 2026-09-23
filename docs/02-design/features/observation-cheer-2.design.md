---
template: design
version: 1.0
feature: observation-cheer-2
date: 2026-09-23
author: pblsketch
project: ssampin
plan: ../../../.dryforge/spec.md
---

# 관찰 기록 응원(잔디) 2·3차 — UI 설계서

> **요약**: `.dryforge/spec.md`(관찰 기록 응원 2·3차 — 결정은 [ADR-134](../../03-decisions/ADR-134.md)·[ADR-135](../../03-decisions/ADR-135.md))를 만족시키는 화면·컴포넌트·문구 설계. 계산 로직(오늘 챙길 학생 고르기, 등교일, 정규 수업 종료일, 반 흐름 칸, 한 주 정리·학기 돌아보기 조각 데이터, 관심 학생 문턱)은 스펙 §0~§11이 이미 확정했으므로 이 문서는 다시 정의하지 않는다. 이 문서는 **화면·컴포넌트·문구·접근성**만 다룬다.
>
> **비주얼 방향**: 1차 설계([observation-cheer.design.md](./observation-cheer.design.md))의 언어를 그대로 잇는다 — 새 팔레트·새 폰트 없음, 기존 `sp-*` 토큰, Noto Sans KR/Pretendard, `rounded-xl` 카드, `bg-sp-accent`만 채운 배경으로 쓰는 규칙, 경고색·학생별 건수 금지(ADR-134). 2·3차는 1차 카드 위에 얹는 확장이지 새 화면 계열이 아니다.
> **Status**: Draft

---

## 0. 전제 — 1차 위에 새로 생기는 상태

1차의 `showCheer` 게이트(§0, `hasAnyRoster && cheerEnabled`)는 그대로 모든 화면의 최상위 조건이다. 2·3차가 새로 더하는 로컬(이 컴퓨터 전용) 상태는 세 가지뿐이다.

| 상태                                                                                                     | 관할                    | 영향 범위                                                                              |
| -------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| **오늘은 쉴게요** (`restToday: { date }`)                                                                | localStorage, 이 컴퓨터 | 핀 줄 텍스트, 오늘 챙길 학생·종, 먼저 거는 말 전부 — 1차 응원 토스트까지 포함(스펙 §0) |
| **오늘 챙길 학생 명단** (`todayFocus: { date, homeroom[], subjects[] }`)                                 | localStorage, 이 컴퓨터 | 압축 카드 칩 줄 + 반 카드 종                                                           |
| **먼저 거는 말 상태** (`proactiveNotice: { spokenDate, weeklyNotifiedWeek, termNotifiedTerm, pending }`) | localStorage, 이 컴퓨터 | 핀 줄 문구·토스트·모달 자동 열림                                                       |

세 값 모두 1차의 응원 표시(`observationCheerSignal.ts`)와 같은 규칙을 쓴다 — 읽기 실패·손상 시 기본값(쉬지 않음/명단 없음/알릴 것 없음)으로 조용히 무시하고, 화면·저장은 멈추지 않는다. 새 동기화 파일은 없다(스펙 §10).

이 문서에서 제안하는 훅 이름(`useRestToday`, `useTodayFocusStudents`, `useProactiveNotice` 등)은 1차의 `use동사+명사` 명명을 따르는 **제안**이며, 실제 계산·저장 위치는 스펙이 정본이다.

---

## 1. 핀 줄 확장 — 쉬기 · 다시 켜기 · 먼저 거는 말

1차 `CheerPinLine.tsx`는 핀 아이콘 + 한 줄 텍스트뿐이었다. 2차부터 오른쪽에 작은 보조 단추 하나가 더 붙고, 텍스트 자리는 세 가지 상태 중 하나를 보여준다. **아이콘과 텍스트 자리는 그대로, 단추만 오른쪽에 추가한다** — 최소 카드 크기에서도 한 줄을 지키는 1차 제약을 그대로 물려받는다.

### 1.1 텍스트 우선순위 (같은 자리, 셋 중 하나)

| 우선순위 | 조건                                        | 텍스트                                                      | 클릭                         |
| -------- | ------------------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| 1        | 오늘 쉬는 중                                | `오늘은 쉬어요`                                             | 없음(텍스트는 안내일 뿐)     |
| 2        | 안 쉼 + 오늘 아직 안 연 먼저 거는 말이 있음 | `이번 주 정리가 왔어요` 또는 `이번 학기 돌아보기가 왔어요`  | 있음 — 그 모달을 연다(§7·§8) |
| 3        | 그 외                                       | 1차 그대로: 오늘 응원 있으면 응원 문구, 없으면 연속 주 문구 | 없음                         |

우선순위 1이 2를 가린다 — 스펙 §1-4 "쉬는 날에는 '보여 주지 않은 것'으로 친다"를 그대로 반영한 것이다. 쉬기를 풀면(다시 켜기) 그날 아직 못 연 먼저 거는 말이 다음에 다시 나타날 수 있다(스펙 §11).

### 1.2 오른쪽 보조 단추

| 상태       | 라벨                                                             | 스타일                                                                                                                             |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 안 쉬는 중 | `쉴게요` (`aria-label="오늘은 쉴게요"`, `title="오늘은 쉴게요"`) | `shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text` |
| 쉬는 중    | `다시 켜기`                                                      | `shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-sp-accent transition-colors hover:bg-sp-surface`                   |

라벨을 짧게 줄인 이유 — 320px 안팎의 위젯 카드에서 `flex-1 truncate` 텍스트와 공존해야 한다. 전체 문구는 `aria-label`·`title`에만 담는다.

### 1.3 조립

```tsx
export function CheerPinLine(): JSX.Element {
  const { text, pinState, clickable, onClick } = useCheerLineState(); // 우선순위 1~3 계산
  const { resting, toggle } = useRestToday();

  return (
    <div className="mb-2 flex shrink-0 items-center gap-2" aria-live="polite">
      <CheerPin state={resting ? 'idle' : pinState} size={24} />
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate text-left text-xs text-sp-accent hover:underline"
        >
          {text}
        </button>
      ) : (
        <p className="min-w-0 flex-1 truncate text-xs text-sp-muted">{text}</p>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={resting ? '오늘 쉬기를 풀고 다시 켜기' : '오늘은 쉴게요'}
        title={resting ? '다시 켜기' : '오늘은 쉴게요'}
        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-sp-surface ${
          resting ? 'text-sp-accent' : 'text-sp-muted hover:text-sp-text'
        }`}
      >
        {resting ? '다시 켜기' : '쉴게요'}
      </button>
    </div>
  );
}
```

- 먼저 거는 말이 있을 때만 텍스트가 `<button>`(`text-sp-accent`)이 된다. 그 외엔 지금처럼 `<p>`. 스크린리더는 `aria-live="polite"`로 문구 전환을 그대로 읽는다.
- **위젯 창에서 눌렀을 때**: `toggle()`은 로컬 저장을 즉시 갱신하고, 텍스트 클릭(`onClick`)은 메인 창이 없으면(위젯 단독) `requestStudentRecordNavigation(...)`으로 메인 창을 띄워 그 자리에서 모달을 연다(§7 참고) — 반 카드 칸 클릭이 이미 쓰는 창 넘기기 패턴(`studentRecordNavigation.ts`) 그대로.
- 쉬기는 창 하나에서 눌러도 모든 창에 즉시 반영돼야 한다(스펙 §1-2) — 1차 `useTodayCheer`가 `storage` 이벤트로 다른 창 상태를 따라가는 것과 같은 방식(`CustomEvent` + `storage` 리스너)을 `useRestToday`에도 적용한다.

### 1.4 주 줄 — 작은 카드 안의 잔디 (v1.3, ADR-137 결정 16)

핀 줄 바로 아래 얇은 한 줄. 오너가 시안 셋 가운데 고른 모양이다(요일 5줄 작은 잔디판은 카드가 48px 커지고, 핀 줄 안 점 5개는 좁은 카드에서 응원 글이 잘려서 뺐다).

```
[핀] 18주째 꾸준히                    쉴게요
                  ■ ■ ■ ▫ ■ ┆┆ ■ ■ ▫          ← 한 칸 = 한 주, 오른쪽 끝이 이번 주
학생 빠른 기록                      기록 남기기
```

| 칸                    | 모양                                            | 뜻                                                 |
| --------------------- | ----------------------------------------------- | -------------------------------------------------- |
| 진하기 1~3            | `bg-sp-accent` + `opacity-30`/`opacity-70`/없음 | 기록한 날 ÷ 등교일: 절반 미만 / 80% 미만 / 그 이상 |
| 0                     | `border border-sp-border`                       | 기록 없는 보통 주                                  |
| 쉬는 주               | `border border-dashed border-sp-border`         | 기록 없는 쉬는 주 — 비었다가 아니라 쉬었다         |
| 이번 주, 아직 기록 전 | `border border-sp-border opacity-40`            | 판단하지 않는다                                    |

- 줄: `-mt-1 mb-2 flex h-2 shrink-0 justify-end gap-0.5 overflow-hidden`, 칸 `h-2 w-2 shrink-0 rounded-sm`. 좁으면 오래된 주부터 왼쪽으로 잘린다(160px 카드에 약 12주).
- 단추가 아니다. 누르면 `WidgetCard`의 카드 빈 곳 누르기와 같아 확장 창 [잔디] 탭(기본 탭)이 열린다.
- 접근성: 줄 하나에 `role="img"`, 이름 "이번 학기 주마다 기록한 날 — N주 가운데 K주 기록". 칸마다 마우스용 `title`("9월 14일 주 · 4일 기록", "이번 주 · 아직 기록 전", "… · 쉬는 주").
- 이번 학기 기록이 하나도 없으면 줄이 없다. 쉬는 날에도 보인다. '응원·잔디 표시'를 끄면 사라진다.

---

## 2. 오늘 챙길 학생 칩 줄

**자리**: 압축 카드(`DashboardStudentRecordsCompact`)의 `<CheerPinLine />` 바로 다음 줄. 헤더(`👩‍🏫 학생 빠른 기록`)보다 위다. 명단이 비면 이 줄 자체를 그리지 않는다(스펙 §2).

```tsx
{
  cheerAvailable && <TodayFocusChipRow />;
}
```

기존 "오늘 만나는 학생"(현재/다음 수업 칩, `StudentChip`)과는 **다른 줄, 다른 목적**이다 — 그쪽은 그 시간표의 전원을 보여주고, 이 줄은 알림과 같은 기준으로 하루 동안 고정된 소수만 보여준다. 서로 헷갈리지 않게 라벨을 반드시 붙인다.

### 2.1 레이아웃

```
오늘 챙길 학생  [5]  [1반·15]  [2반·3 ✓]
```

```tsx
function TodayFocusChipRow(): JSX.Element | null {
  const chips = useTodayFocusStudents(); // TodayFocusChipViewModel[]
  if (chips.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-medium text-sp-muted">오늘 챙길 학생</span>
      {chips.map((c) => (
        <TodayFocusChip key={c.key} chip={c} />
      ))}
    </div>
  );
}
```

`TodayFocusChipViewModel`(화면이 필요로 하는 모양 — 고르기 알고리즘은 스펙 §2가 정본):

```ts
interface TodayFocusChipViewModel {
  readonly key: string; // `${contextKind}:${contextId}:${studentRef}`
  readonly contextKind: 'homeroom' | 'teaching';
  readonly contextId: string;
  readonly studentRef: string;
  readonly label: string; // '5' 또는 '1반-15'(1차 LapCellViewModel.label과 같은 규칙)
  readonly classShort: string | null; // 수업반이면 그 반 이름(예: '1반'), 담임이면 null
  readonly displayName: string; // ''면 표시 안 함(1-3 이름 표시 설정 적용됨)
  readonly done: boolean; // 오늘 이미 그 카드에 기록이 생겼음
}
```

### 2.2 칩 한 개

```tsx
function TodayFocusChip({ chip }: { chip: TodayFocusChipViewModel }): JSX.Element {
  const text = chip.classShort ? `${chip.classShort}·${chip.label}` : chip.label;
  return (
    <button
      type="button"
      onClick={() =>
        openQuickRecordDirect({
          contextKind: chip.contextKind,
          contextId: chip.contextId,
          studentRef: chip.studentRef,
        })
      }
      aria-label={focusChipAriaLabel(chip)}
      className={`group relative rounded-full px-2 py-0.5 text-caption transition-colors ${
        chip.done
          ? 'bg-sp-surface text-sp-muted'
          : 'bg-sp-surface text-sp-text hover:bg-sp-accent/0 hover:border-sp-accent border border-transparent'
      }`}
    >
      {text}
      {chip.done && (
        <span aria-hidden className="ml-1 text-sp-accent">
          ✓
        </span>
      )}
      {chip.displayName.length > 0 && (
        <span
          role="tooltip"
          data-sp-floating
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-sp-border bg-sp-card px-2 py-0.5 text-caption text-sp-text opacity-0 shadow-sp-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          {chip.displayName}
        </span>
      )}
    </button>
  );
}

function focusChipAriaLabel(c: TodayFocusChipViewModel): string {
  const who = c.displayName.length > 0 ? `${c.label}번 ${c.displayName}` : `${c.label}번 학생`;
  const where = c.classShort ? `${c.classShort} ` : '';
  return c.done
    ? `${where}${who}, 오늘 챙길 학생 · 오늘 기록 완료`
    : `${where}${who}, 오늘 챙길 학생`;
}
```

- **완료 표시는 텍스트 `✓`(accent 글자색)뿐**이다 — 채운 배경을 새로 쓰지 않는다(하드 제약: 채운 배경은 `sp-accent` 한 자리뿐이고 그 칸은 반 카드 칸이 이미 쓴다). `hover:border-sp-accent`는 위 스니펫에서 `bg-sp-accent/0`처럼 sp 토큰에 투명도 수정자를 붙이는 실수를 피하려고 **아예 배경 hover를 넣지 않는 편이 안전**하다 — 최종 클래스는 `hover:border-sp-accent border border-transparent`만 쓰고 `bg-sp-accent/0` 부분은 제거한다(구현 시 삭제 표시).
- 클릭은 1차 칸 클릭과 완전히 동일한 함수(`openQuickRecordDirect`)를 그대로 재사용한다 — ADR-122 결정 2의 두 번째 예외(스펙 §2)가 정확히 이 지점이다.
- 이름표(툴팁)는 1차 `ClassLapCard`의 패턴을 그대로 복붙한다(마우스·키보드 동일 처리, `표시 안 함`이면 span 자체를 렌더하지 않음).

### 2.3 종(🔔) 조건 변경 — 시각은 그대로

1차 `ClassLapCard`의 종 아이콘(`text-sp-highlight`, 우하단 겹침 배지)은 코드·스타일 변경이 없다. **바뀌는 것은 그 배지를 붙이는 조건**뿐이다 — "오늘 챙길 학생이면서 이번 바퀴 빈칸인 칸"으로 좁아진다(스펙 §2). 이 조건 계산은 `LapCellViewModel.bell` 값을 만드는 뷰모델 훅의 몫이며, `ClassLapCard.tsx`·`ObservationCellMenu.tsx`는 손대지 않는다.

---

## 3. 관찰 질문 한 줄 · 담임 장면 칩

둘 다 `QuickAddStudentRecordForm.tsx`의 **3단계(본문 쓰기, `compose`)** 안에서 일어난다. 기존 순서(안내 블록 → 날짜 → 본문 textarea → 말로 쓰기/글자 수 → 간단 분류 칩 → 최근 기록 → 저장 버튼)에 두 자리를 끼워 넣는다.

```
[안내: OO 학생 · 1반 담임 누가기록]
┌ 오늘 질문 한 줄 (§3.2, 조건부) ─────────────────┐   ← 새로 추가, textarea 바로 위
│ 💬 가람이가 막혔다가 다시 해 본 순간이 있었나요?  │
└──────────────────────────────────────────────┘
[날짜]
[본문 textarea]
[말로 쓰기 · 글자 수]
[간단 분류 칩 — 기존 그대로: 담임=상담/생활/기타, 교과=장면(TEACHING_SLOTS)]
┌ 오늘 순간 (§3.1, 담임 전용, 새로 추가) ─────────┐
│ 학습 태도  인성·관계  학급 역할  변화  아쉬운 점  진로 │
└──────────────────────────────────────────────┘
[최근 기록]
[저장 버튼]
```

### 3.1 담임 장면 칩

- **조건**: `activeContext.kind === 'homeroom'`일 때만(한 명·여러 명 모두). 교과 맥락은 이미 기존 "간단 분류" 칩이 곧 장면 칩이라 손대지 않는다.
- **목록**: `allSlotsForContext('homeroom', settings.homeroomRecordSlots)` — 도메인에 이미 있는 함수를 그대로 쓴다(`src/domain/rules/observationSlots.ts`). 새 계산이 필요 없다.
- **선택**: 단일 선택, 안 골라도 저장된다. 기존 "간단 분류" 칩과 **완전히 별도의 state**(`sceneSlot`)로 관리한다 — 담임 맥락에서 `classification`은 이미 상담/생활/기타(갈래) 용도로 쓰이고 있어 슬롯과 섞으면 안 된다(observationSlots.ts 머리 주석의 "category 를 tags 에 혼입 금지"와 같은 이유로 category/slot도 분리한다).
- **스타일**: 기존 분류 칩과 완전히 같은 pill(`rounded-full px-2.5 py-1 text-xs`, 선택 시 `bg-sp-accent text-white`, 아니면 `bg-sp-surface text-sp-muted hover:text-sp-text`).
- **켜고 끄기 무관**: 응원·잔디 스위치가 꺼져 있어도 이 칩 줄은 그대로 있다(스펙 §1-1 — "기록 입력의 일부이기 때문"). `showCheer` 게이트를 이 블록에 걸지 않는다.
- **라벨**: "이 순간 · 고르지 않아도 저장됩니다" (기존 "간단 분류 · 고르지 않아도 저장됩니다"와 톤 통일, 다른 축임을 구분하려고 "이 순간"으로 표기).

```tsx
{
  activeContext?.kind === 'homeroom' && (
    <div>
      <p className="mb-1.5 text-xs text-sp-muted">이 순간 · 고르지 않아도 저장됩니다</p>
      <div className="flex flex-wrap gap-1.5">
        {allSlotsForContext('homeroom', customHomeroomSlots).map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => setSceneSlot(sceneSlot === slot ? '' : slot)}
            aria-pressed={sceneSlot === slot}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              sceneSlot === slot
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {slot}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- **구현 메모(데이터 계층, UI 범위 밖이지만 반드시 같이 바뀌어야 함)**: `useStudentRecordsStore.addRecordWithTags`의 `AddRecordWithTagsParams`에는 현재 `slots` 필드가 없다(`category`·`tags`만 있음). 이 칩이 실제로 저장되려면 그 인터페이스와 저장 함수에 `slots?: readonly string[]`을 더하고, `QuickAddStudentRecordForm`의 담임 저장 호출에 `slots: sceneSlot === '' ? [] : [sceneSlot]`을 넘겨야 한다. 화면 설계는 이 값이 `StudentRecord.slots`(이미 있는 칸)에 들어간다는 것만 전제한다.

### 3.2 질문 한 줄

- **조건**(모두 만족): `showCheer` 켜짐 · `step === 'compose'` · `activeContext.members.length === 1`(담임·교과 모두). 여러 명 기록이면 렌더하지 않는다.
- **내용**: 그 학생이 그 카드(담임/그 수업반)에서 이번 학기 아직 안 채운 **기본 슬롯** 중 하나를 날짜+학생으로 정해 하나 고른다(따로 저장하는 값 없음 — 순수 함수 `pickQuestionSlot(date, studentKey, emptySlots)`). 다 채웠으면 줄 자체가 없다.
- **위치**: textarea `<label>` **바로 위**, 안내 블록 아래.
- **모양**: 클릭 가능한 한 줄 배너. 배경에 `sp-accent` 투명도 수정자를 쓰지 않는다(하드 제약) — 대신 점선 테두리 + 중립 배경으로 "말 걸기" 느낌만 낸다.

```tsx
{
  questionLine !== null && (
    <button
      type="button"
      onClick={() => setSlotForContext(questionLine.slot)} // 담임=sceneSlot, 교과=classification
      className="flex w-full items-start gap-2 rounded-lg border border-dashed border-sp-border bg-sp-surface px-3 py-2 text-left text-sm text-sp-text transition-colors hover:border-sp-accent"
    >
      <span aria-hidden className="mt-0.5 text-sp-accent">
        💬
      </span>
      <span>{questionLine.text}</span>
    </button>
  );
}
```

- 클릭하면 그 학생 맥락에 맞는 슬롯 선택 상태를 그 슬롯으로 세팅한다 — 담임이면 §3.1의 `sceneSlot`, 교과면 기존 `classification`(교과는 이미 그 값이 슬롯이다). 커서는 그대로 textarea에 남아 있어도 된다(포커스 이동 불필요, 칩만 시각적으로 눌린 상태가 된다).
- **문구 예시·전체 표는 §13.**

---

## 4. 칸 메뉴 — [관심 학생으로] / [관심 학생 풀기]

`ObservationCellMenu.tsx`(1차, `WidgetContextMenu.tsx` 패턴의 포털 메뉴)에 새 항목을 더한다. 자리·트리거·포털·Esc 처리는 1차 그대로 — 메뉴 **내용**만 늘어난다.

```
일반 칸, 관심 아님:        일반 칸, 이미 관심:         빠진 칸('–'):
┌ 관심 학생으로 ┐          ┌ 관심 학생 풀기 ┐          ┌ 다시 넣기 ┐
│ ──────────── │          │ ──────────── │          └───────────┘
│ 당분간 빼기 ▸ │          │ 당분간 빼기 ▸ │
│  2주          │          │  2주          │
│  한 달        │          │  한 달        │
│  학기 끝까지  │          │  학기 끝까지  │
└──────────────┘          └──────────────┘
```

- **빠진 칸**은 지금처럼 `[다시 넣기]` 하나뿐이다(스펙 §4 — 빠지는 동안 관심 효과 없음, 관심 토글 항목 자체를 안 보여준다). 코드 변경 없음.
- **일반 칸**(칠해짐/빈칸)에는 관심 토글 항목을 **맨 위**에, `당분간 빼기` 묶음과 구분선(`role="separator"`, `border-t border-sp-border`)으로 나눠 아래에 둔다 — 즉시 실행되는 단일 동작(토글)을 먼저, 하위 메뉴가 있는 묶음(기간 선택)을 나중에 두는 순서다.
- 라벨은 스펙 원문 그대로: `관심 학생으로` / `관심 학생 풀기`. 스타일은 기존 `itemClass`(`w-full rounded-md px-3 py-1.5 text-left text-xs text-sp-text hover:bg-sp-surface`)와 동일 — 새 색을 쓰지 않는다.
- **누르는 즉시 저장**하고 메뉴를 닫는다(기존 빼기와 같은 `save()` 패턴). 토스트 없이 조용히 반영 — 시각적 변화 자체가 피드백이라는 1차 원칙을 그대로 따른다. 다만 관심 학생 지정/해제는 칸 배경·테두리를 바꾸지 않으므로(스펙 §4 — 어디에도 관심 표시 안 함) 정말로 **아무 시각 변화가 없다**. 그래서 이 동작만은 짧은 토스트로 확인해주는 편이 안전하다: `useToastStore.getState().show('관심 학생으로 지정했어요', 'success')` / `'관심 학생 지정을 풀었어요'`(각 2500ms 정도, 버튼 없음). **1차와 다른 결정 — 이유를 남긴다**: 빼기·다시 넣기는 칸 모양이 바뀌어 눈에 보이지만, 관심 지정은 스펙상 시각 표시가 전혀 없어 무음 처리하면 선생님이 눌렸는지 확인할 방법이 없다.
- Props 추가: `ObservationCellMenu`에 `focused: boolean`, `onToggleFocus: () => void`(빠진 칸이면 이 두 값은 무시).

```tsx
{
  !excluded && (
    <>
      <button type="button" role="menuitem" className={itemClass} onClick={onToggleFocus}>
        {focused ? '관심 학생 풀기' : '관심 학생으로'}
      </button>
      <div role="separator" className="my-1 border-t border-sp-border" />
    </>
  );
}
```

- 키보드 방향키 순회는 `[role="menuitem"]`을 그대로 querySelector하므로 구분선(role 없음)은 자연히 건너뛴다 — 코드 변경 불필요.

---

## 5. 설정 화면

`RecordReminderSection.tsx`(§8 위치는 1차 문서 참고) 세 곳을 고친다.

### 5.1 '응원·잔디 표시' 도움말 — 문구 교체

1차 문구("학생별 기록 수나 순위는 보여 주지 않아요. 선생님이 쌓아 온 기록만 응원해요.")는 지금은 사라지는 항목이 훨씬 늘었으므로(스펙 §1-1) 아래로 교체한다.

> **끄면 핀 줄·오늘 챙길 학생·반 흐름·한 주 정리·학기 돌아보기가 모두 사라져요. 관심 학생 목록과 기록 알림 기준은 그대로 남아요.**

토글 자체(`checked={isObservationCheerEnabled(rr)}`)는 코드 변경 없음.

### 5.2 '관심 학생' 목록 — 새 섹션, '제외 학생' 옆에

지금 코드는 '관심 학생'을 마스터 스위치(`rr.enabled`)에 종속된 `<div className={rr.enabled ? '' : 'opacity-60 pointer-events-none'}>` **안**에 비활성 "추후 지원" 버튼으로 두고 있다(파일 508~523줄 부근). 이걸 통째로 지우고, **그 래퍼 밖**(1차 `<ExclusionListSection />` 바로 다음)에 새 컴포넌트 `FocusStudentListSection`을 놓는다.

**왜 래퍼 밖인가** — 스펙 §4 "응원·잔디를 끄면 칸 메뉴가 없으니 새로 지정할 수 없다. **설정에서 풀 수는 있고**, 효과는 알림에 남는다." 알림 마스터 스위치가 꺼져 있어도 관심 학생을 풀 수 있어야 하는 건 '제외 학생'과 완전히 같은 이유다 — 두 목록 모두 저장 위치·효과가 알림·오늘 챙길 학생 양쪽에 걸쳐 있어서, 알림을 꺼 둔 동안에도 목록 정리는 막지 않는다.

```tsx
<SettingsSection
  icon="park"
  iconColor="bg-sp-surface text-sp-accent"
  title="응원·잔디"
  description="기록이 쌓인 모습을 보여 주고, 핀이 응원해요."
>
  {/* ...기존 토글, 문구만 5.1로 교체... */}
</SettingsSection>

<ExclusionListSection />
<FocusStudentListSection />

<div className={rr.enabled ? '' : 'opacity-60 pointer-events-none'} aria-disabled={!rr.enabled}>
  {/* 알림 강도부터 시작하는 나머지 — '관심 학생(추후 지원)' 블록은 통째로 삭제 */}
```

`FocusStudentListSection.tsx`(신규, `ExclusionListSection.tsx`와 같은 자리 `src/adapters/components/Settings/`)는 그 파일의 구조를 그대로 미러링하되 더 단순하다 — 만료 날짜가 없다.

```tsx
<SettingsSection
  icon="person_search"
  iconColor="bg-sp-surface text-sp-muted"
  title="관심 학생"
  description="더 자주 챙길 학생이에요. 공백 문턱이 절반으로 줄어요."
>
  {rows.length === 0 ? (
    <p className="text-xs text-sp-muted">
      아직 지정한 학생이 없어요. 반 카드의 칸 메뉴에서 관심 학생으로 지정할 수 있어요.
    </p>
  ) : (
    <ul className="divide-y divide-sp-border">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-28 shrink-0 truncate text-sp-muted">
            {row.group.length > 0 ? row.group : '지금 명렬에 없는 반'}
          </span>
          <span className="w-12 shrink-0 text-sp-muted">
            {row.label.length > 0 ? `${row.label}번` : ''}
          </span>
          <span className="min-w-0 flex-1 truncate text-sp-text">
            {row.missing ? '명렬에서 찾지 못한 학생' : row.displayName}
          </span>
          <button
            type="button"
            onClick={() => putBack(row.key)}
            className="shrink-0 rounded-lg border border-sp-border px-2.5 py-1 text-xs text-sp-text transition-colors hover:border-sp-accent"
          >
            풀기
          </button>
        </li>
      ))}
    </ul>
  )}
</SettingsSection>
```

- 열: 반 · 번호 · 이름(이름 표시 설정 적용) · `[풀기]`. 만료일 열은 없다(관심 지정엔 기간이 없다).
- 명렬에서 사라진 학생도 "명렬에서 찾지 못한 학생"으로 보여주고 `[풀기]`로 지울 수 있다(스펙 §4) — `ExclusionListSection`의 `missing` 처리와 동일.
- **즉시 저장** — 화면 [저장]을 기다리지 않는다. `[풀기]`는 `useSettingsStore`의 `recordReminder.focusedStudentIds`에서 그 key를 즉시 제거하고, 설정 화면 [저장]은 그 사이 바뀐 값을 덮지 않는다(1차 `withLatestExclusions`와 같은 패턴을 `focusedStudentIds`에도 적용).
- **구현 메모**: 행 데이터 조립(`buildExclusionRows`에 대응하는 `buildFocusRows` 또는 그 함수의 제네릭화)은 이 문서 범위 밖이다. 두 목록의 key 형식이 완전히 같으므로(스펙 §4 "1차 빼기와 같다") 기존 유틸을 제네릭화해 재사용할 것을 권장한다.

### 5.3 '알림 강도' 안내 줄 — 오늘 챙길 학생 인원

새 설정 칸을 만들지 않는다(스펙 §9). 기존 3-프리셋 버튼 그리드 바로 아래, "알림 요일" 구분선 위에 안내 한 줄만 추가한다.

```tsx
<div className="grid grid-cols-3 gap-2">{/* 기존 프리셋 버튼 그대로 */}</div>
<p className="mt-2 text-center text-xs text-sp-muted">
  오늘 챙길 학생 담임 {focusCounts.homeroom}명 · 수업반 {focusCounts.subject}명
</p>
<div className="border-t border-sp-border/40 mt-4 pt-4 space-y-4">{/* 기존 요일·시각... */}</div>
```

`focusCounts`는 스펙 §2 표(가볍게 1/2, 보통 2/3, 꼼꼼히 3/5, 직접 설정 `perNudge`/`min(perNudge*2, 6)`)를 그대로 계산한 값이다 — 이미 있는 `rr.preset`·`rr.perNudge`로 순수 함수 하나면 된다.

---

## 6. 반 흐름

**자리**: 두 '통계' 화면 모두에서 **맨 위**(기간 필터·요약 카드보다 먼저)에 카드 하나로 둔다. 담임 업무 → 기록 → 통계(`ProgressMode.tsx`)와 수업 관리 → 수업 기록 → 통계(`ClassRecordStatsView.tsx`) 양쪽에서 **같은 컴포넌트**를 쓴다: `TermFlowSection.tsx`(신규, `src/adapters/components/Dashboard/ObservationCheer/`에 둔다 — 잔디·바퀴와 계산 기반을 공유하는 기능이라 그 폴더가 자연스러운 자리다. 두 화면에서 import해 쓰는 건 이미 `RecordDetailModal`이 하는 방식과 같다).

**왜 맨 위·기간 필터 무관인가** — 이 화면 아래 나머지 통계는 전부 기간 필터(전체/이번 학기/이번 달/직접 설정)를 따르는데, 반 흐름은 스펙 §5 "통계 화면의 기간 선택과 상관없이 늘 이번 학기"다. 같은 줄에 섞으면 "필터를 바꿨는데 왜 반 흐름만 안 바뀌지"라는 오해가 생긴다. 맨 위에 별도 카드로 떼어 놓고 헤더에 고정 배지를 붙인다.

### 6.1 레이아웃

```
┌ 반 흐름                                          이번 학기 기준 ┐
│        [스크롤 영역, max-h-[420px] overflow-y-auto]           │
│  1  ▢ ▢ ■ ▢ ▤ ■ ■ ▢ ▢ ...  (열 = 이번 학기 주, 월요일 시작)  │
│  2  ■ ▢ ▢ ■ ▤ ▢ ■ ▢ ▢ ...                                    │
│  3  ...                                                        │
│  ⋮                                                              │
│  ■ 기록 있음   ▢ 기록 없음   ▤ 쉬는 주 · 아직 (옅게)          │
└──────────────────────────────────────────────────────────────┘
```

```tsx
<section className="rounded-xl bg-sp-card p-4" aria-label="반 흐름">
  <div className="mb-2 flex items-center justify-between">
    <h3 className="text-sm font-bold text-sp-text">반 흐름</h3>
    <span className="text-caption text-sp-muted">이번 학기 기준</span>
  </div>
  <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-lg border border-sp-border">
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="sticky left-0 z-10 bg-sp-card px-2 py-1 text-xs text-sp-muted">
              {row.label}
            </td>
            {row.weeks.map((w) => (
              <td key={w.weekStart} className="px-0.5 py-0.5">
                <FlowCell week={w} studentLabel={row.label} displayName={row.displayName} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  <div className="mt-2 flex flex-wrap items-center gap-3 text-caption text-sp-muted">
    <span className="flex items-center gap-1">
      <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-sp-accent" /> 기록 있음
    </span>
    <span className="flex items-center gap-1">
      <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-sp-border" /> 기록
      없음
    </span>
    <span className="flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-sm border border-sp-border opacity-40"
      />{' '}
      쉬는 주 · 아직
    </span>
  </div>
</section>
```

- **왜 표 안 스크롤인가**: 30명 × 20주 안팎이면 화면 밖으로 넘친다. 페이지 전체를 늘리는 대신 카드 안에서만 스크롤(`max-h-[420px]`)해 "정보 우선" 원칙(design-system.md)을 지키면서도 다른 통계 카드를 밀어내지 않는다. 첫 열(번호·이름)은 `sticky left-0`로 가로 스크롤 중에도 보인다.
- **칸(`FlowCell`)**: 1차 `GrassCell`과 같은 원리 — 채워짐은 `bg-sp-accent`(불투명, 수정자 없음), 빈칸은 `border border-sp-border`, 쉬는 주·아직은 빈칸에 `opacity-40`만 더한다. **건수 없음, 클릭 없음.**

```tsx
function FlowCell({ week, studentLabel, displayName }: FlowCellProps): JSX.Element {
  const who =
    displayName.length > 0 ? `${studentLabel}번 ${displayName}` : `${studentLabel}번 학생`;
  const range = `${formatMD(week.start)}~${formatMD(week.end)}`;
  if (week.filled) {
    return (
      <span
        role="img"
        aria-label={`${who} · ${range} · 기록 있음`}
        className="block h-3.5 w-3.5 rounded-sm bg-sp-accent"
      />
    );
  }
  const faint = week.rest || week.future;
  return (
    <span
      role="img"
      aria-label={`${who} · ${range} · ${week.rest ? '쉬는 주' : week.future ? '아직' : '기록 없음'}`}
      className={`block h-3.5 w-3.5 rounded-sm border border-sp-border ${faint ? 'opacity-40' : ''}`}
    />
  );
}
```

- **행**: 그 카드의 재학 중 학생, 명렬표 번호순, 빠진 학생도 그대로 보인다(1차 §5 규칙 재사용) — `row.label`은 1차 `LapCellViewModel.label`과 같은 "번호"/"반-번호" 규칙.
- **마우스·초점**: `aria-label`이 번호·이름·주 범위·있음/없음을 전부 담으므로 별도 툴팁 span은 만들지 않는다(칸이 20×N개라 1차처럼 절대위치 툴팁을 칸마다 두면 DOM이 무거워진다 — `title` 없이 `aria-label`만으로 스크린리더·키보드 포커스 요구를 만족한다. 마우스 사용자를 위해 `title={who + ' · ' + range}`도 함께 붙여도 좋다).
- 담임/수업 두 화면 모두 `<TermFlowSection classId={...} kind="homeroom" | "teaching">` 형태로 호출한다.

---

## 7. 한 주 정리 · 학기 돌아보기 — 공용 틀

두 모달은 "조각 목록"이라는 같은 틀을 쓴다(스펙 §8). 먼저 이 틀부터 정의한다.

### 7.1 왜 반드시 `createPortal`인가

이 모달들은 [잔디] 탭(`ObservationCheerTab`) 안, 핀 줄, 토스트 세 군데에서 열릴 수 있다. [잔디] 탭은 확장 뷰(`ExpandedStudentRecords`) 안에 있고, 유리(반투명) 테마에서는 그 확장 뷰 자체가 `backdrop-filter`를 쓰는 카드다 — `backdrop-filter`는 하위 `position: fixed` 요소의 기준 상자를 자기 자신으로 가둔다(1차 `ObservationCellMenu`가 이미 겪은 문제와 같은 원인, 프로젝트 공통 함정 "사이드바 안 모달은 createPortal 필수"). 공용 `Modal`(`src/adapters/components/common/Modal.tsx`)은 스스로 포털을 하지 않으므로, [잔디] 탭 안에서 그냥 `<Modal>`을 렌더하면 유리 테마에서 화면 전체가 아니라 확장 뷰 박스 안에 갇혀 보인다.

**해법**: `Modal`을 그대로 쓰되, 호출부에서 `createPortal`로 `document.body`에 직접 붙인다.

```tsx
import { createPortal } from 'react-dom';
import { Modal } from '@adapters/components/common/Modal';

export function RecapModalFrame({
  isOpen,
  onClose,
  title,
  size,
  pieces,
  emptyMessage,
  footer,
}: RecapModalFrameProps) {
  if (!isOpen) return null;
  return createPortal(
    <Modal isOpen onClose={onClose} title={title} size={size}>
      <div className="flex min-h-0 flex-col">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 pb-4 pt-1">
          {pieces.length === 0 ? (
            <p className="py-8 text-center text-sm text-sp-muted">{emptyMessage}</p>
          ) : (
            pieces
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((p) => (
                <section key={p.id} aria-label={p.title ?? undefined}>
                  {p.title !== null && (
                    <h3 className="mb-2 text-sm font-sp-semibold text-sp-text">{p.title}</h3>
                  )}
                  {p.render()}
                </section>
              ))
          )}
        </div>
        {footer}
      </div>
    </Modal>,
    document.body,
  );
}
```

React 포털은 DOM 위치만 옮기고 이벤트 버블링·컨텍스트는 React 트리를 그대로 따르므로, `Modal`의 `FocusTrap`·Esc 처리·backdrop 클릭 로직은 손대지 않아도 그대로 동작한다.

### 7.2 조각(`RecapPiece`) 계약

```ts
interface RecapPiece {
  readonly id: string; // 'observation' | 'termGrass' | 'scene' | 'draftReady' | ...
  readonly order: number;
  /** null이면 제목 없이 본문만(예: 관찰 조각은 자체 헤더가 없다) */
  readonly title: string | null;
  readonly render: () => ReactNode;
}
```

- 관찰 조각(§7.3)이 한 주 정리의 첫(그리고 지금은 유일한) 조각이다. 다른 작업(진도·상담·할 일·학교 달력 순간)은 이 배열에 조각을 **더하기만** 하면 된다 — `RecapModalFrame`·`Modal` 자체는 손대지 않는다.
- 조각이 하나도 없으면(스펙 §8) 알리지도, 열었을 때 비워 보이지도 않고 `emptyMessage` 한 줄만 보여준다. 한 주 정리는 `"이번 주는 조용했어요"`, 학기 돌아보기는 사실상 학기 잔디 조각이 항상 있어 이 경로를 안 타지만 방어적으로 `"아직 보여줄 내용이 없어요"`를 기본값으로 둔다.
- **크기**: 한 주 정리는 `size="md"`(560px, 조각이 짧다), 학기 돌아보기는 `size="xl"`(960px, 반 카드가 여러 장 쌓인다).

### 7.3 열기 진입점 3곳 + 위젯 창

| 진입점                                                              | 동작                                                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 핀 줄 텍스트 클릭(§1)                                               | 메인 창이면 그 자리에서 모달 오픈. 위젯 창이면 `requestStudentRecordNavigation(weeklyRecapTarget())`(또는 `termRecapTarget('current')`)로 메인 창을 띄운다 |
| 토스트 클릭(§11)                                                    | 메인 창에서만 발생 — 그대로 오픈                                                                                                                           |
| `[잔디]` 탭의 `[이번 주 정리]`/`[이번 학기 돌아보기]` 단추(§9 하단) | 메인 창·위젯 창 모두에서 확장 뷰 안에 있으므로 항상 메인 창 컨텍스트 — 그대로 오픈                                                                         |

새 이동 문자열 두 개를 `studentRecordNavigation.ts`에 더한다(기존 `quickRecordDirectTarget` 패턴과 동일한 자리):

```ts
export function weeklyRecapTarget(): string {
  return 'dashboard#weekly-recap';
}
export function termRecapTarget(term: 'current' | 'previous'): string {
  return `dashboard#term-recap:${term}`;
}
```

도착한 창은 `applyStudentRecordIntent`에 `kind: 'weekly-recap'` / `kind: 'term-recap', term`을 추가해 작은 zustand 스토어(`useRecapModalStore` — `open: 'weekly' | 'term' | null`, `termChoice`)를 세팅한다. 두 모달은 메인 창 루트(`App.tsx`의 메인 `<QuickAddModal />` 근처, 위젯 전용 루트가 아닌 쪽)에 나란히 마운트한다 — 위젯 창에는 절대 마운트하지 않는다(스펙 "바탕화면 위젯 창에는 토스트가 없고 핀 줄만 바뀐다"와 같은 이유로, 큰 모달도 위젯에는 자리가 없다).

---

## 8. 한 주 정리 모달

`RecapModalFrame`에 관찰 조각 하나만 꽂은 얇은 래퍼다.

```tsx
<RecapModalFrame
  isOpen={open === 'weekly'}
  onClose={close}
  title="한 주 정리"
  size="md"
  pieces={[buildObservationPiece(weekData)]}
  emptyMessage="이번 주는 조용했어요"
  footer={
    <div className="flex justify-end border-t border-sp-border px-6 py-3">
      <button
        type="button"
        onClick={close}
        className="rounded-lg bg-sp-surface px-3 py-1.5 text-sm text-sp-text hover:bg-sp-surface/70"
      >
        닫기
      </button>
    </div>
  }
/>
```

### 8.1 관찰 조각(`buildObservationPiece`) — 월~금 5칸 + 인원 문구

```
월  화  수  목  금
▢   ■   ▤   ■   ○      이번 주 만난 학생 7명
```

- 5칸, 요일 라벨(`text-[10px] text-sp-muted`) 위 또는 옆에 작게. 칸 크기는 1차 잔디 칸보다 조금 크게(20×20px, `rounded-sm`) — 5칸뿐이라 여유가 있다.
- 상태 3가지, 색은 전부 기존 토큰 재사용(새 색 없음):
  | 상태 | 클래스 |
  | --- | --- |
  | 기록 있음(오늘·미래·쉬는 날 포함, "기록이 이긴다") | `bg-sp-accent` |
  | 오늘 이후(아직) | `border border-sp-border opacity-40` |
  | 쉬는 날(공휴일·방학) | `border border-sp-border opacity-40`(아직과 시각적으로 같다 — `aria-label`로만 구분. 경고색·별도 색을 새로 만들지 않기 위한 결정) |
  | 그 밖 기록 없음 | `border border-sp-border` |
- **"이번 주 만난 학생 N명"**: 그리드 오른쪽 또는 아래에 `text-sm font-medium text-sp-text`. 0명이면 이 조각 자체가 안 보여야 하므로(스펙 §6 "0건이면 없음") `buildObservationPiece`가 0명일 때 `null`을 돌려주고, 호출부가 `pieces.filter(Boolean)`으로 걸러 `RecapModalFrame`에는 빈 배열이 들어가 `emptyMessage`가 뜬다.
- title은 `null`(조각 자체에 헤더 문구가 없다 — "이번 주 정리"라는 모달 제목이 이미 그 역할을 한다).

```tsx
function ObservationWeekRow({
  days,
  metCount,
}: {
  days: readonly WeekDayCell[];
  metCount: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-sp-muted">{d.weekdayLabel}</span>
            <span
              role="img"
              aria-label={`${formatMD(d.date)} · ${d.stateLabel}`}
              className={`h-5 w-5 rounded-sm ${
                d.filled
                  ? 'bg-sp-accent'
                  : 'border border-sp-border' + (d.faint ? ' opacity-40' : '')
              }`}
            />
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-sp-text">이번 주 만난 학생 {metCount}명</p>
    </div>
  );
}
```

### 8.2 `[잔디]` 탭의 `[이번 주 정리]` 단추

`ObservationCheerTab.tsx` 맨 위, `MyGrassSection` 위에 작은 버튼 줄을 추가한다(§9.4에서 학기 돌아보기 버튼과 함께 배치).

---

## 9. 학기 돌아보기 모달

### 9.1 학기 선택기

모달 헤더 영역, `RecapModalFrame`의 `pieces` 위에 별도로 얹는 고정 컨트롤(조각 목록에 넣지 않는다 — 조각을 바꾸는 스위치이지 조각 자체가 아니다).

```tsx
<div className="mb-3 flex gap-2 px-6 pt-2">
  {(['current', 'previous'] as const).map((t) => (
    <button
      key={t}
      type="button"
      onClick={() => setTermChoice(t)}
      aria-pressed={termChoice === t}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        termChoice === t
          ? 'bg-sp-accent text-white'
          : 'bg-sp-surface text-sp-muted hover:text-sp-text'
      }`}
    >
      {t === 'current' ? '이번 학기' : '지난 학기'}
    </button>
  ))}
</div>
```

지난 학기를 고르면 초안 준비 조각은 아예 배열에서 빠진다(스펙 §7 "초안 준비 조각은 이번 학기에만").

### 9.2 조각 1 — 학기 잔디

```
[잔디 그리드 — MyGrassSection과 같은 컴포넌트, 다만 '오늘까지'가 아니라 학기 전체]
기록한 주 12주

3학년 2반(담임)   한 바퀴 3번   ●●●
1반 수학          한 바퀴 1번   ●
```

- 잔디 그리드는 1차 `MyGrassSection`의 그리드 부분(`GrassCell` 진하기 4단계)을 **그대로 재사용**한다 — 다만 `future` 플래그가 "오늘 이후"가 아니라 "학기 마지막 날 이후"가 된다(지난 학기를 보면 전부 과거라 future 칸이 없다).
- "기록한 주 N주" 한 줄, `text-sm font-medium text-sp-text` — 1차 연속 주 문구와 같은 급.
- **반 카드마다 끝낸 바퀴 수** — 1차 카드는 이 숫자를 화면에 낸 적이 없다("한 바퀴까지 N명"만 보여줬다). 여기서 **처음** 숫자로 보여준다(스펙 §7 — "선생님 자신의 쌓인 기록이라 ADR-134 허용 범위"). 표시는 목록 한 줄씩: `{반 이름}  한 바퀴 {N}번`. 점(`●`)을 바퀴 수만큼 그려도 좋지만 10바퀴가 넘으면 점이 줄바꿈되므로, **숫자 텍스트만**을 기본으로 하고 점은 5개 이하일 때만 보조로 덧붙인다.

```tsx
<div className="flex items-center justify-between rounded-lg bg-sp-surface px-3 py-2 text-sm">
  <span className="text-sp-text">{card.title}</span>
  <span className="text-sp-muted">
    한 바퀴 {card.completedLaps}번
    {card.completedLaps > 0 && card.completedLaps <= 5 && (
      <span className="ml-1.5 text-sp-accent" aria-hidden>
        {'●'.repeat(card.completedLaps)}
      </span>
    )}
  </span>
</div>
```

### 9.3 조각 2 — 장면

반 카드마다 두 줄.

```
1반 수학
자주 담은 장면   시행착오 · 질문
아직 없는 장면   진로 · 변화
```

- **많이 남긴 장면(최대 2개)**: `bg-sp-surface text-sp-text` 텍스트 pill.
- **아직 없는 기본 장면**: `border border-dashed border-sp-border text-sp-muted` pill — 경고가 아니라 "빈 자리 안내"라 점선+텍스트색만.
- **장면을 거의 안 쓰는 반**(기준: 장면 붙은 기록 비율 20% 미만이거나 10건 미만, 조정 가능)이면 위 두 줄 대신 한 줄만:

  > 장면을 골라 두면 여기서 고르게 쌓였는지 볼 수 있어요

```tsx
function ScenePieceCard({ card }: { card: SceneCardViewModel }): JSX.Element {
  if (card.rarelyUsesScenes) {
    return (
      <div className="rounded-lg bg-sp-surface px-3 py-2 text-sm">
        <p className="mb-1 font-medium text-sp-text">{card.title}</p>
        <p className="text-xs text-sp-muted">
          장면을 골라 두면 여기서 고르게 쌓였는지 볼 수 있어요
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-sp-surface px-3 py-2 text-sm">
      <p className="mb-1.5 font-medium text-sp-text">{card.title}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-sp-muted">자주 담은 장면</span>
        {card.top.map((s) => (
          <span
            key={s}
            className="rounded-full bg-sp-surface px-2 py-0.5 text-sp-text ring-1 ring-sp-border"
          >
            {s}
          </span>
        ))}
      </div>
      {card.empty.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-sp-muted">아직 없는 장면</span>
          {card.empty.map((s) => (
            <span
              key={s}
              className="rounded-full border border-dashed border-sp-border px-2 py-0.5 text-sp-muted"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 9.4 조각 3 — 초안 준비 (이번 학기만)

```
1반 수학               3명 준비                [초안 쓰러 가기]
아직 부족: 5  12  18
```

- 헤더: `{N}명 준비` — 스펙 문구 그대로, 건수 아닌 "준비된 인원"이라 ADR-134에 안 걸린다(누가 몇 건인지가 아니라 반 전체의 진행 상태).
- **부족한 학생**은 번호 칸으로만(§1-3 — 마우스/포커스 시 이름). 스타일은 1차 "빈칸" 톤을 그대로 빌린다(경고색 아님을 분명히 하려고): `border border-sp-border text-sp-text` 정사각형, `aspect-square`가 아니라 작은 pill(`h-6 w-6 rounded-md`) — 전체 명렬 그리드가 아니라 **부족한 학생만** 나열하는 목록이라 1차 `ClassLapCard`보다 훨씬 짧다.
- `[초안 쓰러 가기]` 버튼은 그 반의 생활기록부 초안 화면으로 이동(담임=담임 기록 초안, 수업=그 수업 기록 초안) — 기존 네비게이션 함수 재사용(정확한 목적지 함수명은 생기부 초안 기능 쪽 코드 확인 필요, 이 문서는 버튼 존재·라벨만 규정).
- **장면을 거의 안 쓰는 반**이면 이 조각도 숫자·부족 명단 없이 스펙 §7의 같은 한 줄로 대체한다(§9.3과 동일 조건·문구).
- **지난 학기 선택 시 조각 자체가 배열에서 빠진다**(헤더에서 이미 언급).

```tsx
<div className="rounded-lg bg-sp-surface px-3 py-2 text-sm">
  <div className="flex items-center justify-between">
    <span className="font-medium text-sp-text">{card.title}</span>
    <span className="text-sp-muted">{card.readyCount}명 준비</span>
  </div>
  {card.notReady.length > 0 && (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {card.notReady.map((s) => (
        <span
          key={s.ref}
          role="img"
          aria-label={s.displayName ? `${s.label}번 ${s.displayName}` : `${s.label}번 학생`}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-sp-border text-[11px] text-sp-text"
        >
          {s.label}
        </span>
      ))}
    </div>
  )}
  <button
    type="button"
    onClick={() => goToDraft(card)}
    className="mt-2 rounded-lg border border-sp-border px-3 py-1 text-xs text-sp-text transition-colors hover:border-sp-accent"
  >
    초안 쓰러 가기
  </button>
</div>
```

### 9.5 조각 4 — '이번 주' (조건부, 한 주 정리와 겹친 날에만)

같은 날 두 알림이 겹쳐 학기 돌아보기 하나로 합쳐 알린 경우(스펙 §7 마지막 줄), §8.1의 `ObservationWeekRow`를 **그대로** `title="이번 주"`로 조각 목록에 끼워 넣는다. 새 컴포넌트가 필요 없다 — 이게 "공용 틀"을 만든 이유다.

### 9.6 `[그림으로 저장]` 버튼 + `[잔디]` 탭 진입 버튼

`RecapModalFrame`의 `footer` 자리:

```tsx
footer={
  <div className="flex items-center justify-end gap-2 border-t border-sp-border px-6 py-3">
    <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text">
      닫기
    </button>
    <button
      type="button"
      onClick={exportPng}
      className="rounded-lg bg-sp-accent px-4 py-1.5 text-sm font-sp-semibold text-white transition-all hover:brightness-110"
    >
      그림으로 저장
    </button>
  </div>
}
```

`[잔디]` 탭 진입 버튼 두 개(§8.2와 함께, `ObservationCheerTab.tsx` 맨 위):

```tsx
<div className="mb-3 flex gap-2">
  <button type="button" onClick={openWeekly} className="flex-1 rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-text transition-colors hover:border-sp-accent">
    <span className="material-symbols-outlined mr-1 align-text-bottom text-sm">calendar_view_week</span>
    이번 주 정리
  </button>
  <button type="button" onClick={openTerm} className="flex-1 rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-text transition-colors hover:border-sp-accent">
    <span className="material-symbols-outlined mr-1 align-text-bottom text-sm">auto_stories</span>
    이번 학기 돌아보기
  </button>
</div>
<MyGrassSection ... />
```

---

## 10. 그림으로 저장 (PNG)

새 라이브러리 없이 `<canvas>` + `toBlob`만 쓴다. 담을 내용·순서는 스펙 §7이 못박았다 — 반 이름, 반별 숫자, 학교·교사 이름, 학생 정보는 **절대 넣지 않는다**.

### 10.1 캔버스 규격

| 항목        | 값                                                      |
| ----------- | ------------------------------------------------------- |
| 캔버스 크기 | 1080 × 1350px (4:5, 세로 카드형 — 공유 앱 규격과 맞춤)  |
| 여백        | 좌우 80px                                               |
| 배경        | `--sp-bg` (테마 실시간 반영)                            |
| 폰트        | `--sp-font-family`, 없으면 `'Noto Sans KR', sans-serif` |

### 10.2 요소 배치 (위→아래)

| 순서 | 내용                               | 대략 위치·크기                                                        |
| ---- | ---------------------------------- | --------------------------------------------------------------------- |
| 1    | 학기 이름 (예: `2026학년도 2학기`) | y≈160, 40px bold, `--sp-text`, 가운데 정렬                            |
| 2    | 학기 잔디 그리드                   | y≈256부터, 셀 22px + 간격 5px, 5행×학기 주 수(최대 22열), 가운데 정렬 |
| 3    | `기록한 주 {N}주`                  | 그리드 아래 72px, 48px bold, `--sp-text`, 가운데                      |
| 4    | `한 바퀴 {M}바퀴`(전체 카드 합계)  | 3번 아래 28px, 48px bold, `--sp-text`, 가운데                         |
| 5    | 쌤핀 표시(작은 워드마크)           | 우하단 구석, 22px, `--sp-muted`                                       |

정확한 px는 구현 시 미세조정 가능 — **순서·구성 요소·"학생/반/학교 정보 없음"은 규약**이다.

```ts
async function renderTermRecapPng(input: TermRecapPngInput): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = read('--sp-bg', '#0a0e17');
  const text = read('--sp-text', '#e2e8f0');
  const muted = read('--sp-muted', '#94a3b8');
  const accent = read('--sp-accent', '#3b82f6');
  const border = read('--sp-border', '#2a3548');
  const font = read('--sp-font-family', "'Noto Sans KR', sans-serif");

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = text;
  ctx.font = `bold 40px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillText(input.termLabel, canvas.width / 2, 160);

  drawTermGrass(ctx, input.weeks, { accent, border, centerX: canvas.width / 2, top: 256 });

  ctx.font = `bold 48px ${font}`;
  ctx.fillText(`기록한 주 ${input.weeksRecorded}주`, canvas.width / 2, 458);
  ctx.fillText(`한 바퀴 ${input.totalLaps}바퀴`, canvas.width / 2, 534);

  ctx.font = `22px ${font}`;
  ctx.fillStyle = muted;
  ctx.textAlign = 'right';
  ctx.fillText('쌤핀', canvas.width - 80, canvas.height - 60);

  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 생성 실패'))),
      'image/png',
    ),
  );
}
```

- 잔디 그리드 진하기는 1차와 같은 4단계를 `ctx.globalAlpha`로 흉내 낸다(0단계=테두리만 `strokeRect`, 1~3단계=`fillStyle=accent`에 `globalAlpha 0.3/0.7/1`).
- 파일명 기본값: `쌤핀_{학기이름 공백제거}_잔디.png`(예: `쌤핀_2026학년도2학기_잔디.png`) — 조정 가능.

### 10.3 저장 흐름 — 기존 내보내기 패턴 재사용

`ProgressMode.tsx`의 `saveExport`(Electron 저장 대화상자 vs 브라우저 다운로드 분기)와 **완전히 같은 패턴**을 쓴다. 새 저장 로직을 만들지 않는다.

```ts
async function exportPng(): Promise<void> {
  const blob = await renderTermRecapPng(input);
  const filename = `쌤핀_${input.termLabel.replace(/\s+/g, '')}_잔디.png`;
  if (window.electronAPI) {
    const saved = await window.electronAPI.showSaveDialog({
      title: '학기 돌아보기 그림 저장',
      defaultPath: filename,
      filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
    });
    if (!saved) return;
    await window.electronAPI.writeFile(saved.handle, await blob.arrayBuffer());
    useToastStore.getState().show('그림을 저장했어요', 'success', {
      label: '파일 열기',
      onClick: () => window.electronAPI?.openFile(saved.handle),
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### 10.4 검증용 고정 문자열

스펙 §13 "그림: 반 이름·학생 정보가 들어가지 않는지(그림에 넣는 글자를 시험으로 고정)"에 대응해, `renderTermRecapPng`가 캔버스에 실제로 그리는 문자열은 **오직** `input.termLabel`, `기록한 주 N주`, `한 바퀴 M바퀴`, `쌤핀` 네 가지뿐이어야 한다 — 단위 시험은 이 네 패턴 밖의 텍스트가 그려지지 않는지를 스파이(`ctx.fillText` mock)로 고정한다.

---

## 11. 토스트 — 먼저 거는 말

기존 `useToastStore`·`'cheer'` 토스트 타입(1차에서 이미 추가됨)을 재사용한다. 다만 지금 구조로는 "토스트 전체를 누르면 열린다"를 못 만든다 — `show()`는 `'success'|'error'|'info'`만 받고, `showCheer(message, pinState)`엔 클릭 핸들러가 없다.

**최소 확장**: `showCheer`에 세 번째 인자를 더한다.

```ts
showCheer: (message: string, pinState: 'wave' | 'celebrate', onClick?: () => void) => void;
```

`ToastData`에 `onClick?: () => void`를 추가하고, `ToastItem`의 바깥 `div[role="alert"]`에 `onClick`이 있을 때만 `role="button" tabIndex={0} onClick={...} onKeyDown={enterOrSpace(...)} className="cursor-pointer"`를 얹는다. 기존 닫기(×) 버튼은 `onClick={(e) => { e.stopPropagation(); onDismiss(); }}`로 버블링을 막아 두 동작이 섞이지 않게 한다. `toast.action`(라벨 버튼)이 있는 다른 토스트 타입은 지금처럼 그대로 둔다 — `onClick`은 'cheer' 타입, 그 중에서도 먼저 거는 말 전용으로만 쓴다.

호출:

```ts
useToastStore.getState().showCheer(
  '이번 주 정리가 왔어요',
  'idle', // 축하 동작이 아니라 담담한 안내이므로 idle — CheerPin이 idle에서도 정지 프레임을 그린다
  () => useRecapModalStore.getState().openWeekly(),
);
```

- **길이**: 6000ms. 1차 cheer 토스트(4000ms)보다 길게 잡는다 — 이건 눌러서 다음 화면으로 이동하는 안내라 "액션을 결정할 시간"이 필요한 쪽(Toast.tsx 기존 주석의 5000ms 기준)에 가깝다.
- **위젯 창엔 없음** — `ToastContainer`를 위젯 창 루트에 마운트하지 않는 지금 구조를 그대로 유지한다(스펙 "바탕화면 위젯 창에는 토스트가 없고 핀 줄만 바뀐다"). 새로 막을 코드가 필요 없다 — 애초에 안 띄운다.
- **하루 한 번**: 토스트를 띄우는 시점 자체가 §1-4 "그날 처음 쌤핀을 볼 때" 판정 결과이므로, 토스트 컴포넌트는 그 판정을 다시 하지 않는다 — 훅이 이미 "오늘 아직 안 알렸다"를 확인하고 호출한다.

---

## 12. 색상 구현 보강 (1차 §9 표에 추가)

| 필요                     | 방법                                                                      | 이유                                                                                                |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 오늘 챙길 학생 완료 표시 | 텍스트 `✓`, `text-sp-accent`                                              | 채운 배경(`bg-sp-accent`)은 반 카드 칸이 이미 그 뜻으로 쓰고 있어 재사용하면 "칠해진 칸"과 헷갈린다 |
| 질문 한 줄 배너          | `border-dashed border-sp-border` + `bg-sp-surface`(수정자 없는 고체 토큰) | `bg-sp-accent/5`류는 CSS가 생성되지 않는다(하드 제약) — 대신 점선 테두리로 "말 걸기" 느낌만 낸다    |
| 초안 준비 "부족 학생" 칩 | `border border-sp-border text-sp-text`(빈칸과 동일)                       | 경고처럼 보이면 안 된다 — 진행 상태 안내이지 재촉이 아니다                                          |
| 장면 "아직 없음" pill    | `border-dashed border-sp-border text-sp-muted`                            | 같은 이유, 빈 자리 안내는 항상 점선+무채색                                                          |
| 반 흐름·한 주 정리 칸    | `bg-sp-accent`(채워짐) / `border-sp-border` + `opacity-40`(옅게)          | 1차 `GrassCell` 규칙 그대로 재사용 — 새 규칙 없음                                                   |
| PNG 잔디 진하기          | `ctx.globalAlpha = 0.3/0.7/1`(canvas API)                                 | DOM이 아니므로 Tailwind 자체가 적용되지 않는다 — CSS 변수 값을 직접 읽어 canvas 채우기 색으로 쓴다  |

---

## 13. 문구 표 (전체 — 조정 가능 표시된 것은 임베드/카피 수정 시 자유롭게 바꿀 수 있다)

### 13.1 핀 줄

| 상태               | 문구                                               |
| ------------------ | -------------------------------------------------- |
| 쉬는 중            | `오늘은 쉬어요`                                    |
| 쉴게요 단추        | `쉴게요`(전체 문구 `오늘은 쉴게요`는 `aria-label`) |
| 다시 켜기 단추     | `다시 켜기`                                        |
| 한 주 정리 알림    | `이번 주 정리가 왔어요`                            |
| 학기 돌아보기 알림 | `이번 학기 돌아보기가 왔어요`                      |

### 13.2 오늘 챙길 학생

| 자리               | 문구                                                              |
| ------------------ | ----------------------------------------------------------------- |
| 섹션 라벨          | `오늘 챙길 학생`                                                  |
| 완료 표시          | `✓`(텍스트 기호, 별도 문구 없음)                                  |
| aria-label(미완료) | `{반 짧은 이름 }{번호}번 {이름}, 오늘 챙길 학생`                  |
| aria-label(완료)   | `{반 짧은 이름 }{번호}번 {이름}, 오늘 챙길 학생 · 오늘 기록 완료` |

### 13.3 관찰 질문 한 줄 (조정 가능 — 장면마다 1개 이상, 아래는 초안)

**교과(TEACHING_SLOTS)**

| 장면     | 질문                                                  |
| -------- | ----------------------------------------------------- |
| 질문     | `{이름}이(가) 오늘 궁금해했던 것이 있었나요?`         |
| 시도     | `{이름}이(가) 새로 해 본 것이 있었나요?`              |
| 시행착오 | `{이름}이(가) 막혔다가 다시 해 본 순간이 있었나요?`   |
| 산출물   | `{이름}이(가) 만든 결과물이 있었나요?`                |
| 피드백   | `{이름}에게 건넨 말에 어떤 반응이 있었나요?`          |
| 융합     | `{이름}이(가) 다른 과목과 연결 지은 순간이 있었나요?` |

**담임(HOMEROOM_SLOTS)**

| 장면      | 질문                                                            |
| --------- | --------------------------------------------------------------- |
| 학습 태도 | `{이름}의 오늘 수업 태도에서 눈에 띈 모습이 있었나요?`          |
| 인성·관계 | `{이름}이(가) 친구를 대하는 모습에서 기억나는 장면이 있었나요?` |
| 학급 역할 | `{이름}이(가) 학급 일에 나선 순간이 있었나요?`                  |
| 변화      | `{이름}에게서 예전과 달라진 점이 보였나요?`                     |
| 아쉬운 점 | `{이름}에게 아쉬웠던 순간이 있었나요?`                          |
| 진로      | `{이름}이(가) 관심을 보인 분야가 있었나요?`                     |

담임 장면 칩 라벨은 각 장면 이름 그대로(`학습 태도`, `인성·관계`, ...). 담임 장면 칩 줄 안내: `이 순간 · 고르지 않아도 저장됩니다`.

### 13.4 관심 학생

| 자리                    | 문구                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- |
| 칸 메뉴 토글(관심 아님) | `관심 학생으로`                                                                    |
| 칸 메뉴 토글(관심)      | `관심 학생 풀기`                                                                   |
| 지정 토스트             | `관심 학생으로 지정했어요`                                                         |
| 해제 토스트             | `관심 학생 지정을 풀었어요`                                                        |
| 설정 섹션 제목          | `관심 학생`                                                                        |
| 설정 섹션 설명          | `더 자주 챙길 학생이에요. 공백 문턱이 절반으로 줄어요.`                            |
| 빈 목록                 | `아직 지정한 학생이 없어요. 반 카드의 칸 메뉴에서 관심 학생으로 지정할 수 있어요.` |
| 행 버튼                 | `풀기`                                                                             |
| 명렬에서 사라짐         | `명렬에서 찾지 못한 학생`                                                          |

### 13.5 응원·잔디 설정

| 자리              | 문구                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 도움말(교체)      | `끄면 핀 줄·오늘 챙길 학생·반 흐름·한 주 정리·학기 돌아보기가 모두 사라져요. 관심 학생 목록과 기록 알림 기준은 그대로 남아요.` |
| 알림 강도 안내 줄 | `오늘 챙길 학생 담임 {N}명 · 수업반 {N}명`                                                                                     |

### 13.6 반 흐름

| 자리      | 문구                                         |
| --------- | -------------------------------------------- |
| 카드 제목 | `반 흐름`                                    |
| 기준 배지 | `이번 학기 기준`                             |
| 범례      | `기록 있음` / `기록 없음` / `쉬는 주 · 아직` |

### 13.7 한 주 정리

| 자리         | 문구                      |
| ------------ | ------------------------- |
| 모달 제목    | `한 주 정리`              |
| 만난 학생 수 | `이번 주 만난 학생 {N}명` |
| 빈 주        | `이번 주는 조용했어요`    |
| 탭 버튼      | `이번 주 정리`            |

### 13.8 학기 돌아보기

| 자리              | 문구                                                   |
| ----------------- | ------------------------------------------------------ |
| 모달 제목         | `학기 돌아보기`                                        |
| 학기 선택         | `이번 학기` / `지난 학기`                              |
| 학기 잔디         | `기록한 주 {N}주` / `한 바퀴 {M}번`                    |
| 장면              | `자주 담은 장면` / `아직 없는 장면`                    |
| 장면 거의 안 씀   | `장면을 골라 두면 여기서 고르게 쌓였는지 볼 수 있어요` |
| 초안 준비         | `{N}명 준비`                                           |
| 초안 이동 버튼    | `초안 쓰러 가기`                                       |
| 이번 주 조각 제목 | `이번 주`                                              |
| 그림 저장 버튼    | `그림으로 저장`                                        |
| 저장 완료 토스트  | `그림을 저장했어요`                                    |
| 탭 버튼           | `이번 학기 돌아보기`                                   |
| 기본 파일명       | `쌤핀_{학기이름}_잔디.png`(공백 제거)                  |

### 13.9 PNG 안 문구 (§10.4 검증 대상, 이 4가지 외 텍스트 없음)

`{학기이름}` · `기록한 주 {N}주` · `한 바퀴 {M}바퀴` · `쌤핀`

---

## 14. 컴포넌트 분해

| 파일                                                 | 종류                    | 설명                                                                                     |
| ---------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `Dashboard/ObservationCheer/CheerPinLine.tsx`        | 수정                    | §1 — 쉬기/다시 켜기 단추, 먼저 거는 말 클릭형 텍스트                                     |
| `Dashboard/ObservationCheer/TodayFocusChipRow.tsx`   | 신규                    | §2 — 오늘 챙길 학생 칩 줄                                                                |
| `Dashboard/ObservationCheer/TodayFocusChip.tsx`      | 신규(또는 위 파일 내부) | §2.2 — 칩 한 개                                                                          |
| `Dashboard/DashboardStudentRecords.tsx`              | 수정                    | 압축 카드에 `<TodayFocusChipRow />` 삽입(핀 줄 다음)                                     |
| `common/QuickAdd/QuickAddStudentRecordForm.tsx`      | 수정                    | §3 — 담임 장면 칩(`sceneSlot` state) + 질문 한 줄                                        |
| `Dashboard/ObservationCheer/ObservationCellMenu.tsx` | 수정                    | §4 — 관심 학생 토글 항목 + 구분선                                                        |
| `Dashboard/ObservationCheer/ClassLapCard.tsx`        | 수정(최소)              | §4 — `focused`/`onToggleFocus` prop을 메뉴에 전달만(칸 자체 시각 변경 없음)              |
| `Settings/RecordReminderSection.tsx`                 | 수정                    | §5 — 도움말 교체, 관심 학생 섹션 위치 이동, 알림 강도 안내 줄                            |
| `Settings/FocusStudentListSection.tsx`               | 신규                    | §5.2                                                                                     |
| `Dashboard/ObservationCheer/TermFlowSection.tsx`     | 신규                    | §6 — 반 흐름, 담임·수업 통계 화면 공용                                                   |
| `Homeroom/Records/ProgressMode.tsx`                  | 수정                    | `<TermFlowSection kind="homeroom" />`를 맨 위에 삽입                                     |
| `ClassManagement/ClassRecordStatsView.tsx`           | 수정                    | `<TermFlowSection kind="teaching" classId={classId} />`를 맨 위에 삽입                   |
| `Dashboard/ObservationCheer/RecapModalFrame.tsx`     | 신규                    | §7 — 공용 틀(포털 + 조각 목록 렌더)                                                      |
| `Dashboard/ObservationCheer/WeeklyRecapModal.tsx`    | 신규                    | §8 — 얇은 래퍼                                                                           |
| `Dashboard/ObservationCheer/TermRecapModal.tsx`      | 신규                    | §9 — 학기 선택기 + 조각 4종 + PNG 버튼                                                   |
| `Dashboard/ObservationCheer/ObservationWeekRow.tsx`  | 신규                    | §8.1·§9.5 공용 — 월~금 5칸 + 만난 학생 수                                                |
| `Dashboard/ObservationCheer/TermGrassPiece.tsx`      | 신규                    | §9.2                                                                                     |
| `Dashboard/ObservationCheer/TermScenePiece.tsx`      | 신규                    | §9.3                                                                                     |
| `Dashboard/ObservationCheer/TermDraftReadyPiece.tsx` | 신규                    | §9.4                                                                                     |
| `Dashboard/ObservationCheer/termRecapPng.ts`         | 신규(비-컴포넌트)       | §10 — canvas 렌더·저장                                                                   |
| `Dashboard/ObservationCheer/ObservationCheerTab.tsx` | 수정                    | §8.2·§9.6 — 상단 버튼 두 개 삽입                                                         |
| `Dashboard/studentRecordNavigation.ts`               | 수정                    | §7.3 — `weeklyRecapTarget`/`termRecapTarget`, `applyStudentRecordIntent` 분기 추가       |
| `adapters/stores/useRecapModalStore.ts`(가칭)        | 신규                    | §7.3 — 어느 모달이 열려 있는지(로컬 UI 상태, 저장 안 함)                                 |
| `adapters/components/common/Toast.tsx`               | 수정                    | §11 — `showCheer`에 `onClick?` 인자, `ToastItem`에 클릭 가능 처리                        |
| `App.tsx`                                            | 수정                    | 메인 창 루트에 `<WeeklyRecapModal />`·`<TermRecapModal />` 마운트(위젯 루트엔 두지 않음) |

> 계산 로직(오늘 챙길 학생 고르기, 등교일·정규 수업 종료일, 반 흐름 칸 값, 조각 데이터, 관심 학생 문턱)은 `src/domain/rules/`·`src/adapters/hooks/`가 맡는다. 이 표의 신규 컴포넌트는 전부 **뷰모델을 입력으로 받는 순수 표시 컴포넌트**로 설계했다(1차와 같은 원칙 — 계산 시험과 렌더 시험을 분리).

---

## 15. 접근성 체크리스트

- [ ] 핀 줄의 세 가지 텍스트 상태 전환이 `aria-live="polite"`로 읽힌다
- [ ] `쉴게요`/`다시 켜기` 단추에 전체 문구가 담긴 `aria-label`이 있다
- [ ] 오늘 챙길 학생 칩마다 번호(+마스킹된 이름)·완료 여부가 담긴 `aria-label`
- [ ] 담임 장면 칩·간단 분류 칩이 서로 다른 `aria-pressed` 그룹으로 구분된다(스크린리더가 "이 순간"과 "간단 분류"를 다른 그룹으로 읽음)
- [ ] 질문 한 줄은 `<button>`이라 Tab으로 도달·Enter로 실행된다
- [ ] 칸 메뉴의 관심 토글 항목도 `role="menuitem"`이라 기존 방향키 순회에 자동 포함된다
- [ ] 반 흐름 칸은 시각 정보 없이도 `aria-label`(번호·이름·주 범위·있음/없음)만으로 읽힌다
- [ ] 한 주 정리 5칸은 `role="img"` + `aria-label`로 상태(있음/아직/쉬는 날/없음)를 구분해 읽는다
- [ ] `RecapModalFrame`은 공용 `Modal`의 `FocusTrap`·Esc·`aria-labelledby`를 그대로 물려받는다(포털은 DOM 위치만 바꾼다)
- [ ] 학기 선택 버튼은 `aria-pressed`로 상태를 알린다
- [ ] 그림으로 저장 성공/실패가 토스트로 스크린리더에도 전달된다(`role="alert"`)
- [ ] 클릭 가능한 'cheer' 토스트는 `role="button" tabIndex={0}`이고 닫기(×) 버튼 클릭이 버블링돼 같이 열리지 않는다
- [ ] 이름 표시 '표시 안 함' 설정일 때 §2·§6·§9의 모든 `displayName`이 빈 문자열이라 툴팁·aria-label에 이름이 없다

> 그 밖 "왜"는 각 섹션 옆에 있다: 포털 이유(§7.1), 관심 토글에만 토스트를 붙인 이유(§4), 채운 배경을 새로 안 쓴 이유(§12), 반 흐름을 카드 스크롤로 가둔 이유(§6.1).

---

## 16. 열린 질문

- **초안 쓰러 가기의 정확한 이동 함수**: 생기부 초안 화면으로 가는 기존 네비게이션 진입점(담임/수업 각각)을 이 작업에서 다시 조사해야 한다 — 이 문서는 버튼 존재·라벨만 규정했고 실제 라우팅 대상 함수명은 구현 시 초안 기능 코드에서 확인해야 한다.
- **관심 학생 지정/해제 토스트 추가는 스펙 문구와 다른 결정**이다(§4) — 스펙은 "즉시 저장하고 토스트 없이 칸 모양만 바뀐다"는 1차 원칙을 관심 학생에도 암묵적으로 기대할 수 있지만, 관심 학생은 **어디에도 시각 표시가 없어**(스펙 §4 "보이지 않는 표시") 무음 처리하면 확인할 길이 없다. 오너 확인이 필요하면 이 결정을 뒤집어 무음으로 되돌릴 수 있다.
- **반 흐름 칸의 "쉬는 주"와 "아직"을 시각적으로 완전히 동일하게 처리**했다(§6.1, §8.1) — 경고색을 피하려는 선택이지만, 실기기 확인에서 오너가 "왜 둘이 똑같아 보이냐"고 물으면 텍스처(예: 대각선 해칭)로 구분하는 대안이 있다. 다만 SVG 패턴을 새로 들이는 비용 대비 이득이 작아 1차 `GrassCell`과의 일관성을 우선했다.
- **학기 돌아보기 PNG의 세로 카드형(1080×1350) 크기**는 스펙이 정하지 않아 이 문서가 임의로 골랐다(공유 앱에 흔한 4:5 비율). 정사각형(1080×1080)이나 가로형을 오너가 선호하면 §10.1 표만 바꾸면 된다 — 레이아웃 로직 자체는 비율에 독립적으로 짰다.
- **`AddRecordWithTagsParams`에 `slots` 필드가 없다**(§3.1 구현 메모) — UI 설계 범위를 벗어나지만, 이 필드 없이는 담임 장면 칩이 저장되지 않으므로 구현 착수 시 가장 먼저 확인해야 할 항목으로 남긴다.

---

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Author    |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.0     | 2026-09-23 | 초기 설계 — 핀 줄 확장/오늘 챙길 학생/질문 한 줄·담임 장면 칩/관심 학생 메뉴·설정/반 흐름/한 주 정리·학기 돌아보기 공용 틀/PNG 저장/토스트/문구/컴포넌트 분해                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | pblsketch |
| 1.1     | 2026-09-23 | 실화면(Electron) 확인 뒤 디자인 에이전트 권고 반영 — ① 오늘 챙길 학생 칩에 `border-sp-border`(밝은 테마에서 칩이 글자처럼 보였다), 수업반 칩은 짧은 반 이름(`3-2반·3`)과 이름표에 전체 반 이름 ② 학기 돌아보기 카드 줄: 끝낸 바퀴 0이면 "한 바퀴 0번" 대신 이번 학기는 "한 바퀴까지 N명", 지난 학기는 숫자 없음 ③ 기록이 없는 학기는 "기록한 주 0주" 대신 "이번 학기는 아직 기록이 없어요"/"지난 학기는 기록이 없었어요" 한 줄, [그림으로 저장] 숨김 ④ 초안 준비: 부족 명단 앞에 "장면이 더 필요한 학생" 글자, 장면을 거의 안 쓰는 반의 안내 한 줄은 장면 조각에만(되풀이 없음) ⑤ 그림 문구 "한 바퀴 N번"(0이면 그 줄 없음), 내용 덩어리를 세로 가운데로 | pblsketch |
| 1.2     | 2026-09-23 | 최종 검토 반영 — 누를 수 있는 토스트는 핀+문구를 한 단추로(닫기와 겹치지 않게) · 반 흐름 줄 머리·초안 준비 번호 칸에 키보드 초점 이름표 · 핀 줄 말에 전체 문구 `title` · 지난주 정리는 "지난주 정리가 왔어요"/"그 주 만난 학생" · 응원·잔디 도움말에 사라지는 것·남는 것 모두                                                                                                                                                                                                                                                                                                                                                                            | pblsketch |
| 1.3     | 2026-09-24 | 오너 요청 — 작은 카드에 주 줄 잔디(§1.4): 한 칸 = 한 주, 진하기 = 그 주 기록한 날 수, 쉬는 주 점선, 누르면 [잔디] 탭                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | pblsketch |
