/**
 * BoardParticipantList — 접속 중 학생 이름 칩 (Design §5.4)
 *
 * useBoardSessionStore.participants 배열을 렌더. 이름 등장 순서 보존.
 * 빈 상태(0명)에서는 안내 메시지.
 */

interface BoardParticipantListProps {
  readonly participants: readonly string[];
  /** Plan §3.2 MAX_PARTICIPANTS 기본 50 — UI 배너에 상한 표시용 */
  readonly maxParticipants?: number;
}

export function BoardParticipantList({
  participants,
  maxParticipants = 50,
}: BoardParticipantListProps): JSX.Element {
  const count = participants.length;
  const nearLimit = count >= Math.floor(maxParticipants * 0.9); // 90% 이상

  return (
    <div className="bg-sp-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent">group</span>
          <h3 className="text-sm font-bold text-sp-text">접속자</h3>
        </div>
        <div
          className={`text-sm font-mono ${
            nearLimit ? 'text-amber-400' : 'text-sp-muted'
          }`}
        >
          {count}명{count > 0 ? ` / ${maxParticipants}` : ''}
        </div>
      </div>

      {count === 0 ? (
        <div className="text-xs text-sp-muted text-center py-6">
          아직 아무도 접속하지 않았어요.<br />
          QR을 보여주거나 URL을 공유해보세요.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {participants.map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sp-bg/60 text-xs text-sp-text border border-sp-border/30"
              title={name}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="truncate max-w-[120px]">{name}</span>
            </span>
          ))}
        </div>
      )}

      {nearLimit && count < maxParticipants && (
        <div className="mt-3 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
          ⚠️ 접속 인원이 한도에 근접했습니다 ({count}/{maxParticipants}).
        </div>
      )}
    </div>
  );
}
