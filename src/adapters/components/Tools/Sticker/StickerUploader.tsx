import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { validateStickerName } from '@domain/rules/stickerRules';
import { DEFAULT_PACK_ID } from '@domain/entities/Sticker';
import { generateUUID } from '@infrastructure/utils/uuid';
import { TagChipsEditor } from './TagChipsEditor';
import '@adapters/components/StickerPicker/stickerElectronTypes';

interface StickerUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  /** 사전 선택된 팩 (관리 페이지에서 특정 팩 보기 중일 때) */
  defaultPackId?: string;
}

interface FileSelection {
  /** 클라이언트에서 부여하는 고유 키 (React key + 처리 추적용) */
  uid: string;
  /** 미리보기 dataURL (FileReader 결과). Electron 다이얼로그 경로일 때는 비어있을 수 있음. */
  previewUrl: string;
  /** Electron이 읽을 수 있는 절대 경로 (Electron 환경) */
  filePath: string;
  /** 파일명 (이름 자동 추천용) */
  fileName: string;
  /** 사용자가 카드에서 직접 편집한 개별 이름 (없으면 prefix/자동 추천 사용) */
  customName?: string;
}

const ACCEPT = 'image/png,image/webp,image/jpeg,image/gif,image/bmp';

/**
 * 이모티콘 추가 모달.
 *
 * 한 모달에서 1장/N장 모두 처리:
 * - 0장: 드롭존 + 파일 다이얼로그(다중 선택 가능)
 * - 1장: 좌측 미리보기 + 우측 단일 이름·태그·팩 폼 (기존 패턴 유지)
 * - 2장 이상: 좌측 썸네일 그리드(개별 이름 인라인 편집) + 우측 이름 prefix·공통 태그·공통 팩
 *
 * 등록 흐름 (Electron):
 * 1) 각 파일별로 tempId + importImage 순차 호출 (progress 표시)
 * 2) 성공 항목 contentHash 모아 addStickersBulk 호출
 * 3) skipped(중복) PNG는 정리, 실패 PNG도 정리
 * 4) 결과 토스트 ("N개 등록 (중복 M개 건너뜀)")
 */
export function StickerUploader({
  isOpen,
  onClose,
  defaultPackId,
}: StickerUploaderProps): JSX.Element {
  const data = useStickerStore((s) => s.data);
  const stickers = data.stickers;
  const addSticker = useStickerStore((s) => s.addSticker);
  const addStickersBulk = useStickerStore((s) => s.addStickersBulk);
  const addPack = useStickerStore((s) => s.addPack);

  const [selections, setSelections] = useState<FileSelection[]>([]);
  // 단일 모드 이름 (selections.length === 1에서 사용)
  const [singleName, setSingleName] = useState('');
  // 다중 모드 이름 prefix (selections.length >= 2에서 사용)
  const [namePrefix, setNamePrefix] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [packId, setPackId] = useState<string>(defaultPackId ?? DEFAULT_PACK_ID);
  const [newPackName, setNewPackName] = useState('');
  const [showNewPack, setShowNewPack] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [singleNameError, setSingleNameError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  /** 인라인 편집 중인 카드 uid */
  const [editingCardUid, setEditingCardUid] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleNameInputRef = useRef<HTMLInputElement>(null);
  const singleNameInputId = useId();
  const namePrefixId = useId();
  const tagsInputId = useId();
  const packSelectId = useId();

  // 모달 열림/닫힘 시 폼 초기화
  useEffect(() => {
    if (!isOpen) return;
    setSelections([]);
    setSingleName('');
    setNamePrefix('');
    setTags([]);
    setPackId(defaultPackId ?? DEFAULT_PACK_ID);
    setShowNewPack(false);
    setNewPackName('');
    setSubmitting(false);
    setProgress(null);
    setSingleNameError(null);
    setEditingCardUid(null);
  }, [isOpen, defaultPackId]);

  const isMulti = selections.length >= 2;
  const isSingle = selections.length === 1;
  const isEmpty = selections.length === 0;

  // 기존 등록된 contentHash 셋 (UI에서 중복 표시는 등록 후에만 확정되므로 사전 표기는 생략)
  // — 시트 분할기와 달리 단일 importImage는 hash가 미리 나오지 않으므로 제출 시 검출
  // 향후 dataURL 기반 client-side hash 사전계산을 도입하면 이곳에 사전 매칭 가능
  // (현 단계에선 단순화 유지)
  void useMemo(() => {
    const set = new Set<string>();
    for (const s of stickers) {
      if (s.contentHash !== undefined && s.contentHash.length > 0) {
        set.add(s.contentHash);
      }
    }
    return set;
  }, [stickers]);

  // ── 파일 추가 ──
  // 같은 batch 내에서도 동일 파일명+사이즈 중복은 사용자에게 맡긴다 (시각적으로 보임)
  const consumeFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    const skipped = files.length - imageFiles.length;
    if (skipped > 0) {
      useToastStore
        .getState()
        .show(`이미지가 아닌 파일 ${skipped}개는 제외했어요.`, 'error');
    }
    if (imageFiles.length === 0) return;

    const readPromises = imageFiles.map(
      (file) =>
        new Promise<FileSelection>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const url = typeof reader.result === 'string' ? reader.result : '';
            const electronPath =
              (file as File & { path?: string }).path ?? '';
            resolve({
              uid: generateUUID(),
              previewUrl: url,
              filePath: electronPath,
              fileName: file.name,
            });
          };
          reader.onerror = () => {
            resolve({
              uid: generateUUID(),
              previewUrl: '',
              filePath: (file as File & { path?: string }).path ?? '',
              fileName: file.name,
            });
          };
          reader.readAsDataURL(file);
        }),
    );

    void Promise.all(readPromises).then((results) => {
      setSelections((prev) => {
        const merged = [...prev, ...results];
        // 단일 → 1장 첫 추가 시 이름 자동 추천
        if (prev.length === 0 && merged.length === 1) {
          const stem = merged[0]!.fileName.replace(/\.[^.]+$/, '');
          setSingleName((cur) => cur || stem.slice(0, 30));
          setTimeout(() => singleNameInputRef.current?.focus(), 50);
        }
        return merged;
      });
    });
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) consumeFiles(files);
    // 같은 파일 재선택 가능하도록 reset
    e.target.value = '';
  };

  const handleSelectViaElectron = async () => {
    const api = window.electronAPI?.sticker;
    if (!api?.selectImage) {
      // 브라우저: 일반 file input 트리거
      fileInputRef.current?.click();
      return;
    }
    try {
      const result = await api.selectImage();
      if (result.canceled || result.filePaths.length === 0) return;
      const newSelections: FileSelection[] = result.filePaths.map((filePath) => {
        const fileName = filePath.replace(/^.*[\\/]/, '');
        return {
          uid: generateUUID(),
          previewUrl: '', // 미리보기는 등록 시 정규화 결과로 대체됨
          filePath,
          fileName,
        };
      });
      setSelections((prev) => {
        const merged = [...prev, ...newSelections];
        if (prev.length === 0 && merged.length === 1) {
          const stem = merged[0]!.fileName.replace(/\.[^.]+$/, '');
          setSingleName((cur) => cur || stem.slice(0, 30));
          setTimeout(() => singleNameInputRef.current?.focus(), 50);
        }
        return merged;
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StickerUploader] selectImage 실패:', err);
      useToastStore.getState().show('파일을 선택하지 못했어요.', 'error');
    }
  };

  // 드래그앤드롭 (다중 파일)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) consumeFiles(files);
  };

  // 항목 제거
  const removeSelection = (uid: string) => {
    setSelections((prev) => prev.filter((s) => s.uid !== uid));
    if (editingCardUid === uid) setEditingCardUid(null);
  };

  // 카드 인라인 이름 편집
  const updateCustomName = (uid: string, name: string) => {
    setSelections((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, customName: name } : s)),
    );
  };

  // 새 팩 만들기
  const handleCreatePack = async () => {
    const trimmed = newPackName.trim();
    if (!trimmed) return;
    const pack = await addPack(trimmed);
    if (pack) {
      setPackId(pack.id);
      setShowNewPack(false);
      setNewPackName('');
    }
  };

  // ── 단일 모드 저장 (기존 atomic 흐름) ──
  const handleSubmitSingle = async () => {
    const validation = validateStickerName(singleName);
    if (!validation.ok) {
      setSingleNameError(validation.reason);
      singleNameInputRef.current?.focus();
      return;
    }
    const sel = selections[0];
    if (!sel) {
      useToastStore.getState().show('이미지를 먼저 선택해주세요.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const api = window.electronAPI?.sticker;
      const trimmedName = singleName.trim();

      if (api?.importImage && sel.filePath) {
        const tempId = generateUUID();
        let importResult: { contentHash: string };
        try {
          importResult = await api.importImage(tempId, sel.filePath);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[StickerUploader] importImage 실패:', err);
          useToastStore
            .getState()
            .show(
              '이모티콘 등록 중 이미지를 처리할 수 없었어요. 다른 파일로 다시 시도해 주세요.',
              'error',
            );
          setSubmitting(false);
          return;
        }

        const sticker = await addSticker({
          id: tempId,
          name: trimmedName,
          tags,
          packId,
          contentHash: importResult.contentHash,
        });

        if (!sticker) {
          if (api.deleteImage) {
            try {
              await api.deleteImage(tempId);
            } catch {
              /* ignore */
            }
          }
          setSubmitting(false);
          return;
        }

        useToastStore
          .getState()
          .show(`"${sticker.name}" 이모티콘이 추가됐어요.`, 'success');
        onClose();
        return;
      }

      // 브라우저 dev 모드
      const sticker = await addSticker({
        name: trimmedName,
        tags,
        packId,
        contentHash: undefined,
      });
      if (!sticker) {
        setSubmitting(false);
        return;
      }
      useToastStore.getState().show(`"${sticker.name}" 이모티콘이 추가됐어요.`, 'success');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // ── 다중 모드 저장 ──
  const handleSubmitMulti = async () => {
    const trimmedPrefix = namePrefix.trim();
    if (trimmedPrefix.length === 0 && selections.some((s) => !s.customName?.trim())) {
      useToastStore
        .getState()
        .show('이름 prefix를 입력하거나 모든 카드의 이름을 직접 지어주세요.', 'error');
      return;
    }
    if (selections.length === 0) return;

    setSubmitting(true);
    setProgress({ current: 0, total: selections.length });
    try {
      const api = window.electronAPI?.sticker;

      // 각 selection의 최종 이름 결정 (customName 우선, 없으면 prefix + index)
      const namedSelections = selections.map((sel, idx) => {
        const custom = sel.customName?.trim();
        const baseName = custom && custom.length > 0 ? custom : `${trimmedPrefix} ${idx + 1}`;
        const v = validateStickerName(baseName);
        const finalName = v.ok ? baseName : `${trimmedPrefix.slice(0, 28)} ${idx + 1}`;
        return { sel, finalName };
      });

      // ── Electron: 각 파일을 importImage로 순차 처리 ──
      if (api?.importImage) {
        const importedRows: Array<{
          tempId: string;
          contentHash: string;
          name: string;
        }> = [];
        const failedNames: string[] = [];

        for (let i = 0; i < namedSelections.length; i += 1) {
          const { sel, finalName } = namedSelections[i]!;
          setProgress({ current: i, total: namedSelections.length });
          if (!sel.filePath) {
            // 브라우저에서 드롭된 파일은 path가 없을 수 있다 → 메타만 저장 가능하도록 폴백
            importedRows.push({ tempId: generateUUID(), contentHash: '', name: finalName });
            continue;
          }
          const tempId = generateUUID();
          try {
            const r = await api.importImage(tempId, sel.filePath);
            importedRows.push({ tempId, contentHash: r.contentHash, name: finalName });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[StickerUploader] importImage 실패 (multi):', err);
            failedNames.push(finalName);
          }
        }
        setProgress({ current: namedSelections.length, total: namedSelections.length });

        if (importedRows.length === 0) {
          useToastStore
            .getState()
            .show('이모티콘을 처리하지 못했어요. 다른 파일로 다시 시도해 주세요.', 'error');
          setSubmitting(false);
          setProgress(null);
          return;
        }

        const inputs = importedRows.map((row) => ({
          id: row.tempId,
          name: row.name,
          tags: [...tags],
          packId,
          contentHash: row.contentHash || undefined,
        }));

        const { stickers: newOnes, skipped } = await addStickersBulk(inputs);

        // skipped(중복 등) PNG 정리 — best-effort
        if (skipped.length > 0 && api.deleteImage) {
          for (const sk of skipped) {
            const orphan = importedRows[sk.index];
            if (orphan && orphan.tempId) {
              try {
                await api.deleteImage(orphan.tempId);
              } catch {
                /* ignore */
              }
            }
          }
        }

        const successMsg =
          newOnes.length === 0
            ? skipped.length > 0
              ? `모두 이미 등록된 이모티콘이에요. (중복 ${skipped.length}개)`
              : '등록된 이모티콘이 없어요.'
            : `이모티콘 ${newOnes.length}개가 등록되었어요!${
                skipped.length > 0 ? ` (중복 ${skipped.length}개 건너뜀)` : ''
              }${failedNames.length > 0 ? ` (실패 ${failedNames.length}개)` : ''}`;

        useToastStore
          .getState()
          .show(successMsg, newOnes.length === 0 ? 'error' : 'success');

        if (newOnes.length > 0) {
          onClose();
        } else {
          setSubmitting(false);
          setProgress(null);
        }
        return;
      }

      // ── 브라우저 dev 모드: metadata만 일괄 저장 ──
      const inputs = namedSelections.map(({ finalName }) => ({
        name: finalName,
        tags: [...tags],
        packId,
        contentHash: undefined,
      }));
      const { stickers: newOnes } = await addStickersBulk(inputs);
      if (newOnes.length === 0) {
        useToastStore.getState().show('등록된 이모티콘이 없어요.', 'error');
        setSubmitting(false);
        setProgress(null);
        return;
      }
      useToastStore
        .getState()
        .show(`이모티콘 ${newOnes.length}개가 등록되었어요!`, 'success');
      onClose();
    } finally {
      // 정상 onClose 시 isOpen 변경 useEffect가 reset하므로 별도 처리 불필요
    }
  };

  const handleSubmit = isMulti ? handleSubmitMulti : handleSubmitSingle;

  const submitDisabled = useMemo(() => {
    if (submitting) return true;
    if (isEmpty) return true;
    if (isSingle) return singleName.trim().length === 0;
    // multi: prefix 또는 모든 카드의 customName 충족
    const trimmedPrefix = namePrefix.trim();
    if (trimmedPrefix.length === 0) {
      return selections.some((s) => !s.customName?.trim());
    }
    return false;
  }, [submitting, isEmpty, isSingle, singleName, namePrefix, selections]);

  const headerSubtitle = isEmpty
    ? '이미지를 한 장 또는 여러 장 선택할 수 있어요.'
    : isSingle
      ? '이미지를 선택하고 이름·태그를 붙여주세요.'
      : `${selections.length}개의 이모티콘을 한 번에 등록해요. 이름은 prefix로 자동, 일부만 직접 지정할 수 있어요.`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title="이모티콘 추가"
      srOnlyTitle
      size={isMulti ? 'xl' : 'lg'}
      closeOnBackdrop={!submitting}
      closeOnEsc={!submitting}
    >
      <div className="flex flex-col">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <div>
            <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
              <span aria-hidden="true">😎</span>
              이모티콘 추가
              {isMulti && (
                <span className="text-detail font-sp-semibold px-2 py-0.5 rounded bg-sp-accent/15 text-sp-accent ring-1 ring-sp-accent/30">
                  {selections.length}장
                </span>
              )}
            </h3>
            <p className="text-detail text-sp-muted mt-0.5">{headerSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 disabled:opacity-50 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* 콘텐츠 */}
        {isEmpty && (
          <EmptyDropZone
            dragActive={dragActive}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClickPick={() => void handleSelectViaElectron()}
          />
        )}

        {isSingle && (
          <SingleEditPanel
            selection={selections[0]!}
            name={singleName}
            nameError={singleNameError}
            tags={tags}
            packId={packId}
            packs={data.packs}
            showNewPack={showNewPack}
            newPackName={newPackName}
            onChangeName={(v) => {
              setSingleName(v);
              if (singleNameError) setSingleNameError(null);
            }}
            onChangeTags={setTags}
            onChangePackId={setPackId}
            onShowNewPack={() => setShowNewPack(true)}
            onHideNewPack={() => setShowNewPack(false)}
            onChangeNewPackName={setNewPackName}
            onCreatePack={() => void handleCreatePack()}
            onClear={() => {
              setSelections([]);
              setSingleName('');
              setSingleNameError(null);
            }}
            onAddMore={() => void handleSelectViaElectron()}
            singleNameInputRef={singleNameInputRef}
            singleNameInputId={singleNameInputId}
            tagsInputId={tagsInputId}
            packSelectId={packSelectId}
            disabled={submitting}
          />
        )}

        {isMulti && (
          <MultiEditPanel
            selections={selections}
            namePrefix={namePrefix}
            tags={tags}
            packId={packId}
            packs={data.packs}
            showNewPack={showNewPack}
            newPackName={newPackName}
            editingCardUid={editingCardUid}
            progress={progress}
            disabled={submitting}
            onChangePrefix={setNamePrefix}
            onChangeTags={setTags}
            onChangePackId={setPackId}
            onShowNewPack={() => setShowNewPack(true)}
            onHideNewPack={() => setShowNewPack(false)}
            onChangeNewPackName={setNewPackName}
            onCreatePack={() => void handleCreatePack()}
            onRemove={removeSelection}
            onAddMore={() => void handleSelectViaElectron()}
            onStartEdit={(uid) => setEditingCardUid(uid)}
            onEndEdit={() => setEditingCardUid(null)}
            onChangeCustomName={updateCustomName}
            namePrefixId={namePrefixId}
            tagsInputId={tagsInputId}
            packSelectId={packSelectId}
          />
        )}

        {/* 푸터 */}
        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-sp-border bg-sp-bg/30">
          {isEmpty ? (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
            >
              취소
            </button>
          ) : (
            <>
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
                onClick={() => void handleSubmit()}
                disabled={submitDisabled}
                className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined icon-sm animate-spin">
                      progress_activity
                    </span>
                    {progress
                      ? `처리 중... ${progress.current}/${progress.total}`
                      : '저장 중...'}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined icon-sm">add</span>
                    {isMulti ? `${selections.length}개 등록하기` : '추가하기'}
                  </>
                )}
              </button>
            </>
          )}
        </footer>

        {/* 숨김 file input — 모든 모드 공유 */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={handleFileInputChange}
          className="sr-only"
        />
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// 0장: 드롭존
// ────────────────────────────────────────────────────────────

interface EmptyDropZoneProps {
  dragActive: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClickPick: () => void;
}

function EmptyDropZone({
  dragActive,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onClickPick,
}: EmptyDropZoneProps): JSX.Element {
  return (
    <div className="px-5 py-8">
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={[
          'rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 px-6 py-12 text-center transition-colors',
          dragActive
            ? 'border-sp-accent bg-sp-accent/5'
            : 'border-sp-border bg-sp-bg/30 hover:border-sp-accent/40',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-icon-xl text-sp-muted"
        >
          cloud_upload
        </span>
        <div>
          <p className="text-base font-sp-semibold text-sp-text">
            이미지를 드래그하거나 클릭해서 선택
          </p>
          <p className="text-detail text-sp-muted mt-1">
            한 장도 좋고, 여러 장을 한꺼번에 골라도 좋아요. (PNG · WebP · JPEG · GIF · BMP)
          </p>
        </div>
        <button
          type="button"
          onClick={onClickPick}
          className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined icon-sm">folder_open</span>
          파일 선택 (여러 개 가능)
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 1장: 단일 편집 패널 (기존 좌우 2단 폼)
// ────────────────────────────────────────────────────────────

interface SingleEditPanelProps {
  selection: FileSelection;
  name: string;
  nameError: string | null;
  tags: string[];
  packId: string;
  packs: ReadonlyArray<{ id: string; name: string; order: number }>;
  showNewPack: boolean;
  newPackName: string;
  onChangeName: (v: string) => void;
  onChangeTags: (next: string[]) => void;
  onChangePackId: (id: string) => void;
  onShowNewPack: () => void;
  onHideNewPack: () => void;
  onChangeNewPackName: (v: string) => void;
  onCreatePack: () => void;
  onClear: () => void;
  onAddMore: () => void;
  singleNameInputRef: React.RefObject<HTMLInputElement>;
  singleNameInputId: string;
  tagsInputId: string;
  packSelectId: string;
  disabled: boolean;
}

function SingleEditPanel({
  selection,
  name,
  nameError,
  tags,
  packId,
  packs,
  showNewPack,
  newPackName,
  onChangeName,
  onChangeTags,
  onChangePackId,
  onShowNewPack,
  onHideNewPack,
  onChangeNewPackName,
  onCreatePack,
  onClear,
  onAddMore,
  singleNameInputRef,
  singleNameInputId,
  tagsInputId,
  packSelectId,
  disabled,
}: SingleEditPanelProps): JSX.Element {
  const sortedPacks = useMemo(
    () => [...packs].sort((a, b) => a.order - b.order),
    [packs],
  );

  return (
    <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[65vh] overflow-y-auto">
      {/* 좌: 미리보기 */}
      <div>
        <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
          이미지
        </p>
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square rounded-xl ring-1 ring-sp-border bg-sp-bg flex items-center justify-center overflow-hidden">
            {selection.previewUrl ? (
              <img
                src={selection.previewUrl}
                alt="미리보기"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-sp-muted px-4">
                <span className="material-symbols-outlined text-icon-xl">image</span>
                <p className="text-detail mt-1 break-all">{selection.fileName}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="flex-1 px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors disabled:opacity-50"
            >
              다른 파일 선택
            </button>
            <button
              type="button"
              onClick={onAddMore}
              disabled={disabled}
              className="flex-1 px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-50"
              title="여러 개를 한꺼번에 등록하려면 더 추가하세요"
            >
              <span className="material-symbols-outlined icon-sm">add_photo_alternate</span>
              여러 장 추가
            </button>
          </div>
          <p className="text-detail text-sp-muted leading-relaxed">
            저장하면 자동으로 360×360 PNG로 변환되고
            <br />
            투명배경이 보존됩니다.
          </p>
        </div>
      </div>

      {/* 우: 메타데이터 */}
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor={singleNameInputId}
            className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
          >
            이름
          </label>
          <input
            ref={singleNameInputRef}
            id={singleNameInputId}
            type="text"
            value={name}
            maxLength={30}
            disabled={disabled}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="예: 화이팅"
            className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1">
            {nameError ? (
              <p className="text-detail text-red-400">{nameError}</p>
            ) : (
              <span />
            )}
            <p className="text-detail text-sp-muted">{name.length}/30</p>
          </div>
        </div>

        <div>
          <label
            htmlFor={tagsInputId}
            className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
          >
            태그{' '}
            <span className="text-sp-muted/70 normal-case font-normal">
              (쉼표·공백으로 구분)
            </span>
          </label>
          <TagChipsEditor
            id={tagsInputId}
            tags={tags}
            onChange={onChangeTags}
            placeholder="예: 응원, 힘내, 파이팅"
          />
          <p className="text-detail text-sp-muted mt-1">최대 10개, 각 12자 이하</p>
        </div>

        <div>
          <label
            htmlFor={packSelectId}
            className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
          >
            팩
          </label>
          {showNewPack ? (
            <PackCreateRow
              newPackName={newPackName}
              onChangeNewPackName={onChangeNewPackName}
              onCreatePack={onCreatePack}
              onHideNewPack={onHideNewPack}
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center gap-2">
              <select
                id={packSelectId}
                value={packId}
                onChange={(e) => onChangePackId(e.target.value)}
                disabled={disabled}
                className="flex-1 px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm disabled:opacity-50"
              >
                {sortedPacks.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onShowNewPack}
                disabled={disabled}
                className="px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <span className="material-symbols-outlined icon-sm">add</span>새 팩
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// N장: 다중 편집 패널 (그리드 + prefix/공통 메타)
// ────────────────────────────────────────────────────────────

interface MultiEditPanelProps {
  selections: FileSelection[];
  namePrefix: string;
  tags: string[];
  packId: string;
  packs: ReadonlyArray<{ id: string; name: string; order: number }>;
  showNewPack: boolean;
  newPackName: string;
  editingCardUid: string | null;
  progress: { current: number; total: number } | null;
  disabled: boolean;
  onChangePrefix: (v: string) => void;
  onChangeTags: (next: string[]) => void;
  onChangePackId: (id: string) => void;
  onShowNewPack: () => void;
  onHideNewPack: () => void;
  onChangeNewPackName: (v: string) => void;
  onCreatePack: () => void;
  onRemove: (uid: string) => void;
  onAddMore: () => void;
  onStartEdit: (uid: string) => void;
  onEndEdit: () => void;
  onChangeCustomName: (uid: string, name: string) => void;
  namePrefixId: string;
  tagsInputId: string;
  packSelectId: string;
}

function MultiEditPanel({
  selections,
  namePrefix,
  tags,
  packId,
  packs,
  showNewPack,
  newPackName,
  editingCardUid,
  progress,
  disabled,
  onChangePrefix,
  onChangeTags,
  onChangePackId,
  onShowNewPack,
  onHideNewPack,
  onChangeNewPackName,
  onCreatePack,
  onRemove,
  onAddMore,
  onStartEdit,
  onEndEdit,
  onChangeCustomName,
  namePrefixId,
  tagsInputId,
  packSelectId,
}: MultiEditPanelProps): JSX.Element {
  const sortedPacks = useMemo(
    () => [...packs].sort((a, b) => a.order - b.order),
    [packs],
  );

  return (
    <div className="px-5 py-5 grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-5 max-h-[70vh] overflow-y-auto">
      {/* 좌: 썸네일 그리드 */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mr-auto">
            등록할 이모티콘 ({selections.length}장)
          </p>
          <button
            type="button"
            onClick={onAddMore}
            disabled={disabled}
            className="px-2.5 py-1.5 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors inline-flex items-center gap-1 disabled:opacity-50"
          >
            <span className="material-symbols-outlined icon-sm">add</span>
            파일 추가
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {selections.map((sel, idx) => {
            const editing = editingCardUid === sel.uid;
            const trimmedPrefix = namePrefix.trim();
            const previewName =
              sel.customName?.trim() ||
              (trimmedPrefix.length > 0 ? `${trimmedPrefix} ${idx + 1}` : `이름 ${idx + 1}`);
            return (
              <ThumbnailCard
                key={sel.uid}
                selection={sel}
                index={idx}
                editing={editing}
                disabled={disabled}
                previewName={previewName}
                onStartEdit={() => onStartEdit(sel.uid)}
                onEndEdit={onEndEdit}
                onChangeCustomName={(v) => onChangeCustomName(sel.uid, v)}
                onRemove={() => onRemove(sel.uid)}
              />
            );
          })}
        </div>

        {progress && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-detail text-sp-muted mb-1">
              <span>이모티콘 등록 중...</span>
              <span className="tabular-nums">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-sp-bg ring-1 ring-sp-border overflow-hidden">
              <div
                className="h-full bg-sp-accent transition-all duration-sp-base"
                style={{
                  width: `${
                    progress.total === 0 ? 0 : (progress.current / progress.total) * 100
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 우: 공통 메타 */}
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor={namePrefixId}
            className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
          >
            이름 prefix
          </label>
          <input
            id={namePrefixId}
            type="text"
            value={namePrefix}
            maxLength={20}
            disabled={disabled}
            onChange={(e) => onChangePrefix(e.target.value)}
            placeholder="예: 캐릭터"
            className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm disabled:opacity-50"
          />
          <p className="text-detail text-sp-muted mt-1 leading-relaxed">
            자동으로{' '}
            <strong className="text-sp-text">
              {namePrefix.trim() || '이름'} 1
            </strong>
            ,{' '}
            <strong className="text-sp-text">
              {namePrefix.trim() || '이름'} 2
            </strong>
            ... 형태로 매겨져요. 카드의 ✏️ 아이콘으로 개별 수정도 가능해요.
          </p>
        </div>

        <div>
          <label
            htmlFor={tagsInputId}
            className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
          >
            공통 태그{' '}
            <span className="text-sp-muted/70 normal-case font-normal">(선택)</span>
          </label>
          <TagChipsEditor
            id={tagsInputId}
            tags={tags}
            onChange={onChangeTags}
            placeholder="예: 응원, 힘내"
          />
          <p className="text-detail text-sp-muted mt-1">최대 10개, 각 12자 이하</p>
        </div>

        <div>
          <label
            htmlFor={packSelectId}
            className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
          >
            팩
          </label>
          {showNewPack ? (
            <PackCreateRow
              newPackName={newPackName}
              onChangeNewPackName={onChangeNewPackName}
              onCreatePack={onCreatePack}
              onHideNewPack={onHideNewPack}
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center gap-2">
              <select
                id={packSelectId}
                value={packId}
                onChange={(e) => onChangePackId(e.target.value)}
                disabled={disabled}
                className="flex-1 px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm disabled:opacity-50"
              >
                {sortedPacks.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onShowNewPack}
                disabled={disabled}
                className="px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <span className="material-symbols-outlined icon-sm">add</span>새 팩
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-sp-bg/40 ring-1 ring-sp-border p-3 text-detail text-sp-muted leading-relaxed">
          <p className="font-sp-semibold text-sp-text mb-1 flex items-center gap-1.5">
            <span aria-hidden="true">💡</span>도움말
          </p>
          <ul className="space-y-1 list-disc list-inside marker:text-sp-muted/50">
            <li>이미 등록된 이미지(같은 hash)는 자동으로 건너뜁니다</li>
            <li>각 이모티콘은 360×360 PNG로 정규화되어 저장됩니다</li>
            <li>카드의 ✕로 등록 전에 빼낼 수 있어요</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

interface ThumbnailCardProps {
  selection: FileSelection;
  index: number;
  editing: boolean;
  disabled: boolean;
  previewName: string;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChangeCustomName: (v: string) => void;
  onRemove: () => void;
}

function ThumbnailCard({
  selection,
  index,
  editing,
  disabled,
  previewName,
  onStartEdit,
  onEndEdit,
  onChangeCustomName,
  onRemove,
}: ThumbnailCardProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      // 마이크로태스크 후 포커스 + 전체 선택
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [editing]);

  return (
    <div
      className={[
        'relative aspect-square rounded-xl bg-sp-bg overflow-hidden transition-all duration-sp-base ease-sp-out',
        editing
          ? 'ring-2 ring-sp-accent shadow-sp-md'
          : 'ring-1 ring-sp-border hover:ring-sp-accent/50',
        disabled ? 'opacity-70' : '',
      ].join(' ')}
    >
      {/* 미리보기 */}
      {selection.previewUrl ? (
        <img
          src={selection.previewUrl}
          alt={previewName}
          className="w-full h-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-sp-muted px-2 text-center">
          <span className="material-symbols-outlined text-icon-md">image</span>
          <p className="text-[10px] mt-1 break-all line-clamp-2">{selection.fileName}</p>
        </div>
      )}

      {/* 좌상: 인덱스 배지 */}
      <div
        className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-sp-card/85 ring-1 ring-sp-border text-[10px] font-sp-semibold text-sp-muted backdrop-blur-sm tabular-nums"
        aria-hidden="true"
      >
        {index + 1}
      </div>

      {/* 우상: 제거 버튼 */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`${previewName} 제거`}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-sp-card/85 text-sp-muted ring-1 ring-sp-border hover:text-red-400 hover:ring-red-400/40 backdrop-blur-sm transition-colors flex items-center justify-center disabled:opacity-50"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          close
        </span>
      </button>

      {/* 하단: 이름 표시 / 편집 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sp-card/95 via-sp-card/85 to-transparent pt-3 pb-1.5 px-1.5">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={selection.customName ?? ''}
            maxLength={30}
            disabled={disabled}
            onChange={(e) => onChangeCustomName(e.target.value)}
            onBlur={onEndEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                onEndEdit();
              }
            }}
            placeholder={previewName}
            className="w-full px-1.5 py-1 rounded bg-sp-bg ring-1 ring-sp-accent text-sp-text text-[11px] focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            disabled={disabled}
            className="w-full text-left flex items-center gap-1 px-1 py-0.5 rounded hover:bg-sp-text/5 transition-colors group disabled:cursor-not-allowed"
            title="클릭해서 이름 편집"
          >
            <span className="text-[11px] text-sp-text font-sp-medium truncate flex-1">
              {previewName}
            </span>
            <span className="material-symbols-outlined text-sp-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ fontSize: '14px' }}>
              edit
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 새 팩 만들기 행 (단일/다중 공통)
// ────────────────────────────────────────────────────────────

interface PackCreateRowProps {
  newPackName: string;
  onChangeNewPackName: (v: string) => void;
  onCreatePack: () => void;
  onHideNewPack: () => void;
  disabled: boolean;
}

function PackCreateRow({
  newPackName,
  onChangeNewPackName,
  onCreatePack,
  onHideNewPack,
  disabled,
}: PackCreateRowProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={newPackName}
        maxLength={20}
        disabled={disabled}
        onChange={(e) => onChangeNewPackName(e.target.value)}
        placeholder="새 팩 이름"
        className="flex-1 px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm disabled:opacity-50"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCreatePack();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onHideNewPack();
          }
        }}
      />
      <button
        type="button"
        onClick={onCreatePack}
        disabled={disabled || !newPackName.trim()}
        className="px-3 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-xs font-sp-semibold disabled:opacity-50 hover:bg-sp-accent/90 transition-colors"
      >
        만들기
      </button>
      <button
        type="button"
        onClick={onHideNewPack}
        disabled={disabled}
        className="px-2 py-2 rounded-lg text-sp-muted hover:text-sp-text disabled:opacity-50"
      >
        <span className="material-symbols-outlined icon-sm">close</span>
      </button>
    </div>
  );
}
