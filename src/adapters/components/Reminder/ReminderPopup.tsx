import { useCallback, useState } from 'react';
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
 * 지금 물어볼 학생(dueNow)이 있으면 ReminderPrompt를 모달로 띄운다. 저장/건너뛰기 시
 * dueNow가 반응형으로 줄어 자동으로 다음 학생으로 넘어가고, 비면 스스로 사라진다.
 * X로 닫으면 그 학생만 이번 세션 동안 접어두되, 다른 학생 due가 생기면 다시 뜬다(학생별 dismiss).
 * ModalCoordinator 큐(RECORD_REMINDER=5.2)로 다른 모달과 겹치지 않는다.
 */
export function ReminderPopup() {
  // X로 접어둔 학생 id(이 학생이 top인 동안만 숨김). 다른 학생이 top이 되면 다시 노출.
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  // OS 토스트 클릭 시 접어둔 상태를 해제해 팝업을 다시 노출(레이어 M2 — reminderId 해석은 렌더러).
  const handleToastClicked = useCallback(() => setDismissedId(null), []);
  // OS 토스트 스케줄 push(P3)를 이 마운트 지점에서 함께 구동한다(MainApp 생존 동안).
  useReminderOsPush(handleToastClicked);

  const { dueNow, tagOptions, saveObservation, snooze, skipStudent, nothingToday } =
    useReminderScheduler();

  const current = dueNow[0];
  const hasDue = !!current && current.studentId !== dismissedId;
  const isHead = useRegisterModal('RECORD_REMINDER', hasDue);

  if (!hasDue || !isHead || !current) return null;

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
        queueInfo={dueNow.length > 1 ? { index: 1, total: dueNow.length } : undefined}
        onSave={(payload) => {
          void saveObservation(current.studentId, payload);
        }}
        onNothingToday={() => nothingToday(current.studentId)}
        onSnooze={() => snooze()}
        onSkipStudent={() => skipStudent(current.studentId)}
        onClose={close}
      />
    </Modal>
  );
}
