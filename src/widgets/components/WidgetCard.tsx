import { useState, useEffect, type ComponentType, type MouseEvent } from 'react';
import type { WidgetDefinition } from '../types';
import { WidgetModal } from './WidgetModal';
import { useWidgetModalStore } from '../stores/useWidgetModalStore';
import { DashboardPinGuard } from '@adapters/components/Dashboard/DashboardPinGuard';
import { PIN_FEATURE_MAP } from '../utils/pinFeatureMap';

interface WidgetCardProps {
  definition: WidgetDefinition;
  onNavigate?: (page: string) => void;
  maxHeight?: number;
  scaleFactor?: number;
}

/**
 * 공통 위젯 카드 래퍼
 * - 카드 클릭 → WidgetModal 열기 (modalMode 있는 위젯)
 * - PIN 보호 위젯(PIN_FEATURE_MAP)은 카드 본문(타일)과 확장 모달을 모두
 *   DashboardPinGuard로 감싼다. 잠금 시 대시보드/바탕화면 위젯 모드 타일에서도
 *   내용 대신 잠금 카드를 노출해 미리보기가 새어나가지 않게 한다.
 *   (사용자 신고: 메모 위젯 잠금을 켜도 타일에 내용이 그대로 보임)
 * - "더 보기" 버튼 제거 (G004 PR-core)
 * - AC4: 다른 카드 클릭 시 열린 모달에 attention flash
 */
export function WidgetCard({ definition, onNavigate, maxHeight, scaleFactor }: WidgetCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 2026-05-23 회귀 fix: 위젯 모드(isDesktopWidget=true)에서도 모달 내 버튼이 작동해야 함.
  // 기존 G009 의 readOnly={isDesktopWidget} 분기는 사용자가 명시적으로 편집을 원하므로 제거.
  // WidgetModal 의 readOnly prop 자체는 다른 호출자가 명시할 수 있도록 유지.

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

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'button, a, input, select, textarea, [role="button"], [data-widget-interactive="true"]',
      )
    ) {
      return;
    }

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

  // PIN 보호 대상 위젯이면 카드 본문을 DashboardPinGuard로 감싼다.
  // 잠금 시 가드가 본문(cardBody) 대신 잠금 카드를 렌더 → 클릭용 래퍼가 없어
  // 모달도 열리지 않고, 잠금 카드 클릭 시 PIN 오버레이가 뜬다.
  const pinFeature = PIN_FEATURE_MAP[definition.id];

  const cardBody = (
    <div
      className={`h-full flex flex-col transition-all duration-200 ${definition.modalMode ? 'cursor-pointer' : ''}`}
      onClick={
        definition.modalMode || (definition.navigateTo && onNavigate) ? handleCardClick : undefined
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
  );

  return (
    <>
      {pinFeature ? (
        <DashboardPinGuard feature={pinFeature}>{cardBody}</DashboardPinGuard>
      ) : (
        cardBody
      )}

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
        >
          <ModalContent isCompactMode={false} />
        </WidgetModal>
      )}
    </>
  );
}
