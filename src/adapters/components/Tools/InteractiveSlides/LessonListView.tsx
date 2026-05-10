/**
 * LessonListView — 저장된 수업 목록 + "새 수업" CTA.
 *
 * Plan §2-1 진입점. 사용자가 기존 수업을 다시 열거나 새로 시작.
 */

import { useEffect } from 'react';
import type { InteractiveLesson } from '@domain/entities/InteractiveSlides';
import type { LessonId } from '@domain/valueObjects/InteractiveSlidesIds';
import { useInteractiveLessonStore } from '@adapters/stores/useInteractiveLessonStore';

export interface LessonListViewProps {
  readonly onSelect: (lessonId: LessonId) => void;
  readonly onCreate: () => Promise<LessonId>;
  readonly onBack: () => void;
}

export function LessonListView({
  onSelect,
  onCreate,
  onBack,
}: LessonListViewProps): JSX.Element {
  const lessons = useInteractiveLessonStore((s) => s.lessons);
  const isLoading = useInteractiveLessonStore((s) => s.isLoading);
  const loadAll = useInteractiveLessonStore((s) => s.loadAll);
  const deleteLesson = useInteractiveLessonStore((s) => s.deleteLesson);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreate = async (): Promise<void> => {
    const id = await onCreate();
    onSelect(id);
  };

  const handleDelete = (lesson: InteractiveLesson): void => {
    if (!confirm(`"${lesson.title}" 수업을 삭제할까요?\n복구할 수 없습니다.`))
      return;
    void deleteLesson(lesson.id);
  };

  return (
    <div className="flex flex-col h-full bg-sp-bg text-sp-text">
      <header className="flex items-center justify-between px-6 py-4 bg-sp-surface border-b border-sp-border">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-sp-muted hover:text-sp-text"
          >
            ← 도구 목록
          </button>
          <h1 className="text-lg font-bold text-sp-text">인터랙티브 슬라이드</h1>
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          className="px-4 py-2 bg-sp-accent text-white rounded-lg text-sm font-bold hover:bg-sp-accent/90"
        >
          + 새 수업
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center text-sp-muted py-12">불러오는 중…</div>
        ) : lessons.length === 0 ? (
          <EmptyState onCreate={() => void handleCreate()} />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <LessonCard
                  lesson={lesson}
                  onOpen={() => onSelect(lesson.id)}
                  onDelete={() => handleDelete(lesson)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
interface LessonCardProps {
  readonly lesson: InteractiveLesson;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}

function LessonCard({ lesson, onOpen, onDelete }: LessonCardProps): JSX.Element {
  const slideCount = lesson.slides.length;
  const overlayCount = lesson.slides.reduce((sum, s) => sum + s.overlays.length, 0);
  const updatedLabel = formatRelativeDate(lesson.updatedAt);

  return (
    <article className="bg-sp-card border border-sp-border rounded-xl overflow-hidden hover:border-sp-accent/60 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={`${lesson.title} 수업 열기`}
      >
        <div className="aspect-[16/9] bg-sp-bg relative">
          {slideCount > 0 && lesson.slides[0]?.imagePath ? (
            <img
              src={lesson.slides[0].imagePath}
              alt={`${lesson.title} 미리보기`}
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sp-muted">
              슬라이드 없음
            </div>
          )}
        </div>
        <div className="p-4 space-y-1">
          <h3 className="font-bold text-sp-text truncate">{lesson.title}</h3>
          <div className="flex items-center gap-3 text-xs text-sp-muted">
            <span>슬라이드 {slideCount}장</span>
            {overlayCount > 0 && <span>· 활동 {overlayCount}개</span>}
            <span className="ml-auto">{updatedLabel}</span>
          </div>
        </div>
      </button>
      <footer className="px-4 py-2 border-t border-sp-border flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-sp-muted hover:text-red-400"
        >
          삭제
        </button>
      </footer>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4" aria-hidden>📊</div>
      <h2 className="text-lg font-bold text-sp-text mb-2">
        첫 수업을 만들어 보세요
      </h2>
      <p className="text-sm text-sp-muted mb-6 max-w-md mx-auto">
        Google Slides URL을 연결하거나 PDF를 업로드해서, 슬라이드 위에 투표·텍스트
        응답·워드클라우드를 추가할 수 있어요.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="px-5 py-2 bg-sp-accent text-white rounded-lg text-sm font-bold hover:bg-sp-accent/90"
      >
        새 수업 만들기
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function formatRelativeDate(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return '방금 전';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(epochMs);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
