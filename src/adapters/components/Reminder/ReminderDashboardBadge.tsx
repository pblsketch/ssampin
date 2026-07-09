import { useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useReminderScheduler } from '@adapters/hooks/useReminderScheduler';
import { requestHomeroomTab } from '@adapters/components/Homeroom/homeroomTabIntent';
import { ReminderBadge } from './ReminderBadge';

/**
 * 대시보드용 은은형 알림 배지 컨테이너.
 *
 * 설정에서 은은형(subtleEnabled) 알림이 켜져 있고 미기록 학생이 있을 때만 렌더한다.
 * 게이미피케이션 없이 "미기록 N명" 완결성 큐로만 기능(ReminderBadge 참고).
 * 클릭 시 담임 업무 '기록' 탭으로 이동한다 — 프롭 threading 없이 SampleRosterWarningBanner와
 * 같은 `ssampin:navigate` 커스텀 이벤트(App.tsx가 수신) + requestHomeroomTab으로 처리해
 * 어느 페이지에 배치되어도 재사용 가능하다.
 */
export function ReminderDashboardBadge() {
  const rr = useSettingsStore((s) => s.settings.recordReminder);
  const { missingCount } = useReminderScheduler();

  const handleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'homeroom' }));
    requestHomeroomTab('records');
  }, []);

  if (!rr?.enabled || !rr?.subtleEnabled || missingCount <= 0) return null;

  return (
    <div className="-mt-4 mb-6">
      <ReminderBadge count={missingCount} variant="inline" onClick={handleClick} />
    </div>
  );
}
