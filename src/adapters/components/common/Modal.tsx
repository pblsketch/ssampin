import { FocusTrap } from 'focus-trap-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  /** 표시 여부 */
  isOpen: boolean;
  /** ESC / backdrop 클릭으로 닫기 요청 */
  onClose: () => void;
  /** 스크린리더용 제목. 시각 헤더가 별도 children에 있어도 항상 제공 */
  title: string;
  /** 시각적으로 보이는 헤더가 children 내부에 따로 있을 때 true (제목은 sr-only로 노출) */
  srOnlyTitle?: boolean;
  /** max-w 사이즈. 기본 md */
  size?: ModalSize;
  /** 최초 포커스를 줄 ref. 비우면 trap 자동 결정 */
  initialFocusRef?: RefObject<HTMLElement>;
  /** backdrop 클릭으로 닫을지. 기본 true */
  closeOnBackdrop?: boolean;
  /** ESC 키로 닫을지. 기본 true */
  closeOnEsc?: boolean;
  /** dialog 패널에 추가할 클래스 */
  panelClassName?: string;
  children: ReactNode;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'w-[min(420px,calc(100vw-32px))]',
  md: 'w-[min(560px,calc(100vw-32px))]',
  lg: 'w-[min(720px,calc(100vw-32px))]',
  xl: 'w-[min(960px,calc(100vw-32px))]',
  full: 'w-[calc(100vw-48px)] h-[calc(100vh-48px)]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  srOnlyTitle = false,
  size = 'md',
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEsc = true,
  panelClassName = '',
  children,
}: ModalProps) {
  const titleId = useId();
  const previousOverflowRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen) return;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e: KeyboardEvent) {
      if (closeOnEsc && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  const focusOptions = initialFocusRef?.current
    ? { initialFocus: initialFocusRef.current }
    : { fallbackFocus: '[data-modal-fallback]' };

  return (
    <FocusTrap
      focusTrapOptions={{
        ...focusOptions,
        escapeDeactivates: false,
        clickOutsideDeactivates: false,
        returnFocusOnDeactivate: true,
      }}
    >
      <div
        className="fixed inset-0 z-sp-modal flex items-center justify-center bg-black/60 backdrop-blur-sm motion-reduce:backdrop-blur-none px-4"
        onMouseDown={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-modal-fallback
          className={[
            'bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5 overflow-hidden flex flex-col',
            'animate-scale-in motion-reduce:animate-none',
            SIZE_CLASS[size],
            'max-h-[calc(100vh-48px)]',
            panelClassName,
          ].filter(Boolean).join(' ')}
        >
          <h2
            id={titleId}
            className={srOnlyTitle ? 'sr-only' : 'px-6 pt-6 pb-2 text-lg font-bold text-sp-text'}
          >
            {title}
          </h2>
          {children}
        </div>
      </div>
    </FocusTrap>
  );
}
