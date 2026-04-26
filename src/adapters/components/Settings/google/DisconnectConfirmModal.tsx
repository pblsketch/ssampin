import { Modal } from '@adapters/components/common/Modal';

interface DisconnectConfirmModalProps {
  email: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

interface AffectedService {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
}

const AFFECTED_SERVICES: readonly AffectedService[] = [
  {
    icon: 'cloud_sync',
    iconColor: 'bg-cyan-500/10 text-cyan-400',
    title: '앱 데이터 백업',
    description: 'Drive 백업이 중단됩니다',
  },
  {
    icon: 'event',
    iconColor: 'bg-pink-500/10 text-pink-400',
    title: 'Google 캘린더',
    description: '가져온 일정이 제거되고 동기화가 멈춥니다',
  },
  {
    icon: 'checklist',
    iconColor: 'bg-green-500/10 text-green-400',
    title: 'Google Tasks',
    description: '할 일 양방향 연동이 멈춥니다',
  },
];

export function DisconnectConfirmModal({
  email,
  onConfirm,
  onCancel,
}: DisconnectConfirmModalProps) {
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Google 계정 연결 해제"
      srOnlyTitle
      size="md"
      closeOnBackdrop={false}
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10">
            <span className="material-symbols-outlined text-red-400">link_off</span>
          </div>
          <h3 className="text-lg font-bold text-sp-text">
            Google 계정 연결 해제
          </h3>
        </div>

        <p className="text-sm text-sp-muted mb-4">
          {email ? `${email} 계정의 연결을 해제합니다.` : 'Google 계정 연결을 해제합니다.'}
          <br />
          다음 서비스가 영향을 받습니다:
        </p>

        <div className="space-y-2 mb-4">
          {AFFECTED_SERVICES.map((svc) => (
            <div
              key={svc.title}
              className="flex items-center gap-3 rounded-lg bg-sp-surface p-3"
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${svc.iconColor}`}
              >
                <span className="material-symbols-outlined text-icon-md">{svc.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sp-text">{svc.title}</p>
                <p className="text-xs text-sp-muted truncate">{svc.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-green-400 text-icon-md">check_circle</span>
          <p className="text-xs text-green-400">
            로컬 데이터(시간표·메모·할 일 등)는 그대로 유지됩니다
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium transition-colors"
          >
            연결 해제
          </button>
        </div>
      </div>
    </Modal>
  );
}
