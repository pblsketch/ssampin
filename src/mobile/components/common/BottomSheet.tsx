import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { FocusTrap } from 'focus-trap-react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';

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
  // 카운터 등록 + 안드로이드 뒤로가기(화면을 넘기지 않고 이 시트만 닫기)를 한 번에.
  useBottomSheet(true, onClose);

  /** 초점 가둘 대상 — 시트 안에 포커스 가능한 요소가 없을 때의 대피처이기도 하다. */
  const panelRef = useRef<HTMLDivElement>(null);

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
    /*
     * 초점 가두기 — `aria-modal` 만으로는 실제 초점이 갇히지 않는다. 없으면 키보드·스크린리더
     * 사용자가 Tab 으로 시트 뒤 화면을 계속 조작할 수 있다(시각 사용자에겐 딤에 가려 안 보이는데).
     *
     * escape/clickOutside 는 끈다 — 닫힘 경로는 이미 위의 Esc 핸들러와 딤 클릭 하나로
     * 수렴해 있고, focus-trap 이 따로 닫으면 onClose 를 우회한다.
     * allowOutsideClick 은 데스크톱 Modal 과 같은 이유로 켠다: body 로 포털된 팝업(날짜
     * 선택 등)은 트랩 밖 요소라 이게 없으면 클릭이 차단돼 동작하지 않는다.
     */
    <FocusTrap
      focusTrapOptions={{
        escapeDeactivates: false,
        clickOutsideDeactivates: false,
        allowOutsideClick: true,
        returnFocusOnDeactivate: true,
        // 시트 안에 초점 받을 요소가 하나도 없어도 트랩이 터지지 않게 패널 자체를 기본값으로.
        fallbackFocus: () => panelRef.current ?? document.body,
      }}
    >
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
        onClick={handleBackdrop}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
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
    </FocusTrap>
  );
}
