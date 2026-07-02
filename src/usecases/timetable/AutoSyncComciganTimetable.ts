/**
 * 컴시간 교사 시간표 자동연동 UseCase (M3).
 *
 * 저장된 지문(마스킹 이름 + 과목)으로 컴시간을 재fetch → 같은 교사를 재매칭 → 교사 시간표를
 * 다시 구성 → 현재 저장본과 diff 한다. 스로틀/enabled 판단·부수효과(적용/알림)는 호출부(hook)가
 * 담당하고, 이 UseCase는 "무엇이 바뀌었는가"만 계산한다(포트만 의존, 순수 규칙 조합).
 *
 * ⚠️ raw teacherIndex는 저장하지 않는다 — fetch마다 재부여될 수 있어 다른 교사로 바뀌는 사고 방지.
 */
import type { IComciganPort } from '@domain/ports/IComciganPort';
import type { ComciganTeacherFingerprint } from '@domain/entities/Settings';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import {
  buildTeacherSchedule,
  decodeTimetable,
  summarizeTeachers,
} from '@domain/rules/comciganRules';
import { locateTeacherByFingerprint } from '@domain/rules/comciganTeacherMatch';
import { diffTeacherSchedule } from '@domain/rules/timetableDiff';
import type { TimetableDiffResult } from '@domain/rules/timetableDiff';

export type ComciganSyncSkipReason = 'no-fingerprint' | 'fetch-failed' | 'no-match';

export interface ComciganSyncResult {
  /** 재fetch/매칭 전에 중단됐는지(지문 없음·fetch 실패) */
  readonly skipped: boolean;
  /** 지문으로 교사를 특정했는지 */
  readonly matched: boolean;
  /** 매칭 후 현재 저장본과 달라졌는지 */
  readonly changed: boolean;
  /** matched일 때 새로 구성한 교사 시간표 */
  readonly data?: TeacherScheduleData;
  readonly diff?: TimetableDiffResult;
  readonly reason?: ComciganSyncSkipReason;
}

const SKIP = (reason: ComciganSyncSkipReason): ComciganSyncResult => ({
  skipped: true,
  matched: false,
  changed: false,
  reason,
});

/**
 * 지문으로 컴시간을 재확인해 교사 시간표 변경을 계산한다.
 * @param fingerprint 저장된 교사 지문(없으면 skip)
 * @param currentTeacherSchedule 현재 저장된 교사 시간표(diff 기준)
 */
export async function autoSyncComciganTimetable(
  comciganPort: IComciganPort,
  fingerprint: ComciganTeacherFingerprint | undefined,
  currentTeacherSchedule: TeacherScheduleData,
): Promise<ComciganSyncResult> {
  if (!fingerprint || !fingerprint.schoolCode || !fingerprint.maskedName) {
    return SKIP('no-fingerprint');
  }

  let data;
  try {
    data = await comciganPort.getSchoolData(fingerprint.schoolCode);
  } catch {
    return SKIP('fetch-failed');
  }

  const lessons = decodeTimetable(data);
  if (lessons.length === 0) return SKIP('fetch-failed');

  const matched = locateTeacherByFingerprint(summarizeTeachers(lessons), {
    maskedName: fingerprint.maskedName,
    subjects: fingerprint.subjects,
  });
  // 매칭 실패는 skip이 아니라 명시적 결과(호출부가 "다시 선택" 안내, 적용 금지)
  if (!matched) return { skipped: false, matched: false, changed: false, reason: 'no-match' };

  const { schedule } = buildTeacherSchedule(lessons, matched.index);
  const diff = diffTeacherSchedule(currentTeacherSchedule, schedule);
  return { skipped: false, matched: true, changed: diff.changed, data: schedule, diff };
}
