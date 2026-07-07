/**
 * 압핀(sgpap.com) 시간표 파싱·변환 규칙 (순수 함수).
 *
 * 압핀 정적 파일 형식 (실측: docs/압핀-시간표-연동-가능성-조사.md):
 *   - 파일의 각 줄 = 한 대상(학급/교사)의 주간 시간표.
 *   - 줄 안: 쉼표(,)로 요일 구분 → 각 요일 안: 캐럿(^)으로 교시 구분.
 *   - 셀: '' (빈 시간) | '과목' | '과목/뒤'. '@B..@K' 등 서식 마커는 제거.
 *   - 파일 종류(교차검증 확정): h=학급, g=교사, t=특별실, s=교시시각. 번호=주차.
 *     학급은 h파일, 교사는 g파일을 쓴다(t는 특별실이라 교사 아님).
 *     학급은 원소목록(dnele field1)의 N번째 = h파일 N번째 줄, 교사는 교사번호 = g파일 (번호-1) 줄.
 * 압핀이 형식을 바꾸면 이 파일만 고치면 된다.
 */
import type {
  AppinCell,
  AppinClassRef,
  AppinDayGrid,
  AppinFileMeta,
} from '../entities/AppinTimetable';
import type {
  ClassPeriod,
  ClassScheduleData,
  TeacherPeriod,
  TeacherScheduleData,
} from '../entities/Timetable';
import { DAYS_OF_WEEK } from '../valueObjects/DayOfWeek';

/** 학급 라벨 'G-C' (학년-반) 형식 */
const CLASS_LABEL_RE = /^(\d+)-(\d+)$/;
/** 시간표 파일명 (h/g/t/s + 주차 번호) */
const WEEK_FILE_RE = /^([hgts])(\d+)\.txt$/;

/**
 * 한 칸(cell)을 해석한다.
 *  - 빈 칸('')은 null
 *  - '과목/교실' → { subject, room }
 *  - '과목'만 → { subject, room: null }
 *  - '@B..@K' 같은 '@'+영문자 서식 마커는 제거
 */
export function parseCell(raw: string): AppinCell | null {
  if (!raw) return null;
  // 표시용 노이즈 제거: '@B..@K' 서식 마커, '*'(이동수업/분반 표시). '***'처럼 마커만 남으면 공강.
  const cleaned = raw
    .replace(/@[A-Za-z]/g, '')
    .replace(/\*/g, '')
    .trim();
  if (cleaned === '') return null;
  const slash = cleaned.indexOf('/');
  if (slash >= 0) {
    return { subject: cleaned.slice(0, slash), room: cleaned.slice(slash + 1) };
  }
  return { subject: cleaned, room: null };
}

/**
 * 시간표 파일 텍스트를 대상별 주간 격자로 파싱한다.
 * 반환: grids[대상index][요일][교시] = 셀 | null (요일 0 = 월).
 * 줄 끝의 빈 요일 토큰(트레일링 쉼표)은 제거한다.
 */
export function parseGrid(text: string): readonly AppinDayGrid[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((line) => {
    const days = line.split(',');
    while (days.length > 1 && days[days.length - 1] === '') days.pop();
    return days.map((day) => day.split('^').map(parseCell));
  });
}

/**
 * 원소 목록에서 'G-C'(학년-반) 형식만 골라 학급 참조로 파생한다.
 * index는 원소 목록에서의 0-기반 위치 = 시간표 파일의 줄 번호.
 * (교실 코드 등 학년-반이 아닌 원소는 제외 — 학교 설정에 따라 원소가 다르다.)
 */
export function parseAppinClasses(elements: readonly string[]): readonly AppinClassRef[] {
  const result: AppinClassRef[] = [];
  elements.forEach((raw, index) => {
    const label = raw.trim();
    const m = CLASS_LABEL_RE.exec(label);
    if (!m) return;
    result.push({ grade: Number(m[1]), classNum: Number(m[2]), label, index });
  });
  return result;
}

/** 격자에 등장하는 학년 목록(오름차순). */
export function gradesOf(classes: readonly AppinClassRef[]): readonly number[] {
  return [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b);
}

/** 특정 학년의 반 목록(오름차순). */
export function classesOfGrade(
  classes: readonly AppinClassRef[],
  grade: number,
): readonly AppinClassRef[] {
  return classes.filter((c) => c.grade === grade).sort((a, b) => a.classNum - b.classNum);
}

/** build 결과 (학급). */
export interface BuiltAppinClassSchedule {
  readonly schedule: ClassScheduleData;
  readonly maxPeriod: number;
}

/**
 * 한 대상의 주간 격자(AppinDayGrid)를 쌤핀 학급 시간표(ClassScheduleData)로 변환한다.
 * - 나이스/컴시간 변환과 동일 규약: 모든 칸을 `{subject:'', teacher:''}`로 초기화하고
 *   수업이 있는 칸만 채운다. 요일 키는 '월'~'금'.
 * - 압핀 학급 시간표엔 담당 교사명이 없으므로 teacher는 빈 문자열.
 */
export function buildClassScheduleFromAppin(dayGrid: AppinDayGrid): BuiltAppinClassSchedule {
  const maxPeriod = dayGrid.reduce((max, day) => Math.max(max, day.length), 0);
  const schedule: Record<string, readonly ClassPeriod[]> = {};
  DAYS_OF_WEEK.forEach((day, i) => {
    const cells = dayGrid[i] ?? [];
    schedule[day] = Array.from({ length: maxPeriod }, (_unused, p) => {
      const cell = cells[p];
      return cell ? { subject: cell.subject, teacher: '' } : { subject: '', teacher: '' };
    });
  });
  return { schedule: schedule as ClassScheduleData, maxPeriod };
}

/** build 결과 (교사). */
export interface BuiltAppinTeacherSchedule {
  readonly schedule: TeacherScheduleData;
  readonly maxPeriod: number;
}

/**
 * 한 대상의 주간 격자를 쌤핀 교사 시간표(TeacherScheduleData)로 변환한다.
 * - 공강은 null. 요일 키는 '월'~'금'.
 * - 셀의 room(이동교실/학급)을 classroom으로 매핑.
 */
export function buildTeacherScheduleFromAppin(dayGrid: AppinDayGrid): BuiltAppinTeacherSchedule {
  const maxPeriod = dayGrid.reduce((max, day) => Math.max(max, day.length), 0);
  const schedule: Record<string, readonly (TeacherPeriod | null)[]> = {};
  DAYS_OF_WEEK.forEach((day, i) => {
    const cells = dayGrid[i] ?? [];
    schedule[day] = Array.from({ length: maxPeriod }, (_unused, p) => {
      const cell = cells[p];
      return cell ? { subject: cell.subject, classroom: cell.room ?? '' } : null;
    });
  });
  return { schedule: schedule as TeacherScheduleData, maxPeriod };
}

/** 'yyyymmdd' → 자정 Date. 형식이 아니면 null. */
export function parseYmd(s: string | undefined): Date | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  return new Date(y, m - 1, d);
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * getupdir 날짜 필드로 주차를 추정한다.
 * 실측상 날짜(yyyymmdd)는 대략 "마지막 주차(= h 파일 수)"의 기준일이라
 *   week ≈ totalWeeks - round((anchorDate - targetDate) / 7일)
 * 로 계산한다. 최근 날짜에서 정확도가 높고 일반적으로 ±1주 오차가 있을 수 있다.
 * anchor 파싱 실패 시 null.
 */
export function estimateWeekFromDate(
  date: string | undefined,
  totalWeeks: number,
  targetDate: Date,
): number | null {
  const anchor = parseYmd(date);
  if (!anchor || totalWeeks <= 0) return null;
  const diff = Math.round((anchor.getTime() - targetDate.getTime()) / WEEK_MS);
  const wk = totalWeeks - diff;
  return Math.min(Math.max(wk, 1), totalWeeks);
}

/** 파일 목록에서 h<N>.txt 개수(= 총 주차 수)를 센다. */
export function countWeekFiles(files: readonly AppinFileMeta[]): number {
  return files.filter((f) => /^h\d+\.txt$/.test(f.name)).length;
}

/**
 * 파일 "수정일"로 현재 주차를 정밀 판정한다(더 정확).
 * 학교가 매주 현재 주차 파일을 갱신하므로, 기준일 이하에서 가장 최근에 수정된
 * h<N>.txt 의 N 이 현재(활성) 주차다. modified(ISO)는 사전식 비교.
 * 판정 불가 시 null.
 */
export function currentWeekByModified(
  files: readonly AppinFileMeta[],
  asOfIso: string,
  preferWeek?: number,
): number | null {
  let best: { n: number; modified: string } | null = null;
  for (const f of files) {
    const m = /^h(\d+)\.txt$/.exec(f.name);
    if (!m || !f.modified || f.modified > asOfIso) continue;
    const n = Number(m[1]);
    if (!best || f.modified > best.modified) {
      best = { n, modified: f.modified };
    } else if (f.modified === best.modified) {
      // 수정 시각 동률(학기초 다중 주차 일괄 업로드 등 — modified 가 분 단위라 흔함):
      // 날짜 앵커 추정(preferWeek)이 있으면 그에 가장 가까운 주차, 없으면 큰 주차를 택한다.
      const better =
        preferWeek != null ? Math.abs(n - preferWeek) < Math.abs(best.n - preferWeek) : n > best.n;
      if (better) best = { n, modified: f.modified };
    }
  }
  return best ? best.n : null;
}

/** 접두(h=학급, g=교사, t=특별실, s=교시시각)와 주차로 파일명을 만든다. */
export function weekFileName(prefix: 'h' | 'g' | 't' | 's', week: number): string {
  return `${prefix}${week}.txt`;
}

/** 파일명에서 주차 번호를 추출한다(h/g/t/s). 실패 시 null. */
export function weekOfFileName(name: string): number | null {
  const m = WEEK_FILE_RE.exec(name);
  return m ? Number(m[2]) : null;
}

/**
 * s<주차>.txt(교시 시각) 첫 줄에서 교시별 시작시각을 뽑아 컴시간 '일과시간' 포맷으로 변환한다.
 * s파일은 4자리 HHMM 을 교시 순서대로 이어붙인 블록('0830093010301130132014201520')이 공백으로
 * 구분돼 반복된다. 첫 블록만 사용. → ['1(08:30)','2(09:30)',…] (parseComciganPeriodTimes 재사용용)
 */
export function parseAppinDayTimes(sText: string): readonly string[] {
  const firstBlock = (sText.split(/\r?\n/)[0] ?? '').trim().split(/\s+/)[0] ?? '';
  const out: string[] = [];
  for (let i = 0; i + 4 <= firstBlock.length; i += 4) {
    const chunk = firstBlock.slice(i, i + 4);
    if (!/^\d{4}$/.test(chunk)) break;
    const hh = Number(chunk.slice(0, 2));
    const mm = Number(chunk.slice(2, 4));
    if (hh > 23 || mm > 59) break;
    out.push(`${out.length + 1}(${chunk.slice(0, 2)}:${chunk.slice(2, 4)})`);
  }
  return out;
}

/**
 * 나이스 주소(도로명)에서 압핀 getupdir 의 시/군(hgsj) 후보들을 우선순위 순으로 뽑는다.
 * 압핀은 학교가 등록한 시/군 표기를 정확히 요구하는데 그 표기가 광역시명일 수도(대구),
 * 구/군일 수도 있어, 몇 가지 후보를 순서대로 시도하기 위한 것이다.
 *   '대구광역시 남구 …' → ['대구','대구광역시','남구','남']
 *   '경상북도 경산시 …' → ['경산','경산시','경상북도','경북']
 */
export function appinRegionCandidates(address: string): readonly string[] {
  const tokens = (address ?? '').trim().split(/\s+/).filter(Boolean);
  const t0 = tokens[0] ?? '';
  const t1 = tokens[1] ?? '';
  const out: string[] = [];
  const push = (s: string) => {
    const v = s.trim();
    if (v && !out.includes(v)) out.push(v);
  };
  if (/(광역시|특별시|특별자치시)$/.test(t0)) {
    // 광역시/특별시: 그 이름 자체가 시/군인 경우가 많다(대구, 서울)
    push(t0.replace(/(광역시|특별시|특별자치시)$/, ''));
    push(t0);
    push(t1);
    push(t1.replace(/(시|군|구)$/, ''));
  } else {
    // 도: 시/군이 실제 시/군
    push(t1);
    push(t1.replace(/(시|군)$/, ''));
    push(t0);
    push(t0.replace(/(도|특별자치도)$/, ''));
  }
  return out;
}
