/**
 * BoardControls — 시작/종료/저장 버튼 (Design §5.4)
 *
 * 현재 세션 상태(useBoardSessionStore)를 보고 적절한 버튼을 노출.
 * - 세션 미활성 + 선택된 보드 있음: "보드 시작" 버튼
 * - 세션 활성: "지금 저장" + "종료" 버튼
 * - 세션 활성이지만 다른 보드: 비활성화 + 안내
 */
import { useRef, useState } from 'react';

import { USER_TEMPLATE_NAME_MAX_LENGTH } from '@domain/entities/UserTemplate';
import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';
import { useBoardStore } from '@adapters/stores/useBoardStore';
import { useUserTemplateStore } from '@adapters/stores/useUserTemplateStore';

import { Modal } from '../../common/Modal';

interface BoardControlsProps {
  /** 현재 교사가 선택한 보드 id (목록에서 선택) */
  readonly selectedBoardId: string | null;
  /** 선택된 보드 이름 (표시용) */
  readonly selectedBoardName: string | null;
}

export function BoardControls({
  selectedBoardId,
  selectedBoardName,
}: BoardControlsProps): JSX.Element {
  const active = useBoardSessionStore((s) => s.active);
  const lastError = useBoardSessionStore((s) => s.lastError);
  const start = useBoardSessionStore((s) => s.start);
  const end = useBoardSessionStore((s) => s.end);
  const saveNow = useBoardSessionStore((s) => s.saveNow);

  const boards = useBoardStore((s) => s.boards);
  const saveAsTemplate = useUserTemplateStore((s) => s.saveFromBoard);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // PDCA-4 (G006): "내 템플릿으로 저장" 이름 입력 모달
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const templateNameRef = useRef<HTMLInputElement>(null);

  if (!selectedBoardId) {
    return (
      <div className="bg-sp-card rounded-xl p-6 text-sp-muted text-sm">
        좌측에서 보드를 선택하거나 새 보드를 만들어주세요.
      </div>
    );
  }

  const isActiveThisBoard = active?.boardId === selectedBoardId;
  const isActiveOtherBoard = active !== null && !isActiveThisBoard;
  // 내 템플릿 저장 가능 조건: 활성 세션(실시간 인코딩) 또는 저장된 스냅샷 존재
  const selectedMeta = boards.find((b) => b.id === selectedBoardId) ?? null;
  const canSaveTemplate = isActiveThisBoard || Boolean(selectedMeta?.hasSnapshot);

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
    // 세션 종료 직후 참여자 이력·lastSessionEndedAt 반영된 메타로 갱신
    await useBoardStore.getState().load();
    setBusy(false);
  }

  async function handleSave(): Promise<void> {
    if (!selectedBoardId) return;
    setBusy(true);
    const savedAt = await saveNow(selectedBoardId);
    setToast(savedAt ? '저장 완료' : '저장 실패');
    setBusy(false);
  }

  function openTemplateDialog(): void {
    setTemplateName(selectedBoardName ?? '');
    setTemplateDialogOpen(true);
  }

  async function handleSaveAsTemplate(): Promise<void> {
    if (!selectedBoardId || busy) return;
    setBusy(true);
    const saved = await saveAsTemplate(selectedBoardId, templateName.trim() || undefined);
    setBusy(false);
    if (saved) {
      setTemplateDialogOpen(false);
      setToast(`"${saved.name}" 템플릿으로 저장했어요. 새 보드를 만들 때 고를 수 있어요.`);
    } else {
      const err = useUserTemplateStore.getState().error ?? '';
      setToast(
        err.includes('USER_TEMPLATE_EMPTY')
          ? '빈 보드는 템플릿으로 저장할 수 없어요. 내용을 먼저 그려주세요.'
          : '템플릿 저장에 실패했어요. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  return (
    <div className="bg-sp-card rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sp-accent">co_present</span>
        <h2 className="text-lg font-bold text-sp-text truncate">{selectedBoardName ?? '보드'}</h2>
      </div>

      {isActiveOtherBoard && (
        <div className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          다른 보드(<strong>{active?.boardId}</strong>)가 이미 실행 중입니다. 먼저 종료 후 다시
          시도해주세요.
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

      {/* PDCA-4 (G006): 현재 보드 내용을 재사용 가능한 밑그림으로 저장 */}
      {canSaveTemplate && !isActiveOtherBoard && (
        <button
          type="button"
          onClick={openTemplateDialog}
          disabled={busy}
          className="w-full px-4 py-2 rounded-lg border border-sp-border text-sp-muted text-sm hover:text-sp-text hover:border-sp-muted disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-icon-sm">bookmark_add</span>내 템플릿으로
          저장
        </button>
      )}

      {toast && <div className="text-xs text-sp-muted">{toast}</div>}
      {lastError && <div className="text-xs text-red-400 break-words">에러: {lastError}</div>}

      <Modal
        isOpen={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        title="내 템플릿으로 저장"
        size="sm"
        initialFocusRef={templateNameRef}
      >
        <div className="px-6 pb-2 pt-2 space-y-3">
          <p className="text-xs leading-relaxed text-sp-muted">
            지금 보드에 그려진 내용을 밑그림으로 보관해요. 새 보드를 만들 때 &quot;내
            템플릿&quot;에서 골라 똑같이 시작할 수 있어요.
          </p>
          <input
            ref={templateNameRef}
            type="text"
            value={templateName}
            maxLength={USER_TEMPLATE_NAME_MAX_LENGTH}
            placeholder="예: 모둠 토론 기본판"
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSaveAsTemplate();
            }}
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2.5 text-sm text-sp-text outline-none placeholder:text-sp-muted/60 focus:border-sp-accent"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <button
            type="button"
            onClick={() => setTemplateDialogOpen(false)}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm text-sp-muted hover:bg-sp-bg hover:text-sp-text disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAsTemplate()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-icon-sm">bookmark_add</span>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
