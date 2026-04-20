/**
 * ToolCollabBoard — 쌤도구 "협업 보드" 진입 컴포넌트 (Design §5.1)
 *
 * Step 7a 범위: 좌측 보드 목록 + 우측 세션 제어 패널까지.
 * Step 7b에서 활성 세션 시 QR·세션 코드·접속자 목록(BoardSessionPanel) 추가 예정.
 */
import { useEffect, useState } from 'react';

import { ToolLayout } from './ToolLayout';
import { BoardListPanel } from './Board/BoardListPanel';
import { BoardControls } from './Board/BoardControls';
import { BoardSessionPanel } from './Board/BoardSessionPanel';
import { useBoardStore } from '@adapters/stores/useBoardStore';
import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';

interface ToolCollabBoardProps {
  readonly onBack: () => void;
  readonly isFullscreen: boolean;
}

export function ToolCollabBoard({ onBack, isFullscreen }: ToolCollabBoardProps): JSX.Element {
  const boards = useBoardStore((s) => s.boards);
  const hydrate = useBoardSessionStore((s) => s.hydrate);
  const subscribe = useBoardSessionStore((s) => s.subscribe);
  const active = useBoardSessionStore((s) => s.active);

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  // Mount 시 IPC 이벤트 구독 + 활성 세션 hydrate
  useEffect(() => {
    void hydrate();
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [hydrate, subscribe]);

  // 활성 세션이 있으면 자동 선택
  useEffect(() => {
    if (active && active.boardId !== selectedBoardId) {
      setSelectedBoardId(active.boardId);
    }
  }, [active, selectedBoardId]);

  const selectedBoard = selectedBoardId
    ? boards.find((b) => b.id === selectedBoardId) ?? null
    : null;

  return (
    <ToolLayout title="협업 보드" emoji="🎨" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 p-4 h-full">
        <BoardListPanel
          selectedBoardId={selectedBoardId}
          onSelect={setSelectedBoardId}
        />
        <div className="space-y-4">
          <BoardControls
            selectedBoardId={selectedBoardId}
            selectedBoardName={selectedBoard?.name ?? null}
          />

          {/* 활성 세션 시 QR·세션코드·접속자·자동저장 패널 */}
          {active && selectedBoardId === active.boardId && <BoardSessionPanel />}
        </div>
      </div>
    </ToolLayout>
  );
}
