import type { INeisPort } from '@domain/ports/INeisPort';
import type { NeisAutoSyncSettings } from '@domain/entities/Settings';
import { getCurrentWeekRange, settingsLevelToNeisLevel } from '@domain/entities/NeisTimetable';
import { fetchNeisTimetableWithSemesterFallback } from './FetchNeisTimetable';
import { toLocalDateString } from '@shared/utils/localDate';
import { transformToClassSchedule, getMaxPeriod } from '@domain/rules/neisTransformRules';
import { extractSubjectsFromSchedule } from '@domain/rules/subjectColorRules';
import { diffClassSchedule } from '@domain/rules/timetableDiff';
import type { ClassScheduleData } from '@domain/entities/Timetable';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';

export interface AutoSyncResult {
  readonly success: boolean;
  readonly data?: ClassScheduleData;
  readonly maxPeriods?: number;
  readonly newSubjects?: readonly string[];
  readonly error?: string;
  readonly skipped?: boolean;
  /**
   * 현재 저장본과 달라졌는지. currentClassSchedule 미제공 시(구버전 호출) true로 간주 —
   * 비교 근거가 없으면 안전하게 '변경 있음'으로 취급해 하위호환(무음 사용자 동작 유지).
   */
  readonly changed?: boolean;
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
  currentClassSchedule?: ClassScheduleData,
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

    // 학기는 조회 주에서 파생하고, 비면 반대 학기도 확인한다 — 8월 개학 학교가 방학 취급되어
    // 자동 동기화가 조용히 NO_DATA로 끝나던 문제 차단.
    const { rows } = await fetchNeisTimetableWithSemesterFallback(neisPort, {
      apiKey,
      officeCode: neisSettings.atptCode,
      schoolCode: neisSettings.schoolCode,
      schoolLevel: neisLevel,
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

    // 현재 저장본과 비교(비파괴 정책용). 미제공 시 변경으로 간주(하위호환).
    const changed = currentClassSchedule
      ? diffClassSchedule(currentClassSchedule, data).changed
      : true;

    // 새 과목 감지
    const allSubjects = extractSubjectsFromSchedule(data);
    const mergedColors = { ...existingSubjectColors };
    const newSubjects = allSubjects.filter((s) => !(s in mergedColors));

    return { success: true, data, maxPeriods, newSubjects, changed };
  } catch {
    return { success: false, error: 'SYNC_FAILED' };
  }
}
