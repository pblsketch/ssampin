import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { comciganPort } from '@adapters/di/container';
import { autoSyncComciganTimetable } from '@usecases/timetable/AutoSyncComciganTimetable';
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

/**
 * 컴시간 변경 확인 + 결과 처리(부수효과). 앱 시작 훅과 수동 버튼, 위젯 새로고침이 공유한다.
 * - 매칭 실패 → "다시 선택" 안내(적용 0)
 * - 변경 없음 → (수동일 때만) 안내
 * - 이번 주 보강·교체(일일자료) → 기본 편성표 판정과 별개로 알림만(반영 안 함, 스토어 weeklyComciganChanges)
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

  // 이번 주 변경(보강·교체) — 일일자료가 있을 때만. 기본 편성표 판정과 따로 알리고,
  // 시간표에는 반영하지 않는다(이번 주만의 일이라 기본 편성표를 덮으면 안 된다).
  // 예전엔 원자료만 봐서 이 변경이 있어도 "바뀐 내용이 없어요"라고 답했다(2026-09-08 제보).
  const weeklyChanges = result.weekly?.diff.changes ?? [];
  const weeklyChangeCount = weeklyChanges.length;
  useScheduleStore
    .getState()
    .setWeeklyComciganChanges(
      result.weekly && weeklyChangeCount > 0
        ? { changes: weeklyChanges, schedule: result.weekly.schedule, checkedAt: today }
        : null,
    );
  const weeklyNote =
    weeklyChangeCount > 0 ? ` 이번 주 보강·교체도 ${weeklyChangeCount}칸 있어요.` : '';

  if (!result.changed || !result.data) {
    if (weeklyChangeCount > 0) {
      // 자동 확인(앱 시작, 하루 1회)에서도 알린다 — 이번 주 수업이 달라졌다는 건 오늘의 일이다.
      toast(
        `기본 시간표는 그대로예요. 이번 주 보강·교체가 ${weeklyChangeCount}칸 있어요.`,
        'info',
        { label: '보기', onClick: navigateToTimetable },
        6000,
      );
    } else if (manual) {
      toast('시간표에 바뀐 내용이 없어요. 최신 상태예요.', 'success');
    }
    await markComciganSynced(today);
    return { status: 'unchanged', changeCount: 0, weeklyChangeCount };
  }

  const changeCount = result.diff?.changes.length ?? 0;

  if (comcigan.autoSync.autoApply) {
    // 옵트인 무음 적용 (컴시간 기본 아님)
    await useScheduleStore.getState().updateTeacherSchedule(result.data);
    toast(`컴시간 시간표가 업데이트됐어요. (${changeCount}칸 변경)${weeklyNote}`, 'success');
    await markComciganSynced(today);
    return { status: 'applied', changeCount, weeklyChangeCount };
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
  return { status: 'pending', changeCount, weeklyChangeCount };
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
