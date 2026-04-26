import { useCallback, useMemo, useRef, useState } from 'react';
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
import { RealtimeWallCardOwnerActions } from './RealtimeWallCardOwnerActions';
import { RealtimeWallCardPlaceholder } from './RealtimeWallCardPlaceholder';
import { RealtimeWallTeacherContextMenu } from './RealtimeWallTeacherContextMenu';
import {
  REALTIME_WALL_CARD_COLOR_DOT,
  getCardColorClass,
  getCardTextMetaClass,
  getCardTextPrimaryClass,
} from './RealtimeWallCardColors';
import { useRealtimeWallBoardColorScheme } from './RealtimeWallBoardColorSchemeContext';
import { parseTitleBody } from './realtimeWallTitleBody';

export interface RealtimeWallCardProps {
  readonly post: RealtimeWallPost;
  readonly compact?: boolean;
  readonly actions?: React.ReactNode;
  readonly dragHandle?: React.ReactNode;
  readonly onOpenLink?: (url: string) => void;
  /** 교사 로컬 하트 증가. 미전달 시 하트 UI는 읽기 전용(결과 복기 등). */
  readonly onHeart?: (postId: string) => void;
  /**
   * 카드 뷰어 역할.
   *   - 'teacher': 교사 하트 클릭 가능, 학생 좋아요 카운트만 read-only 표시
   *   - 'student': 학생 좋아요 클릭 가능, 교사 하트 카운트만 read-only 표시
   * 기본값 'teacher'로 v1.13 호출자 동작 무회귀.
   */
  readonly viewerRole?: RealtimeWallViewerRole;
  /**
   * v1.14 P2 — 학생 like/unlike 판정용 sessionToken.
   * viewerRole='student'일 때 likedBy에 포함되어 있으면 filled heart.
   */
  readonly currentSessionToken?: string;
  /**
   * v1.14 P2 — 학생 좋아요 토글 콜백 (viewerRole='student' 전용).
   */
  readonly onStudentLike?: (postId: string) => void;
  /**
   * v1.14 P2 — 학생 댓글 추가 콜백 (viewerRole='student' 전용).
   */
  readonly onAddComment?: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  /**
   * v1.14 P2 — 교사 댓글 삭제 콜백 (viewerRole='teacher' 전용).
   */
  readonly onRemoveComment?: (postId: string, commentId: string) => void;
  /**
   * Step 2 — 교사 좋아요 토글 콜백 (viewerRole='teacher' 전용).
   * renderer 직접 처리 — `__teacher__` 세션 토큰 기반.
   */
  readonly onTeacherLike?: (postId: string) => void;
  /**
   * Step 2 — 교사 댓글 추가 콜백 (viewerRole='teacher' 전용).
   * renderer 직접 처리 — nickname='선생님' 강제.
   */
  readonly onTeacherAddComment?: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  /**
   * v2.1 Phase B — 학생 댓글 입력 슬롯.
   * 미전달 시 기존 RealtimeWallCommentInput으로 폴백 (교사 측 무회귀).
   * viewerRole='student'일 때만 유의미하게 사용됨.
   */
  readonly commentInputSlot?: React.ReactNode;
  // ============ v2.1 Phase D — 학생 자기 카드 + 교사 모더레이션 ============
  /** v2.1 Phase D — 학생 PIN hash (PIN 설정 학생만, undefined = 익명 모드). */
  readonly currentPinHash?: string;
  /** v2.1 Phase D — 학생 자기 카드 수정 메뉴 클릭 시 호출. */
  readonly onOwnCardEdit?: (postId: string) => void;
  /** v2.1 Phase D — 학생 자기 카드 삭제 메뉴 클릭 시 호출. */
  readonly onOwnCardDelete?: (postId: string) => void;
  /** v2.1 Phase D — 교사 placeholder 카드 복원 클릭 시 호출. */
  readonly onRestoreCard?: (postId: string) => void;
  /** v2.1 Phase D — 교사 우클릭 컨텍스트 메뉴 트리거 (작성자 추적). */
  readonly onTeacherTrackAuthor?: (postId: string) => void;
  /** v2.1 Phase D — 교사 우클릭 컨텍스트 메뉴 트리거 (닉네임 변경). */
  readonly onTeacherUpdateNickname?: (postId: string) => void;
  /** v2.1 Phase D — 교사 우클릭 컨텍스트 메뉴 트리거 (일괄 숨김). */
  readonly onTeacherBulkHideStudent?: (postId: string) => void;
  /** v2.1 Phase D — 교사 작성자 추적 강조 (sky ring + filter). */
  readonly highlighted?: boolean;
  /**
   * v2.1 Phase C 버그 fix (2026-04-24) — 학생 자기 카드 전용 드래그 핸들 슬롯.
   *
   * 회귀 위험 #3 보호 정책 정합:
   *   - line 246-247의 `teacherDragHandle = viewerRole === 'teacher' ? dragHandle : null` 그대로 유지
   *   - 학생 드래그는 별도 prop(`studentDragHandle`)으로 분리해 회귀 가드(#3a/#3b) 무영향
   *
   * 동작:
   *   - viewerRole='student' + isOwn(자기 카드)일 때만 렌더 (RealtimeWallCard 내부에서 가드)
   *   - dnd-kit useSortable의 attributes/listeners를 attach한 button을 KanbanBoard에서 전달
   *   - 다른 학생 카드는 KanbanBoard에서 sortableDisabled=true로 dragHandle prop을 전달하지 않음
   *
   * 회귀 가드: scripts/regression-grep-check.mjs #3a/#3b 모두 영향 없음 (teacher 분기 코드 보존).
   */
  readonly studentDragHandle?: React.ReactNode;
  /**
   * 2026-04-26 결함 fix — 카드 더블클릭 시 상세 보기 모달 열기 콜백.
   *
   * 회귀 위험 보호:
   *   - 빈 영역 더블클릭(useStudentDoubleClick)으로 학생 새 카드 모달이 열리던 결함 차단.
   *     이전: 카드 위 더블클릭 → 이벤트 버블 → main[data-empty-area] → 새 카드 모달 (잘못)
   *     이제: 카드는 data-card-root="true" + e.stopPropagation() → 상세 모달만 발화
   *   - 학생/교사 양쪽 동일 동작 (Padlet 동일뷰).
   *   - hidden-by-author placeholder 카드는 본 컴포넌트 내부에서 일찍 return하므로
   *     onCardDetail 호출 경로에 도달하지 않음 (placeholder는 별도 처리).
   *   - 미전달 시 더블클릭 무동작 (기존 호출자 무회귀).
   */
  readonly onCardDetail?: (postId: string) => void;
}

/**
 * 교사 하트 버튼.
 * v2-student-ux 옵션 B (사용자 결정 #1 완전 번복, 2026-04-25):
 * 교사·학생 모두 하트 1개로 통일 — StudentLikeButton만 사용.
 * HeartButton 컴포넌트는 제거됨. teacherHearts 도메인 필드는 v1.13 호환 위해 유지하나
 * UI 렌더링 안 함. onHeart prop도 무동작 (deprecated, prop 시그니처만 보존).
 */

function getLinkLabel(linkUrl: string): string {
  try {
    const parsed = new URL(linkUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return linkUrl;
  }
}

function YoutubeEmbed({ videoId, compact }: { videoId: string; compact: boolean }) {
  // youtube-nocookie: 추적 쿠키 미설정 (Enhanced Privacy Mode).
  // sandbox에서 allow-same-origin 제거 — 임베드가 부모 문서에 접근 불가.
  // YouTube 플레이어는 자체 origin 내부에서 동작하므로 scripts + presentation
  // 조합만으로 재생 가능.
  return (
    <div
      className={`relative mt-2.5 w-full overflow-hidden rounded-lg border border-sp-border/60 bg-black ${
        compact ? 'aspect-video max-h-[160px]' : 'aspect-video'
      }`}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube 영상 미리보기"
        className="absolute inset-0 h-full w-full"
        // 영상 재생에 필요한 최소 권한만. clipboard-write·accelerometer·gyroscope는
        // 영상 재생과 무관하며 iframe 권한 최소화 원칙(보안 하드닝 계획)에 따라 제외.
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-presentation"
      />
    </div>
  );
}

function WebPagePreview({
  preview,
  linkUrl,
  onOpenLink,
}: {
  preview: Extract<RealtimeWallLinkPreview, { kind: 'webpage' }>;
  linkUrl: string;
  onOpenLink?: (url: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasMeta = preview.ogTitle || preview.ogDescription || preview.ogImageUrl;
  if (!hasMeta) return null;

  const showImage = preview.ogImageUrl && !imageFailed;

  return (
    <button
      type="button"
      onClick={() => onOpenLink?.(linkUrl)}
      className="mt-2.5 flex w-full items-stretch gap-2.5 overflow-hidden rounded-lg border border-sp-border/70 bg-sp-surface text-left transition hover:border-sp-accent/40"
    >
      {showImage && (
        <div className="w-16 shrink-0 overflow-hidden bg-sp-bg sm:w-20">
          <img
            src={preview.ogImageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        </div>
      )}
      <div className="min-w-0 flex-1 px-2 py-1.5">
        {preview.ogTitle && (
          <p className="line-clamp-2 text-xs font-semibold text-sp-text">{preview.ogTitle}</p>
        )}
        {preview.ogDescription && (
          <p className="mt-0.5 line-clamp-2 text-detail text-sp-muted">{preview.ogDescription}</p>
        )}
        <p className="mt-1 truncate text-caption text-sp-muted/70">
          {getLinkLabel(linkUrl)}
        </p>
      </div>
    </button>
  );
}

export function RealtimeWallCard({
  post,
  compact = false,
  actions,
  dragHandle,
  onOpenLink,
  onHeart: _onHeart,  // v2-student-ux 옵션 B: deprecated, UI 렌더링 안 함 (도메인 필드는 v1.13 호환 유지)
  viewerRole = 'teacher',
  currentSessionToken,
  currentPinHash,
  onStudentLike,
  onAddComment,
  onRemoveComment,
  onTeacherLike,
  onTeacherAddComment,
  commentInputSlot,
  onOwnCardEdit,
  onOwnCardDelete,
  onRestoreCard,
  onTeacherTrackAuthor,
  onTeacherUpdateNickname,
  onTeacherBulkHideStudent,
  highlighted = false,
  studentDragHandle,
  onCardDetail,
}: RealtimeWallCardProps) {
  // v2.1 Phase D — soft delete placeholder 분기 (회귀 위험 #8 보호 표시 로직)
  // status='hidden-by-author' 카드는 본문 대신 placeholder 표시.
  // 교사만 onRestoreCard 활성 (학생은 read-only placeholder만).
  if (post.status === 'hidden-by-author') {
    return (
      <RealtimeWallCardPlaceholder
        post={post}
        viewerRole={viewerRole}
        onRestore={
          viewerRole === 'teacher' && onRestoreCard
            ? () => onRestoreCard(post.id)
            : undefined
        }
      />
    );
  }

  const isPinned = post.pinned;
  const preview = post.linkPreview;
  // v2-student-ux 옵션 B (사용자 결정 #1 완전 번복):
  // 교사·학생 모두 하트 1개로 통일. teacherHearts 도메인 필드는 v1.13 호환 위해 유지하되
  // UI 렌더링은 안 함. 교사·학생 모두 StudentLikeButton(red-400)만 표시.
  // 승인된 카드면 항상 StudentLikeButton 노출 (좋아요 0이어도 클릭 가능해야 함).
  const showHearts = post.status === 'approved';

  // v1.14 P2 학생 좋아요 상태
  const studentLikes = post.likes ?? 0;
  const hasLiked = Boolean(
    currentSessionToken && (post.likedBy ?? []).includes(currentSessionToken),
  );
  // Step 2 — 교사 좋아요 상태: __teacher__ 토큰으로 likedBy 포함 여부 판정
  const TEACHER_SESSION_TOKEN = '__teacher__';
  const hasTeacherLiked = Boolean(
    (post.likedBy ?? []).includes(TEACHER_SESSION_TOKEN),
  );

  // v1.14 P2 댓글 토글 상태 — 기본 접힘
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Fix v2-student-ux: 학생 좋아요 debounce (300ms 이내 연속 클릭 차단 — race condition 방지)
  const [likePending, setLikePending] = useState(false);
  const handleStudentLike = useCallback(() => {
    if (!onStudentLike || likePending) return;
    setLikePending(true);
    onStudentLike(post.id);
    setTimeout(() => setLikePending(false), 300);
  }, [onStudentLike, likePending, post.id]);

  // Step 2 — 교사 좋아요 debounce (학생과 동일 패턴, race condition 방지)
  const [teacherLikePending, setTeacherLikePending] = useState(false);
  const handleTeacherLikeClick = useCallback(() => {
    if (!onTeacherLike || teacherLikePending) return;
    setTeacherLikePending(true);
    onTeacherLike(post.id);
    setTimeout(() => setTeacherLikePending(false), 300);
  }, [onTeacherLike, teacherLikePending, post.id]);
  const visibleComments = viewerRole === 'teacher'
    ? (post.comments ?? [])
    : (post.comments ?? []).filter((c) => c.status === 'approved');
  const commentCount = visibleComments.length;
  const showComments = post.status === 'approved';

  // 교사 전용 액션 — 학생 트리에서 DOM 부재 (CSS hidden 의존 금지)
  const teacherActions = viewerRole === 'teacher' ? actions : null;
  const teacherDragHandle = viewerRole === 'teacher' ? dragHandle : null;

  // v2.1 Phase D — 학생 자기 카드 식별 (sessionToken OR PIN hash 양방향)
  const isOwn = useMemo(
    () =>
      isOwnCard(post, {
        currentSessionToken,
        currentPinHash,
      }),
    [post, currentSessionToken, currentPinHash],
  );
  // v2.1 Phase C 버그 fix (2026-04-24) — 학생 자기 카드 드래그 핸들 게이트.
  // 회귀 #3 보호: viewerRole='student' + isOwn일 때만 렌더 (다른 학생 카드는 KanbanBoard에서 차단).
  const studentDragHandleNode =
    viewerRole === 'student' && isOwn ? studentDragHandle : null;
  const showOwnerActions =
    viewerRole === 'student' && isOwn && (Boolean(onOwnCardEdit) || Boolean(onOwnCardDelete));
  const ownerActionsNode = showOwnerActions ? (
    <RealtimeWallCardOwnerActions
      onEdit={onOwnCardEdit ? () => onOwnCardEdit(post.id) : undefined}
      onDelete={onOwnCardDelete ? () => onOwnCardDelete(post.id) : undefined}
    />
  ) : null;

  // v2.1 Phase D — 교사 우클릭 컨텍스트 메뉴
  const articleRef = useRef<HTMLElement>(null);
  const [contextMenuRect, setContextMenuRect] = useState<DOMRect | null>(null);
  const showTeacherContextMenu =
    viewerRole === 'teacher' &&
    (Boolean(onTeacherTrackAuthor) ||
      Boolean(onTeacherUpdateNickname) ||
      Boolean(onTeacherBulkHideStudent));
  const handleContextMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (!showTeacherContextMenu) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenuRect(rect);
  };

  /**
   * 2026-04-26 결함 fix — 카드 더블클릭 → 상세 모달 열기.
   *
   * 정책:
   *   - 인터랙티브 자식(버튼/링크/입력) 위 더블클릭은 무시 (해당 요소가 이미 onClick 처리)
   *   - drag-handle 위에서도 무시 (드래그 동작 보존)
   *   - e.stopPropagation()으로 부모 main[data-empty-area]까지 버블 차단 (Scenario A 보호)
   *     → 학생 빈 영역 더블클릭(useStudentDoubleClick)으로 새 카드 모달이 잘못 뜨는 결함 차단
   *   - data-card-root="true"가 article에 있어 useStudentDoubleClick의 isEmptyAreaTarget이 false 반환 →
   *     현재 시점에서 stopPropagation은 이중 안전망 (handler 등록 순서 무관 회귀 방지)
   *   - onCardDetail 미전달 시 무동작 (기존 호출자 무회귀)
   */
  const handleCardDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!onCardDetail) return;
    const target = e.target as Element | null;
    if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
      return;
    }
    e.stopPropagation();
    onCardDetail(post.id);
  };

  // 2026-04-26 결함 #2 fix — boardColorScheme context (provider: RealtimeWallBoardThemeWrapper).
  // html.dark 의존을 제거하고 명시적 분기로 카드 텍스트/배경 클래스를 선택해 교사 main app
  // (html.dark 강제) + light board 조합에서도 글쓴이/제목/본문이 제대로 보이도록 보장.
  const boardColorScheme = useRealtimeWallBoardColorScheme();
  const textPrimaryClass = getCardTextPrimaryClass(boardColorScheme);
  const textMetaClass = getCardTextMetaClass(boardColorScheme);

  // v2.1 (Phase B) — 카드 색상 배경 8색 (Plan §7.2 결정 #6 / Design v2.1 §5.4 / §5.11)
  const cardColor = post.color ?? 'white';
  const colorBgClass = useMemo(
    () => getCardColorClass(cardColor, boardColorScheme),
    [cardColor, boardColorScheme],
  );
  const colorDotClass = cardColor !== 'white' ? REALTIME_WALL_CARD_COLOR_DOT[cardColor] : null;

  // 2026-04-26 결함 #3 fix — `# 제목\n\n본문` 형식 분리 렌더 (학생/교사 양쪽 동일, 회귀 #11 보존).
  // StudentSubmitForm이 합성한 raw markdown `#`이 plain text로 노출되는 결함 차단.
  const parsed = useMemo(() => parseTitleBody(post.text ?? ''), [post.text]);
  const titleText = parsed?.title ?? null;
  const bodyText = parsed?.body ?? post.text ?? '';

  // v2.1 Phase D — 강조 ring (자기 카드 sky / 교사 추적 매칭 sky-bright)
  const ringClass = isOwn && viewerRole === 'student'
    ? 'ring-1 ring-sky-400/30'
    : highlighted
      ? 'ring-2 ring-sky-400/70'
      : '';

  return (
    <>
    {/*
      2026-04-26 사용자 피드백 #2 — 카드 가시성 강화:
      - shadow-sm → shadow-md(기본) / hover:shadow-lg (Padlet 정합 부유감)
      - light 모드: ring-1 ring-black/5로 미세 outline (흰 카드도 흰 배경 위에서 또렷)
      - dark 모드: 기존 ring 0 + border 유지
    */}
    <article
      ref={articleRef}
      data-card-root="true"
      // 2026-04-26 라운드 7 결함 A 검증 안전망 — DevTools에서 boardColorScheme 조회 가능.
      // Light board면 light 카드 배경 + slate-900 텍스트, dark면 그 반대 — 직접 확인용.
      data-color-scheme={boardColorScheme}
      onContextMenu={showTeacherContextMenu ? handleContextMenu : undefined}
      onDoubleClick={onCardDetail ? handleCardDoubleClick : undefined}
      className={`relative group flex h-full flex-col rounded-xl border p-3.5 shadow-md ring-1 ring-black/5 transition-shadow hover:shadow-lg dark:ring-0 ${
        isPinned
          ? 'border-amber-400/60 shadow-amber-400/10'
          : 'border-sp-border hover:border-sp-border/80'
      } ${colorBgClass} ${ringClass}`}
    >
      {/* v2.1 — 좌상단 색상 점 (white 제외) */}
      {colorDotClass && (
        <span
          className={`absolute top-2 left-2 inline-block w-2 h-2 rounded-full ${colorDotClass}`}
          aria-hidden="true"
        />
      )}
      <div className="mb-2.5 flex items-start gap-1.5">
        {teacherDragHandle && (
          <div className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            {teacherDragHandle}
          </div>
        )}
        {/* v2.1 Phase C 버그 fix (2026-04-24) — 학생 자기 카드 드래그 핸들 슬롯.
            회귀 #3 보호: studentDragHandleNode는 viewerRole='student' + isOwn일 때만 non-null.
            모바일 학생 친화성: opacity-100으로 항상 표시(터치 환경에서는 hover 부재). */}
        {studentDragHandleNode && (
          <div className="mt-0.5 shrink-0">
            {studentDragHandleNode}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-semibold ${textPrimaryClass}`}>{post.nickname}</span>
            {isPinned && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-caption font-bold text-amber-300">
                <span className="material-symbols-outlined text-detail">push_pin</span>
                고정
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-detail ${textMetaClass}`}>
            {new Date(post.submittedAt).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        {teacherActions && (
          <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            {teacherActions}
          </div>
        )}
        {ownerActionsNode && (
          <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">
            {ownerActionsNode}
          </div>
        )}
      </div>

      {/* 본문 — `# 제목\n\n본문` 형식 분리 렌더 (2026-04-26 결함 #3 fix).
          - 매칭 시: 제목은 굵고 큰 글씨, 본문은 본문 톤 (Padlet 동일뷰).
          - 미매칭 시: 전체를 본문으로 plain text 렌더 (기존 호환).
          - whitespace-pre-wrap로 줄바꿈/공백 보존. textPrimaryClass = 4.5:1 대비 보장.
          - 학생/교사 양쪽 동일 분기 — 회귀 #11 viewerRole 비대칭 0건.
          - React 텍스트 노드 렌더로 자동 escape (회귀 #7 dangerouslySetInnerHTML 0건). */}
      {titleText && titleText.length > 0 && (
        <p
          className={`break-words mb-1 font-bold leading-snug text-base ${textPrimaryClass}`}
        >
          {titleText}
        </p>
      )}
      {bodyText && bodyText.length > 0 && (
        <p
          className={`break-words whitespace-pre-wrap leading-relaxed text-sm ${textPrimaryClass}`}
        >
          {bodyText}
        </p>
      )}

      {/* v2.1 — 이미지 다중 표시 (max 3장 carousel) */}
      {post.images && post.images.length > 0 && (
        <RealtimeWallCardImageGallery images={post.images} />
      )}

      {/* v2.1 — PDF 첨부 배지 */}
      {post.pdfUrl && (
        <RealtimeWallCardPdfBadge
          pdfUrl={post.pdfUrl}
          pdfFilename={post.pdfFilename ?? 'document.pdf'}
        />
      )}

      {/* YouTube 임베드 */}
      {post.linkUrl && preview?.kind === 'youtube' && (
        <YoutubeEmbed videoId={preview.videoId} compact={compact} />
      )}

      {/* 웹페이지 OG 미리보기 */}
      {post.linkUrl && preview?.kind === 'webpage' && (
        <WebPagePreview preview={preview} linkUrl={post.linkUrl} onOpenLink={onOpenLink} />
      )}

      {/* 링크 칩 */}
      {post.linkUrl && (
        <button
          type="button"
          onClick={() => onOpenLink?.(post.linkUrl!)}
          className="mt-2 inline-flex max-w-full items-center gap-1 self-start rounded-lg border border-sp-accent/25 bg-sp-accent/8 px-2.5 py-1 text-xs font-medium text-sp-accent transition hover:border-sp-accent/50 hover:bg-sp-accent/15"
        >
          <span className="material-symbols-outlined text-[13px]">open_in_new</span>
          <span className="truncate">{getLinkLabel(post.linkUrl)}</span>
        </button>
      )}

      {/*
        v2-student-ux 옵션 B footer 영역:
        [학생 좋아요(통일)] | [댓글 토글]
        교사·학생 모두 StudentLikeButton 1개. teacherHearts UI 제거.
      */}
      {showHearts && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* v2-student-ux 옵션 B: 교사·학생 모두 동일 버튼. 학생만 클릭 가능. */}
          <StudentLikeButton
            count={studentLikes}
            hasLiked={viewerRole === 'teacher' ? hasTeacherLiked : hasLiked}
            onClick={
              viewerRole === 'student' && onStudentLike && !likePending
                ? handleStudentLike
                : viewerRole === 'teacher' && onTeacherLike && !teacherLikePending
                  ? handleTeacherLikeClick
                  : undefined
            }
          />
          {showComments && (
            <button
              type="button"
              onClick={() => setCommentsOpen((prev) => !prev)}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-sp-border bg-sp-surface px-2 py-0.5 text-detail font-semibold text-sp-muted transition hover:border-sp-accent/40 hover:text-sp-accent"
              aria-expanded={commentsOpen}
              title={commentsOpen ? '댓글 접기' : '댓글 펼치기'}
            >
              <span className="material-symbols-outlined text-[13px]">
                {commentsOpen ? 'expand_less' : 'chat_bubble'}
              </span>
              <span className="tabular-nums">댓글 {commentCount}</span>
            </button>
          )}
        </div>
      )}

      {/* v1.14 P2 댓글 영역 (collapsible) */}
      {showComments && commentsOpen && (
        <div className="mt-2 rounded-lg border border-sp-border/40 bg-sp-bg/30 p-2">
          <RealtimeWallCommentList
            comments={post.comments ?? []}
            viewerRole={viewerRole}
            onRemove={
              viewerRole === 'teacher' && onRemoveComment
                ? (commentId) => onRemoveComment(post.id, commentId)
                : undefined
            }
          />
          {viewerRole === 'student' && (commentInputSlot ?? (onAddComment && (
            <div className="mt-2">
              <RealtimeWallCommentInput
                postId={post.id}
                nicknameDefault={post.nickname}
                onSubmit={(input) => onAddComment(post.id, input)}
              />
            </div>
          )))}
          {/* Step 2 — 교사 댓글 입력 (닉네임 "선생님" 고정) */}
          {viewerRole === 'teacher' && onTeacherAddComment && (
            <div className="mt-2">
              <RealtimeWallCommentInput
                postId={post.id}
                nicknameDefault="선생님"
                nicknameFixed
                onSubmit={(input) => onTeacherAddComment(post.id, { ...input, nickname: '선생님' })}
              />
            </div>
          )}
        </div>
      )}
    </article>
    {showTeacherContextMenu && (
      <RealtimeWallTeacherContextMenu
        open={contextMenuRect !== null}
        anchorRect={contextMenuRect}
        onClose={() => setContextMenuRect(null)}
        onTrackAuthor={onTeacherTrackAuthor ? () => onTeacherTrackAuthor(post.id) : undefined}
        onUpdateNickname={onTeacherUpdateNickname ? () => onTeacherUpdateNickname(post.id) : undefined}
        onBulkHideStudent={onTeacherBulkHideStudent ? () => onTeacherBulkHideStudent(post.id) : undefined}
      />
    )}
    </>
  );
}
