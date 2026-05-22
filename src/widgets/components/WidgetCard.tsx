import { useState, useEffect, type ComponentType } from 'react';
import type { WidgetDefinition } from '../types';
import { WidgetModal } from './WidgetModal';
import { useWidgetModalStore } from '../stores/useWidgetModalStore';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';

interface WidgetCardProps {
  definition: WidgetDefinition;
  onNavigate?: (page: string) => void;
  maxHeight?: number;
  scaleFactor?: number;
}

/**
 * 공통 위젯 카드 래퍼
 * - 카드 클릭 → WidgetModal 열기 (modalMode 있는 위젯)
 * - PIN 보호는 WidgetModal 내부 DashboardPinGuard가 처리
 * - "더 보기" 버튼 제거 (G004 PR-core)
 * - AC4: 다른 카드 클릭 시 열린 모달에 attention flash
 */
export function WidgetCard({ definition, onNavigate, maxHeight, scaleFactor }: WidgetCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // G009: 데스크톱 위젯 BrowserWindow에서 열리는 모달은 읽기 전용으로 렌더링.
  // Widget.tsx 최상단에서 setIsDesktopWidget(true)를 호출해 활성화 — 메인 앱은 false 유지.
  const isDesktopWidget = useDesktopWidgetContextStore((s) => s.isDesktopWidget);

  const openId = useWidgetModalStore((s) => s.openId);
  const setOpenId = useWidgetModalStore((s) => s.setOpenId);
  const triggerFlash = useWidgetModalStore((s) => s.triggerFlash);
  const flashKey = useWidgetModalStore((s) => s.flashKey);

  // flash 애니메이션 상태 (600ms pulse)
  const [isFlashing, setIsFlashing] = useState(false);

  // openId 동기화: 이 카드의 모달이 열리면 스토어에 등록
  useEffect(() => {
    if (isModalOpen) {
      setOpenId(definition.id);
    }
    // 닫힘 처리는 onClose 콜백에서 직접 수행 (handleClose 참조)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  // flashKey 변경 감지: 이 모달이 열려 있을 때만 flash 실행
  useEffect(() => {
    if (flashKey === 0 || !isModalOpen) return;
    setIsFlashing(true);
    const t = setTimeout(() => setIsFlashing(false), 600);
    return () => clearTimeout(t);
  }, [flashKey, isModalOpen]);

  const handleCardClick = () => {
    if (definition.modalMode) {
      // 다른 모달이 이미 열려 있으면 flash만 트리거
      if (openId !== null && openId !== definition.id) {
        triggerFlash();
        return;
      }
      setIsModalOpen(true);
    } else if (definition.navigateTo && onNavigate) {
      // modalMode 없는 경우 기존 navigate 폴백
      onNavigate(definition.navigateTo);
    }
  };

  const scale = scaleFactor && scaleFactor < 1 ? scaleFactor : undefined;
  const adjustedMaxHeight = maxHeight && scale ? maxHeight / scale : maxHeight;

  // WidgetModal children: 위젯 컴포넌트를 isCompactMode={false}로 렌더
  // 일부 위젯이 isCompactMode prop을 받지 않을 수 있어 ComponentType<{ isCompactMode?: boolean }>으로 캐스팅
  const ModalContent = definition.component as ComponentType<{ isCompactMode?: boolean }>;

  return (
    <>
      <div
        className={`h-full flex flex-col transition-all duration-200 ${definition.modalMode ? 'cursor-pointer' : ''}`}
        onClick={
          definition.modalMode || (definition.navigateTo && onNavigate)
            ? handleCardClick
            : undefined
        }
      >
        <div
          className="relative overflow-y-auto flex-1 min-h-0 widget-scroll"
          style={{
            ...(adjustedMaxHeight ? { maxHeight: adjustedMaxHeight, overflowY: 'auto' } : {}),
            ...(scale
              ? {
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  width: `${100 / scale}%`,
                }
              : {}),
          }}
        >
          {/* 위젯 컴포넌트 렌더링 */}
          <definition.component />
        </div>
      </div>

      {/* 위젯 확장 모달 */}
      {definition.modalMode && (
        <WidgetModal
          widgetId={definition.id}
          definition={definition}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setOpenId(null);
          }}
          size={definition.modalSize ?? 'md'}
          requiresExplicitCancel={definition.requiresExplicitCancel}
          flashKey={isFlashing ? flashKey : 0}
          readOnly={isDesktopWidget}
        >
          <ModalContent isCompactMode={false} />
        </WidgetModal>
      )}
    </>
  );
}
