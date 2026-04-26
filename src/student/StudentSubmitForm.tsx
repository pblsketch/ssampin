import { useEffect, useRef, useState } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';
import type { RealtimeWallCardColor, RealtimeWallPost } from '@domain/entities/RealtimeWall';
import {
  REALTIME_WALL_MAX_IMAGES_PER_POST,
  REALTIME_WALL_MAX_TEXT_LENGTH_V2,
} from '@domain/rules/realtimeWallRules';
import { StudentMarkdownToolbar } from '@adapters/components/Tools/RealtimeWall/StudentMarkdownToolbar';
import { StudentImageMultiPicker } from '@adapters/components/Tools/RealtimeWall/StudentImageMultiPicker';
import { StudentPdfPicker } from '@adapters/components/Tools/RealtimeWall/StudentPdfPicker';
import { StudentColorPicker } from '@adapters/components/Tools/RealtimeWall/StudentColorPicker';
import { StudentPipaConsentModal } from '@adapters/components/Tools/RealtimeWall/StudentPipaConsentModal';
import { useGraphemeCounter } from './useGraphemeCounter';
import { useStudentDraft } from './useStudentDraft';

/**
 * 학생 카드 추가 모달 — v2.1 (Phase B + Phase A) 정교화.
 *
 * v1.14 (단순 폼) → v2.1 추가 기능:
 *   - StudentMarkdownToolbar: Bold/Italic/List/Quote 4 버튼 (별표 직접 입력 X — 회귀 위험 #6)
 *   - StudentImageMultiPicker: 최대 3장 + 합계 5MB drop/paste/picker
 *   - StudentPdfPicker: PDF 1개 + base64 송신 (서버가 file:// URL 발급)
 *   - StudentColorPicker: 8색
 *   - useGraphemeCounter: Intl.Segmenter IME-aware 카운터
 *   - StudentPipaConsentModal: 첫 이미지 첨부 시 1회 PIPA 동의
 *
 * Phase A 추가 (v2.1):
 *   - 최소화 버튼 → 보드 좌하단 칩으로 (StudentDraftChip)
 *   - useStudentDraft: textarea/링크/색상 변경 시 debounced 1초 자동저장 (보드+세션 단위 키)
 *   - resumeFromDraft prop: 칩 클릭 → 모달 재개 시 prefill
 *   - 제출 성공 시 부모 onClose({ submitted: true }) 호출 → 부모가 clearDraft
 *
 * 회귀 위험 #4 (prevSubmittingRef false→true→false 시퀀스) 보존 — 절대 수정 X.
 *
 * Design v2.1 §5.9 / §11.1 / §11.2.
 */

const NICKNAME_STORAGE_KEY = 'ssampin-realtime-wall-nickname';
const PIPA_CONSENT_KEY = 'ssampin-pipa-consent-shown';
const MAX_NICKNAME_LENGTH = 20;
const MAX_TEXT_LENGTH = REALTIME_WALL_MAX_TEXT_LENGTH_V2;
const MAX_LINK_LENGTH = 500;

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
   * 'edit' 모드:
   *   - editingPost prefill (text/linkUrl/images/pdfUrl/color)
   *   - 닉네임은 disabled (수정 불가 — 작성자 정합성)
   *   - 제출 시 submitOwnCardEdit 호출 (submitCard 대신)
   *   - 드래프트 자동저장 X (수정은 즉시 적용)
   */
  readonly mode?: 'create' | 'edit';
  /** v2.1 Phase D — mode='edit' 시 prefill 카드 */
  readonly editingPost?: RealtimeWallPost;
  /**
   * v2.1 student-ux — Padlet 컬럼별 + 버튼으로 진입 시 사용할 columnId.
   *
   * - 미지정(undefined): FAB 진입 또는 비-Kanban 레이아웃 — 서버/교사 측에서 첫 컬럼 default
   * - 지정: submitCard 페이로드에 columnId 포함 → 서버가 submission에 첨부 → 교사 onRealtimeWallStudentSubmitted
   *   처리 시 createWallPost가 해당 columnId에 카드 생성
   * - mode='edit'에서는 무시 (수정은 위치 변경 X)
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
  const [text, setText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // v2.1 (Phase B) 신규 state
  const [images, setImages] = useState<string[]>([]);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | undefined>(undefined);
  const [pdfFilename, setPdfFilename] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<RealtimeWallCardColor | undefined>(undefined);
  const [pipaConsentOpen, setPipaConsentOpen] = useState(false);

  // Phase A — 드래프트 훅
  const { draft, saveDraft, flushSaveDraft, reloadDraft } = useStudentDraft({
    boardKey,
    sessionToken,
    autoLoad: false,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const graphemeCount = useGraphemeCounter(text);

  // 회귀 위험 #4 — submitted 응답 수신 감지: 직전까지 true였다가 false로 바뀌면 성공
  const prevSubmittingRef = useRef<boolean>(false);

  // 모달 열릴 때마다 nickname을 sessionStorage default로 초기화 + 드래프트 prefill
  useEffect(() => {
    if (!open) return;
    setLocalError(null);

    // v2.1 Phase D — mode='edit' 분기: 드래프트 무시, editingPost로 prefill
    if (isEditMode && editingPost) {
      setNickname(editingPost.nickname);
      setText(editingPost.text);
      setLinkUrl(editingPost.linkUrl ?? '');
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
      setText(loaded.text);
      setLinkUrl(loaded.linkUrl);
      setColor(loaded.color);
      // 이미지/PDF는 base64 미보존 — 빈 상태로 유지 (UI 안내용 플래그만 살아있음)
      setImages([]);
      setPdfDataUrl(undefined);
      setPdfFilename(undefined);
    } else {
      // 신규 진입 — 빈 상태 + 닉네임만 sessionStorage default
      setText('');
      setLinkUrl('');
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
      text,
      linkUrl,
      color,
      hasImagesPending: images.length > 0,
      hasPdfPending: !!pdfDataUrl,
    });
  }, [open, isEditMode, nickname, text, linkUrl, color, images.length, pdfDataUrl, saveDraft]);

  // 회귀 위험 #4 — 제출 성공 감지 (isSubmitting true → false 전환 + lastError 없음)
  useEffect(() => {
    if (!open) return;
    const wasSubmitting = prevSubmittingRef.current;
    prevSubmittingRef.current = isSubmitting;
    if (wasSubmitting && !isSubmitting && !lastError) {
      // 성공 — 모달 닫고 입력 clear (부모가 clearDraft)
      setText('');
      setLinkUrl('');
      setImages([]);
      setPdfDataUrl(undefined);
      setPdfFilename(undefined);
      setColor(undefined);
      setLocalError(null);
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

  const handlePipaConsentNeeded = () => {
    try {
      const shown = window.localStorage.getItem(PIPA_CONSENT_KEY);
      if (shown === '1') return; // 이미 동의 — 모달 표시 안 함
    } catch {
      // localStorage 접근 실패 — 안전하게 표시
    }
    setPipaConsentOpen(true);
  };

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
    // 즉시 flush 저장 (debounce 우회)
    flushSaveDraft({
      nickname,
      text,
      linkUrl,
      color,
      hasImagesPending: images.length > 0,
      hasPdfPending: !!pdfDataUrl,
    });
    onClose({ minimized: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNickname = nickname.trim();
    const trimmedText = text.trim();
    const trimmedLink = linkUrl.trim();

    if (trimmedNickname.length === 0) {
      setLocalError('닉네임을 입력해 주세요');
      return;
    }
    if (trimmedNickname.length > MAX_NICKNAME_LENGTH) {
      setLocalError(`닉네임은 ${MAX_NICKNAME_LENGTH}자 이하로 입력해 주세요`);
      return;
    }
    if (trimmedText.length === 0 && images.length === 0 && !pdfDataUrl) {
      setLocalError('내용 또는 이미지/PDF를 입력해 주세요');
      return;
    }
    // grapheme count 기준 (IME-aware)
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

    if (isEditMode && editingPost) {
      // v2.1 Phase D — 자기 카드 수정 (submitOwnCardEdit 호출)
      // images 빈 배열 → 첨부 제거 의도 / pdfDataUrl undefined→null로 명시
      // 회귀 위험 #4 보호: prevSubmittingRef는 일반 제출과 동일 흐름 사용 위해 isSubmitting 토글이 필요하나,
      // edit 흐름은 markSubmitted로 명시 close. UX: 즉시 close + 부모는 별도 처리.
      submitOwnCardEdit(editingPost.id, {
        text: trimmedText,
        linkUrl: trimmedLink.length > 0 ? trimmedLink : null,
        images,
        pdfDataUrl: pdfDataUrl ?? null,
        pdfFilename: pdfFilename ?? null,
        color,
      });
      // edit는 ack 응답 없음 → 즉시 close (서버 broadcast post-updated가 도착하면 카드 갱신)
      onClose({ submitted: true });
      return;
    }

    submitCard({
      nickname: trimmedNickname,
      text: trimmedText,
      ...(trimmedLink.length > 0 ? { linkUrl: trimmedLink } : {}),
      ...(images.length > 0 ? { images } : {}),
      ...(pdfDataUrl ? { pdfDataUrl } : {}),
      ...(pdfFilename ? { pdfFilename } : {}),
      ...(color ? { color } : {}),
      // v2.1 student-ux — Kanban 컬럼별 + 버튼 진입 시 columnId 전달 (Padlet 패턴)
      ...(defaultColumnId ? { columnId: defaultColumnId } : {}),
    });
  };

  const displayError = localError ?? lastError ?? null;
  const draftNotice = resumeFromDraft && draft && (draft.hasImagesPending || draft.hasPdfPending);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0 sm:items-center sm:px-4"
        role="dialog"
        aria-modal="true"
        aria-label="카드 추가"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-lg flex-col gap-3 rounded-t-xl border border-sp-border bg-sp-card p-5 shadow-2xl sm:rounded-xl max-h-[90vh] overflow-y-auto"
        >
          <header className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-sp-accent">
              sticky_note_2
            </span>
            <h2 className="text-base font-bold text-sp-text">
              {isEditMode ? '카드 수정' : resumeFromDraft && draft ? '작성 이어가기' : '카드 추가'}
            </h2>
            {/* Phase A — 최소화 버튼 (제출 중에는 비활성) */}
            <button
              type="button"
              onClick={handleMinimize}
              disabled={isSubmitting}
              aria-label="최소화"
              title="최소화 (드래프트 보존)"
              className="ml-auto rounded-md p-1 text-sp-muted transition hover:bg-sp-surface hover:text-sp-text disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">minimize</span>
            </button>
            <button
              type="button"
              onClick={() => onClose()}
              disabled={isSubmitting}
              aria-label="닫기"
              className="rounded-md p-1 text-sp-muted transition hover:bg-sp-surface hover:text-sp-text disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </header>

          {draftNotice && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              이전에 첨부했던 이미지/PDF는 저장되지 않아 다시 올려야 해요.
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-sp-muted">닉네임</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="예) 민수"
              disabled={isSubmitting || isEditMode}
              title={isEditMode ? '닉네임은 수정할 수 없어요' : undefined}
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-60"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-sp-muted">
              내용
              <span className="ml-2 text-[10px] font-normal text-sp-muted/70">
                {graphemeCount}/{MAX_TEXT_LENGTH}
              </span>
            </span>
            <StudentMarkdownToolbar
              textareaRef={textareaRef}
              onChange={setText}
              disabled={isSubmitting}
            />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="담벼락에 올릴 내용을 적어 주세요"
              rows={5}
              autoFocus
              disabled={isSubmitting}
              className="resize-none rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-60"
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-sp-muted">
              링크 <span className="font-normal text-sp-muted/70">(선택)</span>
            </span>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              maxLength={MAX_LINK_LENGTH}
              placeholder="https://"
              disabled={isSubmitting}
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-60"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-sp-muted">
              이미지 <span className="font-normal text-sp-muted/70">(선택, 최대 {REALTIME_WALL_MAX_IMAGES_PER_POST}장)</span>
            </span>
            <StudentImageMultiPicker
              images={images}
              onAdd={(dataUrl) =>
                setImages((prev) => [...prev, dataUrl].slice(0, REALTIME_WALL_MAX_IMAGES_PER_POST))
              }
              onRemove={(idx) => setImages((prev) => prev.filter((_, i) => i !== idx))}
              disabled={isSubmitting}
              onPipaConsentNeeded={handlePipaConsentNeeded}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-sp-muted">
              PDF <span className="font-normal text-sp-muted/70">(선택)</span>
            </span>
            <StudentPdfPicker
              pdfDataUrl={pdfDataUrl}
              pdfFilename={pdfFilename}
              onPick={(info) => {
                setPdfDataUrl(info.pdfDataUrl);
                setPdfFilename(info.pdfFilename);
              }}
              onRemove={() => {
                setPdfDataUrl(undefined);
                setPdfFilename(undefined);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-sp-muted">색상</span>
            <StudentColorPicker
              value={color}
              onChange={setColor}
              disabled={isSubmitting}
            />
          </div>

          {displayError && (
            <p className="text-xs text-rose-400" role="alert">
              {displayError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={isSubmitting}
              className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!isEditMode && studentFormLocked)}
              className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEditMode ? '수정 완료' : isSubmitting ? '올리는 중...' : '올리기'}
            </button>
          </div>

          {!isEditMode && (
            <p className="text-center text-[11px] text-sp-muted">
              선생님이 승인하면 보드에 나타나요
            </p>
          )}
        </form>
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
