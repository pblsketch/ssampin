import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { appinPort } from '@adapters/di/container';
import { autoSyncAppinTimetable } from '@usecases/timetable/AutoSyncAppinTimetable';
import { toLocalDateString } from '@shared/utils/localDate';
import type { TeacherScheduleData, ClassScheduleData } from '@domain/entities/Timetable';

/** 압핀 변경 감지 시 시간표 화면으로 이동시키는 앱 내 네비게이션 이벤트 */
function navigateToTimetable(): void {
  window.dispatchEvent(new CustomEvent('ssampin:navigate', { detail: 'timetable' }));
}

/** lastSyncDate = today 로 갱신해 하루 1회로 스로틀 (나머지 appin 필드는 보존) */
async function markAppinSynced(today: string): Promise<void> {
  const store = useSettingsStore.getState();
  const autoSync = store.settings.appin?.autoSync;
  if (!autoSync) return;
  await store.update({ appin: { autoSync: { ...autoSync, lastSyncDate: today } } });
}

/**
 * 압핀 변경 확인 + 결과 처리(부수효과). 앱 시작 훅과 수동 버튼이 공유한다.
 * 압핀은 학교·교사번호·학년/반이 안정적이라 결정적 재fetch → 지문 재매칭이 없다.
 * - 변경 없음 → (수동일 때만) 안내
 * - 변경 있음 + autoApply → 무음 적용, 아니면 검토 대기(비파괴) + 알림
 */
export async function checkAppinTimetableChange(opts: { manual: boolean }): Promise<void> {
  const { manual } = opts;
  const settings = useSettingsStore.getState().settings;
  const appin = settings.appin;
  const toast = useToastStore.getState().show;

  if (!appin?.autoSync?.enabled) {
    if (manual) toast('먼저 압핀에서 시간표를 한 번 불러와 주세요.', 'info');
    return;
  }

  const schedule = useScheduleStore.getState();
  const result = await autoSyncAppinTimetable(
    appinPort,
    appin.autoSync,
    schedule.teacherSchedule,
    schedule.classSchedule,
    new Date(),
  );

  if (result.skipped) {
    if (manual) {
      toast(
        result.reason === 'fetch-failed'
          ? '압핀에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'
          : '먼저 압핀에서 시간표를 한 번 불러와 주세요.',
        'info',
      );
    }
    return;
  }

  const today = toLocalDateString();

  if (!result.changed || !result.data) {
    if (manual) toast('시간표에 바뀐 내용이 없어요. 최신 상태예요.', 'success');
    await markAppinSynced(today);
    return;
  }

  const changeCount = result.diff?.changes.length ?? 0;

  if (appin.autoSync.autoApply) {
    // 옵트인 무음 적용 (압핀 기본 아님)
    if (result.target === 'teacher') {
      await useScheduleStore.getState().updateTeacherSchedule(result.data as TeacherScheduleData);
    } else {
      await useScheduleStore.getState().updateClassSchedule(result.data as ClassScheduleData);
    }
    toast(`압핀 시간표가 업데이트됐어요. (${changeCount}칸 변경)`, 'success');
    await markAppinSynced(today);
    return;
  }

  // 기본: 비파괴 — 검토 대기로 두고 알림만
  useScheduleStore.getState().setPendingAppinReview({
    schedule: result.data,
    changeCount,
    target: result.target,
  });
  toast(`압핀에서 시간표가 바뀌었어요. (${changeCount}칸) 검토 후 적용해주세요.`, 'info', {
    label: '검토하기',
    onClick: navigateToTimetable,
  });
  await markAppinSynced(today);
}

/**
 * 앱 시작 시 압핀 시간표 변경 자동 확인 훅. App 최상위에서 1회 호출.
 * 하루 1회(lastSyncDate) + 앱 세션당 1회로 스로틀 — sgpap.com 폴링 금지 원칙.
 */
export function useAppinAutoSync(): void {
  const settings = useSettingsStore((s) => s.settings);
  const scheduled = useRef(false);

  useEffect(() => {
    if (scheduled.current) return;
    // settings 는 앱 시작 시 디스크에서 비동기로 채워지므로 [settings] 로 재실행을 받아
    // autoSync 가 로드된 시점을 포착한다.
    const autoSync = settings.appin?.autoSync;
    if (!autoSync?.enabled) return;
    if (autoSync.lastSyncDate === toLocalDateString()) return; // 오늘 이미 확인
    scheduled.current = true;

    // 살짝 지연시켜 다른 앱 시작 동기화와 겹치지 않게 한다. cleanup 으로 취소하지 않는데,
    // 3초 안에 다른 시작 동기화가 settings 를 갱신하면 effect 가 재실행되며 clearTimeout 으로
    // 타이머가 영구 취소되는 레이스가 생기기 때문이다. App 최상위 훅이라 실제 unmount 는 앱
    // 종료뿐이고, checkAppinTimetableChange 는 스토어 getState 만 쓰므로 정리가 불필요하다.
    setTimeout(() => {
      void checkAppinTimetableChange({ manual: false });
    }, 3000);
  }, [settings]);
}
