import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { useSheetBackButton } from '@mobile/routing/useSheetBackButton';

interface BottomSheetProps {
  /** 시트를 닫는 단일 경로. 바깥 클릭·Esc·뒤로가기가 모두 이 콜백으로 수렴한다. */
  onClose: () => void;
  children: ReactNode;
  /** 스크린리더용 이름. 시트마다 무엇을 여는 것인지 알려준다. */
  ariaLabel: string;
  /** 상단 손잡이 표시 여부. 드래그로 닫는 시트가 아니면 숨길 수 있다. */
  showGrip?: boolean;
  /** 바깥(딤)을 눌러 닫는 걸 막는다. 저장 확인처럼 실수로 닫히면 곤란한 경우. */
  dismissOnBackdrop?: boolean;
  /** 패널에 덧붙일 클래스. 높이 제한(max-h) 등 시트별 조정용. */
  panelClassName?: string;
}

/**
 * 모바일 바텀시트 공용 껍데기.
 *
 * 이 컴포넌트를 쓰면 아래가 **자동으로** 보장된다. 시트마다 다시 구현하지 않는다.
 * - 딤 + 패널 + 손잡이 + safe-area 하단 여백
 * - `useBottomSheet()` 등록 → QuickAddFab 이 시트 위로 떠올라 버튼을 가리는 회귀 방지
 * - 바깥 클릭 / Esc 로 닫기 (닫힘 경로가 onClose 하나로 수렴)
 *
 * 딤 배경은 `bg-black/40` 처럼 black/white 알파만 쓴다. `sp-*` 토큰에 Tailwind 투명도
 * 수식(`bg-sp-card/40`)을 붙이면 색이 조용히 투명해지므로 금지.
 */
export function BottomSheet({
  onClose,
  children,
  ariaLabel,
  showGrip = true,
  dismissOnBackdrop = true,
  panelClassName = '',
}: BottomSheetProps) {
  useBottomSheet();
  // 안드로이드 뒤로가기가 화면을 넘기지 않고 이 시트만 닫게 한다.
  useSheetBackButton(onClose);

  // onClose 가 매 렌더 새 함수로 와도 Esc 리스너를 재등록하지 않도록 최신값만 참조한다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleBackdrop = useCallback(() => {
    if (dismissOnBackdrop) onClose();
  }, [dismissOnBackdrop, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`w-full max-w-md bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)] ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showGrip && (
          <div className="px-2 pt-2 flex justify-center">
            <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
