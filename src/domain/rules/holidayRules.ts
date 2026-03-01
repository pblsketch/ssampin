/**
 * 한국 공휴일 규칙
 *
 * 양력 고정 공휴일 + 음력 기반 공휴일(설날, 부처님오신날, 추석)을
 * 연도별 사전 계산 테이블로 관리한다.
 *
 * 대체공휴일 로직:
 * - 설날/추석 3일 중 일요일과 겹치면 다음 평일이 대체공휴일
 * - 어린이날, 부처님오신날, 성탄절, 삼일절, 현충일, 광복절, 개천절, 한글날이
 *   토/일과 겹치면 다음 월요일이 대체공휴일
 */

export interface HolidayInfo {
  /** "YYYY-MM-DD" */
  readonly date: string;
  /** 공휴일 이름 */
  readonly name: string;
  /** 대체공휴일 여부 */
  readonly isSubstitute?: boolean;
}

// ── 음력 공휴일 양력 변환 테이블 (2024-2035) ────────────────────────
// 설날(음력 1/1), 부처님오신날(음력 4/8), 추석(음력 8/15) 의 양력 날짜
interface LunarHolidayEntry {
  /** 설날 당일 (음력 1월 1일의 양력 날짜) "MM-DD" */
  seollal: string;
  /** 부처님오신날 (음력 4월 8일의 양력 날짜) "MM-DD" */
  buddha: string;
  /** 추석 당일 (음력 8월 15일의 양력 날짜) "MM-DD" */
  chuseok: string;
}

const LUNAR_TABLE: Record<number, LunarHolidayEntry> = {
  2024: { seollal: '02-10', buddha: '05-15', chuseok: '09-17' },
  2025: { seollal: '01-29', buddha: '05-05', chuseok: '10-06' },
  2026: { seollal: '02-17', buddha: '05-24', chuseok: '09-25' },
  2027: { seollal: '02-06', buddha: '05-13', chuseok: '09-15' },
  2028: { seollal: '01-26', buddha: '05-02', chuseok: '10-03' },
  2029: { seollal: '02-13', buddha: '05-20', chuseok: '09-22' },
  2030: { seollal: '02-03', buddha: '05-09', chuseok: '09-12' },
  2031: { seollal: '01-23', buddha: '05-28', chuseok: '10-01' },
  2032: { seollal: '02-11', buddha: '05-16', chuseok: '09-19' },
  2033: { seollal: '01-31', buddha: '05-06', chuseok: '09-08' },
  2034: { seollal: '02-19', buddha: '05-25', chuseok: '09-27' },
  2035: { seollal: '02-08', buddha: '05-15', chuseok: '09-16' },
};

// ── 날짜 유틸리티 ──────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMD(md: string): { m: number; d: number } {
  const [mm, dd] = md.split('-');
  return { m: parseInt(mm!, 10), d: parseInt(dd!, 10) };
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay(); // 0=일, 6=토
}

/** 날짜에 n일을 더한 결과 */
function addDays(year: number, month: number, day: number, n: number): { y: number; m: number; d: number } {
  const dt = new Date(year, month - 1, day + n);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

// ── 대체공휴일 계산 ─────────────────────────────────────────────────

/**
 * 3일 연휴(설날/추석) 대체공휴일 계산
 * 연휴 중 일요일이 포함되면, 연휴 다음 날이 대체공휴일
 */
function getSubstituteFor3DayHoliday(
  year: number,
  centerMonth: number,
  centerDay: number,
  name: string,
): HolidayInfo | null {
  const prev = addDays(year, centerMonth, centerDay, -1);
  const next = addDays(year, centerMonth, centerDay, 1);

  const days = [
    { y: prev.y, m: prev.m, d: prev.d },
    { y: year, m: centerMonth, d: centerDay },
    { y: next.y, m: next.m, d: next.d },
  ];

  const hasSunday = days.some((dt) => dayOfWeek(dt.y, dt.m, dt.d) === 0);

  if (!hasSunday) return null;

  // 연휴 다음 날부터 평일을 찾음
  let offset = 2; // centerDay + 2 = 연휴 마지막 다음날
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(year, centerMonth, centerDay, offset + i);
    const dow = dayOfWeek(candidate.y, candidate.m, candidate.d);
    if (dow !== 0 && dow !== 6) {
      // 연휴 기간 자체와 겹치지 않는지 확인
      const candidateStr = toDateStr(candidate.y, candidate.m, candidate.d);
      const holidayStrs = days.map((dt) => toDateStr(dt.y, dt.m, dt.d));
      if (!holidayStrs.includes(candidateStr)) {
        return {
          date: candidateStr,
          name: `${name} 대체공휴일`,
          isSubstitute: true,
        };
      }
    }
  }

  return null;
}

/**
 * 단일 공휴일 대체공휴일 계산
 * 토/일과 겹치면 다음 월요일이 대체공휴일
 */
function getSubstituteForSingleHoliday(
  year: number,
  month: number,
  day: number,
  name: string,
  allHolidayDates: Set<string>,
): HolidayInfo | null {
  const dow = dayOfWeek(year, month, day);

  if (dow !== 0 && dow !== 6) return null;

  // 다음 평일을 찾되, 이미 다른 공휴일이면 그 다음 평일
  let offset = dow === 6 ? 2 : 1; // 토→월(+2), 일→월(+1)
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(year, month, day, offset + i);
    const candidateStr = toDateStr(candidate.y, candidate.m, candidate.d);
    const candidateDow = dayOfWeek(candidate.y, candidate.m, candidate.d);
    if (candidateDow !== 0 && candidateDow !== 6 && !allHolidayDates.has(candidateStr)) {
      return {
        date: candidateStr,
        name: `${name} 대체공휴일`,
        isSubstitute: true,
      };
    }
  }

  return null;
}

// ── 메인 API ────────────────────────────────────────────────────────

/**
 * 특정 연도의 한국 공휴일 목록 반환
 */
export function getKoreanHolidays(year: number): readonly HolidayInfo[] {
  const holidays: HolidayInfo[] = [];

  // ① 양력 고정 공휴일
  holidays.push({ date: toDateStr(year, 1, 1), name: '신정' });
  holidays.push({ date: toDateStr(year, 3, 1), name: '삼일절' });
  holidays.push({ date: toDateStr(year, 5, 5), name: '어린이날' });
  holidays.push({ date: toDateStr(year, 6, 6), name: '현충일' });
  holidays.push({ date: toDateStr(year, 8, 15), name: '광복절' });
  holidays.push({ date: toDateStr(year, 10, 3), name: '개천절' });
  holidays.push({ date: toDateStr(year, 10, 9), name: '한글날' });
  holidays.push({ date: toDateStr(year, 12, 25), name: '성탄절' });

  // ② 음력 기반 공휴일
  const lunar = LUNAR_TABLE[year];
  if (lunar) {
    // 설날 연휴 (전날, 당일, 다음날)
    const seollal = parseMD(lunar.seollal);
    const seollalPrev = addDays(year, seollal.m, seollal.d, -1);
    const seollalNext = addDays(year, seollal.m, seollal.d, 1);

    holidays.push({ date: toDateStr(seollalPrev.y, seollalPrev.m, seollalPrev.d), name: '설날 연휴' });
    holidays.push({ date: toDateStr(year, seollal.m, seollal.d), name: '설날' });
    holidays.push({ date: toDateStr(seollalNext.y, seollalNext.m, seollalNext.d), name: '설날 연휴' });

    // 부처님오신날
    const buddha = parseMD(lunar.buddha);
    holidays.push({ date: toDateStr(year, buddha.m, buddha.d), name: '부처님오신날' });

    // 추석 연휴 (전날, 당일, 다음날)
    const chuseok = parseMD(lunar.chuseok);
    const chuseokPrev = addDays(year, chuseok.m, chuseok.d, -1);
    const chuseokNext = addDays(year, chuseok.m, chuseok.d, 1);

    holidays.push({ date: toDateStr(chuseokPrev.y, chuseokPrev.m, chuseokPrev.d), name: '추석 연휴' });
    holidays.push({ date: toDateStr(year, chuseok.m, chuseok.d), name: '추석' });
    holidays.push({ date: toDateStr(chuseokNext.y, chuseokNext.m, chuseokNext.d), name: '추석 연휴' });
  }

  // ③ 대체공휴일 계산
  const baseHolidayDates = new Set(holidays.map((h) => h.date));

  if (lunar) {
    // 설날 대체공휴일
    const seollal = parseMD(lunar.seollal);
    const seollalSub = getSubstituteFor3DayHoliday(year, seollal.m, seollal.d, '설날');
    if (seollalSub) {
      holidays.push(seollalSub);
      baseHolidayDates.add(seollalSub.date);
    }

    // 추석 대체공휴일
    const chuseok = parseMD(lunar.chuseok);
    const chuseokSub = getSubstituteFor3DayHoliday(year, chuseok.m, chuseok.d, '추석');
    if (chuseokSub) {
      holidays.push(chuseokSub);
      baseHolidayDates.add(chuseokSub.date);
    }

    // 부처님오신날 대체공휴일
    const buddha = parseMD(lunar.buddha);
    const buddhaSub = getSubstituteForSingleHoliday(year, buddha.m, buddha.d, '부처님오신날', baseHolidayDates);
    if (buddhaSub) {
      holidays.push(buddhaSub);
      baseHolidayDates.add(buddhaSub.date);
    }
  }

  // 단일 공휴일 대체공휴일 (삼일절, 어린이날, 현충일, 광복절, 개천절, 한글날, 성탄절)
  const singleSubstituteCandidates: Array<{ m: number; d: number; name: string }> = [
    { m: 3, d: 1, name: '삼일절' },
    { m: 5, d: 5, name: '어린이날' },
    { m: 6, d: 6, name: '현충일' },
    { m: 8, d: 15, name: '광복절' },
    { m: 10, d: 3, name: '개천절' },
    { m: 10, d: 9, name: '한글날' },
    { m: 12, d: 25, name: '성탄절' },
  ];

  for (const c of singleSubstituteCandidates) {
    const sub = getSubstituteForSingleHoliday(year, c.m, c.d, c.name, baseHolidayDates);
    if (sub) {
      holidays.push(sub);
      baseHolidayDates.add(sub.date);
    }
  }

  return holidays;
}

/**
 * 특정 날짜가 공휴일인지 확인
 * @param dateStr "YYYY-MM-DD"
 * @returns 공휴일 이름 또는 null
 */
export function getHolidayName(dateStr: string, holidays: readonly HolidayInfo[]): string | null {
  const match = holidays.find((h) => h.date === dateStr);
  return match ? match.name : null;
}

/**
 * 특정 월의 공휴일 맵 반환 (캘린더 렌더링용)
 * @returns Map<"YYYY-MM-DD", holidayName>
 */
export function getHolidayMapForMonth(
  year: number,
  month: number, // 0-based (0 = 1월)
): ReadonlyMap<string, string> {
  // 해당 월 전후로 공휴일이 걸칠 수 있으므로, 해당 연도 전체 공휴일에서 필터
  const allHolidays = getKoreanHolidays(year);
  const map = new Map<string, string>();

  const mm = month + 1; // 1-based
  for (const h of allHolidays) {
    const parts = h.date.split('-');
    const hMonth = parseInt(parts[1]!, 10);
    if (hMonth === mm) {
      // 같은 날에 여러 공휴일이 겹치면 첫 번째 것만 표시
      if (!map.has(h.date)) {
        map.set(h.date, h.name);
      }
    }
  }

  return map;
}
