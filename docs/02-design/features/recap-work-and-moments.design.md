---
template: design
version: 1.0
feature: recap-work-and-moments
date: 2026-09-23
author: pblsketch
project: ssampin
plan: ../../../.dryforge/spec.md
---

# 돌아보기 숫자 한 줄·학교 달력 인사 — UI 설계서

> **요약**: `.dryforge/spec.md`(돌아보기 숫자 한 줄·학교 달력 인사)를 만족시키는 화면·컴포넌트·문구 설계. 셈 로직은 이미 짜여 있다(`src/domain/rules/recapWorkCounts.ts` — 수업·할 일·상담 계산, `src/domain/rules/schoolMoments.ts` — 인사 날짜·종류 판정). 이 문서는 그 결과를 **어디에 어떻게 그릴지**만 다룬다.
>
> **비주얼 방향**: 새 팔레트·새 폰트 없음. [관찰 기록 응원 2·3차 설계서](./observation-cheer-2.design.md)가 세운 조각 목록 틀(`RecapModalFrame`)을 그대로 잇는다. 채운 배경은 `sp-accent`뿐, 나머지는 `border`·`text` 색만 쓴다(ADR-134 경고색 금지와 같은 원칙).
> **Status**: 확정(오너가 핀 시안 선택)

---

## 0. 이미 있는 것 — 이 문서가 다시 정의하지 않는 것

| 이미 있음           | 파일                                     | 이 문서가 쓰는 것                                                                                 |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 숫자 계산           | `recapWorkCounts.ts`                     | `WorkCounts`, `workCountItems()`, `workCountLine()`, `pngWorkCountItems()`, `isPartialTodoTerm()` |
| 인사 날짜·종류 판정 | `schoolMoments.ts`                       | `momentOfDay()`, `MomentKind`, `PinLook`, `MOMENT_LOOK`, `MOMENT_PRIORITY`                        |
| 먼저 거는 말 틀     | `proactiveTalk.ts`                       | `TALK_PRIORITY`에 `moment: 2`가 이미 있다 — 셋째 후보로 넣기만 하면 된다                          |
| 조각 목록 틀        | `recapPieces.tsx`, `RecapModalFrame.tsx` | `RecapPiece`, `collectPieces()` — 새 조각을 배열에 더하기만 한다                                  |
| 핀 그림 뼈대        | `CheerPin.tsx`                           | 4×4 스프라이트(idle/jump/wave/celebrate) — 인사 모습은 **별도 정지 그림**으로 얹는다(§7)          |

`momentOfDay()`가 셋째 `TalkCandidate`(`{ kind: 'moment', key: 오늘날짜 }`)로 `useObservationDaily.ts`의 후보 목록에 들어가는 배선은 이 문서 범위 밖이다(구현 시 결정 로직만 연결). 이 문서는 **그 뒤에 화면에 뭐가 나오는가**부터 다룬다.

---

## 1. 한 주 정리 — 숫자 한 줄 (`workCounts` 조각)

관찰 조각(`observationWeekPiece`, order 0) 바로 뒤에 새 조각을 더한다.

```tsx
const workCountsPiece: WeeklyPieceProvider = ({ week }) => {
  const items = workCountItems(readWorkCounts(week)); // 수업·할 일 — 즉시(로컬), 상담 — §1.3
  const line = workCountLine(items);
  return line === null
    ? null
    : {
        id: 'workCounts',
        order: 10,
        title: null,
        render: () => <p className="text-sm text-sp-text">{line}</p>,
      };
};
```

- **title: null** — 관찰 조각과 같은 급의 "제목 없는 한 줄"이다. 모달 제목("한 주 정리")이 이미 문맥을 준다.
- **유일한 내용일 때**(그 주 관찰 기록이 없어 관찰 조각이 없을 때): `RecapModalFrame`의 첫(그리고 유일한) `<section>`이 된다 — 조각 목록이 비어있지 않으므로 `emptyMessage`은 안 뜬다. 별도 처리 불필요하다. 다만 이때는 위쪽이 관찰 조각의 5칸 그리드가 있을 때보다 허전해 보일 수 있으니, `RecapModalFrame`의 `space-y-4`와 `pt-1`을 그대로 두고 별도 마진을 얹지 않는다(조각 하나짜리 모달도 자연스럽게 보이도록 이미 여백이 충분하다).
- **글자 크기**: 관찰 조각의 "이번 주 만난 학생 N명"과 같은 급(`text-sm font-medium` 대신 `text-sm text-sp-text` — 굵기는 관찰 조각보다 한 단 낮춘다. 관찰 조각이 이미 그 주의 헤드라인이고 이 줄은 보충 정보이기 때문).

### 1.3 상담 항목이 늦게 붙는 방식 — 스피너 없이, 튐 없이

수업·할 일은 로컬 자료라 모달이 열리자마자 값이 있다. 상담은 서버 응답을 기다린다(spec §2-3). 설계:

1. 모달이 열리는 즉시 `workCounts` 조각은 **수업·할 일만으로** 렌더한다(상담 없이). 이미 그 둘만으로 줄이 있으면(`"수업 3차시 · 끝낸 할 일 2개"`) 그 상태로 보인다.
2. 상담 응답이 도착하면(`combineConsultationCount`가 `null`이 아니면) 같은 `<p>` 엘리먼트의 텍스트만 다시 그린다(`"수업 3차시 · 끝낸 할 일 2개 · 상담 1건"`) — 새 줄이 아니라 **같은 줄 끝에 문구가 늘어나는 것**이라 세로 레이아웃은 전혀 흔들리지 않는다. 대기 표시(스피너·점 3개)는 두지 않는다(spec 그대로).
3. **예외**: 수업·할 일이 둘 다 0이고 상담만 나중에 1 이상으로 도착하면, 조각이 "없음 → 있음"으로 **나타난다**(전에 없던 섹션이 생기므로 진짜 레이아웃 변화가 생긴다). 이 경우는 막을 방법이 없다 — 대기 표시를 금지한 spec과 충돌한다. 흔치 않은 조합(그 주에 수업도 할 일도 없이 상담만 있는 주)이라 받아들인다. §9 열린 질문에도 남긴다.
4. 실패(하나라도 실패)하면 상담 없이 그대로 둔다 — 재시도·오류 문구 없음(spec 그대로, 조용히).

---

## 2. 학기 돌아보기 — 숫자 줄 + 반별 수업 줄 (`workCounts` 조각)

`termGrassPiece`(order 0, 제목 "학기 잔디") 바로 뒤, `scenePiece`(order 10) 앞에 둔다 — spec 3-2의 기본 위치.

```tsx
const termWorkCountsPiece: TermPieceProvider = ({ recap, workCounts, byClass, partial }) => {
  const line = workCountLine(workCountItems(workCounts));
  if (line === null && byClass.size === 0) return null;
  return {
    id: 'workCounts', // spec §7 — 두 창 모두 같은 이름
    order: 5,
    title: null,
    render: () => (
      <div className="space-y-1">
        {line !== null && <p className="text-sm text-sp-text">{line}</p>}
        {byClass.size > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-sp-muted">
            {[...byClass].map(([name, n], i) => (
              <span key={name}>
                {i > 0 && (
                  <span aria-hidden className="mr-1.5">
                    ·
                  </span>
                )}
                {name} {n}
              </span>
            ))}
          </p>
        )}
        {partial && <p className="text-xs text-sp-muted">끝낸 할 일은 {partial}부터 센 수예요</p>}
      </div>
    ),
  };
};
```

### 2.1 반별 줄 — 길어지면 줄바꿈한다 (자르지 않는다)

"3-1반 64 · 3-2반 63 · 5-2반 12 · …" 처럼 반이 많아지면 **`flex-wrap`으로 다음 줄로 넘긴다.** `truncate`나 "외 N개"로 잘라내지 않는다 — 이 줄은 선생님이 스스로 쌓은 숫자이고(ADR-134 허용 범위), 자르면 "내 기록이 어딘가 가려졌다"는 인상을 준다. 모달이 `size="xl"`(960px)이라 두세 줄로 넘어가도 스크롤 영역(`max-h-[70vh]`) 안에서 자연스럽다. 글자는 `text-xs text-sp-muted`로 본문 줄보다 한 단 작고 옅게 — 헤드라인이 아니라 곁줄임을 분명히 한다.

### 2.2 할 일 첫 학기 안내

`partial`(문자열, 예: "9월 3일")이 있으면 숫자 줄 바로 아래 한 줄 더("끝낸 할 일은 9월 3일부터 센 수예요"). `isPartialTodoTerm()` 결과를 그대로 쓴다. 끝낸 할 일이 0이면(spec 3-3) 이 문구도 함께 없다 — `workCounts.todos === 0`이면 상위에서 `partial`을 안 넘긴다.

### 2.3 학기 돌아보기에 접힌 '이번 주' — 그리드와 숫자 줄을 한 조각에서 같이 처리

`thisWeekPiece`(spec 2-5)는 **한 주 정리와 다른 규칙**이다 — 그리드와 숫자 줄이 **하나의 조각**(`title="이번 주"`) 안에서 세 경우로 나뉜다:

| 그 주 관찰 기록 | 그 주 숫자    | 보이는 것                                               |
| --------------- | ------------- | ------------------------------------------------------- |
| 있음            | 있음          | 5칸 그리드 + "이번 주 만난 학생 N명" + 그 아래 숫자 줄  |
| 있음            | 없음(셋 다 0) | 5칸 그리드 + 인원수만(지금 `ObservationWeekRow` 그대로) |
| 없음            | 있음          | **그리드 없이 숫자 줄만**                               |

`ObservationWeekRow`를 직접 쓰지 않고, 새 컴포넌트 `WeekRecapBlock({ observation, workCountsLine })`으로 감싼다 — `observation`이 `null`이면 그리드를 그리지 않고 `workCountsLine`만 그린다. 한 주 정리 모달의 `observationWeekPiece`는 지금처럼 관찰 데이터가 없으면 조각 자체가 없는(별개 조각 두 개) 구조를 유지한다 — 이 합치기는 **term의 thisWeek 조각에서만** 필요하다(spec 2-5가 명시적으로 요구하는 지점).

---

## 3. 인사 조각(`moment`) — 겹친 날 모달 맨 위

spec 4-4: "인사가 조각으로 접힌 날"에만, 그리고 **그 말로 연 창에만** 보인다. 조각 자체는 단순하다 — 까다로운 건 "언제 이 조각이 있는가"를 결정하는 조건이다.

```tsx
const momentPiece: TermPieceProvider | WeeklyPieceProvider = ({ moment }) =>
  moment === null
    ? null
    : {
        id: 'moment',
        order: -10, // 늘 맨 위
        title: null,
        render: () => (
          <div className="flex items-center gap-3 rounded-lg bg-sp-surface px-4 py-3">
            <CheerPin state="idle" look={moment.look} size={40} />
            <p className="text-sm font-medium text-sp-text">{moment.text}</p>
          </div>
        ),
      };
```

### 3.1 "그 말로 연 창"을 판정하는 자리

`openObservationPanelKind(kind)`는 이미 두 갈래다(`observationPanelNavigation.ts`) — 오늘 결정된 말(`talkToday`)이 요청한 kind와 같으면 `panelForTalk(talkToday)`로 열고, 아니면 탭 단추의 기본값으로 연다. **이 분기가 정확히 "그 말로 연 창"의 경계다** — 새 플래그를 만들 필요가 없다. `panelForTalk`을 확장해서, `talkToday.folded`에 `kind: 'moment'`가 있으면 그 후보의 `key`(오늘 날짜)로 `momentOfDay()`를 다시 계산해 `ObservationPanel`에 `moment: { look, text }`를 실어 보낸다. 탭 단추로 연 창(다른 날이든 같은 날이든, `talkToday`가 그 kind와 다르거나 없을 때)은 이 분기를 타지 않으므로 `moment`가 항상 `null`이다 — spec의 "다른 날 탭 단추로 연 창에는 없다"를 **날짜가 아니라 진입 경로로** 만족시킨다.

- 인사 문구(`text`)는 §6의 함수로, 인사가 그날의 말일 때와 같은 문구를 쓴다(모달 안이라고 다른 톤을 쓰지 않는다).
- 배경은 `bg-sp-surface`(중립 카드 톤) — `sp-accent`는 채운 배경 규칙상 이 자리에 못 쓴다. 인사말이 "경고"나 "완료"가 아니라 그냥 곁들이는 인사라 중립 톤이 맞다.

---

## 4. 핀 줄 · 토스트 — 인사가 있는 날

### 4.1 핀 줄 우선순위 — 기존 3단 표에 조건 하나를 끼운다

`CheerPinLine.tsx`의 기존 분기(쉬기 / 열 수 있는 말 / 그 밖)에 **열리지 않는 말**(moment가 그날의 말일 때) 한 줄을 추가한다.

| 순서          | 조건                                                                                  | 보이는 것               | 클릭                                    |
| ------------- | ------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------- |
| 1             | 오늘 쉬는 중                                                                          | "오늘은 쉬어요"         | 없음                                    |
| 2             | `talk.main.kind`가 `weekly`\|`retrospect`                                             | 정리/돌아보기 알림 문구 | 그 모달 오픈                            |
| **2.5(신규)** | `talk.main.kind === 'moment'` **그리고** 오늘 응원(`pinState !== 'idle'`)이 아직 없음 | 인사 한마디             | **열어 봄으로 표시만**(모달 없음, §4.2) |
| 3             | 그 밖(2.5 조건에서 오늘 응원이 이미 있는 경우 포함)                                   | 기존 응원/연속 문구     | 없음                                    |

"그날 첫 기록·한 바퀴 응원이 생기면 응원이 먼저"(spec 4-4)는 새 상태를 안 만들어도 된다 — `useCheerLine()`이 주는 `pinState`가 `'idle'`이 아니면 이미 "오늘 진짜 응원이 떴다"는 뜻이므로(연속 주 문구일 때는 늘 idle), 2.5 조건에 `pinState === 'idle'`만 걸면 응원이 뜨는 순간 자동으로 3번으로 내려간다. 인사는 "열어 봄"으로 적히지 않은 채 뒤로 밀리고, 응원 문구가 그날 내내 유지되는 기존 규칙 그대로 다시 앞에 나오지 않는다.

### 4.2 클릭 동작 — 접힌 날과 그날의 말은 다르다

- **겹친 날**(main이 `weekly`/`retrospect`, moment는 folded): 기존 그대로 — 클릭하면 이긴 쪽 모달이 열리고, 인사 조각(§3)이 맨 위에 보인다.
- **그날의 말**(main이 `moment`): 클릭하면 **열리는 화면이 없다.** 기존 `markOpenedIf` 패턴처럼, "오늘 말이 moment면 열어 봄으로 적는다"는 함수 하나만 부른다(가칭 `dismissTodayMoment()`, `observationPanelNavigation.ts`에 `openObservationPanelKind`와 나란히 둔다) — 모달을 열지 않고 핀 줄 텍스트가 3번(평소 문구)으로 되돌아간다.

```tsx
{talkKind === 'moment' && talkText !== null && pinState === 'idle' ? (
  <button
    type="button"
    onClick={dismissTodayMoment}
    title={talkText}
    aria-label={`${talkText} · 눌러서 확인했다고 표시`}
    className="min-w-0 flex-1 truncate text-left text-xs text-sp-accent hover:underline"
  >
    {talkText}
  </button>
) : /* 기존 openable 분기, 그 다음 기존 else */}
```

### 4.3 토스트

`ObservationTalkHost.tsx`의 `showToast`는 지금 `kind !== 'weekly' && kind !== 'retrospect'`면 아무 것도 안 띄운다 — `moment`를 세 번째로 더한다. `onClick`은 다르다:

```ts
if (kind === 'moment') {
  useToastStore.getState().showCheer(text, 'idle', () => dismissTodayMoment());
} else {
  useToastStore.getState().showCheer(text, 'idle', () => openObservationPanelKind(kind));
}
```

토스트를 눌러도(spec 4-4) 여는 창이 없다 — `dismissTodayMoment()`가 "열어 봄"만 적고 `onDismiss()`는 `ToastItem`이 이미 같이 부른다(눌렀을 때만 닫히고 '열어 봄'이 되며, 저절로 사라진 토스트는 '열어 봄'이 아니라는 spec 규칙과 정확히 일치 — `showCheer`가 이미 타이머로 자동 dismiss하는데, 이때는 `onClick`을 안 거치므로 opened가 안 찍힌다).

토스트의 핀도 그날 모습을 써야 한다 — `CheerPin`에 `look` prop이 있으니 `showCheer`가 `pinState` 대신(또는 함께) `look?: PinLook`을 받도록 넓힌다. `ToastItem`은 `look`이 있으면 그 정지 그림을, 없으면 지금처럼 `pinState` 애니메이션을 그린다.

### 4.4 접근성

- 핀 줄 컨테이너는 이미 `aria-live="polite"`다 — 2.5 상태로 전환되거나 응원에 밀려 3번으로 돌아갈 때도 자동으로 읽힌다.
- 2.5의 버튼은 `title`(전체 문구, 좁은 카드에서 잘릴 때 호버로 확인)과 `aria-label`(전체 문구 + "눌러서 확인했다고 표시" — 스크린리더 사용자가 "이건 눌러도 새 화면이 안 열린다"를 미리 알게)을 둘 다 둔다. 이는 spec 4-4의 "누르면 토스트가 닫히고 '열어 봄'이 된다. 여는 창은 없다"를 시각 장애 사용자에게도 똑같이 전달하기 위해서다 — 일반 열림형 링크(§4.1의 2번)와 똑같은 `<button>` 모양이라 스크린리더만으로는 결과가 다르다는 걸 알 수 없다.
- `Tab`으로 도달, `Enter`/`Space`로 실행(`<button>` 기본 동작, 추가 처리 불필요).
- 토스트의 `role="alert"`·클릭 가능 시 `role="button" tabIndex={0}`은 기존 Toast.tsx 패턴을 그대로 물려받는다(변경 없음).

---

## 5. 그림(PNG) — `termRecapPng.ts` 확장

지금 순서(학기 이름 → 잔디 그리드 → "기록한 주 N주" → "한 바퀴 N번"(0이면 생략) → 우하단 "쌤핀")에서, **숫자 줄을 "한 바퀴" 다음, "쌤핀" 앞**에 끼운다(spec 3-4의 5개 순서 그대로).

| 순서        | 내용                                                           | 글자 크기     | 색                          | 비고                                                               |
| ----------- | -------------------------------------------------------------- | ------------- | --------------------------- | ------------------------------------------------------------------ |
| 1           | 학기 이름                                                      | 40px bold     | `--sp-text`                 | 기존                                                               |
| 2           | 잔디 그리드                                                    | —             | `--sp-accent`/`--sp-border` | 기존                                                               |
| 3           | "기록한 주 N주"                                                | 48px bold     | `--sp-text`                 | 기존                                                               |
| 4           | "한 바퀴 N번"(0이면 없음)                                      | 48px bold     | `--sp-text`                 | 기존                                                               |
| **5(신규)** | 숫자 줄(`pngWorkCountItems`로 만든 줄, 없으면 이 줄 자체 생략) | **36px bold** | `--sp-text`                 | 3·4보다 한 단 작게 — 헤드라인 두 숫자보다 곁줄임을 그림에서도 구분 |
| 6           | "쌤핀"                                                         | 22px          | `--sp-muted`                | 기존, 우하단 고정                                                  |

- **`pngWorkCountItems(counts, isPartialTodoTerm(...))`를 그대로 쓴다** — 학기 중간부터 센 학기는 할 일이 자동으로 빠진다. **"M월 D일부터 센 수예요" 안내 문구는 그림에 절대 안 그린다** — spec 3-4가 못박은 5개 문자열(학기 이름·기록한 주·한 바퀴·숫자 줄·쌤핀)에 안내 문구는 없다.
- **반 이름·반별 숫자는 그림에 없다** — §2의 반별 줄은 화면에만 있다. `pngWorkCountItems`는 애초에 `byClass` 같은 걸 받지 않으므로 실수로 넣을 여지가 구조적으로 없다.
- **위치 계산**: 숫자 줄이 있으면 `blockHeight` 계산에 줄 하나 분량(대략 90px: 글자 높이 + 위 여백)을 더해 전체 덩어리가 여전히 세로 가운데에 오게 한다. "한 바퀴" 줄 유무로 이미 `blockHeight`가 갈라지는 지금 구조(`lapsText !== null ? 190 : 110`)에, 숫자 줄 유무로 한 단 더 갈라지는 조건을 추가하는 정도의 작은 변경이다.
- 검증용 고정 문자열(spec 3-4, §10.4 기존 규칙)에 **여섯 번째 패턴**(숫자 줄의 정확한 문자열)이 추가된다 — `renderTermRecapPng`가 그리는 문자열이 이 6가지 밖으로 늘어나지 않는지 시험으로 고정한다(기존 5→6).

---

## 6. 인사 문구 — 종류마다 한 문장

전부 `{date}`·`{title}` 자리표시만 채우면 되는 고정 문자열이다(조정 가능, 아래는 초안). 모두 반말이 아닌 "-요"체, 학생 이름 없음, 한 문장.

| 종류          | 변형     | 문구                                                       | 비고                                                                                            |
| ------------- | -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `termStart`   | 1학기    | `새 학기가 시작됐어요. 좋은 한 해 보내세요`                |                                                                                                 |
|               | 2학기    | `2학기가 시작됐어요. 다시 힘내봐요`                        |                                                                                                 |
| `vacationEve` | 여름방학 | `내일부터 여름방학이에요. 푹 쉬고 만나요`                  |                                                                                                 |
|               | 겨울방학 | `내일부터 겨울방학이에요. 따뜻하게 보내세요`               |                                                                                                 |
|               | 종업식   | `한 학년을 마무리하는 날이에요. 정말 고생 많으셨어요`      | 제목에 '방학식' 없이 '종업식'만 있을 때                                                         |
| `teachersDay` | —        | `오늘은 스승의 날이에요. 애쓰시는 선생님, 고맙습니다`      |                                                                                                 |
| `suneungEve`  | —        | `{date}은 수능이에요. 감독 가시는 선생님들, 오늘 힘내세요` | `{date}` 예: "11월 19일" — "내일"이라고 하지 않는다(spec)                                       |
| `schoolEvent` | —        | `오늘은 {title}예요. 무사히 잘 마치시길!`                  | `{title}` = 일정 제목(예: 체육대회). 받침 유무에 따라 '이에요'/'예요' 갈리는 조사 처리 필요(§9) |
| `ceremony`    | 입학식   | `오늘은 입학식이에요. 새로운 만남이 되시길`                |                                                                                                 |
|               | 졸업식   | `오늘은 졸업식이에요. 그동안 고생 많으셨어요`              |                                                                                                 |

- `vacationEve`의 여름/겨울/종업식 세 갈래는 `schoolMoments.ts`가 지금 구분하지 않는다(그냥 `isCeremonyEvent` 제목 매칭 하나). 계절 판정은 **일정 제목에 '여름'/'겨울'이 있으면 그대로, 없으면 월(7~8월=여름, 12~2월=겨울)로 추정**, '종업식' 단어가 제목에 있으면(월과 무관하게) 종업식 문구를 우선한다 — §9에 열린 질문으로 남긴다(현재 도메인 함수가 이 구분을 안 하므로 새 판정이 필요하다).
- `suneungEve`·`schoolEvent`는 spec 4-1·4-6이 준 예문을 그대로 살렸다.

---

## 7. 핀 모습 — 네 가지 정지 그림 (오너 확정, 2026-09-23)

기존 `sprite-pin.png`(256px 칸)의 가만히 있는 자세(0행 0열)에 소품을 얹은 **별도의 정지 그림 파일** 4장이다(스프라이트 시트가 아니다 — spec: "그날 모습은 가만히 있는 한 장"). 손 흔들기·만세 같은 응원 동작을 할 때는 이 그림을 안 쓰고 원래 시트로 되돌아간다(spec 4-5).

그림은 `scripts/pin-looks/draw_pin_looks.py`가 원래 핀 그림에서 그대로 만든다(몸 윤곽은 한 픽셀도 바꾸지 않는다). 그림 도구(Codex)가 사용 한도에 걸려 픽셀을 직접 그렸고, 오너가 시안을 보고 골랐다.

| 파일                           | 쓰이는 곳                 | 소품                                                                                                                                                                                                      |
| ------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/pin-look-season.png`   | `termStart`·`vacationEve` | **노란 반짝이 셋**(머리 양옆 큰 것 둘, 왼쪽 작은 것 하나). 오너가 새싹(A)보다 반짝이(B)를 골랐다 — 학기 시작과 방학 모두 "축하"로 읽힌다.                                                                 |
| `public/pin-look-flower.png`   | `teachersDay`             | **왼손에 쥔 카네이션.** 줄기가 손 **뒤로** 지나가 손 아래로 조금 나온다(원래 팔을 다시 얹어 쥔 것처럼 보이게). 윗부분이 들쭉날쭉한 빨강·분홍 꽃잎, 초록 꽃받침, 줄기에 붙은 잎 두 장.                     |
| `public/pin-look-headband.png` | `suneungEve`              | **이마를 둘러 감은 흰 머리띠.** 앞 가운데가 둥글게 내려오고(원통 앞면), 양 끝은 뒤로 돌아가며 얇고 어두워진다. 띠 아래 머리에 그림자. 오른쪽 옆에서 묶은 매듭과 뒤로 날리는 끈 두 가닥. 앞에 빨간 '필승'. |
| `public/pin-look-flag.png`     | `schoolEvent`·`ceremony`  | **오른손으로 쥔 노란 삼각 깃발.** 깃대가 손 뒤로 지나간다. 로고·글자 없음.                                                                                                                                |

- 네 그림 모두 몸 윤곽이 원래와 같다 — 소품만 다르다.
- 카드 핀 줄(24px)·토스트(28px)에서는 소품이 빨간 점·흰 띠·노란 깃발 정도로 읽힌다. 인사 조각(40px)과 확대 화면에서 자세히 보인다.
- 그림 파일이 없거나 못 읽으면 원래 idle 프레임을 보인다(spec 4-5) — `CheerPin`의 `look` 그림 `<img onError>`에서 원래 스프라이트로 조용히 되돌아간다.
- **아이콘 모드 핀(바탕화면 핀)은 건드리지 않는다** — `PinDisc.tsx`는 이 작업 범위 밖(spec 9).

---

## 8. 열린 질문 — 구현 때 정한 것

1. **`season` 소품**: 오너가 반짝이(B)를 골랐다(§7).
2. **`vacationEve`의 여름/겨울/종업식**: 제목에 '종업식'이 있으면 종업식 문구, 아니면 제목의 '여름'/'겨울', 없으면 달(7~8월 여름, 12~2월 겨울, 그 밖은 계절 없는 문구 "내일부터 방학이에요. 푹 쉬고 만나요")로 가른다. 계절을 모르면 계절을 말하지 않는다(짐작 금지).
3. **상담만 있는 주가 나중에 나타나는 문제**: 받아들인다(§1.3의 3번). 대기 표시를 두지 않는다.
4. **학교 행사 제목의 조사**: 받침 유무로 '이에요'/'예요'를 고르는 작은 함수를 둔다(한글이 아닌 끝 글자면 '이에요').
5. **반별 수업 줄의 순서**: 수업반 목록(`useTeachingClassStore.classes`) 순서, 보관한 반은 그 뒤.
6. **`talkNoticeText`**: 그날 말 전체(주인공 + 접힌 것)를 받아, 인사가 들어 있으면 인사 문구를 돌려주도록 넓힌다. 호출부 두 곳을 같이 고친다.

---

## Version History

| Version | Date       | Changes                                                                                                     | Author    |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 1.0     | 2026-09-23 | 초기 설계 — 한 주 정리·학기 돌아보기 숫자 줄, 인사 조각, 핀 줄·토스트 확장, PNG, 인사 문구 6종, 핀 모습 4종 | pblsketch |
| 1.1     | 2026-09-23 | 오너가 핀 시안을 고름(반짝이·손에 쥔 카네이션·감은 머리띠·쥔 깃발), 열린 질문 여섯 가지를 정함              | pblsketch |
