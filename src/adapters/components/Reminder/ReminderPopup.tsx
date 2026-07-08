import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';
import { useReminderScheduler } from '@adapters/hooks/useReminderScheduler';
import { useReminderOsPush } from '@adapters/hooks/useReminderOsPush';
import { ReminderPrompt } from './ReminderPrompt';

// ReminderPrompt 카드가 자체 크롬(bg-sp-card·border·rounded-xl·shadow)을 갖고 있으므로,
// Modal 패널은 배경/테두리를 벗겨 오버레이·포커스트랩·ESC·스크롤락만 담당하게 한다.
const CHROMELESS =
  '!bg-transparent !border-0 !shadow-none !ring-0 !rounded-none !w-auto !max-h-none !overflow-visible';

/**
 * 학생 관찰 기록 알림 — 메인 모드 앱-내 팝업(P2·P4).
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

  const resetSession = useCallback(() => {
    setHandled(0);
    setSessionTarget(0);
    setDismissedKey(null);
  }, []);

  const handleToastClicked = useCallback(() => resetSession(), [resetSession]);
  // OS 토스트 스케줄 push(P3)를 이 마운트 지점에서 함께 구동한다(MainApp 생존 동안).
  useReminderOsPush(handleToastClicked);

  const { dueNow, saveObservation, snooze, skipStudent, nothingToday } = useReminderScheduler();

  const current = dueNow[0];
  const sessionComplete = sessionTarget > 0 && handled >= sessionTarget;
  const hasDue = !!current && current.key !== dismissedKey && !sessionComplete;
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
    }
  }, [sessionComplete, snooze, resetSession]);

  if (!hasDue || !isHead || !current) return null;

  const advance = () => setHandled((n) => n + 1);
  const close = () => setDismissedKey(current.key);

  return (
    <Modal
      isOpen
      onClose={close}
      title="관찰 기록 알림"
      srOnlyTitle
      size="sm"
      panelClassName={CHROMELESS}
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
        onSnooze={() => snooze()}
        onSkipStudent={() => {
          skipStudent(current);
          advance();
        }}
        onClose={close}
      />
    </Modal>
  );
}
