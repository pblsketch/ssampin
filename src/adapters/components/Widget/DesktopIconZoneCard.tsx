import { forwardRef } from 'react';
import type { DesktopIconZoneSettings } from '@domain/entities/Settings';

interface DesktopIconZoneCardProps {
  readonly zone: DesktopIconZoneSettings;
  /** 첫 번째 카드에만 안내 문구를 띄울지 여부 (학습 후 자동 숨김 가능). */
  readonly showHelperHint: boolean;
}

/**
 * 바탕화면 작업판의 1개 카드.
 *
 * - 카드 헤더(이름/편집)는 `pointer-events-auto` — 사용자가 클릭/이름 변경 가능.
 * - 카드 본문(드롭 영역)은 `pointer-events-none` — Phase 2 에서 main 측 hook 이
 *   직접 hit-test 하므로 DOM 이 이벤트를 가로채면 안 된다.
 * - 본 컴포넌트는 측정 대상의 시각적 표현만 담당. 실제 좌표 측정은
 *   `DesktopIconZoneOverlay` 가 ref 로 본 카드의 본문 영역에 ResizeObserver 를 단다.
 *
 * 디자인 §5.1 기반 (점선 테두리 + 반투명 배경 + 안내 문구).
 */
export const DesktopIconZoneCard = forwardRef<HTMLDivElement, DesktopIconZoneCardProps>(
  function DesktopIconZoneCard({ zone, showHelperHint }, bodyRef) {
    return (
      <div
        className="flex flex-col rounded-xl border border-dashed border-sp-border bg-sp-card/30 backdrop-blur-sm overflow-hidden"
        data-zone-id={zone.id}
      >
        {/* 헤더: 이벤트 받음. 이름 표시 + 편집 진입점은 상위에서 추가. */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-sp-border/40 text-sp-muted text-sm font-medium"
          style={{ pointerEvents: 'auto' }}
        >
          <span className="truncate" title={zone.name}>
            {zone.name}
          </span>
          {/* 편집 모드 토글 자리 — 상위 컴포넌트에서 children 으로 주입할 수 있도록 후속 확장 가능 */}
        </div>

        {/* 본문: 드롭 영역. Phase 2 에서 mouse hook 이 처리. */}
        <div
          ref={bodyRef}
          className="flex-1 min-h-[120px] flex items-center justify-center"
          style={{ pointerEvents: 'none' }}
          aria-label={`${zone.name} 영역`}
        >
          {showHelperHint && (
            <p className="text-xs italic text-sp-muted/60 px-4 text-center select-none">
              바탕화면 아이콘을 이 영역에 놓아 작업을 정리하세요
            </p>
          )}
        </div>
      </div>
    );
  },
);
