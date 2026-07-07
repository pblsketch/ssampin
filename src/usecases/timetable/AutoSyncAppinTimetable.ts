/**
 * 압핀 시간표 자동연동 UseCase.
 *
 * 저장된 압핀 설정(webdir + 교사번호 또는 학년/반)으로 현재 주차 파일을 재fetch → 시간표를
 * 다시 구성 → 현재 저장본과 diff 한다. 스로틀/enabled 판단·부수효과(적용/알림)는 호출부(hook)가
 * 담당하고, 이 UseCase는 "무엇이 바뀌었는가"만 계산한다(포트만 의존, 순수 규칙 조합).
 *
 * 압핀은 학교·교사번호·학년/반이 안정적이라 컴시간식 지문 재매칭이 필요 없다(결정적 재fetch).
 */
import type { IAppinPort } from '@domain/ports/IAppinPort';
import type { AppinAutoSyncSettings } from '@domain/entities/Settings';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import {
  parseGrid,
  parseAppinClasses,
  buildClassScheduleFromAppin,
  buildTeacherScheduleFromAppin,
  countWeekFiles,
  currentWeekByModified,
  estimateWeekFromDate,
  weekFileName,
} from '@domain/rules/appinRules';
import { diffTeacherSchedule, diffClassSchedule } from '@domain/rules/timetableDiff';
import type { TimetableDiffResult } from '@domain/rules/timetableDiff';
import { endOfLocalDayIso } from '@shared/utils/localDate';

export type AppinSyncSkipReason = 'no-config' | 'fetch-failed' | 'no-data';

export interface AppinSyncResult {
  readonly skipped: boolean;
  readonly changed: boolean;
  readonly target: 'teacher' | 'class';
  readonly data?: TeacherScheduleData | ClassScheduleData;
  readonly diff?: TimetableDiffResult;
  readonly reason?: AppinSyncSkipReason;
}

const SKIP = (reason: AppinSyncSkipReason, target: 'teacher' | 'class'): AppinSyncResult => ({
  skipped: true,
  changed: false,
  target,
  reason,
});

/**
 * 압핀 설정으로 현재 주차 시간표를 재확인해 변경을 계산한다.
 * @param cfg 저장된 압핀 자동연동 설정(없거나 미enabled면 skip)
 */
export async function autoSyncAppinTimetable(
  appinPort: IAppinPort,
  cfg: AppinAutoSyncSettings | undefined,
  currentTeacherSchedule: TeacherScheduleData,
  currentClassSchedule: ClassScheduleData,
  now: Date,
): Promise<AppinSyncResult> {
  const target = cfg?.target ?? 'teacher';
  if (!cfg || !cfg.enabled || !cfg.webdir) return SKIP('no-config', target);

  try {
    const files = await appinPort.listFiles(cfg.webdir);
    const total = countWeekFiles(files);
    if (total === 0) return SKIP('fetch-failed', target);
    // 날짜 앵커 추정을 먼저 구해, 수정시각 동률 시 주차 판정의 tie-breaker 로 넘긴다.
    const anchorWeek = estimateWeekFromDate(cfg.date, total, now) ?? undefined;
    const week =
      currentWeekByModified(files, endOfLocalDayIso(now), anchorWeek) ?? anchorWeek ?? total;

    if (cfg.target === 'teacher') {
      const idx = (cfg.teacherNo ?? 0) - 1;
      if (idx < 0) return SKIP('no-data', target);
      // 교사 시간표는 g파일(교차검증 확정 — t는 특별실)
      const text = await appinPort.getWeekFileText(cfg.webdir, weekFileName('g', week));
      const grid = parseGrid(text)[idx];
      const hasContent = grid && grid.some((day) => day.some((cell) => cell !== null));
      if (!hasContent) return SKIP('no-data', target);
      const { schedule } = buildTeacherScheduleFromAppin(grid);
      const diff = diffTeacherSchedule(currentTeacherSchedule, schedule);
      return { skipped: false, changed: diff.changed, target, data: schedule, diff };
    }

    // class — 학년/반으로 원소 목록에서 줄 인덱스 재도출(순서 변동에 강건)
    const ele = await appinPort.getElements(cfg.webdir);
    const ref = parseAppinClasses(ele.elements).find(
      (c) => c.grade === cfg.grade && c.classNum === cfg.classNum,
    );
    if (!ref) return SKIP('no-data', target);
    const text = await appinPort.getWeekFileText(cfg.webdir, weekFileName('h', week));
    const grid = parseGrid(text)[ref.index];
    if (!grid) return SKIP('no-data', target);
    const { schedule } = buildClassScheduleFromAppin(grid);
    const diff = diffClassSchedule(currentClassSchedule, schedule);
    return { skipped: false, changed: diff.changed, target, data: schedule, diff };
  } catch {
    return SKIP('fetch-failed', target);
  }
}
