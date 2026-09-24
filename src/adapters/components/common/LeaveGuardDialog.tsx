import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';
import { useLeaveGuardStore, type LeaveKind } from '@adapters/stores/useLeaveGuardStore';

/**
 * 화면 이동 안내 창(ADR-139, spec 5-3).
 *
 * 진행 중인 타이머가 있을 때 페이지를 바꾸거나, 다른 도구를 본문으로 가져오거나,
 * 병렬 칸을 Esc 로 닫으려 하면 뜬다. 앱 최상위에 한 번만 둔다.
 */

interface Copy {
  readonly title: string;
  readonly body: string;
  /** 팝업으로 옮길 수 없을 때(모바일·병렬 모드) 본문. */
  readonly bodyNoPopup: string;
  readonly popup: string;
  readonly stop: string;
  readonly stay: string;
}

const COPY: Readonly<Record<LeaveKind, Copy>> = {
  navigate: {
    title: '타이머가 돌고 있어요',
    body: '다른 화면으로 가면 타이머가 꺼져요. 팝업 창으로 옮기면 계속 돌아요.',
    bodyNoPopup: '다른 화면으로 가면 타이머가 꺼져요.',
    popup: '팝업으로 옮기고 이동',
    stop: '끄고 이동',
    stay: '머무르기',
  },
  returnTool: {
    title: '타이머가 돌고 있어요',
    body: '다른 도구를 본문으로 가져오면 지금 타이머가 꺼져요.',
    bodyNoPopup: '다른 도구를 본문으로 가져오면 지금 타이머가 꺼져요.',
    popup: '타이머를 팝업으로 옮기고 가져오기',
    stop: '타이머 끄고 가져오기',
    stay: '취소',
  },
  closeSlot: {
    title: '타이머가 돌고 있어요',
    body: '이 칸을 닫으면 타이머가 꺼져요.',
    bodyNoPopup: '이 칸을 닫으면 타이머가 꺼져요.',
    popup: '',
    stop: '끄고 닫기',
    stay: '머무르기',
  },
};

export function LeaveGuardDialog(): JSX.Element | null {
  const pending = useLeaveGuardStore((s) => s.pending);
  const working = useLeaveGuardStore((s) => s.working);
  const choose = useLeaveGuardStore((s) => s.choose);
  // 실수로 Enter 를 눌러도 안전한 쪽이 되도록 [머무르기]에 먼저 초점을 둔다(설계 12-1).
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  if (pending === null || typeof document === 'undefined') return null;
  const copy = COPY[pending.kind];

  return createPortal(
    <Modal
      isOpen
      onClose={() => void choose('stay')}
      title={copy.title}
      size="sm"
      initialFocusRef={stayButtonRef}
      closeOnBackdrop={!working}
      closeOnEsc={!working}
    >
      <div className="px-6 pb-6">
        <p className="text-sm text-sp-muted leading-relaxed break-keep mb-5">
          {pending.allowPopup ? copy.body : copy.bodyNoPopup}
        </p>
        <div className="flex flex-col gap-2">
          {pending.allowPopup && (
            <button
              type="button"
              disabled={working}
              onClick={() => void choose('popup')}
              className="w-full px-4 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-wait"
            >
              {working ? '팝업으로 옮기는 중…' : copy.popup}
            </button>
          )}
          <button
            type="button"
            disabled={working}
            onClick={() => void choose('stop')}
            className="w-full px-4 py-2.5 rounded-xl border border-sp-error text-sp-error text-sm font-medium hover:bg-sp-surface transition-colors disabled:opacity-50"
          >
            {copy.stop}
          </button>
          <button
            ref={stayButtonRef}
            type="button"
            disabled={working}
            onClick={() => void choose('stay')}
            className="w-full px-4 py-2.5 rounded-xl border border-sp-border text-sp-text text-sm font-medium hover:bg-sp-surface transition-colors disabled:opacity-50"
          >
            {copy.stay}
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
