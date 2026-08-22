import { useCallback, useState } from 'react';

/**
 * 알림 진단 — "지금 몇 건이 걸려 있고 다음은 언제 울리는지"를 눈으로 확인하는 접기 패널.
 *
 * 알림은 **조용히 실패하는 기능**이다. 안 울린 알림은 아무도 신고하지 않으니, 사고가 나도
 * 몇 달 동안 아무도 모른다. 그래서 확인할 창구를 기능과 같이 만든다.
 *
 * ⚠️ **원리적 한계 — 이 패널로는 "앱을 켜자마자 몇 건이었는지"를 확인할 수 없다.**
 *    이 화면은 메인 창에서만 보이는데, 메인 창을 여는 순간 그 화면이 할 일 알람을 다시
 *    계산해 밀어 넣기 때문이다. **확인하는 행위가 증거를 지운다.**
 *    그래서 "부팅 때 되살린 건수"를 따로 표시하고, 진짜 판정은 `notify-diag.log` 파일로 한다.
 */

interface Diagnostics {
  counts: { record: number; todo: number };
  nextFireAt: number | null;
  nextFireInMs: number | null;
  firedCount: number;
  lastPushedAt: { record?: number; todo?: number };
  restoredFromSnapshotAt: number | null;
  snapshotItemCount: number;
}

function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '없음';
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-xs text-sp-muted">{label}</span>
      <span className="text-xs font-medium text-sp-text tabular-nums">{value}</span>
    </div>
  );
}

export function TodoAlarmDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.getReminderDiagnostics) {
      setError('앱(데스크톱)에서만 확인할 수 있습니다.');
      return;
    }
    setError(null);
    void api
      .getReminderDiagnostics()
      .then((d) => setDiag(d))
      .catch(() => setError('진단 정보를 읽지 못했습니다.'));
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  };

  return (
    <div className="rounded-lg bg-sp-surface ring-1 ring-sp-border overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-medium text-sp-muted">알림 진단</span>
        <span className="material-symbols-outlined text-icon-sm text-sp-muted">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {error !== null && <p className="text-xs text-sp-muted py-1">{error}</p>}

          {error === null && diag !== null && (
            <>
              <Row label="예약된 할 일 알림" value={`${diag.counts.todo}건`} />
              <Row label="예약된 기록 알림" value={`${diag.counts.record}건`} />
              <Row label="다음 알림 예정" value={formatTime(diag.nextFireAt)} />
              <Row label="이미 울린 기록" value={`${diag.firedCount}건`} />
              <Row label="마지막으로 보낸 시각" value={formatTime(diag.lastPushedAt.todo)} />
              <Row
                label="앱 켤 때 되살린 건수"
                value={
                  diag.restoredFromSnapshotAt === null
                    ? '없음'
                    : `${diag.snapshotItemCount}건 (${formatTime(diag.restoredFromSnapshotAt)})`
                }
              />
              <p className="text-xs text-sp-muted mt-2 leading-relaxed">
                이 창을 여는 순간 할 일 알림이 다시 계산되어 들어갑니다. 그래서 &ldquo;앱을 켰을
                때&rdquo;의 숫자는 맨 아래 줄로만 확인할 수 있습니다.
              </p>
            </>
          )}

          {error === null && diag === null && (
            <p className="text-xs text-sp-muted py-1">불러오는 중…</p>
          )}

          <button
            type="button"
            onClick={refresh}
            className="mt-2 px-2.5 py-1 rounded-lg text-xs font-medium bg-sp-card text-sp-muted hover:text-sp-text"
          >
            새로고침
          </button>
        </div>
      )}
    </div>
  );
}
