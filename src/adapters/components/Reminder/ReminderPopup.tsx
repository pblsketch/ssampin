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
 * 학생 관찰 기록 알림 — 메인 모드 앱-내 팝업(P2).
 *
 * 한 번 뜰 때 **'한 번에 물어볼 학생 수(perNudge)'만큼의 배치**를 처리한다.
 * 그 배치를 다 채우면(또는 대상이 없어지면) 스스로 스누즈해 반 전체로 연쇄되지 않게 한다.
 * 진행 상황("2명 중 1명")을 카드에 표시한다. 저장/건너뛰기 시 다음 학생으로 자동 진행.
 * X로 닫으면 그 학생만 접어두되, 다른 학생 배치가 생기면 다시 뜬다.
 * ModalCoordinator 큐(RECORD_REMINDER=5.2)로 다른 모달과 겹치지 않는다.
 */
export function ReminderPopup() {
  // X로 접어둔 학생 id(이 학생이 top인 동안만 숨김).
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  // 이번 세션(배치) 진행 상태.
  const [handled, setHandled] = useState(0);
  const [sessionTarget, setSessionTarget] = useState(0);

  const resetSession = useCallback(() => {
    setHandled(0);
    setSessionTarget(0);
    setDismissedId(null);
  }, []);

  // OS 토스트 클릭 시 배치를 새로 시작(접어둔 상태 해제).
  const handleToastClicked = useCallback(() => resetSession(), [resetSession]);
  // OS 토스트 스케줄 push(P3)를 이 마운트 지점에서 함께 구동한다(MainApp 생존 동안).
  useReminderOsPush(handleToastClicked);

  const { dueNow, tagOptions, saveObservation, snooze, skipStudent, nothingToday } =
    useReminderScheduler();

  const current = dueNow[0];
  const sessionComplete = sessionTarget > 0 && handled >= sessionTarget;
  const hasDue = !!current && current.studentId !== dismissedId && !sessionComplete;
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
  const close = () => setDismissedId(current.studentId);

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
        key={current.studentId}
        studentName={current.studentName}
        promptText={current.promptText}
        tagOptions={tagOptions}
        queueInfo={{ index: Math.min(handled + 1, sessionTarget || 1), total: sessionTarget || 1 }}
        onSave={(payload) => {
          void saveObservation(current.studentId, payload);
          advance();
        }}
        onNothingToday={() => {
          nothingToday(current.studentId);
          advance();
        }}
        onSnooze={() => snooze()}
        onSkipStudent={() => {
          skipStudent(current.studentId);
          advance();
        }}
        onClose={close}
      />
    </Modal>
  );
}
