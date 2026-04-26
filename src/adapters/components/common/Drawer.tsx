import { FocusTrap } from 'focus-trap-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

type DrawerSide = 'right' | 'left' | 'bottom';
type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

interface DrawerProps {
  /** 표시 여부 */
  isOpen: boolean;
  /** ESC / backdrop 클릭으로 닫기 요청 */
  onClose: () => void;
  /** 스크린리더용 제목 */
  title: string;
  /** 시각적 헤더가 children에 따로 있을 때 true */
  srOnlyTitle?: boolean;
  /** 슬라이드 방향. 기본 right */
  side?: DrawerSide;
  /** 폭(side=right/left) 또는 높이(side=bottom). 기본 md */
  size?: DrawerSize;
  /** 최초 포커스 ref */
  initialFocusRef?: RefObject<HTMLElement>;
  /** backdrop 클릭으로 닫을지. 기본 true */
  closeOnBackdrop?: boolean;
  /** ESC 키로 닫을지. 기본 true */
  closeOnEsc?: boolean;
  /** 패널 추가 className */
  panelClassName?: string;
  children: ReactNode;
}

const SIZE_X: Record<DrawerSize, string> = {
  sm: 'w-[min(320px,calc(100vw-32px))]',
  md: 'w-[min(420px,calc(100vw-32px))]',
  lg: 'w-[min(560px,calc(100vw-32px))]',
  xl: 'w-[min(720px,calc(100vw-32px))]',
};

const SIZE_Y: Record<DrawerSize, string> = {
  sm: 'h-[min(280px,calc(100vh-32px))]',
  md: 'h-[min(420px,calc(100vh-32px))]',
  lg: 'h-[min(560px,calc(100vh-32px))]',
  xl: 'h-[min(720px,calc(100vh-32px))]',
};

const POSITION: Record<DrawerSide, string> = {
  right: 'right-0 top-0 bottom-0 h-full',
  left:  'left-0 top-0 bottom-0 h-full',
  bottom:'left-0 right-0 bottom-0 w-full',
};

const ANIMATE: Record<DrawerSide, string> = {
  right: 'animate-slide-in-right motion-reduce:animate-none',
  left:  'animate-slide-in-right motion-reduce:animate-none', // (left는 left mirror 키프레임 추가 시 교체)
  bottom:'animate-slide-up motion-reduce:animate-none',
};

/**
 * 공통 Drawer 컴포넌트.
 *
 * Modal과 동일하게 focus-trap-react 기반 ARIA·focus 위임이지만 표시 형태는
 * 좌/우/하 슬라이드 패널. 설정·필터·상세 보기 등 "주 화면 옆에 잠시 띄우는"
 * 인터랙션에 적합.
 *
 * Modal vs Drawer 결정:
 * - 결정/입력이 화면 중앙에 집중돼야 → Modal
 * - 주 화면을 보면서 설정·세부 정보를 확인 → Drawer
 *
 * 2026-04-25 신설.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  srOnlyTitle = false,
  side = 'right',
  size = 'md',
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEsc = true,
  panelClassName = '',
  children,
}: DrawerProps) {
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
    : { fallbackFocus: '[data-drawer-fallback]' };

  const sizeClass = side === 'bottom' ? SIZE_Y[size] : SIZE_X[size];

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
        className="fixed inset-0 z-sp-modal bg-black/50 backdrop-blur-sm motion-reduce:backdrop-blur-none"
        onMouseDown={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-drawer-fallback
          className={[
            'fixed bg-sp-card border-sp-border shadow-sp-lg flex flex-col',
            POSITION[side],
            sizeClass,
            side === 'right' && 'border-l',
            side === 'left' && 'border-r',
            side === 'bottom' && 'border-t rounded-t-xl',
            ANIMATE[side],
            panelClassName,
          ].filter(Boolean).join(' ')}
        >
          <h2 id={titleId} className={srOnlyTitle ? 'sr-only' : 'px-6 pt-6 pb-2 text-lg font-bold text-sp-text'}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </FocusTrap>
  );
}
