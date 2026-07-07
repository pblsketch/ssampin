/**
 * 나이스 학급 시간표들을 재조합해 교사 개인 시간표를 만드는 규칙 (순수 함수).
 *
 * 나이스 시간표 API(els/mis/hisTimetable)는 교사 정보를 주지 않는다
 * (PERIO·ITRT_CNTNT·ALL_TI_YMD·GRADE·CLASS_NM 뿐). 그래서 교사 시간표를
 * 직접 받을 수 없고, 교사 본인의 '수업반(TeachingClass, 과목 포함)'을 이용해
 * 각 학급 시간표에서 그 과목이 있는 교시만 골라 교사 격자에 재조합한다.
 *
 * 규약은 buildTeacherSchedule(comciganRules)·buildTeacherScheduleFromAppin(appinRules)과 동일하다:
 *  - 요일 키 '월'~'금'(주말 옵션 포함), 교시는 0-베이스 배열(1교시 = index 0), 공강은 null
 *  - classroom 은 '학년-반' 표기(예: '2-3'), 합반(같은 칸·같은 과목 여러 반)은 '·'로 병합
 *
 * 한계(호출 UI가 반드시 사용자에게 안내):
 *  - 과목명 불일치(정규화로 흡수하되 완전하지 않음) → unmatched 로 표면화
 *  - 선택과목 이동수업/팀티칭은 단일 나이스 학급에 안 잡히거나 과다배정될 수 있음
 * → 완전 자동 불가. 미리보기+수정 단계가 필수다.
 */
import type { NeisTimetableRow } from '../entities/NeisTimetable';
import type { TeacherPeriod, TeacherScheduleData } from '../entities/Timetable';
import type { TeachingClass } from '../entities/TeachingClass';
import type { WeekendDay } from '../valueObjects/DayOfWeek';
import { getActiveDays } from '../valueObjects/DayOfWeek';
import { dateToDayOfWeek } from './neisTransformRules';

/** 학급 참조 키 '학년-반' (fetch 결과 Map 키 + classroom 표기 공용) */
export function classKey(grade: number, classNum: number): string {
  return `${grade}-${classNum}`;
}

/** 유니코드 로마숫자(Ⅰ·ⅰ 계열) → 아라비아 숫자. NFKC 는 이들을 라틴 I/V/X로 바꿔 위험하므로 먼저 처리한다. */
const ROMAN_NUMERALS: Record<string, string> = {
  Ⅰ: '1',
  Ⅱ: '2',
  Ⅲ: '3',
  Ⅳ: '4',
  Ⅴ: '5',
  Ⅵ: '6',
  Ⅶ: '7',
  Ⅷ: '8',
  Ⅸ: '9',
  Ⅹ: '10',
  ⅰ: '1',
  ⅱ: '2',
  ⅲ: '3',
  ⅳ: '4',
  ⅴ: '5',
  ⅵ: '6',
  ⅶ: '7',
  ⅷ: '8',
  ⅸ: '9',
  ⅹ: '10',
};

/**
 * 과목명 매칭용 정규화.
 * 나이스 정식 과목명(ITRT_CNTNT)과 수업반 subject 표기 차이를 흡수한다:
 *  - 로마숫자 → 아라비아 숫자 ('수학Ⅰ' → '수학1')
 *  - 괄호와 그 안 내용 제거 ('수학(심화)' → '수학')
 *  - 공백·가운뎃점·마침표 등 구분자 제거
 *  - 전각→반각(NFKC) 후 소문자
 * 완전하지 않으므로(선택과목·학교별 표기) 최종 매칭 실패분은 unmatched 로 사용자에게 노출한다.
 */
export function normalizeSubject(s: string): string {
  if (!s) return '';
  let out = s.replace(/[Ⅰ-Ⅹⅰ-ⅹ]/g, (ch) => ROMAN_NUMERALS[ch] ?? ch);
  out = out.replace(/[([{][^)\]}]*[)\]}]/g, '');
  out = out.replace(/[\s·・.,\-_/|]/g, '');
  return out.normalize('NFKC').toLowerCase();
}

/** 수업반 → 나이스 학급 매핑 (사용자 확정본) */
export interface TeacherClassMapping {
  /** 원본 수업반 id (추적용) */
  readonly classId: string;
  /** 교사가 이 학급에서 가르치는 과목(표기 유지 — 정규화 전 원본) */
  readonly subject: string;
  readonly grade: number;
  readonly classNum: number;
}

/** 나이스에서 과목이 하나도 안 잡힌 수업반 매핑 */
export interface UnmatchedMapping {
  readonly grade: number;
  readonly classNum: number;
  readonly subject: string;
}

export interface ReconstructedTeacherSchedule {
  readonly schedule: TeacherScheduleData;
  readonly maxPeriod: number;
  /** 교사 격자에 채워진 수업 칸 수(= 재조합된 주간 시수) */
  readonly matchedCount: number;
  readonly unmatched: readonly UnmatchedMapping[];
}

interface Placement {
  readonly dayIdx: number; // getActiveDays 기준 인덱스
  readonly periodIdx: number; // 0-베이스
  readonly subject: string;
  readonly classroom: string;
}

/**
 * 수업반→나이스 학급 매핑과 학급별 나이스 시간표 row 를 받아 교사 시간표로 재조합한다.
 *
 * @param mappings 사용자가 확정한 (수업반 과목 + 학년·반) 목록
 * @param timetableRowsByClass '학년-반'(classKey) → 그 학급의 나이스 시간표 row 배열
 * @param weekendDays 주말 수업 요일(옵션). 기본 월~금
 */
export function reconstructTeacherSchedule(
  mappings: readonly TeacherClassMapping[],
  timetableRowsByClass: ReadonlyMap<string, readonly NeisTimetableRow[]>,
  weekendDays?: readonly WeekendDay[],
): ReconstructedTeacherSchedule {
  const activeDays = getActiveDays(weekendDays);
  const dayIndex = new Map<string, number>();
  activeDays.forEach((d, i) => dayIndex.set(d, i));

  const placements: Placement[] = [];
  const unmatched: UnmatchedMapping[] = [];

  for (const m of mappings) {
    const rows = timetableRowsByClass.get(classKey(m.grade, m.classNum)) ?? [];
    const target = normalizeSubject(m.subject);
    let matched = 0;
    for (const row of rows) {
      if (normalizeSubject(row.ITRT_CNTNT) !== target) continue;
      const period = parseInt(row.PERIO, 10);
      if (!Number.isInteger(period) || period < 1 || period > 12) continue;
      const day = dateToDayOfWeek(row.ALL_TI_YMD, weekendDays);
      if (!day) continue;
      const dIdx = dayIndex.get(day);
      if (dIdx === undefined) continue;
      placements.push({
        dayIdx: dIdx,
        periodIdx: period - 1,
        subject: m.subject,
        classroom: classKey(m.grade, m.classNum),
      });
      matched++;
    }
    if (matched === 0) {
      unmatched.push({ grade: m.grade, classNum: m.classNum, subject: m.subject });
    }
  }

  const maxPeriod = placements.reduce((mx, p) => Math.max(mx, p.periodIdx + 1), 0);

  const grid: (TeacherPeriod | null)[][] = activeDays.map(() =>
    Array.from({ length: maxPeriod }, () => null),
  );

  for (const p of placements) {
    const row = grid[p.dayIdx];
    if (!row || p.periodIdx < 0 || p.periodIdx >= row.length) continue;
    const existing = row[p.periodIdx];
    if (!existing) {
      row[p.periodIdx] = { subject: p.subject, classroom: p.classroom };
    } else if (existing.subject === p.subject) {
      // 합반(같은 과목·같은 칸 여러 반) → 반 표기 병합. 중복 반(멀티 주차 range 등)은 무시.
      const parts = existing.classroom.split('·');
      if (!parts.includes(p.classroom)) {
        row[p.periodIdx] = { ...existing, classroom: `${existing.classroom}·${p.classroom}` };
      }
    }
    // 다른 과목이 이미 있으면 먼저 온 것을 유지(팀티칭/데이터 이상 방어) — 미리보기에서 사용자가 수정
  }

  const schedule: Record<string, readonly (TeacherPeriod | null)[]> = {};
  activeDays.forEach((day, i) => {
    schedule[day] = grid[i] ?? [];
  });

  let matchedCount = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell) matchedCount++;
    }
  }

  return { schedule: schedule as TeacherScheduleData, maxPeriod, matchedCount, unmatched };
}

/**
 * 수업반에서 (학년, 반)을 도출한다.
 * name 파싱('2-3'·'2학년 3반')을 우선하고, 실패하면 students 의 최빈 (grade, classNum)을 쓴다.
 * 둘 다 불가하면 null → 호출 UI 가 사용자에게 직접 지정을 요청한다.
 */
export function deriveClassFromTeachingClass(
  cls: TeachingClass,
): { grade: number; classNum: number } | null {
  const m = /(\d+)[-\s]*(?:학년)?\s*(\d+)/.exec(cls.name);
  if (m) {
    const grade = Number(m[1]);
    const classNum = Number(m[2]);
    if (grade >= 1 && grade <= 6 && classNum >= 1 && classNum <= 20) {
      return { grade, classNum };
    }
  }

  const counts = new Map<string, { grade: number; classNum: number; n: number }>();
  for (const s of cls.students) {
    if (s.grade == null || s.classNum == null) continue;
    const key = classKey(s.grade, s.classNum);
    const e = counts.get(key);
    if (e) e.n++;
    else counts.set(key, { grade: s.grade, classNum: s.classNum, n: 1 });
  }
  let best: { grade: number; classNum: number; n: number } | null = null;
  for (const e of counts.values()) {
    if (!best || e.n > best.n) best = e;
  }
  return best ? { grade: best.grade, classNum: best.classNum } : null;
}

/**
 * 수업반 학생들의 소속 (학년, 반) 목록(중복 제거·정렬).
 * grade/classNum 이 채워진 학생만 센다(담임·단일 홈룸 수업반은 대개 비어 있어 [] 반환).
 */
export function distinctStudentClasses(
  cls: TeachingClass,
): readonly { grade: number; classNum: number }[] {
  const seen = new Map<string, { grade: number; classNum: number }>();
  for (const s of cls.students) {
    if (s.grade == null || s.classNum == null) continue;
    seen.set(classKey(s.grade, s.classNum), { grade: s.grade, classNum: s.classNum });
  }
  return [...seen.values()].sort((a, b) => a.grade - b.grade || a.classNum - b.classNum);
}

/**
 * 선택과목 이동수업 의심 여부.
 * 학생 소속이 2개 이상 (학년,반)으로 흩어져 있으면 단일 나이스 학급에 안 잡히므로 재조합이 어렵다.
 * 호출 UI 는 이런 수업반을 기본 제외 + '재조합이 어려워요' 라벨로 안내한다.
 */
export function isLikelyMovementClass(cls: TeachingClass): boolean {
  return distinctStudentClasses(cls).length > 1;
}
