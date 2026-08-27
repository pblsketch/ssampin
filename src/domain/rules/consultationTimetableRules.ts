/**
 * 상담 예약 ↔ 수업 시간표 연동 규칙 (순수 함수).
 *
 * - React/Zustand/fetch/Electron 등 외부 의존 절대 금지 (같은 domain 모듈 참조는 허용).
 * - 부수효과 없음. 테스트 가능한 입력 → 출력 함수만 정의한다.
 *
 * ## 왜 이 파일이 생겼나
 *
 * 이 계산은 원래 `ConsultationCreateModal.tsx` 안에 있었고, **첫 번째 상담 날짜 하나의
 * 요일 시간표만** 보고 공강을 판별한 뒤 그 결과를 나머지 날짜에 그대로 복사했다.
 * 요일이 다른 날을 함께 열면 **교사가 수업 중인 시간에 학부모 예약이 들어왔다.**
 * 화면 안에 섞여 있어 자동 테스트로 고정할 수도 없었다.
 *
 * 그래서 "무엇을 뺄지"를 날짜별 순수 계산으로 분리한다. 판정 기준은 여기 하나뿐이고,
 * 화면은 결과를 그리기만 한다.
 *
 * 관련: `consultationRules.ts` 의 `buildBusyPeriods` 는 **만든 뒤** 행사·시간표 임시 변경과
 * 겹치는 슬롯을 막는다(사후 재계산). 이 파일은 **만들 때** 정규 시간표를 보고 시간대를
 * 정한다(사전 계산). 둘은 보는 대상도 시점도 다르다.
 */

import { periodTimeLabel } from './periodLabel';
import type { PeriodTime } from '../valueObjects/PeriodTime';

/** "HH:MM" → 분 */
function parseTime(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 분 → "HH:MM" */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** 시간 구간. 상담 가능 범위와 제외 구간 양쪽에 쓴다. */
export interface TimeRange {
  readonly startTime: string;
  readonly endTime: string;
}

/**
 * 제외 항목 키 — `${date}|${presetId}`.
 *
 * 학생 상담의 `selectedPresets` 가 이미 쓰는 형식과 같다(같은 화면 안 선례).
 * 날짜("YYYY-MM-DD")에도 교시 id("period-3"·"break-2"·"lunch")에도 `|` 가 없으므로
 * 첫 번째 `|` 로 자르면 안전하다.
 */
export function exclusionKey(date: string, presetId: string): string {
  return `${date}|${presetId}`;
}

/** `exclusionKey` 의 역함수. */
export function parseExclusionKey(key: string): { date: string; presetId: string } {
  const idx = key.indexOf('|');
  if (idx < 0) return { date: '', presetId: key };
  return { date: key.slice(0, idx), presetId: key.slice(idx + 1) };
}

/**
 * 전체 시간 범위에서 제외 구간을 빼고 남은 연속 구간 목록을 돌려준다.
 *
 * 분 단위 가용 배열을 만들어 제외 구간을 지운 뒤 연속 구간을 뽑는다.
 * 제외 구간이 범위 밖으로 삐져나가거나 서로 겹쳐도 안전하다.
 */
export function computeAvailableRanges(
  rangeStart: string,
  rangeEnd: string,
  excluded: readonly TimeRange[],
): TimeRange[] {
  const startMins = parseTime(rangeStart);
  const endMins = parseTime(rangeEnd);
  if (startMins >= endMins) return [];

  const available: boolean[] = new Array<boolean>(endMins - startMins).fill(true);
  for (const ex of excluded) {
    const exStart = Math.max(parseTime(ex.startTime) - startMins, 0);
    const exEnd = Math.min(parseTime(ex.endTime) - startMins, available.length);
    for (let i = exStart; i < exEnd; i++) available[i] = false;
  }

  const ranges: TimeRange[] = [];
  let i = 0;
  while (i < available.length) {
    if (!available[i]) {
      i++;
      continue;
    }
    const segStart = i;
    while (i < available.length && available[i]) i++;
    ranges.push({
      startTime: formatTime(startMins + segStart),
      endTime: formatTime(startMins + i),
    });
  }
  return ranges;
}

/** 시간대 프리셋 중 이 계산에 필요한 부분만. `BreakPreset` 이 구조적으로 들어맞는다. */
export interface PresetSlice {
  readonly id: string;
}

/**
 * 하루를 조례 전 → 교시 → 쉬는 시간 → 점심 → 종례 후 로 쪼갠 시간대 목록의 한 칸.
 *
 * id 규칙 — `before-school` · `period-N` · `break-N` · `lunch` · `after-school`.
 * 이 id 가 제외 키(`날짜|id`)의 뒷부분이 되므로 형식이 곧 계약이다.
 */
export interface BreakPreset {
  readonly id: string;
  readonly label: string;
  readonly startTime: string;
  readonly endTime: string;
}

/**
 * 교시 시간 설정에서 하루 시간대 목록을 만든다. **요일과 무관하다** — 어느 날이든 같다.
 * 날짜마다 달라지는 것은 "그 교시가 공강이냐"뿐이고, 그건 `computeDefaultExclusions` 가 본다.
 *
 * 점심 판별: `lunchStart`/`lunchEnd` 설정이 있으면 그 범위에 들어가는 쉬는 시간,
 * 없으면 30분 이상인 가장 긴 간격을 점심으로 본다.
 *
 * 교시 이름은 `periodTimeLabel` 에 위임한다 — 교사가 붙인 이름("창체")을 화면마다 따로
 * 만들면 그 화면에서만 조용히 무시된다(periodLabelHardcoding 메타 테스트가 지키는 계약).
 */
export function computeBreakPresets(
  periodTimes: readonly PeriodTime[],
  lunchStart?: string,
  lunchEnd?: string,
): BreakPreset[] {
  if (periodTimes.length === 0) return [];
  const sorted = [...periodTimes].sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const presets: BreakPreset[] = [];

  // 조례 전
  const firstStart = parseTime(sorted[0]!.start);
  presets.push({
    id: 'before-school',
    label: '조례 전',
    startTime: formatTime(Math.max(firstStart - 20, 0)),
    endTime: sorted[0]!.start,
  });

  // 점심 fallback 계산 — 가장 긴 간격(>= 30분)
  let longestGapIdx = -1;
  let longestGap = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = parseTime(sorted[i + 1]!.start) - parseTime(sorted[i]!.end);
    if (gap > longestGap) {
      longestGap = gap;
      longestGapIdx = i;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    presets.push({
      id: `period-${sorted[i]!.period}`,
      label: periodTimeLabel(sorted[i]!),
      startTime: sorted[i]!.start,
      endTime: sorted[i]!.end,
    });

    if (i < sorted.length - 1) {
      const endMins = parseTime(sorted[i]!.end);
      const nextStartMins = parseTime(sorted[i + 1]!.start);
      if (nextStartMins <= endMins) continue;
      const isLunch =
        lunchStart && lunchEnd
          ? endMins >= parseTime(lunchStart) && nextStartMins <= parseTime(lunchEnd)
          : i === longestGapIdx && longestGap >= 30;
      presets.push({
        id: isLunch ? 'lunch' : `break-${sorted[i]!.period}`,
        label: isLunch ? '점심 시간' : `${periodTimeLabel(sorted[i]!)} 후 쉬는 시간`,
        startTime: sorted[i]!.end,
        endTime: sorted[i + 1]!.start,
      });
    }
  }

  // 종례 후
  const lastEnd = parseTime(sorted[sorted.length - 1]!.end);
  presets.push({
    id: 'after-school',
    label: '종례 후',
    startTime: sorted[sorted.length - 1]!.end,
    endTime: formatTime(lastEnd + 30),
  });

  return presets;
}

/** 한 날짜에서 "수업 중"인 시간 구간만 뽑는다. 공강·쉬는 시간·점심·조례 전후는 제외. */
export function classTimeRangesFor(params: {
  readonly presets: readonly PresetTimeSlice[];
  readonly freePeriods: ReadonlySet<number> | null;
}): TimeRange[] {
  if (params.freePeriods === null) return [];
  const free = params.freePeriods;
  return params.presets
    .filter((p) => {
      const n = periodNumberOf(p.id);
      return n !== null && !free.has(n);
    })
    .map((p) => ({ startTime: p.startTime, endTime: p.endTime }));
}

/** `findClassTimeOpenSlots` 가 보는 슬롯의 최소 형태. */
export interface SlotSlice {
  readonly id: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
}

/**
 * **이미 만들어진** 상담 슬롯 중 "그 날 수업 중인데 아직 열려 있는" 것을 찾는다.
 *
 * ## 왜 찾기만 하고 막지는 않나
 *
 * 상담 일정을 만든 뒤에 정규 시간표가 바뀌면 앱은 그 사실을 몰랐다. 그렇다고 겹치는 슬롯을
 * **자동으로 막으면 안 된다** — "수업 시간에 슬롯이 열려 있다"가 실수인지 의도인지 앱은
 * 구분할 수 없기 때문이다. 상담 주간이라 수업을 단축했거나 보결을 구해 둔 선생님은
 * 일부러 열어 둔 것이고, 그걸 조용히 닫으면 학부모 예약 페이지에서 자리가 사라진다.
 *
 * ADR-060 이 기록한 사고가 정확히 이 판단을 반대 방향으로 했던 것이다 — 앱이 "잘못 막힌
 * 것 같다"며 교사의 수동 차단을 풀었고, 그 시간에 학부모 예약이 들어왔다.
 *
 * 그래서 이 함수는 **알려 주기만** 한다. 막을지는 화면에서 교사가 정한다.
 *
 * @returns openSlotIds  아직 예약이 없고 열려 있는데 수업과 겹치는 슬롯 (교사가 막을 후보)
 * @returns bookedSlotIds 이미 예약이 들어왔는데 수업과 겹치는 슬롯 (막을 수 없음 — 알리기만)
 */
export function findClassTimeOpenSlots(params: {
  readonly slots: readonly SlotSlice[];
  readonly presets: readonly PresetTimeSlice[];
  readonly freePeriodsByDate: ReadonlyMap<string, ReadonlySet<number> | null>;
  readonly bookedSlotIds: ReadonlySet<string>;
}): { openSlotIds: string[]; bookedSlotIds: string[] } {
  const rangesByDate = new Map<string, TimeRange[]>();
  const rangesFor = (date: string): TimeRange[] => {
    const cached = rangesByDate.get(date);
    if (cached) return cached;
    const free = params.freePeriodsByDate.has(date)
      ? (params.freePeriodsByDate.get(date) ?? null)
      : null;
    const ranges = classTimeRangesFor({ presets: params.presets, freePeriods: free });
    rangesByDate.set(date, ranges);
    return ranges;
  };

  const openSlotIds: string[] = [];
  const bookedSlotIds: string[] = [];

  for (const slot of params.slots) {
    const ranges = rangesFor(slot.date);
    if (ranges.length === 0) continue;

    const s = parseTime(slot.startTime);
    const e = parseTime(slot.endTime);
    if (e <= s) continue;
    const overlaps = ranges.some((r) => s < parseTime(r.endTime) && parseTime(r.startTime) < e);
    if (!overlaps) continue;

    if (params.bookedSlotIds.has(slot.id)) bookedSlotIds.push(slot.id);
    else if (slot.status === 'available') openSlotIds.push(slot.id);
    // status === 'blocked' 인 것은 이미 막혀 있으니 알릴 것이 없다
  }

  return { openSlotIds, bookedSlotIds };
}

/**
 * 한 날짜의 상담 가능 범위에서 **그 날 수업 중인 시간만** 빼고 남은 구간을 돌려준다.
 *
 * 편집 화면의 "수업 시간 빼기" 버튼이 쓴다. 생성 화면처럼 제외 목록을 계속 들고 있지
 * 않고 **누른 그 순간 한 번** 계산해 시간대를 쪼갠다.
 *
 * `freePeriods` 가 null(시간표 없는 날)이면 뺄 근거가 없으므로 원래 범위를 그대로 준다.
 */
export function splitRangeByClassTime(params: {
  readonly startTime: string;
  readonly endTime: string;
  /** `label` 은 쓰지 않는다 — `BreakPreset` 이 구조적으로 들어맞는다. */
  readonly presets: readonly PresetTimeSlice[];
  readonly freePeriods: ReadonlySet<number> | null;
}): TimeRange[] {
  const excludedIds = computeDefaultExclusions({
    presets: params.presets,
    freePeriods: params.freePeriods,
    mode: 'classOnly',
  });
  if (excludedIds.size === 0) {
    return [{ startTime: params.startTime, endTime: params.endTime }];
  }
  const excluded = params.presets
    .filter((p) => excludedIds.has(p.id))
    .map((p) => ({ startTime: p.startTime, endTime: p.endTime }));
  return computeAvailableRanges(params.startTime, params.endTime, excluded);
}

/** 프리셋 id 가 수업 교시("period-N")면 교시 번호, 아니면 null. */
export function periodNumberOf(presetId: string): number | null {
  if (!presetId.startsWith('period-')) return null;
  const n = Number.parseInt(presetId.slice('period-'.length), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 기본 제외 모드.
 *
 * - `classOnly` — 공강이 아닌 **수업 교시만** 제외한다. 쉬는 시간·점심은 상담 가능으로 남긴다.
 *                 ("수업 시간 제외" 토글을 켤 때의 기본값)
 * - `freeOnly`  — 수업 교시 + 쉬는 시간 + 점심까지 제외해 **공강만** 남긴다.
 *                 ("공강만 상담 가능" 버튼)
 *
 * 두 모드 모두 조례 전·종례 후는 **언제나 남긴다** — 수업이 없는 시간이라 상담에 쓸 수 있고,
 * 실제로 학부모 상담이 가장 많이 잡히는 시간대다.
 */
export type ExclusionMode = 'classOnly' | 'freeOnly';

/**
 * 한 날짜의 기본 제외 교시를 정한다. 돌려주는 값은 **presetId 집합**(날짜 없음).
 *
 * `freePeriods` 가 `null` 이면 **아무것도 제외하지 않는다.**
 *   그 날은 시간표 자체가 없다는 뜻이다(토·일에 주말 시간표를 안 켠 경우 등).
 *   이때 빈 집합을 "공강이 하나도 없다"로 읽으면 **모든 교시가 수업으로 분류되어 전부 막히고
 *   그 날 슬롯이 0개가 된다.** 시간표가 없는 날은 막을 근거도 없으므로 전부 연다.
 *   ★`null`(시간표 없음)과 빈 Set(시간표는 있는데 공강이 0교시)은 다른 뜻이다.
 */
export function computeDefaultExclusions(params: {
  readonly presets: readonly PresetSlice[];
  readonly freePeriods: ReadonlySet<number> | null;
  readonly mode: ExclusionMode;
}): Set<string> {
  const result = new Set<string>();
  if (params.freePeriods === null) return result;

  for (const preset of params.presets) {
    if (preset.id === 'before-school' || preset.id === 'after-school') continue;

    const periodNum = periodNumberOf(preset.id);
    if (periodNum !== null) {
      // 수업 교시 — 공강이 아니면 제외
      if (!params.freePeriods.has(periodNum)) result.add(preset.id);
      continue;
    }

    // 쉬는 시간·점심 — freeOnly 에서만 제외
    if (params.mode === 'freeOnly') result.add(preset.id);
  }
  return result;
}

/**
 * 여러 날짜의 기본 제외를 한 번에 계산해 `date|presetId` 키 집합으로 돌려준다.
 * `freePeriodsByDate` 에 없는 날짜는 "시간표 모름"으로 보고 제외하지 않는다.
 */
export function computeDefaultExclusionKeys(params: {
  readonly dates: readonly string[];
  readonly presets: readonly PresetSlice[];
  readonly freePeriodsByDate: ReadonlyMap<string, ReadonlySet<number> | null>;
  readonly mode: ExclusionMode;
}): Set<string> {
  const keys = new Set<string>();
  for (const date of params.dates) {
    if (!date) continue;
    const free = params.freePeriodsByDate.has(date)
      ? (params.freePeriodsByDate.get(date) ?? null)
      : null;
    const ids = computeDefaultExclusions({
      presets: params.presets,
      freePeriods: free,
      mode: params.mode,
    });
    for (const id of ids) keys.add(exclusionKey(date, id));
  }
  return keys;
}

/** 시간대 프리셋 + 시각. `buildExcludedTimesByDate` 입력용. */
export interface PresetTimeSlice extends PresetSlice, TimeRange {}

/**
 * 날짜별 제외 키 집합 → **날짜별 제외 시간 구간 목록**.
 *
 * 프리셋에서 온 제외와 교사가 직접 넣은 제외(`customByDate`)를 한 날짜 아래로 합친다.
 * 어느 프리셋에도 해당하지 않는 키는 조용히 버린다(교시 설정이 바뀌어 id 가 사라진 경우).
 */
export function buildExcludedTimesByDate(params: {
  readonly excludedKeys: ReadonlySet<string>;
  readonly presets: readonly PresetTimeSlice[];
  readonly customByDate?: ReadonlyMap<string, readonly TimeRange[]>;
}): Map<string, TimeRange[]> {
  const presetById = new Map<string, PresetTimeSlice>();
  for (const p of params.presets) presetById.set(p.id, p);

  const result = new Map<string, TimeRange[]>();

  for (const key of params.excludedKeys) {
    const { date, presetId } = parseExclusionKey(key);
    if (!date) continue;
    const preset = presetById.get(presetId);
    if (!preset) continue;
    const list = result.get(date) ?? [];
    list.push({ startTime: preset.startTime, endTime: preset.endTime });
    result.set(date, list);
  }

  if (params.customByDate) {
    for (const [date, ranges] of params.customByDate) {
      if (!date || ranges.length === 0) continue;
      const list = result.get(date) ?? [];
      for (const r of ranges) list.push({ startTime: r.startTime, endTime: r.endTime });
      result.set(date, list);
    }
  }

  return result;
}
