/**
 * LessonEditor — 수업 편집 화면 (Plan §2-1 ① 단계).
 *
 * - 좌측: 슬라이드 썸네일 레일
 * - 메인: 현재 슬라이드 + 활동 오버레이 (react-rnd)
 * - 우상단: 제목 편집 + 슬라이드 소스 연결 (Google Slides URL)
 * - 우하단: 활동 추가 FAB
 * - 우측: 활동 설정 Drawer (선택 시 자동 오픈)
 *
 * Plan §3 + Design §8.4 매핑.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  InteractiveLesson,
  OverlayConfig,
  OverlayPosition,
  OverlayType,
  Slide,
} from '@domain/entities/InteractiveSlides';
import type {
  LessonId,
  OverlayId,
} from '@domain/valueObjects/InteractiveSlidesIds';
import { useInteractiveLessonStore } from '@adapters/stores/useInteractiveLessonStore';
import { SlideCanvas } from './SlideCanvas';
import { OverlayConfigDrawer } from './OverlayConfigDrawer';

export interface LessonEditorProps {
  readonly lesson: InteractiveLesson;
  readonly onStartLesson: () => void;
  readonly onBack: () => void;
}

/** 활동 추가 시 기본 위치 (캔버스 중앙 40%×20%) */
const DEFAULT_OVERLAY_POSITION: OverlayPosition = {
  xPercent: 30,
  yPercent: 40,
  widthPercent: 40,
  heightPercent: 20,
};

const DEFAULT_CONFIG_BY_TYPE: Record<OverlayType, OverlayConfig> = {
  poll: {
    type: 'poll',
    question: '',
    options: [
      { id: 'opt-1', label: '' },
      { id: 'opt-2', label: '' },
    ],
    multiSelect: false,
  },
  text: { type: 'text', prompt: '', maxLength: 200 },
  wordcloud: { type: 'wordcloud', prompt: '', maxKeywords: 3 },
  // draw / draggable는 본 PR에서 추가 메뉴 비활성. 향후 Phase 2.
  draw: { type: 'draw', strokeWidthPx: 4, palette: ['#ffffff', '#3b82f6', '#f59e0b'] },
  draggable: { type: 'draggable', items: [], targets: [] },
};

export function LessonEditor({
  lesson,
  onStartLesson,
  onBack,
}: LessonEditorProps): JSX.Element {
  const store = useInteractiveLessonStore();

  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedOverlayId, setSelectedOverlayId] = useState<OverlayId | null>(
    null,
  );
  const [isFabOpen, setIsFabOpen] = useState(false);

  // 슬라이드 인덱스 클램프 (lesson.slides 변경 시)
  useEffect(() => {
    if (selectedSlideIndex >= lesson.slides.length) {
      setSelectedSlideIndex(Math.max(0, lesson.slides.length - 1));
    }
  }, [lesson.slides.length, selectedSlideIndex]);

  const currentSlide: Slide | undefined = lesson.slides[selectedSlideIndex];
  const selectedOverlay = useMemo(() => {
    if (!selectedOverlayId) return null;
    for (const slide of lesson.slides) {
      const found = slide.overlays.find((o) => o.id === selectedOverlayId);
      if (found) return found;
    }
    return null;
  }, [selectedOverlayId, lesson.slides]);

  const handleAddOverlay = async (type: OverlayType): Promise<void> => {
    if (!currentSlide) return;
    setIsFabOpen(false);
    const overlayId = await store.addOverlay(
      lesson.id,
      currentSlide.id,
      type,
      DEFAULT_OVERLAY_POSITION,
      DEFAULT_CONFIG_BY_TYPE[type],
    );
    setSelectedOverlayId(overlayId);
  };

  const handlePositionChange = (
    overlayId: OverlayId,
    position: OverlayPosition,
  ): void => {
    void store.updateOverlayPosition(lesson.id, overlayId, position);
  };

  const handleConfigChange = async (
    overlayId: OverlayId,
    config: OverlayConfig,
  ): Promise<void> => {
    await store.updateOverlayConfig(lesson.id, overlayId, config);
  };

  const handleAutoActivateChange = async (
    overlayId: OverlayId,
    autoActivate: boolean,
  ): Promise<void> => {
    await store.setOverlayAutoActivate(lesson.id, overlayId, autoActivate);
  };

  const handleDelete = (overlayId: OverlayId): void => {
    if (!confirm('활동을 삭제할까요?\n응답 데이터도 함께 삭제됩니다.')) return;
    void store.deleteOverlay(lesson.id, overlayId);
    setSelectedOverlayId(null);
  };

  return (
    <div className="flex flex-col h-full bg-sp-bg text-sp-text">
      <Toolbar
        lesson={lesson}
        onBack={onBack}
        onStartLesson={onStartLesson}
        canStart={lesson.slides.length > 0}
      />

      <div className="flex flex-1 min-h-0">
        <SlideThumbnailRail
          slides={lesson.slides}
          selectedIndex={selectedSlideIndex}
          onSelect={setSelectedSlideIndex}
        />

        <main className="flex-1 relative p-4 min-w-0">
          {currentSlide ? (
            <>
              <SlideCanvas
                slide={currentSlide}
                mode="edit"
                selectedOverlayId={selectedOverlayId}
                onOverlaySelect={setSelectedOverlayId}
                onOverlayPositionChange={handlePositionChange}
                onOverlayOpenConfig={(id) => setSelectedOverlayId(id)}
              />
              <ActivityAddFab
                isOpen={isFabOpen}
                onToggle={setIsFabOpen}
                onSelectType={(type) => void handleAddOverlay(type)}
              />
            </>
          ) : (
            <EmptySlidePlaceholder lessonId={lesson.id} />
          )}
        </main>
      </div>

      <OverlayConfigDrawer
        isOpen={selectedOverlayId !== null}
        overlay={selectedOverlay}
        lessonId={lesson.id}
        isActive={false /* edit 모드에서는 항상 false */}
        onClose={() => setSelectedOverlayId(null)}
        onConfigChange={handleConfigChange}
        onAutoActivateChange={handleAutoActivateChange}
        onDelete={handleDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toolbar (제목 편집 + 슬라이드 소스 연결 + 수업 시작 CTA)
// ─────────────────────────────────────────────────────────────
interface ToolbarProps {
  readonly lesson: InteractiveLesson;
  readonly onBack: () => void;
  readonly onStartLesson: () => void;
  readonly canStart: boolean;
}

function Toolbar({
  lesson,
  onBack,
  onStartLesson,
  canStart,
}: ToolbarProps): JSX.Element {
  const store = useInteractiveLessonStore();
  const [titleDraft, setTitleDraft] = useState(lesson.title);
  const [url, setUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTitleDraft(lesson.title), [lesson.title]);

  const commitTitle = (): void => {
    const trimmed = titleDraft.trim();
    if (trimmed === lesson.title || trimmed.length === 0) return;
    void store.updateLessonTitle(lesson.id, trimmed);
  };

  const handleConnect = async (): Promise<void> => {
    if (url.trim().length === 0) return;
    if (
      lesson.slides.length > 0 &&
      !confirm(
        '기존 슬라이드와 활동 배치가 새 슬라이드로 교체됩니다. 계속할까요?',
      )
    ) {
      return;
    }
    setIsFetching(true);
    try {
      await store.connectGoogleSlides(lesson.id, url.trim());
      setUrl('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '슬라이드 가져오기 실패';
      alert(msg);
    } finally {
      setIsFetching(false);
    }
  };

  const handlePdfClick = (): void => {
    if (
      lesson.slides.length > 0 &&
      !confirm(
        '기존 슬라이드와 활동 배치가 새 슬라이드로 교체됩니다. 계속할까요?',
      )
    ) {
      return;
    }
    pdfFileInputRef.current?.click();
  };

  const handlePdfChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 파일만 선택할 수 있어요.');
      return;
    }
    setIsFetching(true);
    setPdfProgress({ current: 0, total: 1 });
    try {
      await store.connectPdf(lesson.id, file, (p) => setPdfProgress(p));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF 가져오기 실패';
      alert(msg);
    } finally {
      setIsFetching(false);
      setPdfProgress(null);
    }
  };

  return (
    <header className="flex items-center gap-3 px-4 py-3 bg-sp-surface border-b border-sp-border">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-sp-muted hover:text-sp-text"
      >
        ← 목록
      </button>

      <input
        type="text"
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="flex-shrink-0 w-64 px-3 py-1.5 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
        placeholder="수업 제목"
      />

      <div className="flex-1 flex items-center gap-2 min-w-0">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleConnect();
          }}
          disabled={isFetching}
          className="flex-1 min-w-0 px-3 py-1.5 bg-sp-bg border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent disabled:opacity-50"
          placeholder="Google Slides URL 붙여넣기 (공유 설정 '뷰어' 필요)"
        />
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={isFetching || url.trim().length === 0}
          className="px-3 py-1.5 bg-sp-accent text-white rounded-lg text-sm hover:bg-sp-accent/90 disabled:bg-sp-border disabled:text-sp-muted disabled:cursor-not-allowed"
        >
          {isFetching && pdfProgress === null ? '불러오는 중…' : '불러오기'}
        </button>
        <button
          type="button"
          onClick={handlePdfClick}
          disabled={isFetching}
          className="px-3 py-1.5 bg-sp-bg border border-sp-border rounded-lg text-sm text-sp-text hover:border-sp-accent disabled:opacity-50 disabled:cursor-not-allowed"
          title="PDF 파일을 슬라이드로 사용"
        >
          {pdfProgress
            ? `PDF ${pdfProgress.current}/${pdfProgress.total}`
            : 'PDF 업로드'}
        </button>
        <input
          ref={pdfFileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => void handlePdfChange(e)}
        />
      </div>

      <button
        type="button"
        onClick={onStartLesson}
        disabled={!canStart}
        className="px-4 py-1.5 bg-sp-highlight text-sp-bg font-bold rounded-lg text-sm hover:bg-sp-highlight/90 disabled:bg-sp-border disabled:text-sp-muted disabled:cursor-not-allowed"
      >
        수업 시작 →
      </button>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// SlideThumbnailRail (좌측)
// ─────────────────────────────────────────────────────────────
interface SlideThumbnailRailProps {
  readonly slides: readonly Slide[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
}

function SlideThumbnailRail({
  slides,
  selectedIndex,
  onSelect,
}: SlideThumbnailRailProps): JSX.Element {
  return (
    <aside className="w-[200px] flex-shrink-0 bg-sp-surface border-r border-sp-border overflow-y-auto p-2 space-y-2">
      {slides.length === 0 ? (
        <div className="px-2 py-4 text-xs text-sp-muted text-center">
          슬라이드를 불러오면 여기에 표시됩니다.
        </div>
      ) : (
        slides.map((slide, idx) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => onSelect(idx)}
            className={`w-full block rounded-lg overflow-hidden border transition-colors ${
              idx === selectedIndex
                ? 'border-sp-accent ring-2 ring-sp-accent/40'
                : 'border-sp-border hover:border-sp-accent/60'
            }`}
            aria-current={idx === selectedIndex}
          >
            <div className="relative aspect-[16/9] bg-sp-bg">
              {slide.imagePath.length > 0 ? (
                <img
                  src={slide.imagePath}
                  alt={`슬라이드 ${slide.pageNumber}`}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sp-muted text-xs">
                  ?
                </div>
              )}
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-xs">
                {slide.pageNumber}
              </div>
              {slide.overlays.length > 0 && (
                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-sp-accent text-white text-xs">
                  {slide.overlays.length}
                </div>
              )}
            </div>
          </button>
        ))
      )}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// ActivityAddFab
// ─────────────────────────────────────────────────────────────
interface ActivityAddFabProps {
  readonly isOpen: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly onSelectType: (type: OverlayType) => void;
}

function ActivityAddFab({
  isOpen,
  onToggle,
  onSelectType,
}: ActivityAddFabProps): JSX.Element {
  return (
    <div className="absolute right-6 bottom-6 z-10 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="bg-sp-card border border-sp-border rounded-xl shadow-sp-md p-1 min-w-[180px] animate-in fade-in slide-in-from-bottom-2">
          <FabMenuItem
            icon="📊"
            label="투표"
            onClick={() => onSelectType('poll')}
          />
          <FabMenuItem
            icon="✏️"
            label="텍스트 응답"
            onClick={() => onSelectType('text')}
          />
          <FabMenuItem
            icon="☁️"
            label="워드클라우드"
            onClick={() => onSelectType('wordcloud')}
          />
          <div className="my-1 border-t border-sp-border" />
          <FabMenuItem icon="🎨" label="자유 그리기 · 곧" disabled />
          <FabMenuItem icon="🧩" label="드래그 활동 · 곧" disabled />
        </div>
      )}
      <button
        type="button"
        onClick={() => onToggle(!isOpen)}
        className="w-14 h-14 rounded-full bg-sp-accent text-white text-2xl shadow-sp-md hover:bg-sp-accent/90 transition-transform hover:scale-105 active:scale-95"
        aria-label="활동 추가"
        aria-expanded={isOpen}
      >
        {isOpen ? '×' : '+'}
      </button>
    </div>
  );
}

interface FabMenuItemProps {
  readonly icon: string;
  readonly label: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}

function FabMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
}: FabMenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-sp-text hover:bg-sp-bg disabled:text-sp-muted disabled:cursor-not-allowed"
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// EmptySlidePlaceholder
// ─────────────────────────────────────────────────────────────
function EmptySlidePlaceholder({ lessonId: _id }: { lessonId: LessonId }): JSX.Element {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-sp-muted text-sm">
        <div className="mb-3 text-4xl" aria-hidden>📄</div>
        <p>위쪽 입력창에 Google Slides URL을 붙여넣으면</p>
        <p>슬라이드를 불러올 수 있어요.</p>
      </div>
    </div>
  );
}

