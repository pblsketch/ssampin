import { useCallback, useEffect, useState } from 'react';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';
import { useReminderScheduler } from '@adapters/hooks/useReminderScheduler';
import { useReminderOsPush } from '@adapters/hooks/useReminderOsPush';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { ReminderPrompt } from './ReminderPrompt';

/**
 * 학생 관찰 기록 알림 — 메인 모드 앱-내 팝업(P2·P4).
 *
 * **비-모달**: 화면을 가리는 오버레이·포커스트랩·ESC 전역 닫기·스크롤 락이 없다. 선생님이
 * 팝업이 떠 있는 동안에도 뒤에서 계속 다른 작업을 할 수 있도록 우측 하단에 떠 있는 카드로만
 * 노출한다(ReminderPrompt 카드 자체가 배경·테두리·그림자를 모두 갖는 완결된 형태라 이 컨테이너는
 * 위치·z-index·등장 애니메이션만 담당).
 *
 * 한 번 뜰 때 '한 번에 물어볼 학생 수(perNudge)'만큼의 배치를 처리하고, 다 채우면 스누즈해
 * 반 전체로 연쇄되지 않게 한다. 담임반/수업반 학생이 섞여 있어도 각 항목의 target에 따라
 * 저장처(StudentRecord/ObservationRecord)와 태그가 자동 라우팅된다(useReminderScheduler).
 * 진행 상황("2명 중 1명")을 카드에 표시하고, 저장/건너뛰기 시 다음 학생으로 자동 진행.
 */
export function ReminderPopup() {
  // X로 접어둔 항목 key(이 항목이 top인 동안만 숨김).
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // 이번 세션(배치) 진행 상태.
  const [handled, setHandled] = useState(0);
  const [sessionTarget, setSessionTarget] = useState(0);
  // OS 토스트 클릭으로 강제로 연 세션(은은형이 꺼져 있어도 이때는 팝업을 연다).
  const [forcedOpen, setForcedOpen] = useState(false);

  // 은은형(subtleEnabled)이 켜져 있으면 due가 있을 때 팝업이 자동으로 뜬다.
  // 꺼져 있으면 자동으로 뜨지 않고, OS 토스트를 클릭했을 때만(forcedOpen) 열린다.
  const subtleEnabled = useSettingsStore((s) => s.settings.recordReminder?.subtleEnabled ?? true);

  const resetSession = useCallback(() => {
    setHandled(0);
    setSessionTarget(0);
    setDismissedKey(null);
  }, []);

  const handleToastClicked = useCallback(() => {
    resetSession();
    setForcedOpen(true);
  }, [resetSession]);
  // OS 토스트 스케줄 push(P3)를 이 마운트 지점에서 함께 구동한다(MainApp 생존 동안).
  useReminderOsPush(handleToastClicked);

  const { dueNow, saveObservation, snooze, snoozeAll, snoozeStudent, skipStudent, nothingToday } =
    useReminderScheduler();

  const current = dueNow[0];
  const sessionComplete = sessionTarget > 0 && handled >= sessionTarget;
  const hasDue =
    !!current && current.key !== dismissedKey && !sessionComplete && (subtleEnabled || forcedOpen);
  const isHead = useRegisterModal('RECORD_REMINDER', hasDue);

  // 배치가 새로 열릴 때 목표 인원 확정(= 지금 대상 수, 최대 perNudge).
  useEffect(() => {
    if (current && sessionTarget === 0 && dueNow.length > 0) {
      setSessionTarget(dueNow.length);
    }
  }, [current, sessionTarget, dueNow.length]);

  // 배치 완료 → 잠시 스누즈해 반 전체로 연쇄되는 것을 막고, 세션 초기화.
  useEffect(() => {
    if (sessionComplete) {
      snooze();
      resetSession();
      setForcedOpen(false);
    }
  }, [sessionComplete, snooze, resetSession]);

  if (!hasDue || !isHead || !current) return null;

  const advance = () => setHandled((n) => n + 1);
  const close = () => setDismissedKey(current.key);

  return (
    <div
      role="dialog"
      aria-label="관찰 기록 알림"
      className="fixed bottom-4 right-4 z-sp-toast animate-slide-up motion-reduce:animate-none"
    >
      <ReminderPrompt
        key={current.key}
        studentName={current.studentName}
        promptText={current.promptText}
        tagOptions={current.tagOptions}
        queueInfo={{ index: Math.min(handled + 1, sessionTarget || 1), total: sessionTarget || 1 }}
        onSave={(payload) => {
          void saveObservation(current, payload);
          advance();
        }}
        onNothingToday={() => {
          nothingToday(current);
          advance();
        }}
        onSnooze={(scope, when) => {
          if (scope === 'all') {
            snoozeAll(when);
            resetSession();
            setForcedOpen(false);
          } else {
            snoozeStudent(current, when);
            advance();
          }
        }}
        onSkipStudent={() => {
          skipStudent(current);
          advance();
        }}
        onClose={close}
      />
    </div>
  );
}
