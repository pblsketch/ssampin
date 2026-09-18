import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { comciganPort } from '@adapters/di/container';
import { autoSyncComciganTimetable } from '@usecases/timetable/AutoSyncComciganTimetable';
import {
  buildComciganWeeklyOverrides,
  isWeekendDate,
  weekMondayOf,
} from '@domain/rules/comciganWeeklyOverrides';
import type { TimetableChange } from '@domain/rules/timetableDiff';
import { toLocalDateString } from '@shared/utils/localDate';
import type { TimetableCheckResult } from './timetableCheckTypes';

/** 컴시간 변경 감지 시 시간표 화면으로 이동시키는 앱 내 네비게이션 이벤트 */
function navigateToTimetable(): void {
  window.dispatchEvent(new CustomEvent('ssampin:navigate', { detail: 'timetable' }));
}

/** lastSyncDate = today 로 갱신해 하루 1회로 스로틀 (fingerprint 등 나머지 comcigan 필드는 보존) */
async function markComciganSynced(today: string): Promise<void> {
  const store = useSettingsStore.getState();
  const autoSync = store.settings.comcigan?.autoSync;
  if (!autoSync) return;
  await store.update({ comcigan: { autoSync: { ...autoSync, lastSyncDate: today } } });
}

/** 되돌린 주 표식을 쓴다/지운다. 설정에 저장되므로 재시작·다른 기기에서도 유지된다. */
async function setWeeklySuppressedWeek(week: string | undefined): Promise<void> {
  const store = useSettingsStore.getState();
  if ((store.settings.comcigan?.weeklySuppressedWeek ?? undefined) === week) return;
  await store.update({ comcigan: { weeklySuppressedWeek: week } });
}

interface WeeklyApplyOutcome {
  readonly weekMonday: string;
  readonly changeCount: number;
  readonly applied: number;
  readonly skipped: number;
  readonly reason?: 'weekend' | 'suppressed';
}

/**
 * 이번 주 변동을 그 주 날짜의 변동 시간표로 등록한다(자동 반영).
 *
 * - 주말(토·일)에는 등록하지 않는다. 컴시간 이번 주 자료가 주말에 어느 주를 가리키는지
 *   실측되지 않았고, 이미 반영된 이번 주 항목을 지우지도 않는다.
 * - 사용자가 되돌린 주에는 자동 확인이 다시 넣지 않는다. 사용자가 **직접 누른** 확인이면
 *   그 표식을 지우고 다시 넣는다(실수로 되돌린 경우의 복구 경로).
 * - 변동이 0칸이어도 등록을 호출한다 — 컴시간에서 보강이 취소되면 그 주 항목이 사라져야 한다.
 */
async function applyWeeklyChanges(input: {
  readonly teacherChanges: readonly TimetableChange[];
  readonly classChanges: readonly TimetableChange[];
  readonly manual: boolean;
}): Promise<WeeklyApplyOutcome> {
  const settings = useSettingsStore.getState().settings;
  const schedule = useScheduleStore.getState();
  const changeCount = input.teacherChanges.length + input.classChanges.length;
  const now = new Date();
  const weekMonday = weekMondayOf(now);

  const notApplied = (reason: 'weekend' | 'suppressed'): WeeklyApplyOutcome => {
    schedule.setComciganWeeklyApply(
      changeCount > 0
        ? {
            weekMonday,
            changeCount,
            applied: 0,
            skipped: 0,
            state: 'not-applied',
            reason,
            drafts: [],
          }
        : null,
    );
    return { weekMonday, changeCount, applied: 0, skipped: 0, reason };
  };

  if (isWeekendDate(now)) return notApplied('weekend');

  const suppressed = settings.comcigan?.weeklySuppressedWeek === weekMonday;
  if (suppressed && !input.manual) return notApplied('suppressed');

  const { drafts } = buildComciganWeeklyOverrides({
    baseDate: now,
    teacherChanges: input.teacherChanges,
    classChanges: input.classChanges,
    maxPeriods: settings.maxPeriods,
  });
  const { applied, skipped } = await schedule.applyComciganWeeklyOverrides(weekMonday, drafts);
  if (suppressed) await setWeeklySuppressedWeek(undefined);

  schedule.setComciganWeeklyApply(
    changeCount > 0
      ? { weekMonday, changeCount, applied, skipped, state: 'applied', drafts }
      : null,
  );
  return { weekMonday, changeCount, applied, skipped };
}

/** 토스트에 덧붙일 이번 주 반영 안내 (앞에 공백 한 칸) */
function weeklyNoteOf(outcome: WeeklyApplyOutcome): string {
  if (outcome.changeCount === 0) return '';
  if (outcome.reason === 'weekend') {
    return ` 이번 주 보강·교체가 ${outcome.changeCount}칸 있어요. 주말에는 자동으로 반영하지 않아요.`;
  }
  if (outcome.reason === 'suppressed') {
    return ` 이번 주 보강·교체가 ${outcome.changeCount}칸 있어요. 되돌린 상태라 반영하지 않았어요.`;
  }
  const skipNote = outcome.skipped > 0 ? ` 직접 바꾼 ${outcome.skipped}칸은 그대로 뒀어요.` : '';
  if (outcome.applied === 0) {
    return skipNote || ` 이번 주 보강·교체 ${outcome.changeCount}칸은 이미 반영돼 있어요.`;
  }
  return ` 이번 주 시간표 ${outcome.applied}칸을 반영했어요.${skipNote}`;
}

/**
 * 되돌리기 — 그 주의 컴시간발 항목을 지우고 "이번 주는 자동으로 넣지 마" 표식을 남긴다.
 * 배너는 사라지지 않고 '다시 반영하기'로 남는다(실수로 되돌린 경우의 복구 경로).
 */
export async function revertComciganWeeklyApply(): Promise<void> {
  const schedule = useScheduleStore.getState();
  const current = schedule.comciganWeeklyApply;
  if (!current) return;
  await schedule.revertComciganWeeklyOverrides(current.weekMonday);
  await setWeeklySuppressedWeek(current.weekMonday);
  schedule.setComciganWeeklyApply({ ...current, applied: 0, skipped: 0, state: 'reverted' });
}

/** 다시 반영하기 — 되돌리기 직후 배너에서 부른다. 컴시간을 다시 조회하지 않는다. */
export async function reapplyComciganWeeklyApply(): Promise<void> {
  const schedule = useScheduleStore.getState();
  const current = schedule.comciganWeeklyApply;
  if (!current) return;
  const { applied, skipped } = await schedule.applyComciganWeeklyOverrides(
    current.weekMonday,
    current.drafts,
  );
  await setWeeklySuppressedWeek(undefined);
  schedule.setComciganWeeklyApply({ ...current, applied, skipped, state: 'applied' });
}

/**
 * 학기 기본 편성표를 검토·적용한 직후 이번 주 항목을 다시 맞춘다.
 * 컴시간을 다시 조회하지 않고(폴링 금지) 들고 있던 초안을 그대로 재적용한다 —
 * 교시 수·사용자 변동이 그 사이 달라졌을 수 있어 건너뛴 칸 판정이 바뀔 수 있다.
 */
export async function refreshComciganWeeklyAfterBaseApplied(): Promise<void> {
  const schedule = useScheduleStore.getState();
  const current = schedule.comciganWeeklyApply;
  if (!current || current.state !== 'applied') return;
  const { applied, skipped } = await schedule.applyComciganWeeklyOverrides(
    current.weekMonday,
    current.drafts,
  );
  schedule.setComciganWeeklyApply({ ...current, applied, skipped });
}

/**
 * 컴시간 변경 확인 + 결과 처리(부수효과). 앱 시작 훅과 수동 버튼, 위젯 새로고침이 공유한다.
 * - 매칭 실패 → "다시 선택" 안내(적용 0)
 * - 변경 없음 → (수동일 때만) 안내
 * - 이번 주 보강·교체(일일자료) → 기본 편성표 판정과 별개로 그 주 날짜의 변동 시간표에 자동 등록
 *   (결과 요약만 스토어 comciganWeeklyApply 에 싣는다)
 * - 변경 있음 + autoApply → 무음 적용, 아니면 검토 대기(비파괴) + 알림
 *
 * 판정 결과를 반환하는 이유: 위젯 창에는 토스트 표시기가 없어(App.tsx WidgetApp) 안내를
 * 호출자가 직접 그려야 한다. silent 를 켜면 토스트를 띄우지 않고 결과만 돌려준다.
 */
export async function checkComciganTimetableChange(opts: {
  manual: boolean;
  silent?: boolean;
}): Promise<TimetableCheckResult> {
  const { manual, silent = false } = opts;
  const settings = useSettingsStore.getState().settings;
  const comcigan = settings.comcigan;
  const show = useToastStore.getState().show;
  const toast: typeof show = silent ? () => undefined : show;

  if (!comcigan?.autoSync?.enabled || !comcigan.fingerprint) {
    if (manual) toast('먼저 컴시간에서 시간표를 한 번 불러와 주세요.', 'info');
    return { status: 'not-configured', changeCount: 0 };
  }

  const schedule = useScheduleStore.getState();
  const result = await autoSyncComciganTimetable(
    comciganPort,
    comcigan.fingerprint,
    schedule.teacherSchedule,
    comcigan.classRef,
  );

  if (result.skipped) {
    // 지문 없음/네트워크 실패 — 자동일 땐 조용히, 수동일 땐 이유 안내
    if (manual) {
      toast(
        result.reason === 'fetch-failed'
          ? '컴시간에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'
          : '먼저 컴시간에서 시간표를 한 번 불러와 주세요.',
        'info',
      );
    }
    return {
      status: result.reason === 'fetch-failed' ? 'fetch-failed' : 'not-configured',
      changeCount: 0,
    };
  }

  const today = toLocalDateString();

  if (!result.matched) {
    // 오귀속 방지 — 절대 적용하지 않고 재선택 유도
    toast(
      '컴시간에서 본인을 다시 선택해주세요. (교사 자동 매칭에 실패했어요)',
      'info',
      { label: '컴시간 열기', onClick: navigateToTimetable },
      5000,
    );
    await markComciganSynced(today);
    return { status: 'unmatched', changeCount: 0 };
  }

  // 이번 주 변동(보강·교체) — 일일자료가 있을 때만. 기본 편성표 판정과 별개로,
  // 그 주 날짜의 변동 시간표로 **자동 등록**한다(ADR-091 3항의 "알리기만" 결정을 대체).
  // 학기 기본 편성표는 건드리지 않는다 — 이번 주만의 일을 편성표에 덮으면 다음 주가 틀어진다.
  const weeklyChanges = result.weekly?.diff.changes ?? [];
  const weeklyClassChanges = result.weeklyClass?.diff.changes ?? [];
  const weeklyChangeCount = weeklyChanges.length + weeklyClassChanges.length;
  const applyOutcome = await applyWeeklyChanges({
    teacherChanges: weeklyChanges,
    classChanges: weeklyClassChanges,
    manual,
  });
  const weeklyNote = weeklyNoteOf(applyOutcome);
  /** 확인 결과에 실어 보낼 이번 주 반영 요약 (위젯 배너가 문구를 정하는 근거) */
  const weeklyResult = {
    weeklyChangeCount,
    weeklyAppliedCount: applyOutcome.applied,
    ...(applyOutcome.reason ? { weeklyNotApplied: applyOutcome.reason } : {}),
  };

  if (!result.changed || !result.data) {
    if (weeklyChangeCount > 0) {
      // 자동 확인(앱 시작, 하루 1회)에서도 알린다 — 이번 주 수업이 달라졌다는 건 오늘의 일이다.
      toast(
        `기본 시간표는 그대로예요.${weeklyNote}`,
        'info',
        {
          label: '보기',
          onClick: navigateToTimetable,
        },
        6000,
      );
    } else if (manual) {
      toast('시간표에 바뀐 내용이 없어요. 최신 상태예요.', 'success');
    }
    await markComciganSynced(today);
    return { status: 'unchanged', changeCount: 0, ...weeklyResult };
  }

  const changeCount = result.diff?.changes.length ?? 0;

  if (comcigan.autoSync.autoApply) {
    // 옵트인 무음 적용 (컴시간 기본 아님)
    await useScheduleStore.getState().updateTeacherSchedule(result.data);
    toast(`컴시간 시간표가 업데이트됐어요. (${changeCount}칸 변경)${weeklyNote}`, 'success');
    await markComciganSynced(today);
    return { status: 'applied', changeCount, ...weeklyResult };
  }

  // 기본: 비파괴 — 검토 대기로 두고 알림만
  useScheduleStore.getState().setPendingComciganReview({ schedule: result.data, changeCount });
  toast(
    `컴시간에서 시간표가 바뀌었어요. (${changeCount}칸) 검토 후 적용해주세요.${weeklyNote}`,
    'info',
    {
      label: '검토하기',
      onClick: navigateToTimetable,
    },
  );
  await markComciganSynced(today);
  return { status: 'pending', changeCount, ...weeklyResult };
}

/**
 * 앱 시작 시 컴시간 시간표 변경 자동 확인 훅. App 최상위에서 1회 호출.
 * 하루 1회(lastSyncDate) + 앱 세션당 1회로 스로틀 — comci.net 폴링 금지 원칙.
 */
export function useComciganAutoSync(): void {
  const settings = useSettingsStore((s) => s.settings);
  const scheduled = useRef(false);

  useEffect(() => {
    if (scheduled.current) return;
    // settings 는 앱 시작 시 디스크에서 비동기로 채워지므로 [settings] 로 재실행을 받아
    // autoSync 가 로드된 시점을 포착한다.
    const autoSync = settings.comcigan?.autoSync;
    if (!autoSync?.enabled || !settings.comcigan?.fingerprint) return;
    if (autoSync.lastSyncDate === toLocalDateString()) return; // 오늘 이미 확인
    scheduled.current = true;

    // 살짝 지연시켜 다른 앱 시작 동기화(드라이브/나이스)와 겹치지 않게 한다. cleanup 으로
    // 취소하지 않는데, 3초 내 settings 갱신 시 effect 재실행 → clearTimeout 으로 타이머가
    // 영구 취소되는 레이스를 막기 위함이다. App 최상위 훅이라 실제 unmount 는 앱 종료뿐이다.
    setTimeout(() => {
      void checkComciganTimetableChange({ manual: false });
    }, 2500);
  }, [settings]);
}
