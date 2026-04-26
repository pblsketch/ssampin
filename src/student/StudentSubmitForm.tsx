import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';
import type { RealtimeWallCardColor, RealtimeWallPost } from '@domain/entities/RealtimeWall';
import {
  REALTIME_WALL_MAX_IMAGES_PER_POST,
  REALTIME_WALL_MAX_NICKNAME_LENGTH,
  REALTIME_WALL_MAX_TEXT_LENGTH_V2,
} from '@domain/rules/realtimeWallRules';
import { StudentFormatBar } from '@adapters/components/Tools/RealtimeWall/StudentFormatBar';
import { StudentMarkdownPreviewToggle } from '@adapters/components/Tools/RealtimeWall/StudentMarkdownPreviewToggle';
import { StudentColorPicker } from '@adapters/components/Tools/RealtimeWall/StudentColorPicker';
import { StudentPipaConsentModal } from '@adapters/components/Tools/RealtimeWall/StudentPipaConsentModal';
import { useGraphemeCounter } from './useGraphemeCounter';
import { useStudentDraft } from './useStudentDraft';
import { useStudentImageMultiUpload } from './useStudentImageMultiUpload';
import { useStudentPdfUpload } from './useStudentPdfUpload';
import { StudentSubmitFormHeader } from './StudentSubmitFormHeader';
import { StudentAttachmentRow } from './StudentAttachmentRow';
import { StudentAttachmentPreviewStrip } from './StudentAttachmentPreviewStrip';

/**
 * 학생 카드 추가 모달 — v2.2 (Bug 2 Fix) Padlet 스타일 재설계.
 *
 * v2.1 → v2.2 변경:
 *   - 헤더: 닫기/최소화(좌) + 더보기/게시(우) — 액션 인지 향상
 *   - 제목 / 본문 분리 (`# 제목\n\n본문` 마크다운 합성)
 *   - 통합 첨부 행 (5 버튼 — upload/camera/draw/link/search)
 *   - 첨부 미리보기 스트립 (이미지+PDF+링크 통합)
 *   - 색상/닉네임은 하단 메타바로 이동
 *   - 직접 useStudentImageMultiUpload / useStudentPdfUpload 훅 사용
 *
 * v2.1 (Phase B + Phase A) 기능 유지:
 *   - StudentFormatBar (한글 라벨: 굵게/기울임/• 목록/❝ 인용 + 미리보기 토글) — IME 안전 보존
 *   - 이미지 5장 + 합계 15MB
 *   - PDF 1개 (10MB + magic byte)
 *   - StudentColorPicker: 8색
 *   - useGraphemeCounter: Intl.Segmenter IME-aware
 *   - StudentPipaConsentModal: 첫 이미지 첨부 시 1회 PIPA 동의
 *   - 최소화 → DraftChip + 자동저장
 *   - useStudentDraft: textarea/링크/색상/제목 변경 시 debounced 1초 자동저장
 *
 * 회귀 위험 14건 보존 — 자세한 항목은 PR 본문 참조.
 *
 * Design Bug 2 Fix.
 */

const NICKNAME_STORAGE_KEY = 'ssampin-realtime-wall-nickname';
const PIPA_CONSENT_KEY = 'ssampin-pipa-consent-shown';
const MAX_NICKNAME_LENGTH = REALTIME_WALL_MAX_NICKNAME_LENGTH;
const MAX_TEXT_LENGTH = REALTIME_WALL_MAX_TEXT_LENGTH_V2;
const MAX_LINK_LENGTH = 500;
const MAX_TITLE_LENGTH = 100;
const TITLE_BODY_REGEX = /^#\s+(.+?)\n\n([\s\S]*)$/;

interface StudentSubmitFormProps {
  readonly open: boolean;
  /**
   * 모달 닫기 콜백.
   * - opts.submitted=true: 제출 성공 후 닫힘 (부모가 clearDraft)
   * - opts.minimized=true: 최소화 버튼으로 닫힘 (드래프트 보존, 부모가 칩 표시)
   * - opts 없음: 명시 취소(ESC/X) — 드래프트 보존
   */
  readonly onClose: (opts?: { submitted?: boolean; minimized?: boolean }) => void;
  /** Phase A — 드래프트 storage 키 (보드 단위 분리) */
  readonly boardKey: string;
  /** Phase A — 드래프트 storage 키 (세션 단위 분리) */
  readonly sessionToken: string;
  /** Phase A — 칩 클릭으로 재개 시 true → 드래프트 prefill */
  readonly resumeFromDraft?: boolean;
  /**
   * v2.1 Phase D — 모드 ('create' 기본 / 'edit' 수정).
   */
  readonly mode?: 'create' | 'edit';
  /** v2.1 Phase D — mode='edit' 시 prefill 카드 */
  readonly editingPost?: RealtimeWallPost;
  /**
   * v2.1 student-ux — Padlet 컬럼별 + 버튼으로 진입 시 사용할 columnId.
   */
  readonly defaultColumnId?: string;
}

export function StudentSubmitForm({
  open,
  onClose,
  boardKey,
  sessionToken,
  resumeFromDraft = false,
  mode = 'create',
  editingPost,
  defaultColumnId,
}: StudentSubmitFormProps) {
  const submitCard = useRealtimeWallSyncStore((s) => s.submitCard);
  const submitOwnCardEdit = useRealtimeWallSyncStore((s) => s.submitOwnCardEdit);
  const isSubmitting = useRealtimeWallSyncStore((s) => s.isSubmitting);
  const lastError = useRealtimeWallSyncStore((s) => s.lastError);
  const studentFormLocked = useRealtimeWallSyncStore((s) => s.studentFormLocked);
  const isEditMode = mode === 'edit' && editingPost !== undefined;

  const [nickname, setNickname] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // v2.1 (Phase B) state
  const [images, setImages] = useState<string[]>([]);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | undefined>(undefined);
  const [pdfFilename, setPdfFilename] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<RealtimeWallCardColor | undefined>(undefined);
  const [pipaConsentOpen, setPipaConsentOpen] = useState(false);

  // v2.2 (Bug 2 Fix) state
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // v2.2 (UX) — 마크다운 편집/미리보기 토글 (옵션 D)
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit');

  // Phase A — 드래프트 훅
  const { draft, saveDraft, flushSaveDraft, reloadDraft } = useStudentDraft({
    boardKey,
    sessionToken,
    autoLoad: false,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const graphemeCount = useGraphemeCounter(body);

  // 회귀 위험 #4 — submitted 응답 수신 감지: 직전까지 true였다가 false로 바뀌면 성공
  const prevSubmittingRef = useRef<boolean>(false);

  // v2.2 — 송신 직전 합성: 제목 있으면 `# 제목\n\n본문`, 없으면 본문만
  const compositeText = useMemo(() => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    return trimmedTitle.length > 0
      ? `# ${trimmedTitle}\n\n${trimmedBody}`
      : trimmedBody;
  }, [title, body]);

  // v2.2 — 이미지 다중 업로드 훅 (직접 사용)
  const handleImageAdd = useCallback(
    (dataUrl: string) => {
      // 첫 이미지 첨부 시 PIPA 동의 모달 1회
      if (images.length === 0) {
        try {
          const shown = window.localStorage.getItem(PIPA_CONSENT_KEY);
          if (shown !== '1') setPipaConsentOpen(true);
        } catch {
          setPipaConsentOpen(true);
        }
      }
      setImages((prev) =>
        [...prev, dataUrl].slice(0, REALTIME_WALL_MAX_IMAGES_PER_POST),
      );
    },
    [images.length],
  );

  const imageUpload = useStudentImageMultiUpload({
    currentImages: images,
    onAdd: handleImageAdd,
  });

  // v2.2 — PDF 업로드 훅 (직접 사용)
  const pdfUpload = useStudentPdfUpload();

  // v2.2 — 통합 파일 첨부 핸들러 (이미지/PDF 분기)
  const handleAttachmentUpload = useCallback(
    async (files: FileList) => {
      setAttachmentError(null);
      const filesArr = Array.from(files);
      const imageFiles = filesArr.filter((f) => f.type.startsWith('image/'));
      const pdfFile = filesArr.find(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );

      if (imageFiles.length > 0) {
        // useStudentImageMultiUpload의 onFileSelect 패턴을 흉내냄 (FileList → handleFiles)
        // 훅의 onDrop은 DragEvent를 요구하므로 파생 onFileSelect 호출이 가장 안전
        const synthetic = {
          target: {
            files: dataTransferFromFiles(imageFiles).files,
            value: '',
          },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        imageUpload.onFileSelect(synthetic);
      }
      if (pdfFile) {
        try {
          const result = await pdfUpload.read(pdfFile);
          setPdfDataUrl(result.pdfDataUrl);
          setPdfFilename(result.pdfFilename);
        } catch (e) {
          if (e instanceof Error) setAttachmentError(e.message);
        }
      }
    },
    [imageUpload, pdfUpload],
  );

  const handleRemoveImage = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleRemovePdf = useCallback(() => {
    setPdfDataUrl(undefined);
    setPdfFilename(undefined);
  }, []);

  const handleRemoveLink = useCallback(() => {
    setLinkUrl('');
    setLinkInputOpen(false);
  }, []);

  // 모달 열릴 때마다 nickname을 sessionStorage default로 초기화 + 드래프트 prefill
  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setAttachmentError(null);
    setMoreMenuOpen(false);
    setEditMode('edit');

    // v2.1 Phase D — mode='edit' 분기: 드래프트 무시, editingPost로 prefill
    if (isEditMode && editingPost) {
      setNickname(editingPost.nickname);
      // 정규식으로 # 제목\n\n본문 분리
      const m = TITLE_BODY_REGEX.exec(editingPost.text);
      if (m) {
        setTitle(m[1] ?? '');
        setBody(m[2] ?? '');
      } else {
        setTitle('');
        setBody(editingPost.text);
      }
      const editLink = editingPost.linkUrl ?? '';
      setLinkUrl(editLink);
      setLinkInputOpen(editLink.length > 0);
      setColor(editingPost.color);
      setImages(editingPost.images ? [...editingPost.images] : []);
      // PDF는 file:// URL 그대로 (base64 X — 서버는 file://도 허용)
      setPdfDataUrl(editingPost.pdfUrl);
      setPdfFilename(editingPost.pdfFilename);
      return;
    }

    // 드래프트 복원 (resumeFromDraft 시 또는 mount 시 자동 복원)
    const loaded = reloadDraft();
    const shouldPrefill = resumeFromDraft && loaded !== null;

    if (shouldPrefill && loaded) {
      setNickname(loaded.nickname || readDefaultNickname());
      // 드래프트 text도 # 제목\n\n본문 분리 (있으면)
      const m = TITLE_BODY_REGEX.exec(loaded.text);
      if (m) {
        setTitle(m[1] ?? '');
        setBody(m[2] ?? '');
      } else {
        setTitle('');
        setBody(loaded.text);
      }
      setLinkUrl(loaded.linkUrl);
      setLinkInputOpen(loaded.linkUrl.length > 0);
      setColor(loaded.color);
      // 이미지/PDF는 base64 미보존 — 빈 상태로 유지 (UI 안내용 플래그만 살아있음)
      setImages([]);
      setPdfDataUrl(undefined);
      setPdfFilename(undefined);
    } else {
      // 신규 진입 — 빈 상태 + 닉네임만 sessionStorage default
      setTitle('');
      setBody('');
      setLinkUrl('');
      setLinkInputOpen(false);
      setImages([]);
      setPdfDataUrl(undefined);
      setPdfFilename(undefined);
      setColor(undefined);
      setNickname(readDefaultNickname());
    }
  }, [open, resumeFromDraft, reloadDraft, isEditMode, editingPost]);

  // Phase A — 입력 변경 시 debounced 자동저장 (1초) — edit 모드에서는 X
  useEffect(() => {
    if (!open || isEditMode) return;
    saveDraft({
      nickname,
      text: compositeText,
      linkUrl,
      color,
      hasImagesPending: images.length > 0,
      hasPdfPending: !!pdfDataUrl,
    });
  }, [
    open,
    isEditMode,
    nickname,
    compositeText,
    linkUrl,
    color,
    images.length,
    pdfDataUrl,
    saveDraft,
  ]);

  // 회귀 위험 #4 — 제출 성공 감지 (isSubmitting true → false 전환 + lastError 없음)
  useEffect(() => {
    if (!open) return;
    const wasSubmitting = prevSubmittingRef.current;
    prevSubmittingRef.current = isSubmitting;
    if (wasSubmitting && !isSubmitting && !lastError) {
      // 성공 — 모달 닫고 입력 clear (부모가 clearDraft)
      setTitle('');
      setBody('');
      setLinkUrl('');
      setLinkInputOpen(false);
      setImages([]);
      setPdfDataUrl(undefined);
      setPdfFilename(undefined);
      setColor(undefined);
      setLocalError(null);
      setAttachmentError(null);
      setEditMode('edit');
      onClose({ submitted: true });
    }
  }, [isSubmitting, lastError, open, onClose]);

  // ESC 키 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  const handlePipaConfirm = () => {
    try {
      window.localStorage.setItem(PIPA_CONSENT_KEY, '1');
    } catch {
      // noop
    }
    setPipaConsentOpen(false);
  };

  // Phase A — 모달 최소화 (드래프트는 보존)
  const handleMinimize = () => {
    if (isSubmitting) return;
    flushSaveDraft({
      nickname,
      text: compositeText,
      linkUrl,
      color,
      hasImagesPending: images.length > 0,
      hasPdfPending: !!pdfDataUrl,
    });
    onClose({ minimized: true });
  };

  const handleSubmit = () => {
    const trimmedNickname = nickname.trim();
    const trimmedBody = body.trim();
    const trimmedLink = linkUrl.trim();

    if (trimmedNickname.length === 0) {
      setLocalError('닉네임을 입력해 주세요');
      return;
    }
    if (trimmedNickname.length > MAX_NICKNAME_LENGTH) {
      setLocalError(`닉네임은 ${MAX_NICKNAME_LENGTH}자 이하로 입력해 주세요`);
      return;
    }
    if (trimmedBody.length === 0 && images.length === 0 && !pdfDataUrl) {
      setLocalError('내용 또는 이미지/PDF를 입력해 주세요');
      return;
    }
    // grapheme count 기준 (IME-aware) — 본문에만 적용 (제목은 별도 maxLength)
    if (graphemeCount > MAX_TEXT_LENGTH) {
      setLocalError(`내용은 ${MAX_TEXT_LENGTH}자 이하로 입력해 주세요`);
      return;
    }
    if (trimmedLink.length > 0) {
      if (trimmedLink.length > MAX_LINK_LENGTH) {
        setLocalError('링크가 너무 길어요');
        return;
      }
      try {
        const url = new URL(trimmedLink);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          setLocalError('링크는 http 또는 https 주소만 사용할 수 있어요');
          return;
        }
      } catch {
        setLocalError('올바른 주소를 입력해 주세요');
        return;
      }
    }

    if (studentFormLocked) {
      setLocalError('선생님이 카드 추가를 잠깐 멈췄어요');
      return;
    }

    setLocalError(null);
    try {
      window.sessionStorage.setItem(NICKNAME_STORAGE_KEY, trimmedNickname);
    } catch {
      // sessionStorage 실패해도 제출은 진행
    }

    // v2.2 — 송신 합성 (제목+본문)
    const trimmedComposite = compositeText.trim();

    if (isEditMode && editingPost) {
      submitOwnCardEdit(editingPost.id, {
        text: trimmedComposite,
        linkUrl: trimmedLink.length > 0 ? trimmedLink : null,
        images,
        pdfDataUrl: pdfDataUrl ?? null,
        pdfFilename: pdfFilename ?? null,
        color,
      });
      onClose({ submitted: true });
      return;
    }

    submitCard({
      nickname: trimmedNickname,
      text: trimmedComposite,
      ...(trimmedLink.length > 0 ? { linkUrl: trimmedLink } : {}),
      ...(images.length > 0 ? { images } : {}),
      ...(pdfDataUrl ? { pdfDataUrl } : {}),
      ...(pdfFilename ? { pdfFilename } : {}),
      ...(color ? { color } : {}),
      ...(defaultColumnId ? { columnId: defaultColumnId } : {}),
    });
  };

  const displayError =
    localError ?? attachmentError ?? imageUpload.error ?? pdfUpload.error ?? lastError ?? null;
  const draftNotice = resumeFromDraft && draft && (draft.hasImagesPending || draft.hasPdfPending);
  const trimmedNickname = nickname.trim();
  const trimmedBody = body.trim();
  const hasContent = trimmedBody.length > 0 || images.length > 0 || !!pdfDataUrl;
  const canSubmit =
    trimmedNickname.length > 0 &&
    hasContent &&
    graphemeCount <= MAX_TEXT_LENGTH &&
    (isEditMode || !studentFormLocked);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0 sm:items-center sm:px-4"
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? '카드 수정' : '카드 추가'}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
      >
        <div
          className="relative flex w-full max-w-2xl flex-col rounded-t-xl border border-sp-border bg-sp-card shadow-2xl sm:rounded-xl max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <StudentSubmitFormHeader
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
            isEditMode={isEditMode}
            onClose={() => onClose()}
            onMinimize={handleMinimize}
            onSubmit={handleSubmit}
            onMoreClick={() => setMoreMenuOpen((v) => !v)}
            moreMenuOpen={moreMenuOpen}
          />

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {draftNotice && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                이전에 첨부했던 이미지/PDF는 저장되지 않아 다시 올려야 해요.
              </p>
            )}

            {/* 제목 */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              maxLength={MAX_TITLE_LENGTH}
              disabled={isSubmitting}
              autoFocus
              className="w-full border-b border-sp-border bg-transparent px-1 py-2 text-lg font-bold text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none disabled:opacity-60"
            />

            <StudentAttachmentRow
              onUpload={handleAttachmentUpload}
              onLinkClick={() => setLinkInputOpen((v) => !v)}
              disabled={isSubmitting}
              hasReachedImageMax={images.length >= REALTIME_WALL_MAX_IMAGES_PER_POST}
            />

            {linkInputOpen && (
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                maxLength={MAX_LINK_LENGTH}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-60"
              />
            )}

            <StudentAttachmentPreviewStrip
              images={images}
              pdfFilename={pdfFilename}
              linkUrl={linkUrl.trim().length > 0 ? linkUrl : undefined}
              onRemoveImage={handleRemoveImage}
              onRemovePdf={handleRemovePdf}
              onRemoveLink={handleRemoveLink}
              disabled={isSubmitting}
            />

            {/* 마크다운 서식 바 (편집/미리보기 토글 포함) */}
            <StudentFormatBar
              textareaRef={textareaRef}
              onChange={setBody}
              mode={editMode}
              onModeToggle={() =>
                setEditMode((m) => (m === 'edit' ? 'preview' : 'edit'))
              }
              disabled={isSubmitting}
              variant="card"
            />

            {/* 본문 — edit/preview 토글 */}
            <StudentMarkdownPreviewToggle
              value={body}
              onChange={setBody}
              textareaRef={textareaRef}
              mode={editMode}
              rows={8}
              maxLength={MAX_TEXT_LENGTH}
              disabled={isSubmitting}
              placeholder="환상적인 내용을 적어보세요..."
              ariaLabel="본문"
              previewMinHeightClass="min-h-[200px]"
            />
            <div className="flex justify-end text-xs text-sp-muted">
              {graphemeCount}/{MAX_TEXT_LENGTH}
            </div>

            {displayError && (
              <p className="text-xs text-rose-400" role="alert">
                {displayError}
              </p>
            )}
          </div>

          {/* 하단 메타바 — 닉네임 + 색상 */}
          <footer className="flex flex-wrap items-center gap-3 border-t border-sp-border bg-sp-card px-4 py-3">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="닉네임"
              disabled={isSubmitting || isEditMode}
              title={isEditMode ? '닉네임은 수정할 수 없어요' : '닉네임을 입력해 주세요'}
              className="max-w-[160px] rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-60"
            />
            <StudentColorPicker
              value={color}
              onChange={setColor}
              disabled={isSubmitting}
            />
            {!isEditMode && (
              <p className="ml-auto text-xs text-sp-muted">
                선생님이 승인하면 보드에 나타나요
              </p>
            )}
          </footer>

          {/* 더보기 메뉴 (조건부 — 현재는 placeholder, v3에서 확장) */}
          {moreMenuOpen && (
            <div
              className="absolute right-3 top-12 z-10 min-w-[180px] rounded-lg border border-sp-border bg-sp-card p-2 text-xs text-sp-muted shadow-lg"
              role="menu"
            >
              <p className="px-2 py-1.5">추가 도구는 곧 만나요</p>
            </div>
          )}
        </div>
      </div>

      <StudentPipaConsentModal
        open={pipaConsentOpen}
        onClose={() => setPipaConsentOpen(false)}
        onConfirm={handlePipaConfirm}
      />
    </>
  );
}

function readDefaultNickname(): string {
  try {
    return window.sessionStorage.getItem(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * useStudentImageMultiUpload.onFileSelect는 React.ChangeEvent<HTMLInputElement>를
 * 요구하나 우리는 임의 File[]을 가지고 있다. DataTransfer를 통해 FileList를 합성한다.
 * (jsdom 환경 고려: DataTransfer가 없으면 빈 객체로 fallback)
 */
function dataTransferFromFiles(files: File[]): DataTransfer {
  if (typeof DataTransfer !== 'undefined') {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    return dt;
  }
  // jsdom 등 — DataTransfer 미지원 시 임시 객체
  const fakeFiles = files as unknown as FileList;
  return { files: fakeFiles, items: [] as unknown as DataTransferItemList } as unknown as DataTransfer;
}
