import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { isWindows } from '@adapters/hooks/shortcut/keyNormalize';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';
import type { WidgetDesktopMode } from '@domain/entities/Settings';

/**
 * widget-mode-discovery (v2.1.x~) — 위젯 모드 첫 진입 1회성 코치 투어.
 *
 * 3장 슬라이드로 모드 3종(normal/topmost/native-desktop)을 비유 + 시각 + 한 줄 설명으로
 * 안내한다. 마지막 슬라이드에 "지금 시도하기" 버튼이 있어 곧바로 모드 적용 가능.
 *
 * Skip은 모든 슬라이드에서 가능. 마지막까지 보거나 Skip을 누르면 호출자가 markShown()으로
 * settings.widget.modeTour.shown=true를 저장. "다시 보기"는 reset() 후 재마운트.
 *
 * 호출자(Widget.tsx)는 isOpen + onSkip/onComplete/onTrySelected를 제공한다.
 */

interface WidgetModeCoachTourProps {
  readonly isOpen: boolean;
  readonly onSkip: (slideIndex: number) => void;
  readonly onComplete: (trySelected: WidgetDesktopMode | 'none') => void;
  readonly onTrySelected: (mode: WidgetDesktopMode) => void;
}

interface SlideDef {
  readonly key: string;
  readonly icon: string;
  readonly tone: 'gray' | 'blue' | 'amber';
  readonly preview: string;
  readonly title: string;
  readonly subtitle: string;
  readonly body: string;
  readonly tryMode?: WidgetDesktopMode;
  readonly tryLabel?: string;
}

const SLIDES: readonly SlideDef[] = [
  {
    key: 'normal',
    icon: 'desktop_windows',
    tone: 'gray',
    preview: 'mode-preview/normal.svg',
    title: '일반 모드',
    subtitle: '평범한 창처럼',
    body: '다른 창에 가려질 수 있는 평범한 상태예요. 평소 노트북 작업하실 때 부담 없이 쓰기 좋아요.',
    tryMode: 'normal',
    tryLabel: '일반 모드로',
  },
  {
    key: 'topmost',
    icon: 'push_pin',
    tone: 'blue',
    preview: 'mode-preview/topmost.svg',
    title: '항상 위에',
    subtitle: '수업 중에 안 가려져요',
    body: '다른 창을 띄워도 쌤핀이 항상 위에 떠 있어요. 수업 진행 중 시간표·할 일을 흘끗 보기 좋아요.',
    tryMode: 'topmost',
    tryLabel: '항상 위로',
  },
  {
    key: 'native-desktop',
    icon: 'dashboard',
    tone: 'amber',
    preview: 'mode-preview/native-desktop.svg',
    title: '바탕화면 아이콘 아래',
    subtitle: '바탕화면 작업판처럼',
    body: '쌤핀이 바탕화면 위에 깔리고, 아이콘은 그 위에서 그대로 클릭·드래그 가능해요. Windows 전용. 새 모드라면 한 번 써보세요!',
    tryMode: 'native-desktop',
    tryLabel: '바탕화면 모드로',
  },
];

function tonePreviewClass(tone: SlideDef['tone']): string {
  switch (tone) {
    case 'gray':
      return 'text-sp-muted';
    case 'blue':
      return 'text-blue-400';
    case 'amber':
      return 'text-amber-400';
  }
}

function toneBtnClass(tone: SlideDef['tone']): string {
  switch (tone) {
    case 'gray':
      return 'bg-sp-border text-sp-text hover:bg-sp-border/80';
    case 'blue':
      return 'bg-blue-500 text-white hover:bg-blue-500/90';
    case 'amber':
      return 'bg-amber-500 text-white hover:bg-amber-500/90';
  }
}

export function WidgetModeCoachTour({
  isOpen,
  onSkip,
  onComplete,
  onTrySelected,
}: WidgetModeCoachTourProps): JSX.Element | null {
  const [idx, setIdx] = useState(0);
  const win = isWindows();

  // ModalCoordinator 큐 등록 — 교육 성격이라 EVENT_ALERT보다 후순위(5.5).
  // 다른 알림이 있으면 그것이 먼저 표시되고 코치 투어는 대기.
  const isHead = useRegisterModal('WIDGET_MODE_COACH', isOpen);

  useEffect(() => {
    if (isOpen) setIdx(0);
  }, [isOpen]);

  if (!isOpen || !isHead) return null;

  const slide = SLIDES[idx]!;
  const last = idx === SLIDES.length - 1;
  const slideDisabled = slide.tryMode === 'native-desktop' && !win;

  const handleSkip = (): void => {
    onSkip(idx);
  };
  const handleNext = (): void => {
    if (last) {
      onComplete('none');
    } else {
      setIdx((i) => i + 1);
    }
  };
  const handlePrev = (): void => {
    setIdx((i) => Math.max(0, i - 1));
  };
  const handleTry = (): void => {
    if (!slide.tryMode || slideDisabled) return;
    onTrySelected(slide.tryMode);
    onComplete(slide.tryMode);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleSkip} title="위젯 모드 가이드" size="md" srOnlyTitle>
      <div className="px-6 pt-6 pb-5 space-y-4" data-testid="widget-mode-coach-tour">
        {/* 상단 헤더 + Skip */}
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-sp-muted font-semibold">
              위젯 모드 가이드 ({idx + 1}/{SLIDES.length})
            </p>
            <h3 className="mt-1 text-lg font-bold text-sp-text">{slide.title}</h3>
            <p className="text-sm text-sp-muted">{slide.subtitle}</p>
          </div>
          <button
            type="button"
            className="text-xs text-sp-muted hover:text-sp-text underline-offset-2 hover:underline"
            onClick={handleSkip}
            data-testid="coach-tour-skip"
          >
            건너뛰기
          </button>
        </div>

        {/* 미리보기 SVG */}
        <div
          className={[
            'rounded-xl bg-sp-surface/40 border border-sp-border/40 p-4 flex items-center justify-center',
            tonePreviewClass(slide.tone),
          ].join(' ')}
        >
          <img src={slide.preview} alt="" width={240} height={160} className="select-none" />
        </div>

        {/* 본문 */}
        <p className="text-sm text-sp-text leading-relaxed">{slide.body}</p>

        {/* 진행 닷 */}
        <div className="flex justify-center gap-1.5 pt-1">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={[
                'w-1.5 h-1.5 rounded-full transition-colors',
                i === idx ? 'bg-sp-accent' : 'bg-sp-border',
              ].join(' ')}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* 액션 */}
        <div className="flex gap-2 justify-between pt-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm text-sp-muted hover:bg-sp-text/5 disabled:opacity-30"
            onClick={handlePrev}
            disabled={idx === 0}
          >
            이전
          </button>
          <div className="flex gap-2">
            {slide.tryMode && (
              <button
                type="button"
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  slideDisabled
                    ? 'bg-sp-border/40 text-sp-muted cursor-not-allowed'
                    : toneBtnClass(slide.tone),
                ].join(' ')}
                onClick={handleTry}
                disabled={slideDisabled}
                title={slideDisabled ? 'Windows에서만 사용할 수 있어요' : undefined}
                data-testid={`coach-tour-try-${slide.key}`}
              >
                {slideDisabled ? 'Windows 전용' : `지금 ${slide.tryLabel}`}
              </button>
            )}
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-sm bg-sp-accent text-white hover:bg-sp-accent/90"
              onClick={handleNext}
              data-testid="coach-tour-next"
            >
              {last ? '확인' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
