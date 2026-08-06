/**
 * ArchiveDeleteGate — 보관함 영구 삭제 2단계 게이트 (P3 S3.3).
 *
 * 보관함에서만 삭제할 수 있고, 확인 문구를 정확히 타이핑해야 버튼이 열린다.
 * 라이브 삭제 경로(deleteClass 등)를 절대 재사용하지 않는다 — archive:delete(디렉토리만).
 * 삭제 전 백업 내보내기를 먼저 제안하고, 되돌릴 수 없음을 명시한다.
 */

import { useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { formatTermKo } from '@domain/rules/academicCalendar';
import { deleteConfirmPhrase, isDeleteConfirmed } from './archiveViewerData';

interface ArchiveDeleteGateProps {
  /** 삭제 대상 학기 라벨('2026-1'). null이면 닫힘. */
  term: string | null;
  onClose: () => void;
  /** 삭제 성공 후 목록 갱신용. */
  onDeleted: (term: string) => void;
  /** 백업 내보내기 화면으로 이동(설정 > 백업 탭). */
  onOpenBackup: () => void;
}

export function ArchiveDeleteGate({
  term,
  onClose,
  onDeleted,
  onOpenBackup,
}: ArchiveDeleteGateProps) {
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const termLabel = term !== null ? formatTermKo(term) : '';
  const phrase = deleteConfirmPhrase(termLabel);
  const confirmed = isDeleteConfirmed(input, termLabel);

  const close = () => {
    if (deleting) return;
    setInput('');
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (term === null || !confirmed) return;
    const api = window.electronAPI?.archive;
    if (!api) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await api.delete(term);
      if (res.ok) {
        setInput('');
        onDeleted(term);
      } else {
        setError(res.error);
      }
    } catch {
      setError('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={term !== null}
      onClose={close}
      title="보관함 삭제"
      srOnlyTitle
      size="sm"
      closeOnBackdrop={false}
    >
      <div className="p-6" data-modal-fallback tabIndex={-1}>
        <h3 className="text-lg font-bold text-sp-text">{termLabel} 보관함을 삭제할까요?</h3>
        <p className="mt-2 text-sm leading-relaxed text-sp-muted">
          이 학기의 보관함(명렬·출결·기록·진도·첨부)이{' '}
          <span className="font-semibold text-red-400">영구히 삭제</span>
          돼요. 되돌릴 수 없어요. 지금 쓰고 있는 데이터(라이브)는 바뀌지 않아요.
        </p>

        <div className="mt-3 rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5">
          <p className="text-xs leading-relaxed text-sp-muted">
            삭제 전에 백업 파일로 내보내 두면, 나중에 필요할 때 복원할 수 있어요.
          </p>
          <button
            type="button"
            onClick={onOpenBackup}
            className="mt-1.5 text-xs font-medium text-sp-accent hover:underline"
          >
            백업/복원 화면 열기
          </button>
        </div>

        <label className="mt-4 block text-xs text-sp-muted">
          계속하려면 아래에 <span className="font-semibold text-sp-text">{phrase}</span> 를
          입력하세요
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={phrase}
            className="mt-1.5 w-full rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-red-400 focus:outline-none"
          />
        </label>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={deleting}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:text-sp-text disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!confirmed || deleting}
            className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 disabled:opacity-40"
          >
            {deleting ? '삭제하는 중…' : '영구 삭제'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
