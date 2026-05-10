/**
 * ToolInteractiveSlides — 도구 진입점 + viewMode 라우팅.
 *
 * - list: 수업 목록
 * - editor: 수업 편집 (활동 배치)
 * - lobby: 세션 시작 전 대기 화면 (다음 PR)
 * - presenter: 수업 진행 화면 (다음 PR)
 *
 * Plan §2-1 + Design §8 매핑.
 */

import { useState } from 'react';
import { useInteractiveLessonStore } from '@adapters/stores/useInteractiveLessonStore';
import type { LessonId } from '@domain/valueObjects/InteractiveSlidesIds';
import { LessonListView } from './LessonListView';
import { LessonEditor } from './Editor/LessonEditor';

type ViewMode = 'list' | 'editor' | 'lobby' | 'presenter';

export interface ToolInteractiveSlidesProps {
  readonly onBack: () => void;
}

export function ToolInteractiveSlides({
  onBack,
}: ToolInteractiveSlidesProps): JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeLessonId, setActiveLessonId] = useState<LessonId | null>(null);
  const lessons = useInteractiveLessonStore((s) => s.lessons);
  const createLesson = useInteractiveLessonStore((s) => s.createLesson);

  const activeLesson = activeLessonId
    ? lessons.find((l) => l.id === activeLessonId) ?? null
    : null;

  if (viewMode === 'list') {
    return (
      <LessonListView
        onBack={onBack}
        onSelect={(id) => {
          setActiveLessonId(id);
          setViewMode('editor');
        }}
        onCreate={() => createLesson('새 수업')}
      />
    );
  }

  if (viewMode === 'editor') {
    if (!activeLesson) {
      // 활성 수업이 사라진 경우 (삭제 등) — 목록으로 복귀
      setViewMode('list');
      return <LobbyOrPresenterPlaceholder mode="list-fallback" />;
    }
    return (
      <LessonEditor
        lesson={activeLesson}
        onBack={() => {
          setActiveLessonId(null);
          setViewMode('list');
        }}
        onStartLesson={() => setViewMode('lobby')}
      />
    );
  }

  // lobby / presenter는 다음 PR 구현 — 임시 placeholder
  return (
    <LobbyOrPresenterPlaceholder
      mode={viewMode}
      onBackToEditor={() => setViewMode('editor')}
    />
  );
}

// ─────────────────────────────────────────────────────────────
interface PlaceholderProps {
  readonly mode: 'lobby' | 'presenter' | 'list-fallback';
  readonly onBackToEditor?: () => void;
}

function LobbyOrPresenterPlaceholder({
  mode,
  onBackToEditor,
}: PlaceholderProps): JSX.Element {
  if (mode === 'list-fallback') return <></>;
  const title = mode === 'lobby' ? '로비 화면' : '진행 화면';
  return (
    <div className="flex flex-col items-center justify-center h-full bg-sp-bg text-sp-text">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4" aria-hidden>🚧</div>
        <h2 className="text-lg font-bold mb-2">{title}은 곧 추가됩니다</h2>
        <p className="text-sm text-sp-muted mb-6">
          백엔드 인프라는 모두 완성됐어요. 다음 업데이트에서 학생 참여 화면과
          연결됩니다.
        </p>
        {onBackToEditor && (
          <button
            type="button"
            onClick={onBackToEditor}
            className="px-4 py-2 bg-sp-card border border-sp-border rounded-lg text-sm hover:border-sp-accent"
          >
            ← 수업 편집으로 돌아가기
          </button>
        )}
      </div>
    </div>
  );
}
