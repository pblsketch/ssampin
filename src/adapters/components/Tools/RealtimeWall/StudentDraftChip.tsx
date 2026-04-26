import type { RealtimeWallDraft } from '../../../../student/useStudentDraft';

/**
 * v2.1 신규 (Phase A-A4 / Plan FR-A5 / Design v2.1 §5.8).
 *
 * 모달 minimize 시 보드 좌하단에 표시되는 "작성 중인 카드" 칩.
 * 클릭 시 모달이 다시 열리며 드래프트가 prefill됨.
 *
 * 정책:
 * - draft가 null이면 렌더 안 함
 * - 칩 미리보기는 최대 20자 (긴 드래프트는 ellipsis)
 * - 좌하단 fixed 위치 — FAB(우하단)와 충돌 X
 * - aria-label로 한국어 설명
 *
 * Plan FR-A5 / Design v2.1 §13 Phase A 수용 기준 #5.
 */

const PREVIEW_MAX_CHARS = 20;

interface StudentDraftChipProps {
  /** 현재 활성 드래프트 (없으면 null) */
  readonly draft: RealtimeWallDraft | null;
  /** 칩 클릭 시 모달 다시 열기 */
  readonly onResume: () => void;
}

export function StudentDraftChip({ draft, onResume }: StudentDraftChipProps) {
  if (!draft) return null;

  const previewSource = draft.text.trim() || draft.linkUrl.trim() || '';
  const preview = previewSource.length > 0
    ? truncate(previewSource, PREVIEW_MAX_CHARS)
    : '(빈 카드)';

  const attachmentLabel = describeAttachments(draft);

  return (
    <button
      type="button"
      onClick={onResume}
      aria-label={`작성 중인 카드 다시 열기: ${preview}${attachmentLabel ? ', ' + attachmentLabel : ''}`}
      className="fixed bottom-5 left-5 z-30 flex max-w-[260px] items-center gap-2 rounded-xl border border-sp-accent/40 bg-sp-card px-3 py-2 text-left text-sm text-sp-text shadow-lg transition hover:bg-sp-card/80 sm:bottom-8 sm:left-8"
    >
      <span className="material-symbols-outlined text-lg text-sp-accent">edit_note</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-detail font-semibold text-sp-muted">작성 중인 카드</span>
        <span className="truncate text-xs text-sp-text">{preview}</span>
        {attachmentLabel && (
          <span className="truncate text-caption text-sp-muted/80">{attachmentLabel}</span>
        )}
      </span>
    </button>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function describeAttachments(draft: RealtimeWallDraft): string {
  const parts: string[] = [];
  if (draft.hasImagesPending) parts.push('이미지 다시 첨부 필요');
  if (draft.hasPdfPending) parts.push('PDF 다시 첨부 필요');
  return parts.join(' · ');
}
