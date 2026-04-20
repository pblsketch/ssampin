/**
 * BoardControls — 시작/종료/저장 버튼 (Design §5.4)
 *
 * 현재 세션 상태(useBoardSessionStore)를 보고 적절한 버튼을 노출.
 * - 세션 미활성 + 선택된 보드 있음: "보드 시작" 버튼
 * - 세션 활성: "지금 저장" + "종료" 버튼
 * - 세션 활성이지만 다른 보드: 비활성화 + 안내
 */
import { useState } from 'react';

import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';

interface BoardControlsProps {
  /** 현재 교사가 선택한 보드 id (목록에서 선택) */
  readonly selectedBoardId: string | null;
  /** 선택된 보드 이름 (표시용) */
  readonly selectedBoardName: string | null;
}

export function BoardControls({ selectedBoardId, selectedBoardName }: BoardControlsProps): JSX.Element {
  const active = useBoardSessionStore((s) => s.active);
  const lastError = useBoardSessionStore((s) => s.lastError);
  const start = useBoardSessionStore((s) => s.start);
  const end = useBoardSessionStore((s) => s.end);
  const saveNow = useBoardSessionStore((s) => s.saveNow);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!selectedBoardId) {
    return (
      <div className="bg-sp-card rounded-xl p-6 text-sp-muted text-sm">
        좌측에서 보드를 선택하거나 새 보드를 만들어주세요.
      </div>
    );
  }

  const isActiveThisBoard = active?.boardId === selectedBoardId;
  const isActiveOtherBoard = active !== null && !isActiveThisBoard;

  async function handleStart(): Promise<void> {
    if (!selectedBoardId) return;
    setBusy(true);
    setToast(null);
    const result = await start(selectedBoardId);
    if (!result) {
      setToast('보드 시작에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    setBusy(false);
  }

  async function handleEnd(): Promise<void> {
    if (!selectedBoardId) return;
    setBusy(true);
    await end(selectedBoardId, false);
    setBusy(false);
  }

  async function handleSave(): Promise<void> {
    if (!selectedBoardId) return;
    setBusy(true);
    const savedAt = await saveNow(selectedBoardId);
    setToast(savedAt ? '저장 완료' : '저장 실패');
    setBusy(false);
  }

  return (
    <div className="bg-sp-card rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sp-accent">co_present</span>
        <h2 className="text-lg font-bold text-sp-text truncate">
          {selectedBoardName ?? '보드'}
        </h2>
      </div>

      {isActiveOtherBoard && (
        <div className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          다른 보드(<strong>{active?.boardId}</strong>)가 이미 실행 중입니다. 먼저 종료 후 다시 시도해주세요.
        </div>
      )}

      {!isActiveThisBoard && !isActiveOtherBoard && (
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="w-full px-4 py-3 rounded-lg bg-sp-accent text-white font-semibold hover:bg-sp-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined">play_circle</span>
          {busy ? '시작 중…' : '보드 시작'}
        </button>
      )}

      {isActiveThisBoard && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-lg bg-sp-border/40 text-sp-text hover:bg-sp-border/60 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-icon-sm">save</span>
            지금 저장
          </button>
          <button
            type="button"
            onClick={handleEnd}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-icon-sm">stop_circle</span>
            종료
          </button>
        </div>
      )}

      {toast && <div className="text-xs text-sp-muted">{toast}</div>}
      {lastError && (
        <div className="text-xs text-red-400 break-words">에러: {lastError}</div>
      )}
    </div>
  );
}
