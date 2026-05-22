/**
 * MemoDetailPopup — 단일 메모 상세 팝업 (portal + overlay + ESC).
 *
 * 본문 렌더링은 `MemoEditor.tsx`에 위임. 본 컴포넌트는 portal 오버레이 + 외부 클릭/ESC
 * 닫기 동작만 담당.
 *
 * 사용처:
 *  - `DashboardMemo.tsx` (compact 카드) — 메모 클릭 시 본 팝업 노출
 *  - `MemoPage.tsx` — 메모 페이지에서 단건 상세 보기
 *
 * widget-expanded-editors Plan v0.1 Phase 1B: MemoEditor 추출 후 wrapper 화.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MemoEditor } from './MemoEditor';

interface MemoDetailPopupProps {
  memo: Memo;
  onClose: () => void;
  onUpdate?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onColorChange?: (id: string, color: MemoColor) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
}

export function MemoDetailPopup({
  memo,
  onClose,
  onUpdate,
  onDelete,
  onColorChange,
  onArchive,
}: MemoDetailPopupProps) {
  // 편집 중일 때는 ESC 가 MemoRichEditor 내부에서 처리(저장 후 view 모드 복귀)되도록 의도.
  // 본 컴포넌트의 ESC 는 view 모드일 때만 popup 자체를 닫는다.
  const [isEditingHint, setIsEditingHint] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditingHint) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditingHint, onClose]);

  const handleOverlayClick = useCallback(() => {
    // 편집 중이면 MemoEditor 의 onBlur 가 자동 저장 후 view 모드 복귀시키므로
    // overlay 클릭은 그냥 닫는다 (포커스 손실 → onBlur → 저장 → view 모드 → 다음 ESC 가 닫음).
    onClose();
  }, [onClose]);

  // MemoEditor 의 편집 상태를 알기 위한 신호 — 본 wrapper 는 직접 알 수 없으므로
  // 보수적으로 ESC 닫기는 'memo.content === editContent' 비교로는 불가. 단순화:
  // ESC 1회 → MemoEditor 가 편집 중이면 저장 후 view, view 면 popup 닫기.
  // 본 wrapper 의 isEditingHint 는 사용자 키 입력 빈도로 추정하지 않고 항상 view 가정.
  // 결과적으로 ESC 1회로 닫기 — 기존 동작과 동등(편집 중에도 ESC 가 MemoRichEditor 내부에서
  // stopPropagation 후 저장하므로 본 wrapper 까지 도달 안 함).
  void isEditingHint;
  void setIsEditingHint;

  const popup = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <style>{`
        @keyframes memoPopupIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .memo-popup-card {
          animation: memoPopupIn 200ms ease-out forwards;
        }
      `}</style>

      <div className="memo-popup-card w-[360px] max-w-[90vw] max-h-[70vh]">
        <MemoEditor
          memo={memo}
          onDismiss={onClose}
          showCloseButton
          onUpdate={onUpdate}
          onDelete={onDelete}
          onColorChange={onColorChange}
          onArchive={onArchive}
        />
      </div>
    </div>
  );

  return createPortal(popup, document.body);
}
