import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  validateSheetDimensions,
  validateStickerName,
  type GridSize,
} from '@domain/rules/stickerRules';
import { DEFAULT_PACK_ID } from '@domain/entities/Sticker';
import { generateUUID } from '@infrastructure/utils/uuid';
import { TagChipsEditor } from './TagChipsEditor';
import type {
  StickerSheetCellPreview,
  StickerSplitSheetResult,
} from '@adapters/components/StickerPicker/stickerElectronTypes';

interface StickerSheetSplitterProps {
  isOpen: boolean;
  onClose: () => void;
  /** 사전 선택된 팩 (관리 페이지에서 특정 팩 보기 중일 때) */
  defaultPackId?: string;
}

interface FileSelection {
  filePath: string;
  fileName: string;
}

type Step = 'select' | 'preview' | 'committing';

const GRID_OPTIONS: ReadonlyArray<{ value: GridSize; label: string; subtitle: string }> = [
  { value: 2, label: '2 × 2', subtitle: '4개 셀' },
  { value: 3, label: '3 × 3', subtitle: '9개 셀' },
  { value: 4, label: '4 × 4', subtitle: '16개 셀 (기본)' },
];

/**
 * 시트 분할 모달 (Phase 2B / PRD §3.4.3).
 *
 * 흐름:
 * 1) Step 'select' — 파일 선택 + 격자 크기 선택 → 검증
 * 2) Step 'preview' — 분할 미리보기 + 셀 선택 + 메타데이터 입력
 * 3) Step 'committing' — 일괄 저장 (PNG + metadata) → 닫기
 *
 * 모달 닫힘 시 분할 세션을 main에서 정리한다.
 */
export function StickerSheetSplitter({
  isOpen,
  onClose,
  defaultPackId,
}: StickerSheetSplitterProps): JSX.Element {
  const data = useStickerStore((s) => s.data);
  const stickers = data.stickers;
  const addPack = useStickerStore((s) => s.addPack);
  const addStickersBulk = useStickerStore((s) => s.addStickersBulk);

  const [step, setStep] = useState<Step>('select');
  const [selection, setSelection] = useState<FileSelection | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [gridSize, setGridSize] = useState<GridSize>(4);

  // Step 2 — preview state
  const [splitResult, setSplitResult] = useState<StickerSplitSheetResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [namePrefix, setNamePrefix] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [packId, setPackId] = useState<string>(defaultPackId ?? DEFAULT_PACK_ID);
  const [newPackName, setNewPackName] = useState('');
  const [showNewPack, setShowNewPack] = useState(false);

  const sessionIdRef = useRef<string | null>(null);

  const namePrefixId = useId();
  const tagsInputId = useId();
  const packSelectId = useId();

  const electronApi = window.electronAPI?.sticker;

  // 모달 닫힘 시 상태 초기화 + 세션 정리
  useEffect(() => {
    if (isOpen) return;
    // 세션 정리는 isOpen → false 전환 시 한 번만
    const sid = sessionIdRef.current;
    if (sid && electronApi?.cancelSheetSession) {
      void electronApi.cancelSheetSession(sid).catch(() => {
        // ignore
      });
    }
    sessionIdRef.current = null;
    setStep('select');
    setSelection(null);
    setValidationError(null);
    setValidating(false);
    setGridSize(4);
    setSplitResult(null);
    setSelectedIndices(new Set());
    setNamePrefix('');
    setTags([]);
    setPackId(defaultPackId ?? DEFAULT_PACK_ID);
    setShowNewPack(false);
    setNewPackName('');
    // electronApi는 reference-stable, defaultPackId만 외부 변경
  }, [isOpen, defaultPackId, electronApi]);

  // 기존 등록된 contentHash 셋 (중복 감지용)
  const existingHashes = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const s of stickers) {
      if (s.contentHash !== undefined && s.contentHash.length > 0) {
        set.add(s.contentHash);
      }
    }
    return set;
  }, [stickers]);

  const previewCells = splitResult?.cells ?? [];

  // 자동 선택: 비어있지 않고 중복 아닌 셀들만 기본 선택
  useEffect(() => {
    if (!splitResult) return;
    const next = new Set<number>();
    for (const cell of splitResult.cells) {
      if (cell.isEmpty) continue;
      if (existingHashes.has(cell.contentHash)) continue;
      next.add(cell.index);
    }
    setSelectedIndices(next);
  }, [splitResult, existingHashes]);

  // ── 파일 선택 (Step 1) ──
  const handleSelectFile = async () => {
    const api = electronApi;
    if (!api?.selectImage) {
      useToastStore
        .getState()
        .show('파일 선택은 데스크톱 앱에서만 동작해요.', 'error');
      return;
    }
    try {
      const result = await api.selectImage();
      if (result.canceled || result.filePaths.length === 0) return;
      const filePath = result.filePaths[0]!;
      const fileName = filePath.replace(/^.*[\\/]/, '');
      setSelection({ filePath, fileName });
      setValidationError(null);

      // 즉시 dimension 검증
      if (api.validateSheet) {
        setValidating(true);
        try {
          const dims = await api.validateSheet(filePath);
          const v = validateSheetDimensions(dims.width, dims.height);
          if (!v.ok) {
            setValidationError(v.reason ?? '시트 검증에 실패했어요.');
          }
        } catch (err) {
          setValidationError(
            err instanceof Error ? err.message : '시트를 검증하지 못했어요.',
          );
        } finally {
          setValidating(false);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[StickerSheetSplitter] selectImage 실패:', err);
      useToastStore.getState().show('파일을 선택하지 못했어요.', 'error');
    }
  };

  // ── 분석하기 (Step 1 → Step 2) ──
  const handleAnalyze = async () => {
    if (!selection) return;
    if (validationError) return;
    const api = electronApi;
    if (!api?.splitSheet) {
      useToastStore
        .getState()
        .show('시트 분할은 데스크톱 앱에서만 동작해요.', 'error');
      return;
    }
    setValidating(true);
    try {
      const result = await api.splitSheet(selection.filePath, gridSize);
      sessionIdRef.current = result.sessionId;
      // result는 readonly 시그니처. mutable state로 보관하기 위해 그대로 전달.
      setSplitResult(result);
      setStep('preview');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '분할에 실패했어요.';
      useToastStore.getState().show(msg, 'error');
    } finally {
      setValidating(false);
    }
  };

  // ── 셀 토글 ──
  const toggleCell = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!splitResult) return;
    const next = new Set<number>();
    for (const cell of splitResult.cells) {
      next.add(cell.index);
    }
    setSelectedIndices(next);
  }, [splitResult]);

  const clearAll = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  // ── 새 팩 만들기 ──
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

  // ── 등록하기 (Step 2 → Step 3) ──
  const handleCommit = async () => {
    const api = electronApi;
    if (!api?.commitSheetCells) {
      useToastStore
        .getState()
        .show('이모티콘 등록은 데스크톱 앱에서만 동작해요.', 'error');
      return;
    }
    if (!splitResult || !sessionIdRef.current) return;
    if (selectedIndices.size === 0) {
      useToastStore.getState().show('등록할 셀을 선택해 주세요.', 'error');
      return;
    }
    const trimmedPrefix = namePrefix.trim();
    if (trimmedPrefix.length === 0) {
      useToastStore.getState().show('이름 prefix를 입력해 주세요.', 'error');
      return;
    }

    setStep('committing');

    // index 오름차순으로 정렬한 후 1번부터 매칭
    const orderedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    const cellMap = new Map<number, StickerSheetCellPreview>();
    for (const c of splitResult.cells) cellMap.set(c.index, c);

    // 사전 stickerId 발급 → main에 PNG 저장 요청
    const idAssignments = orderedIndices.map((idx) => ({
      index: idx,
      stickerId: generateUUID(),
    }));

    let committed: ReadonlyArray<{
      index: number;
      stickerId: string;
      contentHash: string;
    }>;
    try {
      const res = await api.commitSheetCells(sessionIdRef.current, idAssignments);
      committed = res.committed;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '이모티콘 PNG를 저장하지 못했어요.';
      useToastStore.getState().show(msg, 'error');
      setStep('preview');
      return;
    }

    // metadata 일괄 저장 — 이름은 prefix + " " + (1..N)
    const inputs = committed.map((c, i) => {
      const baseName = `${trimmedPrefix} ${i + 1}`;
      const validation = validateStickerName(baseName);
      const finalName = validation.ok ? baseName : `${trimmedPrefix.slice(0, 28)} ${i + 1}`;
      return {
        id: c.stickerId,
        name: finalName,
        tags: [...tags],
        packId,
        contentHash: c.contentHash,
      };
    });

    const { stickers: newOnes, skipped } = await addStickersBulk(inputs);

    // 중복(skipped)으로 등록 안 된 PNG는 정리 (best-effort)
    if (skipped.length > 0 && api.deleteImage) {
      for (const sk of skipped) {
        const orphanCommit = committed[sk.index];
        if (orphanCommit) {
          try {
            await api.deleteImage(orphanCommit.stickerId);
          } catch {
            // ignore
          }
        }
      }
    }

    sessionIdRef.current = null;

    if (newOnes.length === 0) {
      useToastStore
        .getState()
        .show(
          skipped.length > 0
            ? `모두 이미 등록된 이모티콘이에요. (중복 ${skipped.length}개)`
            : '등록된 이모티콘이 없어요.',
          'error',
        );
    } else {
      const skipMsg = skipped.length > 0 ? ` (중복 ${skipped.length}개 건너뜀)` : '';
      useToastStore
        .getState()
        .show(`이모티콘 ${newOnes.length}개가 등록되었어요!${skipMsg}`, 'success');
    }

    onClose();
  };

  // ── 뒤로 가기 (Step 2 → Step 1) ──
  const handleBack = async () => {
    const sid = sessionIdRef.current;
    const api = electronApi;
    if (sid && api?.cancelSheetSession) {
      try {
        await api.cancelSheetSession(sid);
      } catch {
        // ignore
      }
    }
    sessionIdRef.current = null;
    setSplitResult(null);
    setSelectedIndices(new Set());
    setStep('select');
  };

  const isCommitting = step === 'committing';

  // 선택된/유효한 카운트
  const validCount = splitResult
    ? splitResult.cells.filter(
        (c) => !c.isEmpty && !existingHashes.has(c.contentHash),
      ).length
    : 0;
  const totalCount = splitResult?.cells.length ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isCommitting ? () => {} : onClose}
      title="시트 분할"
      srOnlyTitle
      size="xl"
      closeOnBackdrop={!isCommitting}
      closeOnEsc={!isCommitting}
    >
      <div className="flex flex-col">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => void handleBack()}
                aria-label="이전 단계로"
                disabled={isCommitting}
                className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            )}
            <div>
              <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
                <span aria-hidden="true">📐</span>
                시트 분할로 한 번에 등록
              </h3>
              <p className="text-detail text-sp-muted mt-0.5">
                {step === 'select'
                  ? '4×4 시트 이미지를 선택하면 자동으로 잘라서 일괄 등록할 수 있어요.'
                  : `${gridSize}×${gridSize} 분할 결과 — ${selectedIndices.size}/${totalCount}개 선택됨`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCommitting}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 disabled:opacity-50 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* 콘텐츠 */}
        {step === 'select' && (
          <SelectStep
            selection={selection}
            validationError={validationError}
            validating={validating}
            gridSize={gridSize}
            onSelectFile={() => void handleSelectFile()}
            onClear={() => {
              setSelection(null);
              setValidationError(null);
            }}
            onChangeGridSize={setGridSize}
          />
        )}

        {step !== 'select' && splitResult && (
          <PreviewStep
            cells={previewCells}
            gridSize={splitResult.gridSize}
            selectedIndices={selectedIndices}
            existingHashes={existingHashes}
            onToggleCell={toggleCell}
            onSelectAll={selectAll}
            onClearAll={clearAll}
            validCount={validCount}
            packs={data.packs}
            packId={packId}
            onChangePackId={setPackId}
            showNewPack={showNewPack}
            onShowNewPack={() => setShowNewPack(true)}
            onHideNewPack={() => setShowNewPack(false)}
            newPackName={newPackName}
            onChangeNewPackName={setNewPackName}
            onCreatePack={() => void handleCreatePack()}
            namePrefix={namePrefix}
            onChangeNamePrefix={setNamePrefix}
            namePrefixId={namePrefixId}
            tags={tags}
            onChangeTags={setTags}
            tagsInputId={tagsInputId}
            packSelectId={packSelectId}
            disabled={isCommitting}
          />
        )}

        {/* 푸터 */}
        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-sp-border bg-sp-bg/30">
          {step === 'select' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={
                  !selection ||
                  validating ||
                  validationError !== null
                }
                className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center gap-1.5"
              >
                {validating ? (
                  <>
                    <span className="material-symbols-outlined icon-sm animate-spin">
                      progress_activity
                    </span>
                    분석 중...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined icon-sm">grid_view</span>
                    분석하기
                  </>
                )}
              </button>
            </>
          )}
          {step !== 'select' && (
            <>
              <button
                type="button"
                onClick={() => void handleBack()}
                disabled={isCommitting}
                className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
              >
                다시 선택
              </button>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={
                  isCommitting ||
                  selectedIndices.size === 0 ||
                  namePrefix.trim().length === 0
                }
                className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center gap-1.5"
              >
                {isCommitting ? (
                  <>
                    <span className="material-symbols-outlined icon-sm animate-spin">
                      progress_activity
                    </span>
                    등록 중...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined icon-sm">add</span>
                    {selectedIndices.size}개 등록하기
                  </>
                )}
              </button>
            </>
          )}
        </footer>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// Step 1: 파일 선택 + 격자 크기
// ────────────────────────────────────────────────────────────

interface SelectStepProps {
  selection: FileSelection | null;
  validationError: string | null;
  validating: boolean;
  gridSize: GridSize;
  onSelectFile: () => void;
  onClear: () => void;
  onChangeGridSize: (g: GridSize) => void;
}

function SelectStep({
  selection,
  validationError,
  validating,
  gridSize,
  onSelectFile,
  onClear,
  onChangeGridSize,
}: SelectStepProps): JSX.Element {
  return (
    <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[65vh] overflow-y-auto">
      {/* 좌: 파일 선택 / 미리보기 */}
      <div>
        <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
          시트 이미지
        </p>
        {selection ? (
          <div className="flex flex-col gap-3">
            <div className="aspect-square rounded-xl ring-1 ring-sp-border bg-sp-bg flex flex-col items-center justify-center text-center px-4">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-icon-xl text-sp-muted mb-2"
              >
                grid_view
              </span>
              <p className="text-detail text-sp-text break-all">{selection.fileName}</p>
              {validating && (
                <p className="text-detail text-sp-muted mt-2 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined icon-sm animate-spin">
                    progress_activity
                  </span>
                  검증 중...
                </p>
              )}
              {validationError && (
                <p className="text-detail text-red-400 mt-2 leading-relaxed">
                  {validationError}
                </p>
              )}
              {!validating && !validationError && (
                <p className="text-detail text-emerald-400 mt-2 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined icon-sm">check_circle</span>
                  분할 가능한 시트예요
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="w-full px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors"
            >
              다른 파일 선택
            </button>
          </div>
        ) : (
          <div className="aspect-square rounded-xl border-2 border-dashed border-sp-border bg-sp-bg/30 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-icon-xl text-sp-muted"
            >
              grid_view
            </span>
            <div>
              <p className="text-sm font-sp-semibold text-sp-text">
                4×4 등 정사각형 시트 이미지
              </p>
              <p className="text-detail text-sp-muted mt-1 leading-relaxed">
                ChatGPT 등에서 받은 1000px 이상의
                <br />
                정사각형 격자 이미지를 선택해 주세요.
              </p>
            </div>
            <button
              type="button"
              onClick={onSelectFile}
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-xs font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined icon-sm">folder_open</span>
              파일 선택
            </button>
          </div>
        )}
      </div>

      {/* 우: 격자 크기 + 안내 */}
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
            격자 크기
          </p>
          <div className="grid grid-cols-3 gap-2">
            {GRID_OPTIONS.map((opt) => {
              const active = opt.value === gridSize;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeGridSize(opt.value)}
                  className={[
                    'rounded-xl px-3 py-3 text-center transition-all duration-sp-base ease-sp-out',
                    active
                      ? 'bg-sp-accent/15 ring-2 ring-sp-accent text-sp-text shadow-sp-sm'
                      : 'ring-1 ring-sp-border bg-sp-bg/40 text-sp-muted hover:text-sp-text hover:ring-sp-accent/40',
                  ].join(' ')}
                >
                  <p
                    className={[
                      'text-base font-sp-bold',
                      active ? 'text-sp-accent' : '',
                    ].join(' ')}
                  >
                    {opt.label}
                  </p>
                  <p className="text-detail mt-0.5">{opt.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl bg-sp-bg/40 ring-1 ring-sp-border p-4">
          <p className="text-sm font-sp-semibold text-sp-text mb-2 flex items-center gap-1.5">
            <span aria-hidden="true">💡</span>이렇게 동작해요
          </p>
          <ul className="space-y-1.5 text-detail text-sp-muted leading-relaxed list-disc list-inside marker:text-sp-muted/50">
            <li>정사각형 시트(±3% 허용) + 1000px 이상 필요</li>
            <li>각 셀은 자동으로 360×360 PNG로 정규화</li>
            <li>비어 있는 셀(투명/단색)은 자동으로 제외</li>
            <li>이미 등록된 이모티콘과 같은 셀은 중복으로 표시</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 2: 미리보기 + 셀 선택 + 메타데이터
// ────────────────────────────────────────────────────────────

interface PreviewStepProps {
  cells: ReadonlyArray<StickerSheetCellPreview>;
  gridSize: GridSize;
  selectedIndices: Set<number>;
  existingHashes: Set<string>;
  onToggleCell: (index: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  validCount: number;
  packs: ReadonlyArray<{ id: string; name: string; order: number }>;
  packId: string;
  onChangePackId: (id: string) => void;
  showNewPack: boolean;
  onShowNewPack: () => void;
  onHideNewPack: () => void;
  newPackName: string;
  onChangeNewPackName: (name: string) => void;
  onCreatePack: () => void;
  namePrefix: string;
  onChangeNamePrefix: (v: string) => void;
  namePrefixId: string;
  tags: string[];
  onChangeTags: (next: string[]) => void;
  tagsInputId: string;
  packSelectId: string;
  disabled: boolean;
}

function PreviewStep({
  cells,
  gridSize,
  selectedIndices,
  existingHashes,
  onToggleCell,
  onSelectAll,
  onClearAll,
  validCount,
  packs,
  packId,
  onChangePackId,
  showNewPack,
  onShowNewPack,
  onHideNewPack,
  newPackName,
  onChangeNewPackName,
  onCreatePack,
  namePrefix,
  onChangeNamePrefix,
  namePrefixId,
  tags,
  onChangeTags,
  tagsInputId,
  packSelectId,
  disabled,
}: PreviewStepProps): JSX.Element {
  const sortedPacks = useMemo(
    () => [...packs].sort((a, b) => a.order - b.order),
    [packs],
  );

  return (
    <div className="px-5 py-5 grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-5 max-h-[70vh] overflow-y-auto">
      {/* 좌: 셀 그리드 */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mr-auto">
            분할 미리보기
          </p>
          <span className="text-detail text-sp-muted">
            등록 가능 {validCount} · 선택 {selectedIndices.size}/{cells.length}
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={disabled}
            className="px-2.5 py-1.5 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors disabled:opacity-50"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={disabled}
            className="px-2.5 py-1.5 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors disabled:opacity-50"
          >
            전체 해제
          </button>
        </div>

        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          }}
        >
          {cells.map((cell) => {
            const selected = selectedIndices.has(cell.index);
            const dup = existingHashes.has(cell.contentHash);
            return (
              <CellThumbnail
                key={cell.index}
                cell={cell}
                selected={selected}
                duplicate={dup}
                disabled={disabled}
                onClick={() => onToggleCell(cell.index)}
              />
            );
          })}
        </div>
      </div>

      {/* 우: 메타데이터 폼 */}
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
            onChange={(e) => onChangeNamePrefix(e.target.value)}
            placeholder="예: 감정"
            disabled={disabled}
            className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm disabled:opacity-50"
          />
          <p className="text-detail text-sp-muted mt-1 leading-relaxed">
            자동으로 <strong className="text-sp-text">{namePrefix.trim() || '이름'} 1</strong>,{' '}
            <strong className="text-sp-text">
              {namePrefix.trim() || '이름'} 2
            </strong>
            ... 형태로 매겨져요.
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
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPackName}
                maxLength={20}
                onChange={(e) => onChangeNewPackName(e.target.value)}
                placeholder="새 팩 이름"
                disabled={disabled}
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
            <span aria-hidden="true">ℹ️</span>표시 안내
          </p>
          <ul className="space-y-1 list-disc list-inside marker:text-sp-muted/50">
            <li>
              <span className="text-sp-text">테두리 강조</span>: 등록할 셀
            </li>
            <li>
              <span className="text-sp-text">"비어 보임"</span>: 95% 이상 단색·투명
            </li>
            <li>
              <span className="text-sp-text">"중복"</span>: 이미 같은 이미지로 등록됨
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

interface CellThumbnailProps {
  cell: StickerSheetCellPreview;
  selected: boolean;
  duplicate: boolean;
  disabled: boolean;
  onClick: () => void;
}

function CellThumbnail({
  cell,
  selected,
  duplicate,
  disabled,
  onClick,
}: CellThumbnailProps): JSX.Element {
  const dim = cell.isEmpty || duplicate;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`셀 ${cell.index + 1} ${selected ? '선택됨' : '선택 안 됨'}${cell.isEmpty ? ' (비어 보임)' : ''}${duplicate ? ' (중복)' : ''}`}
      className={[
        'relative aspect-square rounded-xl bg-sp-bg overflow-hidden transition-all duration-sp-base ease-sp-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
        selected
          ? 'ring-2 ring-sp-accent shadow-sp-md'
          : duplicate
            ? 'ring-1 ring-yellow-500/40'
            : cell.isEmpty
              ? 'ring-1 ring-dashed ring-sp-border'
              : 'ring-1 ring-sp-border hover:ring-sp-accent/50',
        dim && !selected ? 'opacity-50' : '',
        disabled ? 'cursor-not-allowed' : 'hover:scale-[1.02]',
      ].join(' ')}
    >
      <img
        src={cell.dataUrl}
        alt=""
        aria-hidden="true"
        className="w-full h-full object-contain"
        draggable={false}
      />
      {/* 좌상: 선택 체크 */}
      <div
        className={[
          'absolute top-1.5 left-1.5 w-5 h-5 rounded-md flex items-center justify-center transition-colors',
          selected
            ? 'bg-sp-accent text-sp-accent-fg'
            : 'bg-sp-card/80 text-sp-muted ring-1 ring-sp-border',
        ].join(' ')}
        aria-hidden="true"
      >
        {selected && (
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            check
          </span>
        )}
      </div>
      {/* 우상: 상태 배지 */}
      {(cell.isEmpty || duplicate) && (
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
          {cell.isEmpty && (
            <span className="px-1.5 py-0.5 rounded bg-sp-bg/85 ring-1 ring-sp-border text-[10px] font-sp-semibold text-sp-muted backdrop-blur-sm">
              비어 보임
            </span>
          )}
          {duplicate && (
            <span className="px-1.5 py-0.5 rounded bg-yellow-500/15 ring-1 ring-yellow-500/40 text-[10px] font-sp-semibold text-yellow-300 backdrop-blur-sm">
              중복
            </span>
          )}
        </div>
      )}
      {/* 좌하: 인덱스 */}
      <div
        className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-sp-bg/85 text-[10px] tabular-nums text-sp-muted ring-1 ring-sp-border backdrop-blur-sm"
        aria-hidden="true"
      >
        {cell.index + 1}
      </div>
    </button>
  );
}
