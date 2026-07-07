/**
 * 나이스 학급 시간표 재조합으로 교사 개인 시간표를 만드는 UseCase.
 *
 * 나이스에는 교사 시간표 API가 없어(→ neisTeacherReconstruct.ts) 교사의 수업반(과목+학급)
 * 매핑을 받아 각 학급의 나이스 시간표를 병렬 조회한 뒤 순수 규칙으로 재조합한다.
 * 학급별 조회 실패는 전체를 막지 않고 fetchErrors 로 모아 UI 가 안내하게 한다.
 */
import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisTimetableRow, SchoolLevel } from '@domain/entities/NeisTimetable';
import type { WeekendDay } from '@domain/valueObjects/DayOfWeek';
import {
  classKey,
  reconstructTeacherSchedule,
  type TeacherClassMapping,
  type ReconstructedTeacherSchedule,
} from '@domain/rules/neisTeacherReconstruct';

export interface ReconstructNeisTeacherParams {
  readonly apiKey: string;
  readonly officeCode: string; // ATPT_OFCDC_SC_CODE
  readonly schoolCode: string; // SD_SCHUL_CODE
  readonly schoolLevel: SchoolLevel;
  readonly academicYear: string;
  readonly semester: string;
  readonly fromDate: string; // YYYYMMDD
  readonly toDate: string; // YYYYMMDD
  readonly mappings: readonly TeacherClassMapping[];
  readonly weekendDays?: readonly WeekendDay[];
}

/** 특정 학급 시간표 조회 실패 */
export interface ClassFetchError {
  readonly grade: number;
  readonly classNum: number;
  readonly message: string;
}

export interface ReconstructNeisTeacherResult extends ReconstructedTeacherSchedule {
  readonly fetchErrors: readonly ClassFetchError[];
}

export async function reconstructNeisTeacherSchedule(
  neisPort: INeisPort,
  params: ReconstructNeisTeacherParams,
): Promise<ReconstructNeisTeacherResult> {
  // 유니크 (학년,반)만 한 번씩 조회 — 한 반에서 여러 과목을 담당해도 fetch 는 1회.
  const uniqueClasses = new Map<string, { grade: number; classNum: number }>();
  for (const m of params.mappings) {
    uniqueClasses.set(classKey(m.grade, m.classNum), { grade: m.grade, classNum: m.classNum });
  }

  const rowsByClass = new Map<string, readonly NeisTimetableRow[]>();
  const fetchErrors: ClassFetchError[] = [];

  await Promise.all(
    [...uniqueClasses.values()].map(async ({ grade, classNum }) => {
      try {
        const rows = await neisPort.getTimetable({
          apiKey: params.apiKey,
          officeCode: params.officeCode,
          schoolCode: params.schoolCode,
          schoolLevel: params.schoolLevel,
          academicYear: params.academicYear,
          semester: params.semester,
          grade: String(grade),
          className: String(classNum),
          fromDate: params.fromDate,
          toDate: params.toDate,
        });
        rowsByClass.set(classKey(grade, classNum), rows);
      } catch (e) {
        fetchErrors.push({
          grade,
          classNum,
          message: e instanceof Error ? e.message : '시간표 조회에 실패했어요.',
        });
      }
    }),
  );

  const result = reconstructTeacherSchedule(params.mappings, rowsByClass, params.weekendDays);
  return { ...result, fetchErrors };
}
