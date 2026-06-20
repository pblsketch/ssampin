import { useEffect, useState, useCallback } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';

type Client = 'claude' | 'codex' | 'antigravity';

interface ClientDef {
  id: Client;
  name: string;
  maker: string;
  icon: string;
  iconBg: string;
}

const CLIENTS: ClientDef[] = [
  {
    id: 'claude',
    name: 'Claude Desktop',
    maker: 'Anthropic',
    icon: 'smart_toy',
    iconBg: 'bg-orange-500/10 text-orange-400',
  },
  {
    id: 'codex',
    name: 'Codex (GPT)',
    maker: 'OpenAI',
    icon: 'terminal',
    iconBg: 'bg-emerald-500/10 text-emerald-400',
  },
  {
    id: 'antigravity',
    name: 'Antigravity (Gemini)',
    maker: 'Google',
    icon: 'auto_awesome',
    iconBg: 'bg-blue-500/10 text-blue-400',
  },
];

type StatusMap = Record<Client, boolean | null | undefined>;

export function AiBridgeCard() {
  const showToast = useToastStore((s) => s.show);
  const [allowContent, setAllowContent] = useState(false);
  const [allowWrite, setAllowWrite] = useState(false);
  const [status, setStatus] = useState<StatusMap>({
    claude: undefined,
    codex: undefined,
    antigravity: undefined,
  });
  const [busy, setBusy] = useState<Client | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [codexCommand, setCodexCommand] = useState<string | null>(null);
  const [liveSyncOn, setLiveSyncOn] = useState(false);
  const [liveSyncBusy, setLiveSyncBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const api = window.electronAPI?.aiBridge;
    if (!api) return;
    try {
      const all = await api.statusAll();
      const next: StatusMap = { claude: undefined, codex: undefined, antigravity: undefined };
      for (const s of all) next[s.client] = s.registered;
      setStatus(next);
    } catch {
      /* 무시 — 상태는 미확정으로 둠 */
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void window.electronAPI?.aiBridge
      ?.paths()
      .then((p) => setServerReady(p.serverExists))
      .catch(() => setServerReady(null));
    void window.electronAPI?.aiBridge
      ?.liveSyncStatus?.()
      .then((s) => setLiveSyncOn(s.allowWrite))
      .catch(() => {
        /* 미지원/구버전 — OFF 로 둠 */
      });
  }, [refreshStatus]);

  const toggleLiveSync = async (enabled: boolean) => {
    const api = window.electronAPI?.aiBridge;
    if (!api?.setLiveSync) {
      showToast('이 기능은 데스크톱 앱에서만 사용할 수 있습니다.', 'error');
      return;
    }
    setLiveSyncBusy(true);
    try {
      await api.setLiveSync(enabled);
      setLiveSyncOn(enabled);
      showToast(
        enabled
          ? '실시간 AI 쓰기를 켰습니다(쌤핀 실행 중에만 적용).'
          : '실시간 AI 쓰기를 껐습니다.',
        'success',
      );
    } catch (err) {
      showToast(`설정 실패: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLiveSyncBusy(false);
    }
  };

  const handleConnect = async (client: Client) => {
    const api = window.electronAPI?.aiBridge;
    if (!api) {
      showToast('이 기능은 데스크톱 앱에서만 사용할 수 있습니다.', 'error');
      return;
    }
    setBusy(client);
    try {
      const result = await api.register(client, { allowContent, allowWrite });
      setCodexCommand(null);
      if (!result.ok) {
        showToast(`연결 실패: ${result.error ?? '알 수 없는 오류'}`, 'error');
      } else if (result.cliMissing) {
        setCodexCommand(result.command ?? null);
        showToast('codex CLI가 설치되어 있지 않습니다. 설치 후 아래 명령을 실행하세요.', 'error');
      } else {
        const name = CLIENTS.find((c) => c.id === client)?.name ?? client;
        showToast(`${name}에 연결했습니다. 해당 앱을 재시작하면 도구가 나타납니다.`, 'success');
      }
      await refreshStatus();
    } catch (err) {
      showToast(`연결 중 오류: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const statusChip = (client: Client) => {
    const s = status[client];
    if (client === 'codex' || s === null || s === undefined) {
      return <span className="text-xs text-sp-muted/70">연결 후 재시작 필요</span>;
    }
    return s ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        <span className="material-symbols-outlined text-icon-sm">check_circle</span>연결됨
      </span>
    ) : (
      <span className="text-xs text-sp-muted/70">미연결</span>
    );
  };

  return (
    <section className="rounded-xl bg-sp-card ring-1 ring-sp-border p-5">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-sp-accent/10 text-sp-accent">
          <span className="material-symbols-outlined">linked_services</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-sp-text">AI 연결 (브릿지)</h3>
          <p className="text-xs text-sp-muted mt-0.5">
            쌤핀 데이터를 외부 AI(Claude·Codex·Antigravity)와 API 키 없이 연결합니다.
          </p>
        </div>
      </div>

      {/* 정직 고지 */}
      <div className="mt-4 rounded-lg border border-sp-accent/30 bg-sp-surface/60 p-3 text-xs leading-relaxed text-sp-muted">
        <p>
          실명·연락처는 토큰으로 가려서 내보냅니다. 다만{' '}
          <strong className="text-sp-text">읽기</strong>를 켜면 관찰 기록{' '}
          <strong className="text-sp-text">원문</strong>이 외부 AI로 전달되어 맥락으로 재식별될 수
          있습니다. 꼭 필요할 때만 켜세요. 생기부는 법정 기록이며 모든 문장은 교사가 직접 확인해야
          합니다.
        </p>
      </div>

      {/* 게이트 토글 */}
      <div className="mt-4 space-y-2">
        <GateRow
          label="읽기 허용"
          hint="get_observations — 관찰 기록 원문을 외부 AI가 읽도록 허용"
          checked={allowContent}
          onChange={setAllowContent}
        />
        <GateRow
          label="쓰기 허용"
          hint="add_observation — 외부 AI가 관찰 기록을 추가하도록 허용"
          checked={allowWrite}
          onChange={setAllowWrite}
        />
        <p className="text-[0.7rem] text-sp-muted/70">
          토글은 <strong>다음에 연결할 때</strong> 적용됩니다. 끈 상태로 연결하면 명단·자리 같은
          토큰 정보만 다룹니다.
        </p>
      </div>

      {/* 실시간 쓰기 (live-sync) — 즉시 적용, 쌤핀 실행 중에만 동작 */}
      <div className="mt-4 rounded-lg border border-sp-border p-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={liveSyncOn}
            disabled={liveSyncBusy}
            onChange={(e) => void toggleLiveSync(e.target.checked)}
            className="h-4 w-4 accent-sp-accent disabled:opacity-50"
          />
          <span className="flex-1 min-w-0">
            <span className="text-sm text-sp-text">
              실시간 AI 쓰기 허용
              {liveSyncOn && (
                <span className="ml-2 inline-flex items-center gap-1 text-[0.7rem] font-medium text-emerald-400">
                  <span className="material-symbols-outlined text-icon-sm">bolt</span>켜짐
                </span>
              )}
            </span>
            <span className="block text-[0.7rem] text-sp-muted/70">
              create_todo·create_event — 쌤핀이 켜져 있을 때 외부 AI가 일정·할일을 추가하도록 허용
              (즉시 적용, 앱이 꺼져 있으면 거부)
            </span>
          </span>
        </label>
      </div>

      {/* 클라이언트별 연결 */}
      <div className="mt-4 space-y-2">
        {CLIENTS.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-lg border border-sp-border p-3"
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.iconBg}`}
            >
              <span className="material-symbols-outlined text-icon-md">{c.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-sp-text truncate">{c.name}</span>
                <span className="text-[0.7rem] text-sp-muted/60 shrink-0">{c.maker}</span>
              </div>
              <div className="mt-0.5">{statusChip(c.id)}</div>
            </div>
            <button
              type="button"
              disabled={busy !== null || serverReady === false}
              onClick={() => void handleConnect(c.id)}
              className="shrink-0 rounded-lg bg-sp-accent/10 px-3 py-1.5 text-sm font-medium text-sp-accent ring-1 ring-sp-accent/20 transition-colors hover:bg-sp-accent/20 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy === c.id ? '연결 중…' : '연결'}
            </button>
          </div>
        ))}
      </div>

      {codexCommand && (
        <div className="mt-3 rounded-lg border border-sp-border bg-sp-surface p-3">
          <p className="text-xs font-medium text-sp-text">
            codex CLI 설치 후, 터미널에 아래 명령을 실행하세요
          </p>
          <pre className="mt-2 overflow-x-auto text-[0.7rem] text-sp-muted">
            <code>{codexCommand}</code>
          </pre>
        </div>
      )}

      {serverReady === false && (
        <p className="mt-3 text-xs text-red-400">
          동봉된 브릿지 서버를 찾지 못했습니다. 앱을 다시 설치하거나 최신 버전으로 업데이트하세요.
        </p>
      )}
      <p className="mt-3 text-[0.7rem] text-sp-muted/60">
        codex는 codex CLI가 필요합니다. 연결 메커니즘·자세한 안내는 ssampin.com/ai-bridge 를
        참고하세요.
      </p>
    </section>
  );
}

function GateRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-sp-accent"
      />
      <span className="flex-1 min-w-0">
        <span className="text-sm text-sp-text">{label}</span>
        <span className="block text-[0.7rem] text-sp-muted/70">{hint}</span>
      </span>
    </label>
  );
}
