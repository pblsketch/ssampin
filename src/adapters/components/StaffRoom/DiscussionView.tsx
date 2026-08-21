/**
 * 온라인 교무실 — 토론방 (M4)
 *
 * 계획서 §6(안건 + 찬성/반대/의견 + 집계) · §8-E(활동 포인트·랭킹 금지)
 *
 * 화면이 지켜야 할 것:
 *  1) **숫자를 그대로 보여주고 판단은 사람이 한다.** "우세"·"1등" 같은 말을 쓰지 않는다.
 *     부서 안의 뜻을 모으는 자리지 이기고 지는 자리가 아니다(§8-E).
 *  2) **기권도 한 자리를 차지한다.** "읽었지만 판단을 미룬다"를 말할 곳이 없으면
 *     그 사람은 아무것도 안 누르고, 그러면 안 본 사람과 구분되지 않는다.
 *  3) **마감한 안건에는 못 낸다.** 집계를 보고 뒤늦게 뒤집는 걸 막는다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomRoomsStore } from '@adapters/stores/useStaffRoomRoomsStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import {
  canCloseDiscussion,
  canEditRoomItem,
  canVote,
  checkRoomTitle,
  tallyLabel,
} from '@domain/rules/staffRoomRoomRules';
import {
  STAFFROOM_ROOM_TITLE_MAX_LENGTH,
  STAFFROOM_VOTE_COMMENT_MAX_LENGTH,
  type StaffRoomDiscussion,
  type StaffRoomStance,
} from '@domain/entities/StaffRoomRooms';
import { formatPostTime } from './boardFormat';

interface DiscussionViewProps {
  departmentId: string;
  moduleId: string;
}

/** 뜻마다 아이콘과 이름 — 세 가지가 나란히 보여야 기권이 묻히지 않는다 */
const STANCE_UI: Readonly<
  Record<StaffRoomStance, { readonly label: string; readonly icon: string }>
> = {
  agree: { label: '찬성', icon: 'thumb_up' },
  disagree: { label: '반대', icon: 'thumb_down' },
  abstain: { label: '기권', icon: 'remove' },
};

/** 집계 막대 — 숫자를 그대로 보여준다 */
function TallyBar({
  discussion,
  memberCount,
}: {
  discussion: StaffRoomDiscussion;
  memberCount: number;
}) {
  const { agree, disagree, abstain } = discussion.tally;
  const total = agree + disagree + abstain;

  return (
    <div>
      {total > 0 && (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-sp-surface">
          <div className="bg-sp-accent" style={{ width: `${(agree / total) * 100}%` }} />
          <div className="bg-sp-danger" style={{ width: `${(disagree / total) * 100}%` }} />
          <div className="bg-sp-muted" style={{ width: `${(abstain / total) * 100}%` }} />
        </div>
      )}
      <p className="mt-1.5 text-xs text-sp-muted">{tallyLabel(discussion.tally, memberCount)}</p>
    </div>
  );
}

/** 안건 목록 한 줄 */
function DiscussionRow({
  discussion,
  memberCount,
  onOpen,
}: {
  discussion: StaffRoomDiscussion;
  memberCount: number;
  onOpen: () => void;
}) {
  const authorLabel = displayNameOf({
    email: discussion.authorEmail,
    displayName: discussion.authorName,
  });

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3.5 text-left transition-all duration-sp-base ease-sp-out hover:border-sp-accent hover:shadow-sp-md"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {discussion.closedAt && (
          <span className="shrink-0 rounded-full bg-sp-surface px-2 py-0.5 text-[11px] font-sp-semibold text-sp-muted">
            마감
          </span>
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-sp-medium text-sp-text">
          {discussion.title}
        </h3>
        {discussion.myVote && (
          <span className="shrink-0 rounded-full border border-sp-accent px-2 py-0.5 text-[11px] font-sp-semibold text-sp-accent">
            내 뜻: {STANCE_UI[discussion.myVote.stance].label}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-sp-muted">
        {authorLabel} · {formatPostTime(discussion.createdAt)}
      </p>
      <div className="mt-2">
        <TallyBar discussion={discussion} memberCount={memberCount} />
      </div>
    </button>
  );
}

/** 안건 내기 */
function NewDiscussionForm({
  departmentId,
  moduleId,
  onDone,
}: {
  departmentId: string;
  moduleId: string;
  onDone: () => void;
}) {
  const addDiscussion = useStaffRoomRoomsStore((s) => s.addDiscussion);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const titleCheck = checkRoomTitle(title);

  const submit = async () => {
    if (!titleCheck.ok || saving) return;
    setSaving(true);
    const ok = await addDiscussion(departmentId, moduleId, { title: titleCheck.value, body });
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-3 rounded-xl border border-sp-border bg-sp-card p-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={STAFFROOM_ROOM_TITLE_MAX_LENGTH}
        placeholder="무엇을 정할까요? (예: 체육대회 종목)"
        aria-label="안건 제목"
        className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="왜 정해야 하는지, 고를 수 있는 것이 무엇인지 적어주세요."
        aria-label="안건 설명"
        className="w-full resize-y rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!titleCheck.ok || saving}
          className="rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '올리는 중…' : '안건 올리기'}
        </button>
      </div>
    </div>
  );
}

/** 안건 하나 — 뜻 내기와 사람들이 낸 뜻 */
function DiscussionDetail({ departmentId }: { departmentId: string }) {
  const discussion = useStaffRoomRoomsStore((s) => s.currentDiscussion);
  const votes = useStaffRoomRoomsStore((s) => s.votes);
  const memberCount = useStaffRoomRoomsStore((s) => s.memberCount);
  const vote = useStaffRoomRoomsStore((s) => s.vote);
  const setClosed = useStaffRoomRoomsStore((s) => s.setClosed);
  const removeDiscussion = useStaffRoomRoomsStore((s) => s.removeDiscussion);
  const back = useStaffRoomRoomsStore((s) => s.closeDiscussionView);

  const myEmail = useGoogleAccountStore((s) => s.email) ?? '';
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole) ?? null;

  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setComment(discussion?.myVote?.comment ?? '');
  }, [discussion?.id, discussion?.myVote?.comment]);

  if (!discussion) return null;

  const open = canVote(discussion.closedAt);
  const mayClose = canCloseDiscussion(myEmail, myRole, discussion.authorEmail);
  const mayDelete = canEditRoomItem(myEmail, myRole, discussion.authorEmail);

  const cast = async (stance: StaffRoomStance) => {
    if (!open || saving) return;
    setSaving(true);
    await vote(departmentId, discussion.id, stance, comment);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={back}
        className="flex items-center gap-1 text-sm text-sp-muted transition-colors hover:text-sp-text"
      >
        <span className="material-symbols-outlined text-icon-sm">arrow_back</span>
        안건 목록
      </button>

      <div className="rounded-xl border border-sp-border bg-sp-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {discussion.closedAt && (
                <span className="rounded-full bg-sp-surface px-2 py-0.5 text-[11px] font-sp-semibold text-sp-muted">
                  마감
                </span>
              )}
              <h3 className="text-base font-sp-semibold text-sp-text">{discussion.title}</h3>
            </div>
            <p className="mt-0.5 text-xs text-sp-muted">
              {displayNameOf({ email: discussion.authorEmail, displayName: discussion.authorName })}{' '}
              · {formatPostTime(discussion.createdAt)}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            {mayClose && (
              <button
                type="button"
                onClick={() => void setClosed(departmentId, discussion.id, !discussion.closedAt)}
                className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
              >
                {discussion.closedAt ? '다시 열기' : '마감하기'}
              </button>
            )}
            {mayDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('이 안건을 지울까요? 낸 뜻도 함께 사라집니다.')) {
                    void removeDiscussion(departmentId, discussion.id);
                  }
                }}
                aria-label="안건 지우기"
                className="rounded-lg p-2 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-danger"
              >
                <span className="material-symbols-outlined text-icon-sm">delete</span>
              </button>
            )}
          </div>
        </div>

        {discussion.body && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
            {discussion.body}
          </p>
        )}

        <div className="mt-4">
          <TallyBar discussion={discussion} memberCount={memberCount} />
        </div>
      </div>

      {/* 뜻 내기 */}
      <div className="rounded-xl border border-sp-border bg-sp-card p-5">
        <h4 className="text-sm font-sp-semibold text-sp-text">
          {discussion.myVote ? '내 뜻 (다시 고를 수 있습니다)' : '어떻게 생각하세요?'}
        </h4>

        {!open && (
          <p className="mt-2 text-xs text-sp-muted">마감된 안건이라 더 이상 뜻을 낼 수 없습니다.</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(STANCE_UI) as StaffRoomStance[]).map((stance) => {
            const chosen = discussion.myVote?.stance === stance;
            return (
              <button
                key={stance}
                type="button"
                onClick={() => void cast(stance)}
                disabled={!open || saving}
                aria-pressed={chosen}
                className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-sp-medium transition-all duration-sp-base ease-sp-out disabled:cursor-not-allowed disabled:opacity-50 ${
                  chosen
                    ? 'border-sp-accent bg-sp-accent text-white'
                    : 'border-sp-border text-sp-text hover:border-sp-accent'
                }`}
              >
                <span className="material-symbols-outlined text-icon-sm">
                  {STANCE_UI[stance].icon}
                </span>
                {STANCE_UI[stance].label}
              </button>
            );
          })}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={!open}
          rows={2}
          maxLength={STAFFROOM_VOTE_COMMENT_MAX_LENGTH}
          placeholder="왜 그렇게 생각하시는지 적어주세요. (비워도 됩니다)"
          aria-label="내 의견"
          className="mt-3 w-full resize-y rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
        />
        {open && (
          <p className="mt-1.5 text-xs text-sp-muted">
            의견을 적은 뒤 위에서 다시 골라 주시면 함께 저장됩니다.
          </p>
        )}
      </div>

      {/* 사람들이 낸 뜻 */}
      {votes.length > 0 && (
        <div className="rounded-xl border border-sp-border bg-sp-card p-5">
          <h4 className="text-sm font-sp-semibold text-sp-text">낸 뜻 {votes.length}개</h4>
          <ul className="mt-3 space-y-2.5">
            {votes.map((v) => (
              <li key={v.memberEmail} className="flex gap-2.5">
                <span
                  className="material-symbols-outlined shrink-0 text-icon-sm text-sp-muted"
                  title={STANCE_UI[v.stance].label}
                >
                  {STANCE_UI[v.stance].icon}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-sp-medium text-sp-text">
                    {displayNameOf({ email: v.memberEmail, displayName: v.memberName })} ·{' '}
                    {STANCE_UI[v.stance].label}
                  </p>
                  {v.comment && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-sp-muted">
                      {v.comment}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DiscussionView({ departmentId, moduleId }: DiscussionViewProps) {
  const discussions = useStaffRoomRoomsStore((s) => s.discussions);
  const memberCount = useStaffRoomRoomsStore((s) => s.memberCount);
  const currentDiscussion = useStaffRoomRoomsStore((s) => s.currentDiscussion);
  const isLoading = useStaffRoomRoomsStore((s) => s.isLoading);
  const error = useStaffRoomRoomsStore((s) => s.error);
  const loadDiscussions = useStaffRoomRoomsStore((s) => s.loadDiscussions);
  const openDiscussion = useStaffRoomRoomsStore((s) => s.openDiscussion);
  const clearError = useStaffRoomRoomsStore((s) => s.clearError);

  const [writing, setWriting] = useState(false);

  useEffect(() => {
    void loadDiscussions(departmentId, moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, moduleId]);

  if (currentDiscussion) return <DiscussionDetail departmentId={departmentId} />;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-danger bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-danger">{error}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="안내 닫기"
            className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        </div>
      )}

      {writing ? (
        <NewDiscussionForm
          departmentId={departmentId}
          moduleId={moduleId}
          onDone={() => setWriting(false)}
        />
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md"
          >
            <span className="material-symbols-outlined text-icon-sm">add</span>
            안건 올리기
          </button>
        </div>
      )}

      {isLoading && discussions.length === 0 && (
        <p className="py-8 text-center text-sm text-sp-muted">불러오는 중…</p>
      )}

      {!isLoading && discussions.length === 0 && !writing && (
        <div className="rounded-xl border border-dashed border-sp-border bg-sp-card px-6 py-12 text-center">
          <span className="material-symbols-outlined text-icon-xl text-sp-muted">how_to_vote</span>
          <p className="mt-3 text-sm font-sp-medium text-sp-text">아직 올라온 안건이 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            단체방에서 흩어지기 쉬운 "이거 어떻게 할까요"를 안건으로 올리면 누가 어떻게 생각하는지
            한눈에 모입니다.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {discussions.map((d) => (
          <DiscussionRow
            key={d.id}
            discussion={d}
            memberCount={memberCount}
            onOpen={() => void openDiscussion(departmentId, d.id)}
          />
        ))}
      </div>
    </div>
  );
}
