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
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import {
  buildClassSchedule,
  buildTeacherSchedule,
  decodeDailyTimetable,
  decodeTimetable,
  summarizeTeachers,
} from '@domain/rules/comciganRules';
import { locateTeacherByFingerprint } from '@domain/rules/comciganTeacherMatch';
import { diffClassSchedule, diffTeacherSchedule } from '@domain/rules/timetableDiff';
import type { TimetableDiffResult } from '@domain/rules/timetableDiff';

export type ComciganSyncSkipReason = 'no-fingerprint' | 'fetch-failed' | 'no-match';

/**
 * 이번 주 변경 — 컴시간 일일자료(보강·교체 반영)로 만든 이 교사의 이번 주 시간표와,
 * 같은 응답의 기본 편성표(원자료)로 만든 시간표의 차이. 기본 편성표 diff(`changed`)와는
 * 별개다: 기본 편성표는 그대로인데 이번 주만 몇 칸 달라진 경우가 바로 이것이다.
 */
export interface ComciganWeeklyChanges {
  /** 이번 주 실제 시간표(보강·교체 반영) */
  readonly schedule: TeacherScheduleData;
  /** 기본 편성표 → 이번 주 시간표 차이 */
  readonly diff: TimetableDiffResult;
}

/**
 * 우리 반(담임 학급) 이번 주 변경. 교사 쪽과 같은 규약으로 **서버 원자료 ↔ 서버 일일자료**를
 * 같은 학년·반으로 견준다. 저장본과 견주지 않는 이유도 같다 — 기본 편성표 변경과 섞이면
 * 무엇이 이번 주만의 일인지 알 수 없다. 교사 자동 매칭 결과와 무관하게 계산한다.
 */
export interface ComciganWeeklyClassChanges {
  readonly schedule: ClassScheduleData;
  readonly diff: TimetableDiffResult;
}

/** 우리 반 이번 주 변동 계산 대상 (컴시간에서 학급 시간표를 가져올 때 저장한 학년·반) */
export interface ComciganClassRef {
  readonly grade: number;
  readonly classNum: number;
}

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
  /** matched 이고 컴시간이 일일자료를 줬을 때만. 일일자료가 없는 학교는 undefined */
  readonly weekly?: ComciganWeeklyChanges;
  /** classRef 를 넘겼고 일일자료가 있을 때만. 없으면 undefined */
  readonly weeklyClass?: ComciganWeeklyClassChanges;
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
 * @param classRef 우리 반 이번 주 변동을 함께 계산할 학년·반(없으면 계산하지 않음)
 */
export async function autoSyncComciganTimetable(
  comciganPort: IComciganPort,
  fingerprint: ComciganTeacherFingerprint | undefined,
  currentTeacherSchedule: TeacherScheduleData,
  classRef?: ComciganClassRef,
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

  // 이번 주 변경: 일일자료의 같은 교사 시간표를 "서버의 기본 편성표"와 견준다(저장본이 아니라).
  // 저장본과 견주면 기본 편성표 변경과 섞여 무엇이 이번 주만의 것인지 알 수 없다.
  const dailyLessons = decodeDailyTimetable(data);
  let weekly: ComciganWeeklyChanges | undefined;
  let weeklyClass: ComciganWeeklyClassChanges | undefined;
  if (dailyLessons) {
    const { schedule: weekSchedule } = buildTeacherSchedule(dailyLessons, matched.index);
    weekly = { schedule: weekSchedule, diff: diffTeacherSchedule(schedule, weekSchedule) };

    // 우리 반 이번 주 변경 — 같은 규약(서버 원자료 ↔ 서버 일일자료)으로 학년·반만 바꿔 견준다.
    // 교사 매칭과 무관하며, 학년·반을 모르면(가져온 적 없으면) 계산하지 않는다.
    if (classRef) {
      const { schedule: baseClass } = buildClassSchedule(
        lessons,
        classRef.grade,
        classRef.classNum,
      );
      const { schedule: weekClass } = buildClassSchedule(
        dailyLessons,
        classRef.grade,
        classRef.classNum,
      );
      weeklyClass = { schedule: weekClass, diff: diffClassSchedule(baseClass, weekClass) };
    }
  }

  return {
    skipped: false,
    matched: true,
    changed: diff.changed,
    data: schedule,
    diff,
    ...(weekly ? { weekly } : {}),
    ...(weeklyClass ? { weeklyClass } : {}),
  };
}
