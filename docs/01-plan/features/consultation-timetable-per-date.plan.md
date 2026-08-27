상태: **승인됨 (2026-08-27, 오너) — 범위 M1~M3 전부**

# 상담 예약 시간표 연동 — 날짜별로 계산하기 (A안) · 계획서 v1

**작성일: 2026-08-27 · 대상 브랜치: main (공유 워킹트리) · 확정 ADR: ADR-076**

> 읽는 분께: 이 문서는 코드를 고치지 않습니다. "무엇을, 어떤 순서로, 무엇이 되면 끝난 것으로
> 볼지"만 정합니다. 개발 용어에는 쉬운 뜻을 붙였습니다.

---

## 0. 한 줄 요약

학부모 상담 만들 때 **"수업 시간 제외"가 첫 번째 날짜 하루의 요일 시간표만 보고 계산**해서,
나머지 날짜에도 그 결과를 그대로 복사한다. 이걸 **날짜마다 각자의 요일 시간표를 보도록** 고친다.

---

## 1. 현재 소스 기준 사실 확인

모두 실제 파일을 열어 확인한 내용이다. 행 번호는 2026-08-27 기준.

### 1.1 공강 판별이 첫 날짜 하나로 고정돼 있다

`ConsultationCreateModal.tsx:248-259`

```ts
// Use first parent date to determine free periods
const targetDate = type === 'parent' && dates.length > 0 ? dates[0]?.date : undefined;
if (!targetDate) return new Set<number>();
const schedule = getEffectiveTeacherSchedule(targetDate, settings.enableWeekendDays);
```

`getEffectiveTeacherSchedule(날짜)`는 그 날짜의 **요일**을 뽑아 해당 요일 시간표를 돌려준다
(`useScheduleStore.ts:321-328`). 즉 공강 판별은 **맨 위 날짜의 요일 하나**로 끝난다.

주석이 영어로 남아 있는 것에서 보이듯 **임시 구현이었고 그대로 굳었다.**
`git log -L`로 확인 — 기능이 처음 들어온 v2.0.4 시점 커밋 그대로이고 이후 손댄 적 없다.
새로 생긴 회귀가 아니라 **처음부터 미완성이던 부분**이다.

### 1.2 제외 시간 목록이 날짜별이 아니라 하나뿐이다

`ConsultationCreateModal.tsx:262-272`의 `excludedTimes`는 `{startTime, endTime}` 배열
**하나**다. 날짜 정보가 없다. 이 하나를 슬롯 만드는 세 곳이 모든 날짜에 똑같이 적용한다.

| 위치                        | 하는 일                         |
| --------------------------- | ------------------------------- |
| `:541-555` `slotPreview`    | 날짜별 "N슬롯" 미리보기 숫자    |
| `:565-593` `generatedSlots` | 3단계 슬롯 미리보기 / 개별 차단 |
| `:632-640` `handleCreate`   | **실제 저장되는 시간대**        |

세 곳 모두 `computeAvailableRanges(d.startTime, d.endTime, excludedTimes)` — 날짜(`d.date`)를
전달하지 않는다.

### 1.3 실제로 벌어지는 사고

|                  | 월요일(첫 날짜)          | 화요일(둘째 날짜)                                                       |
| ---------------- | ------------------------ | ----------------------------------------------------------------------- |
| 실제 시간표      | 1·2교시 수업, 3교시 공강 | 1교시 공강, 3교시 **수업**                                              |
| 앱이 적용하는 것 | 1·2교시 막고 3교시 염    | 1·2교시 막고 3교시 **염**                                               |
| 결과             | 정상                     | 🔴 **수업 중인 3교시에 학부모 예약이 들어옴** + 비어 있는 1교시는 못 씀 |

"기능이 안 된다" 수준이 아니라 **선생님이 수업하고 있는 시간에 학부모가 찾아오는** 사고다.
그리고 예약이 이미 잡힌 뒤에는 되돌리는 데 학부모 연락이 필요하다.

### 1.4 화면에 "어느 날 기준인지" 표시가 없다

`:1209-1274` "시간표 기반 제외 시간" 패널은 교시마다 **공강 / 수업** 뱃지를 붙이는데,
그게 **어느 날짜 기준인지는 어디에도 안 적혀 있다.** 그래서 선생님은 모든 날짜에 맞게
계산된 줄로 읽는다. 조용히 틀리는 종류라 신고가 늦게 들어온다.

### 1.5 날짜·시간을 건드리면 수동 조정이 초기화된다 (딸린 문제)

`:274-289`의 자동 채움 로직이 `freePeriodSet`이 바뀔 때마다 실행되는데,
`freePeriodSet`은 `dates` **배열 전체**를 보고 다시 만들어진다(`:259`).
날짜 칸이나 시작·종료 시간을 한 글자만 고쳐도 배열이 새로 생기므로,
**"공강만 상담 가능" 버튼으로 맞춰 둔 선택이나 손으로 체크 해제한 것이 통째로 되돌아간다.**

### 1.6 주말을 상담일로 넣으면 슬롯이 0개가 된다 (지금도 있는 문제)

`getDayOfWeek`(`periodRules.ts:18-27`)는 토·일에 `settings.enableWeekendDays` 설정이 없으면
`null`을 준다 → 시간표가 빈 배열 → 공강 교시 0개 → **모든 교시가 "수업"으로 분류되어 전부 제외**
→ 그 날 슬롯이 0개. 지금은 첫 날짜가 평일이면 가려져 있지만, 날짜별로 고치는 순간
**주말·시간표 없는 날마다 이 문제가 그대로 드러난다.** 이번에 같이 막아야 한다.

### 1.7 뒤에서 받아주는 안전망이 없다

만든 뒤 도는 자동 재계산(`useConsultationStore.ts:423-460`)은 날짜를 전부 훑기는 하지만,
보는 대상이 **학교 행사(`SchoolEvent`)와 시간표 임시 변경(`TimetableOverride`)뿐**이다
(`consultationRules.ts:242-290` `buildBusyPeriods`). **정규 수업 시간표는 안 본다.**
그리고 편집 모달(`ConsultationEditModal.tsx`, 504행)에는 시간표 연동 기능 자체가 없다.
= 생성 시점에 틀리면 **끝까지 틀린 채로 간다.**

### 1.8 ★ 좋은 소식 1 — 저장 형식은 이미 준비돼 있다

`ConsultationSchedule.dates`는 `{date, startTime, endTime}`의 **배열**이다
(`Consultation.ts:14, 29-33`). **같은 날짜가 여러 줄 들어가도 된다.**
지금도 "수업 시간 제외"를 켜면 하루가 여러 조각으로 쪼개져 저장된다(`:632-640` `flatMap`).

→ **저장 형식·서버·학부모 예약 화면은 손댈 필요가 없다.** 바뀌는 건 "무엇을 뺄지 계산하는
방법"과 "그걸 보여주는 화면"뿐이다. 이미 만들어진 상담 일정도 그대로 열린다.

### 1.9 ★ 좋은 소식 2 — 같은 파일에 이미 정답 사례가 있다

**학생 상담**은 이미 날짜별로 시간대를 고른다. 키를 `date|presetId` 형태로 만들어
한 집합에 담는 방식이다(`:139-148` `presetKey` / `parsePresetKey`, `:222` `selectedPresets`).

→ 학부모 상담도 **같은 파일 안에 있는 같은 방식**을 그대로 쓰면 된다. 새로 발명할 게 없다.

---

## 2. 이번 작업의 범위

### 하는 것

1. 공강 판별을 **날짜마다** 각자의 요일 시간표로 계산
2. 제외 시간 목록을 **날짜별**로 보관·적용
3. 시간표가 없는 날(주말 등)은 **제외하지 않고 전부 열기**
4. 화면에 **날짜와 요일을 명시**하고, 날짜별로 조정 가능하게
5. 날짜·시간을 고쳐도 **수동 조정이 살아남게**
6. 계산 부분을 순수 규칙(`domain/`)으로 빼서 **자동 테스트로 고정**

### 안 하는 것 (이번엔 손대지 않음)

| 항목                               | 이유                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| 저장 형식(`ConsultationDate`) 변경 | §1.8 — 이미 되고 있다. 건드리면 기존 일정이 깨진다    |
| 서버·학부모 예약 화면              | 슬롯만 읽는다. 영향 없음                              |
| 학생 상담 흐름                     | 이미 날짜별로 맞게 동작한다                           |
| 자동 재계산에 정규 시간표 추가     | 별건. §8 판단거리 2                                   |
| 편집 모달에 시간표 연동 추가       | 별건. §8 판단거리 1                                   |
| `computeBreakPresets` 위치 이동    | 날짜와 무관하게 잘 동작한다. 필요 없는 이동은 안 한다 |

---

## 3. 설계

### S1. 계산을 순수 규칙으로 뺀다 — `consultationTimetableRules.ts` (신규)

**왜**: 지금 계산이 화면 파일 안에 섞여 있어 자동 테스트로 고정할 수가 없다. 이번 사고처럼
"조용히 틀리는" 문제는 테스트가 없으면 또 난다. `domain/`은 화면·저장소를 모르는 순수 계산
계층이라 테스트하기 쉽다.

`src/domain/rules/consultationTimetableRules.ts` — 외부 import 0 (아키텍처 규칙 §domain).

```ts
/** 제외 항목 키: `${date}|${presetId}` — 학생 상담 selectedPresets 와 같은 형식 */
export function exclusionKey(date: string, presetId: string): string;
export function parseExclusionKey(key: string): { date: string; presetId: string };

/** 전체 범위에서 제외 구간을 빼고 남은 연속 구간 (기존 computeAvailableRanges 를 옮긴 것) */
export function computeAvailableRanges(
  rangeStart: string,
  rangeEnd: string,
  excluded: readonly { startTime: string; endTime: string }[],
): { startTime: string; endTime: string }[];

/**
 * 한 날짜의 기본 제외 교시를 정한다.
 * - freePeriods 가 null  → 시간표가 없는 날(주말 등). **아무것도 제외하지 않는다** (§1.6)
 * - mode 'classOnly'     → 공강이 아닌 수업 교시만 제외 (지금 토글 기본값)
 * - mode 'freeOnly'      → 수업 + 쉬는 시간 + 점심까지 제외 ("공강만 상담 가능" 버튼)
 *                          조례 전·종례 후는 언제나 남긴다
 */
export function computeDefaultExclusions(params: {
  presets: readonly { id: string }[];
  freePeriods: ReadonlySet<number> | null;
  mode: 'classOnly' | 'freeOnly';
}): Set<string>; // presetId 집합

/** 날짜별 제외 키 집합 → 날짜별 시간 구간 목록 */
export function buildExcludedTimesByDate(params: {
  excludedKeys: ReadonlySet<string>;
  presets: readonly { id: string; startTime: string; endTime: string }[];
  customByDate: ReadonlyMap<string, readonly { startTime: string; endTime: string }[]>;
}): Map<string, { startTime: string; endTime: string }[]>;
```

`presets`·`freePeriods`를 **인자로 받는다**(구조적 타입). 그래서 `BreakPreset` 타입이나
`computeBreakPresets`를 옮길 필요가 없다 — 기존 `isSlotBlockedByTimetable`
(`consultationRules.ts:122`)이 이미 쓰는 관용구다.

### S2. 제외 목록을 날짜별로 — 키 형식 하나만 바꾼다

```
지금:  excludedPeriodIds: Set<"period-3">
이후:  excludedPeriodIds: Set<"2026-03-02|period-3">
```

`presetKey`/`parsePresetKey`가 이미 `indexOf('|')` 기준으로 자른다(`:145-148`).
날짜(`YYYY-MM-DD`)에도 교시 id(`period-3`, `break-2`, `lunch`)에도 `|`가 없으므로 안전하다.

`customExclusions`(직접 추가한 제외 시간)도 같이 날짜별이 되어야 한다 —
`{ date, startTime, endTime, label }`로 필드 하나 추가.

### S3. 공강표를 "날짜 목록"에만 반응하게 — §1.5 초기화 문제 해결

핵심은 **"날짜 목록이 실제로 바뀌었을 때만" 다시 계산**하게 만드는 것이다.

```ts
// 날짜 문자열만 뽑아 정렬해 이어 붙인다 — 시간만 고치면 이 값은 그대로다
const dateKeysCsv = useMemo(
  () =>
    dates
      .map((d) => d.date)
      .filter(Boolean)
      .sort()
      .join(','),
  [dates],
);

const freePeriodsByDate = useMemo(() => {
  const map = new Map<string, Set<number> | null>();
  for (const ds of dateKeysCsv ? dateKeysCsv.split(',') : []) {
    const schedule = getEffectiveTeacherSchedule(ds, settings.enableWeekendDays);
    if (schedule.length === 0) {
      map.set(ds, null); // 시간표 없는 날 (§1.6)
      continue;
    }
    const free = new Set<number>();
    schedule.forEach((p, i) => {
      if (p === null) free.add(i + 1);
    });
    map.set(ds, free);
  }
  return map;
}, [dateKeysCsv, getEffectiveTeacherSchedule, settings.enableWeekendDays]);
```

시작·종료 시간만 고치면 `dateKeysCsv`가 **같은 문자열**이라 `freePeriodsByDate`는 다시
만들어지지 않는다 → 자동 채움도 안 돈다 → 수동 조정이 살아남는다.

### S4. 새 날짜만 채우고 기존 선택은 건드리지 않는다

"이 날짜는 이미 기본값을 채웠다"를 따로 기억한다. 안 그러면 _"제외를 전부 해제한 날짜"_ 와
_"아직 안 채운 날짜"_ 를 구별할 수 없어 해제가 계속 되살아난다.

```ts
const [seededDates, setSeededDates] = useState<Set<string>>(new Set());
```

| 상황                     | 동작                                                |
| ------------------------ | --------------------------------------------------- |
| "수업 시간 제외" 끔 → 켬 | 현재 모든 날짜를 기본값으로 채우고 전부 `seeded`    |
| 날짜 추가                | **그 날짜만** 기본값으로 채움. 나머지는 그대로      |
| 날짜 값 변경(요일 바뀜)  | 옛 키는 사라지고 새 키가 등장 → 새 날짜만 다시 채움 |
| 날짜 삭제                | 그 날짜의 제외 키·`seeded` 항목 정리                |
| 시작·종료 시간 변경      | **아무 일도 안 일어남** (S3 덕분)                   |
| "수업 시간 제외" 켬 → 끔 | 전부 비움 (지금과 동일)                             |

### S5. 화면 — 제외 목록을 날짜 카드 안으로

현재는 날짜 목록 **아래**에 제외 패널이 하나 있다. 이걸 **각 날짜 카드 안**으로 옮긴다.
학생 상담이 이미 그렇게 생겼다(`:911-1000`) — 같은 화면 안에서 두 흐름이 같은 모양이 된다.

```
┌─ 3월 2일 (월)  ────────────────  🗑 ─┐
│ 09:00 ~ 17:00              → 4슬롯   │
│ ▸ 수업 시간 제외됨 · 5개 시간대   ⌄  │   ← 접힌 상태가 기본
└──────────────────────────────────────┘
        펼치면 ↓ (그 날짜의 시간표 기준)
        ☒ 1교시 09:00~09:50  [수업]
        ☐ 2교시 10:00~10:50  [공강]  상담가능
        ...
```

- 카드 머리에 **날짜 + 요일**을 적는다 → §1.4의 "어느 날 기준인지 모름"이 사라진다
- 시간표가 없는 날은 뱃지 대신 **"이 날은 시간표가 없어 전부 열립니다"** 안내
- "공강만 상담 가능" 버튼은 **전체 날짜 일괄 적용**으로 유지 (누르면 모든 날짜에 `freeOnly` 적용)

> ⚠️ **화면 구조가 바뀌는 작업이다.** 프로젝트 규칙상 UI/UX는 단독으로 진행하지 않는다 —
> M3 시작 전에 프론트엔드 디자인 담당과 접힘/펼침 형태, 요약 줄 문구, 날짜 카드 밀도를
> 먼저 맞춘다. `docs/design-system.md`의 `sp-*` 토큰만 쓰고 하드코딩 색상은 넣지 않는다.

### S6. 슬롯 계산에 날짜를 넘긴다

`slotPreview`(`:538`) · `generatedSlots`(`:560`) · `handleCreate`(`:620`) 세 곳이
`excludedTimes` 하나 대신 `excludedTimesByDate.get(d.date) ?? []`를 쓴다.
**계산 방식은 그대로**이고 입력만 날짜별로 바뀐다.

---

## 4. 변경 파일 목록

| 파일                                                                        | 신규 | 무엇을                                                                         |
| --------------------------------------------------------------------------- | :--: | ------------------------------------------------------------------------------ |
| `src/domain/rules/consultationTimetableRules.ts`                            |  ✅  | S1의 순수 계산 함수 4종                                                        |
| `src/domain/rules/consultationTimetableRules.test.ts`                       |  ✅  | 위 함수들의 테스트 (평면 배치 — 형제 `consultationRules.test.ts`와 동일)       |
| `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx` |      | S2~S6. 상태 3개 키 변경 + `computeAvailableRanges` import로 교체 + 화면 재배치 |

**3개 파일뿐이다.** 저장소·서버·스토어·엔티티는 손대지 않는다(§1.8).

`git status` 확인 — 다른 세션이 잡고 있는 파일과 겹치지 않는다
(현재 수정 중: `supabase/functions/ssampin-chat/index.ts`, `landing/*`).

---

## 5. 마일스톤 (커밋 단위)

| #      | 내용                                                                               | 되돌리기    |
| ------ | ---------------------------------------------------------------------------------- | ----------- |
| **M1** | `consultationTimetableRules.ts` + 테스트 신설. **화면은 아직 안 씀** — 동작 변화 0 | 파일 삭제   |
| **M2** | 계산 배선 교체 (S2·S3·S4·S6). 화면 배치는 그대로 두고 **동작만 날짜별로**          | M2만 revert |
| **M3** | 화면 재배치 (S5) — **디자인 담당과 협업 후 착수**                                  | M3만 revert |

M1→M2가 이 작업의 실질이다. **M2까지만 나가도 사고는 막힌다**(계산이 맞아진다).
M3는 "선생님이 그 사실을 화면에서 확인할 수 있게" 하는 단계다.

---

## 6. 검증 계획

### 6.1 자동 (M1)

`consultationTimetableRules.test.ts` — 아래가 전부 통과해야 M2로 간다.

| #   | 케이스                                  | 기대                                                   |
| --- | --------------------------------------- | ------------------------------------------------------ |
| 1   | 월 3교시 공강 / 화 3교시 수업 → 두 날짜 | 월은 3교시 열림, **화는 3교시 닫힘** (핵심 회귀 방지)  |
| 2   | `freePeriods = null` (주말·시간표 없음) | 제외 0건 — 전부 열림 (§1.6)                            |
| 3   | `mode: 'classOnly'`                     | 수업 교시만. 점심·쉬는 시간은 남는다                   |
| 4   | `mode: 'freeOnly'`                      | 수업+점심+쉬는 시간 제외, **조례 전·종례 후는 남는다** |
| 5   | `computeAvailableRanges`                | 옮기기 전 함수와 같은 결과 (경계·겹침·전체 제외 포함)  |
| 6   | 키 왕복                                 | `parseExclusionKey(exclusionKey(d, p))` === `{d, p}`   |

### 6.2 게이트 (M2·M3 각각)

```bash
npx tsc --noEmit          # 에러 0
npm run lint              # 통과
npm run test              # Vitest 통과
npm run regression-check  # 통과
```

> ★ 현재 `npm run test`는 CI에서 무관한 이유로 2건 실패 중이다
> (`coolMessenger.test.ts` OS 가드 없음 · `observationSlotLifecycle.test.ts` 옆 저장소 참조).
> **이번 작업과 무관하며 이 계획으로 고치지 않는다.** 로컬 판정은 이 2건을 제외하고 본다.

### 6.3 실화면 확인 (M3 후, 코드만 보고 통과 선언 금지)

1. **핵심 시나리오** — 요일이 다른 이틀(월·화)을 넣고 "수업 시간 제외" 켜기
   → 두 날짜의 공강 뱃지가 **서로 다르게** 뜨고, 슬롯 수도 다르게 나오는지
2. 3단계 미리보기의 시간이 **실제로 수업 없는 시간인지** 시간표 화면과 대조
3. 저장 후 상담 상세 화면에서 날짜별 슬롯 시간 재확인
4. 시간 범위를 고쳐도 손으로 해제한 제외가 **살아 있는지** (§1.5)
5. **토요일**을 날짜로 넣었을 때 슬롯이 0이 아닌지 (§1.6)
6. 날짜 추가·삭제를 반복해도 다른 날짜 선택이 안 흔들리는지

---

## 7. 되돌리기

M1~M3 각각 독립 커밋이라 문제가 생긴 단계만 `git revert` 하면 된다.
저장 형식을 안 바꾸므로(§1.8) **되돌려도 이미 만들어진 상담 일정과 예약은 그대로다.**
가장 나쁜 경우 M2·M3를 되돌리면 오늘과 똑같은 상태로 돌아간다.

---

## 8. 판단거리 — 오너 결정 필요

### 1. 편집 모달에도 시간표 연동을 넣을까?

지금은 **만들 때만** 시간표를 볼 수 있고, 만든 뒤 날짜를 고치면 시간표를 다시 못 본다
(`ConsultationEditModal.tsx`에 해당 기능 없음). 이번에 같이 넣으면 일관되지만 작업이
1.5배쯤 늘고, 이미 예약이 들어온 슬롯을 건드리는 판정(`analyzeScheduleUpdateImpact`)과
얽힌다.

- **권장: 이번엔 안 넣는다.** 생성 시점이 맞아지면 사고는 막힌다. 편집은 별도 작업으로.

### 2. 자동 재계산이 정규 시간표도 보게 할까?

`buildBusyPeriods`(§1.7)가 행사·임시변경만 본다. 정규 시간표까지 보게 하면 **상담 일정을
만든 뒤에 시간표가 바뀌어도** 자동으로 막아 준다 — 진짜 안전망이 생긴다.

다만 이건 **이미 예약된 슬롯을 나중에 차단 후보로 만드는** 변화라, ADR-060(교사가 막은
슬롯은 자동 재계산이 건드리지 않는다)과 함께 다시 따져야 한다.

- **권장: 별도 계획으로 분리.** 이번 A안의 성격(생성 시점 계산 정확도)과 다른 문제다.

### 3. M3(화면 재배치)를 이번에 같이 갈까, 나눌까?

M2까지만 나가면 **계산은 맞지만 화면은 여전히 "어느 날 기준인지" 안 보인다**(§1.4).
선생님 입장에서는 "고쳐졌는지 확인할 방법이 없는" 상태다.

- **권장: M3까지 같이 간다.** 대신 디자인 담당과 먼저 맞추고 시작한다.

---

## 9. 다음 행동

이 계획서가 승인되면:

1. `DECISIONS.md`에 **ADR-076** 추가 완료. ★다른 세션이 같은 날 ADR-075 를 먼저 커밋해 번호가 겹쳤고, 내 것을 076 으로 옮겼다
2. M1 착수 (순수 규칙 + 테스트, 동작 변화 0)
3. M2 착수 후 게이트 4종 실행
4. M3는 디자인 담당과 형태 합의 후 착수
