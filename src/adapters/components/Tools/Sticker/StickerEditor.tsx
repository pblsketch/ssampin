import { useEffect, useMemo, useState } from 'react';
import type { Sticker } from '@domain/entities/Sticker';
import { Modal } from '@adapters/components/common/Modal';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStickerImage, invalidateStickerImage } from '@adapters/components/StickerPicker/useStickerImage';
import { validateStickerName } from '@domain/rules/stickerRules';
import { TagChipsEditor } from './TagChipsEditor';
import '@adapters/components/StickerPicker/stickerElectronTypes';

interface StickerEditorProps {
  isOpen: boolean;
  sticker: Sticker | null;
  onClose: () => void;
}

/**
 * 단일 이모티콘 편집 모달.
 *
 * - 이미지 미리보기 (96px)
 * - 이름·태그·팩 수정
 * - 사용 통계(횟수, 마지막 사용일)
 * - 삭제 (확인 단계)
 */
export function StickerEditor({ isOpen, sticker, onClose }: StickerEditorProps): JSX.Element | null {
  const data = useStickerStore((s) => s.data);
  const updateSticker = useStickerStore((s) => s.updateSticker);
  const deleteSticker = useStickerStore((s) => s.deleteSticker);

  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [packId, setPackId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // sticker 변경 시 폼 초기화
  useEffect(() => {
    if (sticker) {
      setName(sticker.name);
      setTags([...sticker.tags]);
      setPackId(sticker.packId);
      setConfirmDelete(false);
      setNameError(null);
      setSubmitting(false);
    }
  }, [sticker]);

  const dataUrl = useStickerImage(sticker?.id ?? '');

  const lastUsedLabel = useMemo(() => {
    if (!sticker?.lastUsedAt) return '아직 사용 안 함';
    const date = new Date(sticker.lastUsedAt);
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days === 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [sticker?.lastUsedAt]);

  if (!sticker) return null;

  const handleSave = async () => {
    const validation = validateStickerName(name);
    if (!validation.ok) {
      setNameError(validation.reason);
      return;
    }
    setSubmitting(true);
    try {
      await updateSticker(sticker.id, {
        name: name.trim(),
        tags,
        packId,
      });
      useToastStore.getState().show('이모티콘 정보를 수정했어요.', 'success');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      // Electron 파일도 삭제
      await window.electronAPI?.sticker?.deleteImage(sticker.id).catch(() => {});
      invalidateStickerImage(sticker.id);
      await deleteSticker(sticker.id);
      useToastStore.getState().show(`"${sticker.name}" 이모티콘을 삭제했어요.`, 'success');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={`${sticker.name} 편집`}
      srOnlyTitle
      size="md"
      closeOnBackdrop={!submitting && !confirmDelete}
      closeOnEsc={!submitting}
    >
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined icon-md text-sp-muted">edit</span>
            이모티콘 편집
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="px-5 py-5 flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
          {/* 미리보기 + 통계 */}
          <div className="flex gap-4 items-start">
            <div className="w-24 h-24 shrink-0 rounded-xl ring-1 ring-sp-border bg-sp-bg flex items-center justify-center overflow-hidden">
              {dataUrl === undefined && (
                <div className="w-full h-full bg-sp-border/30 animate-pulse" />
              )}
              {dataUrl === null && (
                <span className="material-symbols-outlined icon-md text-sp-muted">
                  broken_image
                </span>
              )}
              {dataUrl && (
                <img
                  src={dataUrl}
                  alt={sticker.name}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <StatRow label="사용 횟수" value={`${sticker.usageCount}회`} />
              <StatRow label="마지막 사용" value={lastUsedLabel} />
              <StatRow
                label="등록일"
                value={new Date(sticker.createdAt).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              />
            </div>
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
              이름
            </label>
            <input
              type="text"
              value={name}
              maxLength={30}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm"
            />
            {nameError && (
              <p className="text-detail text-red-400 mt-1">{nameError}</p>
            )}
          </div>

          {/* 태그 */}
          <div>
            <label className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
              태그
            </label>
            <TagChipsEditor tags={tags} onChange={setTags} placeholder="예: 응원, 힘내" />
          </div>

          {/* 팩 */}
          <div>
            <label className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
              팩
            </label>
            <select
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm"
            >
              {data.packs.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name}
                </option>
              ))}
            </select>
          </div>

          {/* 삭제 영역 */}
          {confirmDelete ? (
            <div
              role="alert"
              className="rounded-xl ring-1 ring-red-500/30 bg-red-500/5 p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined icon-md text-red-400 mt-0.5">
                  warning
                </span>
                <div>
                  <p className="text-sm font-sp-semibold text-red-300">
                    정말 삭제하시겠어요?
                  </p>
                  <p className="text-detail text-red-300/80 mt-1">
                    삭제하면 되돌릴 수 없어요.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={submitting}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-sp-semibold hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-sp-semibold transition-colors"
            >
              <span className="material-symbols-outlined icon-sm">delete</span>
              이모티콘 삭제
            </button>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-sp-border bg-sp-bg/30">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || !name.trim()}
            className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined icon-sm">save</span>
            저장
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function StatRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between text-detail">
      <span className="text-sp-muted">{label}</span>
      <span className="text-sp-text font-sp-medium">{value}</span>
    </div>
  );
}
