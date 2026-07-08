import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';
import { useReminderScheduler } from '@adapters/hooks/useReminderScheduler';
import { ReminderPrompt } from './ReminderPrompt';

// ReminderPrompt 카드가 자체 크롬(bg-sp-card·border·rounded-xl·shadow)을 갖고 있으므로,
// Modal 패널은 배경/테두리를 벗겨 오버레이·포커스트랩·ESC·스크롤락만 담당하게 한다.
const CHROMELESS =
  '!bg-transparent !border-0 !shadow-none !ring-0 !rounded-none !w-auto !max-h-none !overflow-visible';

/**
 * 학생 관찰 기록 알림 — 메인 모드 앱-내 팝업(P2).
 *
 * 지금 물어볼 학생(dueNow)이 있으면 ReminderPrompt를 모달로 띄운다. 저장/건너뛰기 시
 * dueNow가 반응형으로 줄어 자동으로 다음 학생으로 넘어가고, 비면 스스로 사라진다.
 * ModalCoordinator 큐(RECORD_REMINDER=5.2)로 다른 모달과 겹치지 않는다.
 * (OS 토스트 발화는 P3, 위젯/아이콘 은은형 표면은 별도.)
 */
export function ReminderPopup() {
  const { dueNow, tagOptions, saveObservation, snooze, skipStudent, nothingToday } =
    useReminderScheduler();
  const [dismissed, setDismissed] = useState(false);

  const hasDue = dueNow.length > 0 && !dismissed;
  const isHead = useRegisterModal('RECORD_REMINDER', hasDue);

  if (!hasDue || !isHead) return null;
  const current = dueNow[0]!;

  const close = () => setDismissed(true);

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
        queueInfo={dueNow.length > 1 ? { index: 1, total: dueNow.length } : undefined}
        onSave={(payload) => {
          void saveObservation(current.studentId, payload);
        }}
        onNothingToday={() => nothingToday(current.studentId)}
        onSnooze={() => {
          snooze();
          close();
        }}
        onSkipStudent={() => skipStudent(current.studentId)}
        onClose={close}
      />
    </Modal>
  );
}
