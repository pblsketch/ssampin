import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisAutoSyncSettings } from '@domain/entities/Settings';
import {
  getCurrentWeekRange,
  settingsLevelToNeisLevel,
  getCurrentAcademicYear,
  getCurrentSemester,
} from '@domain/entities/NeisTimetable';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  transformToClassSchedule,
  getMaxPeriod,
} from '@domain/rules/neisTransformRules';
import { extractSubjectsFromSchedule } from '@domain/rules/subjectColorRules';
import type { ClassScheduleData } from '@domain/entities/Timetable';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';

export interface AutoSyncResult {
  readonly success: boolean;
  readonly data?: ClassScheduleData;
  readonly maxPeriods?: number;
  readonly newSubjects?: readonly string[];
  readonly error?: string;
  readonly skipped?: boolean;
}

/**
 * 현재 ISO 주간 문자열 반환 (YYYY-Www)
 */
export function getCurrentISOWeek(): string {
  const now = new Date();
  // ISO 8601 week calculation
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * NEIS 시간표 자동 동기화 UseCase
 *
 * 앱 시작 시 호출. 이번 주에 아직 동기화하지 않았으면 NEIS에서 시간표를 가져온다.
 * 기존 색상 매핑에 없는 새 과목을 감지하여 반환한다.
 */
export async function autoSyncNeisTimetable(
  neisPort: INeisPort,
  apiKey: string,
  neisSettings: { schoolCode: string; atptCode: string },
  autoSync: NeisAutoSyncSettings,
  schoolLevel: 'elementary' | 'middle' | 'high' | 'custom',
  existingSubjectColors: SubjectColorMap,
): Promise<AutoSyncResult> {
  // 비활성화 또는 설정 불완전
  if (!autoSync.enabled || !autoSync.grade || !autoSync.className) {
    return { success: false, skipped: true };
  }

  // 학교 정보 없으면 스킵
  if (!neisSettings.schoolCode || !neisSettings.atptCode) {
    return { success: false, skipped: true };
  }

  // 이미 오늘 동기화 완료
  const today = toLocalDateString();
  if (autoSync.lastSyncDate === today) {
    return { success: false, skipped: true };
  }

  try {
    const { fromDate, toDate } = getCurrentWeekRange();
    const neisLevel = settingsLevelToNeisLevel(schoolLevel);

    const rows = await neisPort.getTimetable({
      apiKey,
      officeCode: neisSettings.atptCode,
      schoolCode: neisSettings.schoolCode,
      schoolLevel: neisLevel,
      academicYear: getCurrentAcademicYear(),
      semester: getCurrentSemester(),
      grade: autoSync.grade,
      className: autoSync.className,
      fromDate,
      toDate,
    });

    if (rows.length === 0) {
      return { success: false, error: 'NO_DATA' };
    }

    const maxPeriods = getMaxPeriod(rows);
    const data = transformToClassSchedule(rows, maxPeriods);

    // 새 과목 감지
    const allSubjects = extractSubjectsFromSchedule(data);
    const mergedColors = { ...existingSubjectColors };
    const newSubjects = allSubjects.filter((s) => !(s in mergedColors));

    return { success: true, data, maxPeriods, newSubjects };
  } catch {
    return { success: false, error: 'SYNC_FAILED' };
  }
}
