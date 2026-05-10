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
import { useSlidesSessionStore } from '@adapters/stores/useSlidesSessionStore';
import type { LessonId } from '@domain/valueObjects/InteractiveSlidesIds';
import { LessonListView } from './LessonListView';
import { LessonEditor } from './Editor/LessonEditor';
import { LessonLobby } from './Lobby/LessonLobby';
import { LessonPresenter } from './Presenter/LessonPresenter';

type ViewMode = 'list' | 'editor' | 'lobby' | 'presenter';

export interface ToolInteractiveSlidesProps {
  readonly onBack: () => void;
  /** 듀얼 모드 호환 — 본 도구는 전체 영역을 사용 */
  readonly isFullscreen?: boolean;
}

export function ToolInteractiveSlides({
  onBack,
}: ToolInteractiveSlidesProps): JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeLessonId, setActiveLessonId] = useState<LessonId | null>(null);
  const lessons = useInteractiveLessonStore((s) => s.lessons);
  const createLesson = useInteractiveLessonStore((s) => s.createLesson);
  const stopSession = useSlidesSessionStore((s) => s.stopSession);

  const activeLesson = activeLessonId
    ? lessons.find((l) => l.id === activeLessonId) ?? null
    : null;

  const goToList = (): void => {
    void stopSession(); // 진행 중 세션 정리
    setActiveLessonId(null);
    setViewMode('list');
  };

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

  // 활성 수업이 사라진 경우 (삭제 등) — 목록으로 복귀
  if (!activeLesson) {
    setViewMode('list');
    return <></>;
  }

  if (viewMode === 'editor') {
    return (
      <LessonEditor
        lesson={activeLesson}
        onBack={goToList}
        onStartLesson={() => setViewMode('lobby')}
      />
    );
  }

  if (viewMode === 'lobby') {
    return (
      <LessonLobby
        lesson={activeLesson}
        onBeginPresentation={() => setViewMode('presenter')}
        onReturnToEditor={() => setViewMode('editor')}
      />
    );
  }

  // presenter
  return (
    <LessonPresenter
      lesson={activeLesson}
      onSessionEnd={goToList}
    />
  );
}
