/**
 * 학교별 개학일 규칙 — "지금이 몇 학기인가"의 표시용 정본.
 *
 * `academicCalendar.academicTerm()`은 달력만 보고 3~8월=1학기, 9~12월=2학기로 파생한다.
 * 그런데 8월 중순에 2학기를 개학하는 학교가 실제로 많아서, 그런 학교는 9월 1일이 되기 전까지
 * 앱 전체가 1학기로 보인다(시간표 갱신 안내도 그때까지 뜨지 않는다).
 *
 * ⚠️ 그렇다고 "8월 16일부터 2학기"처럼 날짜를 새로 박으면 3월 개학 학교가 정반대로 틀린다.
 * 앱은 개학일을 알 수 없다(ADR-037 — 개학일로 구간을 단정하지 않는다). 그래서 이 파일은
 * **학교가 알려준 개학일**(사용자 입력·시간표 신호 확인)이 있을 때만 달력 파생을 대신한다.
 * 개학일이 없으면 종전대로 달력 파생이며, 이 파일은 어떤 날짜도 스스로 만들어내지 않는다.
 *
 * `academicCalendar`에 넣지 않은 이유: 그 모듈은 export 목록이 계약 테스트로 잠겨 있다
 * (ADR-037 — 시즌 구간 판정 함수 금지). 개학일 기반 판정은 "앱의 단정"이 아니라 "학교가 준
 * 사실"이므로 금지 취지에 어긋나지 않지만, 잠긴 표면은 그대로 두고 별도 모듈로 분리한다.
 */

import { academicTerm, parseTerm, schoolYearOf } from './academicCalendar';

/** 학기 라벨('2026-2') → 그 학기 개학일('2026-08-18'). */
export type TermStartDates = Readonly<Record<string, string>>;

/** 개학일 형식: YYYY-MM-DD */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date → 'YYYY-MM-DD'(**로컬 기준**). toISOString은 UTC라 자정 부근에서 하루가 밀린다. */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 학기 라벨 비교 — a가 b보다 뒤(나중)면 양수, 앞이면 음수, 같으면 0.
 * 형식이 아닌 쪽은 항상 뒤로 밀린다(비교 불가 → 판단 근거로 쓰지 않는다).
 */
export function compareTerms(a: string | undefined, b: string | undefined): number {
  const pa = a === undefined ? null : parseTerm(a);
  const pb = b === undefined ? null : parseTerm(b);
  if (pa === null && pb === null) return 0;
  if (pa === null) return -1;
  if (pb === null) return 1;
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.semester - pb.semester;
}

/** 직전 학기 라벨('2026-2'→'2026-1', '2026-1'→'2025-2'). 형식이 아니면 null. */
export function previousTerm(term: string): string | null {
  const parsed = parseTerm(term);
  if (parsed === null) return null;
  return parsed.semester === 2 ? `${parsed.year}-1` : `${parsed.year - 1}-2`;
}

/**
 * 개학일 등록이 없을 때 쓰는 명목 시작일(1학기 3/1, 2학기 8/1). 형식이 아니면 null.
 *
 * 2학기가 9/1이 아니라 8/1인 이유: 달력 경계가 8월부터 2학기이고(academicCalendar),
 * 다수 학교가 8월 중순에 개학한다. 9/1로 두면 "이번 학기" 통계에서 **8월 개학분이 통째로
 * 빠진다.** 8월 초는 대개 방학이라 기록이 없으므로 범위를 조금 넓게 잡는 쪽이 안전하다.
 */
export function nominalTermStartDate(term: string): string | null {
  const parsed = parseTerm(term);
  if (parsed === null) return null;
  return parsed.semester === 1 ? `${parsed.year}-03-01` : `${parsed.year}-08-01`;
}

/** 형식이 올바른 (학기, 개학일) 쌍만 추린다 — 잘못된 값은 조용히 버린다(추측 금지). */
function validEntries(map: TermStartDates | undefined): Array<[string, string]> {
  if (map === undefined) return [];
  return Object.entries(map).filter(
    ([term, start]) =>
      parseTerm(term) !== null && typeof start === 'string' && ISO_DATE_RE.test(start),
  );
}

/**
 * 등록된 개학일만으로 파생한 학기. 등록이 하나도 없으면 null(호출자가 달력으로 폴백).
 *
 * - 이미 지난 개학일이 있으면 → 그중 **가장 나중 학기**. (날짜순이 아니라 학기순으로 고르는 이유:
 *   사용자가 날짜를 잘못 넣어 순서가 뒤집혀도 학기 라벨은 뒤로 가지 않게 하기 위함)
 * - 등록된 개학일이 전부 미래면 → 가장 이른 학기의 **직전 학기**. 8월에 "2학기 개학일 8/18"만
 *   등록한 상태에서 8/12에 1학기로 답하는 경로가 이것이다.
 */
export function termFromStartDates(
  todayIso: string,
  termStartDates: TermStartDates | undefined,
): string | null {
  const entries = validEntries(termStartDates);
  if (entries.length === 0) return null;

  const passed = entries.filter(([, start]) => start <= todayIso);
  if (passed.length > 0) {
    return passed.reduce(
      (latest, [term]) => (compareTerms(term, latest) > 0 ? term : latest),
      passed[0]![0],
    );
  }

  const earliest = entries.reduce(
    (min, [term]) => (compareTerms(term, min) < 0 ? term : min),
    entries[0]![0],
  );
  return previousTerm(earliest);
}

/** 표시용 현재 학기를 정하는 데 필요한 입력. */
export interface CurrentTermInput {
  /** 기준 날짜(보통 오늘). */
  readonly today: Date;
  /** 학교가 알려준 학기별 개학일. 미설정이면 달력 파생만 쓴다. */
  readonly termStartDates?: TermStartDates;
  /**
   * 학년도 마무리(ExecuteYearTransition)가 기록한 학기.
   * ⚠️ 이 값은 동기화 병합 가드의 기준이기도 하다 — 여기서는 **읽기만** 하고 쓰지 않는다.
   */
  readonly currentTerm?: string;
}

/**
 * 화면에 보여줄 현재 학기 — 앱 전체의 "지금 몇 학기인가"는 이 함수 하나로 답한다.
 *
 * 판정 순서:
 *  1. 달력 파생(`academicTerm`)을 기본값으로 둔다.
 *  2. 개학일 파생이 **같은 학년도**면 그쪽을 쓴다. 학년도가 다르면 등록이 낡은 것이므로 달력을
 *     따른다 — 이 조건이 없으면 작년 개학일 하나 때문에 새 학년도가 영원히 안 넘어간다.
 *     같은 학년도 안에서는 개학일이 이기므로 "8/18 개학"도, "9/5 개학"(9/1~9/4는 아직 1학기)도
 *     모두 학교 사실대로 답한다.
 *  3. 마무리 마법사가 기록한 학기가 더 뒤면 그것이 이긴다 — 이미 마감한 학기로 되돌아가지 않는다.
 */
export function resolveCurrentTerm(input: CurrentTermInput): string {
  const calendarTerm = academicTerm(input.today);
  const derived = termFromStartDates(toLocalIsoDate(input.today), input.termStartDates);

  const base =
    derived !== null && schoolYearOf(derived) === schoolYearOf(calendarTerm)
      ? derived
      : calendarTerm;

  return compareTerms(input.currentTerm, base) > 0 ? (input.currentTerm as string) : base;
}

/**
 * 그 학기의 시작일('YYYY-MM-DD') — "이번 학기" 통계·기록 필터의 시작점.
 * 등록된 개학일이 있으면 그 날, 없으면 명목 시작일(3/1·9/1). 형식이 아닌 학기는 null.
 */
export function resolveTermStartDate(
  term: string,
  termStartDates: TermStartDates | undefined,
): string | null {
  const registered = validEntries(termStartDates).find(([t]) => t === term);
  return registered !== undefined ? registered[1] : nominalTermStartDate(term);
}

/**
 * 개학일로부터 며칠 지났는지(당일 0, 개학 전이면 음수). 형식이 아니면 null.
 * "학기 초에만 보여줄 안내"의 기준 — 월을 직접 세면 8월·9월 초 개학 학교가 어긋난다.
 */
export function daysSinceTermStart(todayIso: string, startIso: string | null): number | null {
  if (startIso === null || !ISO_DATE_RE.test(todayIso) || !ISO_DATE_RE.test(startIso)) return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const start = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(start.getTime())) return null;
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}
