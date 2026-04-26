import { useMemo } from 'react';
import type React from 'react';
import { Modal } from '@adapters/components/common/Modal';
import type {
  RealtimeWallLinkPreview,
  RealtimeWallPost,
  StudentCommentInput,
} from '@domain/entities/RealtimeWall';
import { isOwnCard } from '@domain/rules/realtimeWallRules';
import type { RealtimeWallViewerRole } from './types';
import { StudentLikeButton } from './StudentLikeButton';
import { RealtimeWallCommentList } from './RealtimeWallCommentList';
import { RealtimeWallCommentInput } from './RealtimeWallCommentInput';
import { RealtimeWallCardImageGallery } from './RealtimeWallCardImageGallery';
import { RealtimeWallCardPdfBadge } from './RealtimeWallCardPdfBadge';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';
import { RealtimeWallCardOwnerActions } from './RealtimeWallCardOwnerActions';
import {
  REALTIME_WALL_CARD_COLOR_DOT,
  getCardColorClass,
  getCardTextMetaClass,
  getCardTextPrimaryClass,
} from './RealtimeWallCardColors';
import {
  RealtimeWallBoardColorSchemeProvider,
  useRealtimeWallBoardColorScheme,
} from './RealtimeWallBoardColorSchemeContext';
import { parseTitleBody } from './realtimeWallTitleBody';
import type { WallBoardColorScheme } from '@domain/entities/RealtimeWallBoardTheme';

/**
 * 카드 상세 모달 — Padlet detail 패턴.
 *
 * 결함 #(2026-04-26): 학생/교사 양쪽 카드 더블클릭 시 본문/이미지/댓글을 풀-사이즈로
 * 보여주는 단일 진입 모달. 기존 `RealtimeWallCard` (compact 카드) 위에 layered 모달로 동작.
 *
 * 권한 분기:
 *   - viewerRole='teacher' : 핀/숨기기/댓글 삭제(교사 actions) + 모든 댓글 표시
 *   - viewerRole='student' :
 *       - 자기 카드면 수정/삭제 버튼 (RealtimeWallCardOwnerActions 재사용)
 *       - 다른 카드면 좋아요/댓글 입력만
 *       - hidden 댓글 자동 필터 (RealtimeWallCommentList 내부 처리)
 *
 * 닫기:
 *   - ESC, 배경 클릭, 우상단 X 버튼 (Modal 컴포넌트 기본 제공)
 *   - focus-trap-react로 포커스 잠금 (Modal 내부)
 */

export interface RealtimeWallCardDetailModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** 표시할 카드. null이면 모달 미렌더 (open=false와 함께 사용). */
  readonly post: RealtimeWallPost | null;
  readonly viewerRole: RealtimeWallViewerRole;
  readonly currentSessionToken?: string;
  readonly currentPinHash?: string;
  // 콜백 (해당 권한에서만 활성)
  readonly onOpenLink?: (url: string) => void;
  readonly onStudentLike?: (postId: string) => void;
  readonly onAddComment?: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  readonly onRemoveComment?: (postId: string, commentId: string) => void;
  /** 학생 댓글 입력 슬롯 — 미전달 시 RealtimeWallCommentInput 폴백. */
  readonly commentInputSlot?: React.ReactNode;
  /** Step 2 — 교사 좋아요 토글 콜백 (viewerRole='teacher' 전용). */
  readonly onTeacherLike?: (postId: string) => void;
  /** Step 2 — 교사 댓글 추가 콜백 (viewerRole='teacher' 전용). nickname='선생님' 강제. */
  readonly onTeacherAddComment?: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  // 교사 액션
  readonly onTogglePin?: (postId: string) => void;
  readonly onHidePost?: (postId: string) => void;
  // 학생 자기 카드 액션
  readonly onOwnCardEdit?: (postId: string) => void;
  readonly onOwnCardDelete?: (postId: string) => void;
  /**
   * 2026-04-26 결함 #2 fix — boardTheme.colorScheme 명시 주입.
   *
   * 본 모달은 RealtimeWallBoardThemeWrapper 외부에 렌더되므로 부모(ToolRealtimeWall /
   * StudentBoardView)가 boardTheme.colorScheme을 명시적으로 전달해야 텍스트/배경이 보드와
   * 일관되게 보임. 미전달 시 'light' 기본 (DEFAULT_WALL_BOARD_THEME과 동일).
   *
   * 회귀 위험 #11 (viewerRole 비대칭): viewerRole 무관 동일 적용. PASS.
   */
  readonly boardColorScheme?: WallBoardColorScheme;
}

function getLinkLabel(linkUrl: string): string {
  try {
    const parsed = new URL(linkUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return linkUrl;
  }
}

function YoutubeEmbedDetail({ videoId }: { videoId: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-sp-border/60 bg-black aspect-video">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube 영상 미리보기"
        className="absolute inset-0 h-full w-full"
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-presentation"
      />
    </div>
  );
}

function WebPageDetailPreview({
  preview,
  linkUrl,
  onOpenLink,
}: {
  preview: Extract<RealtimeWallLinkPreview, { kind: 'webpage' }>;
  linkUrl: string;
  onOpenLink?: (url: string) => void;
}) {
  const hasMeta = preview.ogTitle || preview.ogDescription || preview.ogImageUrl;
  if (!hasMeta) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenLink?.(linkUrl)}
      className="flex w-full items-stretch gap-3 overflow-hidden rounded-lg border border-sp-border/70 bg-sp-surface text-left transition hover:border-sp-accent/40"
    >
      {preview.ogImageUrl && (
        <div className="w-24 shrink-0 overflow-hidden bg-sp-bg sm:w-32">
          <img
            src={preview.ogImageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1 px-3 py-2.5">
        {preview.ogTitle && (
          <p className="line-clamp-2 text-sm font-semibold text-sp-text">{preview.ogTitle}</p>
        )}
        {preview.ogDescription && (
          <p className="mt-1 line-clamp-3 text-xs text-sp-muted">{preview.ogDescription}</p>
        )}
        <p className="mt-1.5 truncate text-caption text-sp-muted/70">
          {getLinkLabel(linkUrl)}
        </p>
      </div>
    </button>
  );
}

/**
 * 2026-04-26 결함 #2 fix — 외부 wrapper로 BoardColorSchemeProvider 주입.
 *
 * 본 모달은 RealtimeWallBoardThemeWrapper 외부에 렌더되므로, 부모가 명시한 colorScheme을
 * 본 wrapper에서 context로 주입한다. 내부 렌더 컴포넌트는 useRealtimeWallBoardColorScheme()로
 * 일관 조회.
 */
export function RealtimeWallCardDetailModal(props: RealtimeWallCardDetailModalProps) {
  const colorScheme = props.boardColorScheme ?? 'light';
  return (
    <RealtimeWallBoardColorSchemeProvider value={colorScheme}>
      <RealtimeWallCardDetailModalInner {...props} />
    </RealtimeWallBoardColorSchemeProvider>
  );
}

function RealtimeWallCardDetailModalInner({
  open,
  onClose,
  post,
  viewerRole,
  currentSessionToken,
  currentPinHash,
  onOpenLink,
  onStudentLike,
  onAddComment,
  onRemoveComment,
  commentInputSlot,
  onTogglePin,
  onHidePost,
  onOwnCardEdit,
  onOwnCardDelete,
  onTeacherLike,
  onTeacherAddComment,
}: RealtimeWallCardDetailModalProps) {
  // 2026-04-26 결함 #2 fix — context 주입된 colorScheme로 텍스트/배경 클래스 계산.
  const boardColorScheme = useRealtimeWallBoardColorScheme();
  const textPrimaryClass = getCardTextPrimaryClass(boardColorScheme);
  const textMetaClass = getCardTextMetaClass(boardColorScheme);

  // Step 2 — 교사 좋아요 debounce (학생과 동일 패턴)
  const TEACHER_SESSION_TOKEN = '__teacher__';

  // 자기 카드 식별 (학생 모드 전용 의미)
  const isOwn = useMemo(
    () =>
      post
        ? isOwnCard(post, { currentSessionToken, currentPinHash })
        : false,
    [post, currentSessionToken, currentPinHash],
  );

  // 2026-04-26 결함 #3 fix — `# 제목\n\n본문` 형식 분리 렌더 (학생/교사 동일, 회귀 #11 보존).
  const parsed = useMemo(
    () => parseTitleBody(post?.text ?? ''),
    [post?.text],
  );
  const titleText = parsed?.title ?? null;
  const bodyText = parsed?.body ?? post?.text ?? '';

  if (!post) {
    return (
      <Modal isOpen={false} onClose={onClose} title="카드 상세" srOnlyTitle>
        <div />
      </Modal>
    );
  }

  // hidden-by-author placeholder는 본 모달에서 열지 않는 것을 권장하지만,
  // 실수로 도달했을 때를 위해 안내 문구만 표시.
  if (post.status === 'hidden-by-author') {
    return (
      <Modal
        isOpen={open}
        onClose={onClose}
        title="카드 상세"
        size="md"
        srOnlyTitle
      >
        <div className="flex flex-col gap-3 p-6">
          <h3 className="text-lg font-bold text-sp-text">작성자가 카드를 삭제했어요</h3>
          <p className="text-sm text-sp-muted">
            이 카드는 작성자가 직접 삭제했습니다. 자세한 내용을 더 이상 볼 수 없어요.
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-sp-accent/85"
            >
              닫기
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const cardColor = post.color ?? 'white';
  const colorBgClass = getCardColorClass(cardColor, boardColorScheme);
  const colorDotClass =
    cardColor !== 'white' ? REALTIME_WALL_CARD_COLOR_DOT[cardColor] : null;

  const studentLikes = post.likes ?? 0;
  const hasLiked = Boolean(
    currentSessionToken && (post.likedBy ?? []).includes(currentSessionToken),
  );
  // Step 2 — 교사 좋아요 상태
  const hasTeacherLiked = Boolean(
    (post.likedBy ?? []).includes(TEACHER_SESSION_TOKEN),
  );
  const visibleComments =
    viewerRole === 'teacher'
      ? post.comments ?? []
      : (post.comments ?? []).filter((c) => c.status === 'approved');
  const commentCount = visibleComments.length;

  const isTeacher = viewerRole === 'teacher';
  const isPinned = post.pinned;
  const showTeacherActions =
    isTeacher && (Boolean(onTogglePin) || Boolean(onHidePost));
  const showOwnerActions =
    !isTeacher && isOwn && (Boolean(onOwnCardEdit) || Boolean(onOwnCardDelete));

  const handleClose = () => {
    onClose();
  };

  const submittedAt = new Date(post.submittedAt);
  const submittedLabel = submittedAt.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={`${post.nickname}의 카드`}
      size="xl"
      srOnlyTitle
      panelClassName={colorBgClass}
    >
      {/* 헤더 — 닉네임 / 시간 / 색상 dot / 닫기 버튼 */}
      <header className="flex items-start gap-3 border-b border-sp-border/60 px-6 py-4">
        {colorDotClass && (
          <span
            className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${colorDotClass}`}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`truncate text-lg font-bold ${textPrimaryClass}`}>
              {post.nickname}
            </h3>
            {isPinned && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-caption font-bold text-amber-300">
                <span className="material-symbols-outlined text-detail">push_pin</span>
                고정
              </span>
            )}
          </div>
          <p className={`mt-1 text-detail ${textMetaClass}`}>{submittedLabel}</p>
        </div>
        {showTeacherActions && (
          <div className="shrink-0">
            <RealtimeWallCardActions
              onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
              onHide={onHidePost ? () => onHidePost(post.id) : undefined}
            />
          </div>
        )}
        {showOwnerActions && (
          <div className="shrink-0">
            <RealtimeWallCardOwnerActions
              onEdit={onOwnCardEdit ? () => onOwnCardEdit(post.id) : undefined}
              onDelete={onOwnCardDelete ? () => onOwnCardDelete(post.id) : undefined}
            />
          </div>
        )}
        <button
          type="button"
          onClick={handleClose}
          aria-label="상세 보기 닫기"
          title="닫기 (Esc)"
          className="shrink-0 rounded-full p-1.5 text-sp-muted transition hover:bg-sp-text/5 hover:text-sp-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent/40"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
      </header>

      {/* 본문 — 큰 폰트 + 이미지 풀-사이즈 갤러리 + 링크 미리보기 + 댓글 */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-4">
          {/* 2026-04-26 결함 #3 fix — `# 제목\n\n본문` 형식 분리 렌더 (학생/교사 동일, 회귀 #11 보존).
              제목은 큰 굵은 글씨, 본문은 본문 톤. React 텍스트 노드 → 자동 escape (회귀 #7). */}
          {titleText && titleText.length > 0 && (
            <p className={`break-words text-2xl font-bold leading-snug ${textPrimaryClass}`}>
              {titleText}
            </p>
          )}
          {bodyText && bodyText.length > 0 && (
            <p
              className={`whitespace-pre-wrap break-words text-base leading-relaxed ${textPrimaryClass}`}
            >
              {bodyText}
            </p>
          )}

          {post.images && post.images.length > 0 && (
            <RealtimeWallCardImageGallery images={post.images} />
          )}

          {post.pdfUrl && (
            <RealtimeWallCardPdfBadge
              pdfUrl={post.pdfUrl}
              pdfFilename={post.pdfFilename ?? 'document.pdf'}
            />
          )}

          {post.linkUrl && post.linkPreview?.kind === 'youtube' && (
            <YoutubeEmbedDetail videoId={post.linkPreview.videoId} />
          )}

          {post.linkUrl && post.linkPreview?.kind === 'webpage' && (
            <WebPageDetailPreview
              preview={post.linkPreview}
              linkUrl={post.linkUrl}
              onOpenLink={onOpenLink}
            />
          )}

          {post.linkUrl && (
            <button
              type="button"
              onClick={() => onOpenLink?.(post.linkUrl!)}
              className="inline-flex max-w-full items-center gap-1.5 self-start rounded-lg border border-sp-accent/25 bg-sp-accent/8 px-3 py-1.5 text-sm font-medium text-sp-accent transition hover:border-sp-accent/50 hover:bg-sp-accent/15"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              <span className="truncate">{getLinkLabel(post.linkUrl)}</span>
            </button>
          )}

          {/* 좋아요 + 댓글 카운트 표시 */}
          <div className="flex flex-wrap items-center gap-2 border-t border-sp-border/40 pt-4">
            <StudentLikeButton
              count={studentLikes}
              hasLiked={viewerRole === 'teacher' ? hasTeacherLiked : hasLiked}
              onClick={
                viewerRole === 'student' && onStudentLike
                  ? () => onStudentLike(post.id)
                  : viewerRole === 'teacher' && onTeacherLike
                    ? () => onTeacherLike(post.id)
                    : undefined
              }
            />
            <span className={`text-detail ${textMetaClass}`}>
              댓글 {commentCount}
            </span>
          </div>

          {/* 댓글 영역 — 항상 펼침 */}
          <div className="rounded-lg border border-sp-border/40 bg-sp-bg/40 p-3">
            <RealtimeWallCommentList
              comments={post.comments ?? []}
              viewerRole={viewerRole}
              onRemove={
                isTeacher && onRemoveComment
                  ? (commentId) => onRemoveComment(post.id, commentId)
                  : undefined
              }
            />
            {viewerRole === 'student' && (
              commentInputSlot ?? (onAddComment && (
                <div className="mt-3">
                  <RealtimeWallCommentInput
                    postId={post.id}
                    nicknameDefault={post.nickname}
                    onSubmit={(input) => onAddComment(post.id, input)}
                  />
                </div>
              ))
            )}
            {/* Step 2 — 교사 댓글 입력 (닉네임 "선생님" 고정) */}
            {viewerRole === 'teacher' && onTeacherAddComment && (
              <div className="mt-3">
                <RealtimeWallCommentInput
                  postId={post.id}
                  nicknameDefault="선생님"
                  nicknameFixed
                  onSubmit={(input) => onTeacherAddComment(post.id, { ...input, nickname: '선생님' })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
