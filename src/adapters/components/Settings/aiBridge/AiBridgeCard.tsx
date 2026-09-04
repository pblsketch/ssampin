import { useEffect, useState, useCallback, type ReactNode, type MouseEvent } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { SITE_URL } from '@config/siteUrl';
import {
  useAiBridgeConsentStore,
  academicTerm,
  needsConsent,
  type HighRiskGate,
} from '@adapters/stores/useAiBridgeConsentStore';

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

/** setCapability 부분 갱신 인자 */
type CapPartial = {
  allowWrite?: boolean;
  allowContent?: boolean;
  allowGradeWrite?: boolean;
  allowRecordWrite?: boolean;
};

/** 고위험 게이트(채점·생기부 쓰기) 토글 토스트 문구 — confirm/handler 가 공유. */
const GATE_ON_MSG: Record<HighRiskGate, string> = {
  allowGradeWrite: '채점 쓰기를 켰습니다(바로 적용).',
  allowRecordWrite: '생기부 초안 쓰기를 켰습니다(바로 적용).',
};
const GATE_OFF_MSG: Record<HighRiskGate, string> = {
  allowGradeWrite: '채점 쓰기를 껐습니다(바로 적용).',
  allowRecordWrite: '생기부 초안 쓰기를 껐습니다(바로 적용).',
};

/** 고위험 게이트 키 → CapPartial(타입 안전 — 컴퓨티드 키 인덱스 시그니처 회피). */
function highRiskPartial(gate: HighRiskGate, value: boolean): CapPartial {
  return gate === 'allowGradeWrite' ? { allowGradeWrite: value } : { allowRecordWrite: value };
}

/** 학생·학부모 고지문 양식 페이지 URL. */
const NOTICE_URL = `${SITE_URL}/ai-bridge#notice`;

/**
 * 고지문 양식 링크 클릭 처리.
 * Electron 은 보안 가드(setWindowOpenHandler deny)로 일반 링크/새 창을 막으므로, 반드시
 * shell:openExternal IPC(window.electronAPI.openExternal)로 기본 브라우저에서 열어야 한다.
 * 브라우저(웹 dev) 모드에서는 electronAPI 가 없어 기본 anchor 동작을 그대로 둔다.
 */
function handleNoticeClick(e: MouseEvent<HTMLAnchorElement>): void {
  if (window.electronAPI?.openExternal) {
    e.preventDefault();
    void window.electronAPI.openExternal(NOTICE_URL);
  }
}

export function AiBridgeCard() {
  const showToast = useToastStore((s) => s.show);
  // 게이트 상태는 capability.json 의 실제 값으로 동기화한다(로컬 추정 아님).
  const [allowContent, setAllowContent] = useState(false);
  const [allowWrite, setAllowWrite] = useState(false);
  const [allowGradeWrite, setAllowGradeWrite] = useState(false);
  const [allowRecordWrite, setAllowRecordWrite] = useState(false);
  const [liveServerRunning, setLiveServerRunning] = useState(false);
  const [capBusy, setCapBusy] = useState(false);
  const [status, setStatus] = useState<StatusMap>({
    claude: undefined,
    codex: undefined,
    antigravity: undefined,
  });
  const [busy, setBusy] = useState<Client | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [codexCommand, setCodexCommand] = useState<string | null>(null);
  // 고위험 게이트(채점·생기부 쓰기)를 미확인 상태에서 켜려 할 때, 해당 토글 아래 인라인 고지 확인을 띄운다.
  const [pendingGate, setPendingGate] = useState<HighRiskGate | null>(null);
  const [pendingChecked, setPendingChecked] = useState(false);
  const consentAcks = useAiBridgeConsentStore((s) => s.acks);
  const acknowledgeConsent = useAiBridgeConsentStore((s) => s.acknowledge);

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
    // 게이트 초기값을 capability.json 실제 상태로 반영(토글 ON/OFF 가 화면과 일치).
    void window.electronAPI?.aiBridge
      ?.liveSyncStatus?.()
      .then((s) => {
        setAllowContent(s.allowContent);
        setAllowWrite(s.allowWrite);
        setAllowGradeWrite(s.allowGradeWrite);
        setAllowRecordWrite(s.allowRecordWrite);
        setLiveServerRunning(s.running);
      })
      .catch(() => {
        /* 미지원/구버전 — OFF 로 둠 */
      });
  }, [refreshStatus]);

  /** 게이트 토글을 capability 에 즉시 기록(재연결·재시작 불필요). 응답의 실제 상태로 화면을 갱신한다. */
  const applyCapability = async (partial: CapPartial, successMsg: string) => {
    const api = window.electronAPI?.aiBridge;
    if (!api?.setCapability) {
      showToast('이 기능은 데스크톱 앱에서만 사용할 수 있습니다.', 'error');
      return;
    }
    setCapBusy(true);
    try {
      const s = await api.setCapability(partial);
      setAllowContent(s.allowContent);
      setAllowWrite(s.allowWrite);
      setAllowGradeWrite(s.allowGradeWrite);
      setAllowRecordWrite(s.allowRecordWrite);
      setLiveServerRunning(s.running);
      // ★"켰습니다"라고 말해 놓고 안 켜지면 안 된다. 쓰기를 켜려면 앱 안의 통로(서버)가
      //   떠야 하는데, 포트가 막히면 못 뜬다. 그럴 때 앱은 **켜지 않고** 옛 상태를 돌려준다.
      const notApplied = (Object.keys(partial) as (keyof CapPartial)[]).some(
        (k) => partial[k] !== undefined && s[k] !== partial[k],
      );
      if (notApplied) {
        showToast(
          '설정을 켜지 못했습니다. 앱을 다시 켜거나, 다른 프로그램이 포트를 쓰고 있는지 확인해 주세요.',
          'error',
        );
        return;
      }
      showToast(successMsg, 'success');
    } catch (err) {
      showToast(`설정 실패: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setCapBusy(false);
    }
  };

  /**
   * 고위험 게이트(채점·생기부 쓰기) 토글. 끄기와 "이번 학기 이미 확인함"은 즉시 적용하고,
   * 미확인 상태에서 켜려 하면 토글 아래 인라인 고지 확인을 띄운다(켜지 않고 대기).
   */
  const handleHighRiskToggle = (gate: HighRiskGate, value: boolean) => {
    if (!value) {
      void applyCapability(highRiskPartial(gate, false), GATE_OFF_MSG[gate]);
      return;
    }
    if (!needsConsent(gate, consentAcks)) {
      void applyCapability(highRiskPartial(gate, true), GATE_ON_MSG[gate]);
      return;
    }
    setPendingGate(gate);
    setPendingChecked(false);
  };

  /** 인라인 고지 확인 완료 → 이번 학기 확인 기록 후 게이트 ON. */
  const confirmPendingGate = () => {
    if (!pendingGate || !pendingChecked) return;
    const gate = pendingGate;
    acknowledgeConsent(gate, academicTerm());
    setPendingGate(null);
    setPendingChecked(false);
    void applyCapability(highRiskPartial(gate, true), GATE_ON_MSG[gate]);
  };

  const cancelPendingGate = () => {
    setPendingGate(null);
    setPendingChecked(false);
  };

  const handleConnect = async (client: Client) => {
    const api = window.electronAPI?.aiBridge;
    if (!api) {
      showToast('이 기능은 데스크톱 앱에서만 사용할 수 있습니다.', 'error');
      return;
    }
    setBusy(client);
    try {
      // 게이트는 위 토글이 capability.json 에 직접 기록한다 — 연결 시점 env 로 굽지 않는다(토글 즉시 적용).
      const result = await api.register(client);
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
    if (s === null || s === undefined) {
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
          <strong className="text-sp-text">읽기</strong>를 켜면 일정·할일·노트·메모·관찰 기록 등의{' '}
          <strong className="text-sp-text">원문</strong>(제목·내용·장소)이 외부 AI로 전달되어
          맥락으로 재식별될 수 있습니다. 꼭 필요할 때만 켜세요. 생기부 같은 기록은 법정 자료이며
          모든 문장은 교사가 직접 확인해야 합니다.
        </p>
        <p className="mt-2">
          외부 AI에 자료를 활용하기 전, 학생·학부모에게 고지·동의를 확인하세요(인공지능기본법).
          학생·학부모는 AI 활용을 거부하거나 설명을 요구할 권리가 있습니다.{' '}
          <a
            href={NOTICE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleNoticeClick}
            className="font-medium text-sp-accent hover:underline"
          >
            학생·학부모 고지문 양식 보기
          </a>
        </p>
      </div>

      {/* 게이트 토글 — 켜는 즉시 capability 에 기록되어 연결된 AI에 바로 반영(재연결 불필요) */}
      <div className="mt-4 space-y-2">
        <GateRow
          label="읽기 허용"
          hint="일정·할일·노트·메모·북마크·관찰 기록의 원문(제목·내용·장소)까지 노출 — 끄면 날짜·개수 같은 비식별 정보만"
          checked={allowContent}
          disabled={capBusy}
          onChange={(v) =>
            void applyCapability(
              { allowContent: v },
              v ? '읽기를 켰습니다(바로 적용).' : '읽기를 껐습니다(바로 적용).',
            )
          }
        />
        <GateRow
          label="쓰기 허용"
          hint="외부 AI가 일정·할일·관찰 기록을 추가·수정 — 쌤핀이 켜져 있으면 즉시 반영, 닫혀 있으면 파일에 직접 기록"
          checked={allowWrite}
          disabled={capBusy}
          badge={
            allowWrite && liveServerRunning ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[0.7rem] font-medium text-emerald-400">
                <span className="material-symbols-outlined text-icon-sm">bolt</span>실시간 켜짐
              </span>
            ) : null
          }
          onChange={(v) =>
            void applyCapability(
              { allowWrite: v },
              v ? '쓰기를 켰습니다(바로 적용).' : '쓰기를 껐습니다(바로 적용).',
            )
          }
        />
        <GateRow
          label="채점 쓰기 허용"
          hint="외부 AI가 수행평가 채점(도달 수준 선택)을 입력하도록 허용 — 공식 성적 기록이라 별도 고위험 토글, 쌤핀을 닫은 상태 권장"
          checked={allowGradeWrite}
          disabled={capBusy}
          onChange={(v) => handleHighRiskToggle('allowGradeWrite', v)}
        />
        {pendingGate === 'allowGradeWrite' && (
          <GateConsentRow
            checked={pendingChecked}
            onCheck={setPendingChecked}
            onConfirm={confirmPendingGate}
            onCancel={cancelPendingGate}
            busy={capBusy}
          />
        )}
        <GateRow
          label="생기부 초안 쓰기 허용"
          hint="외부 AI가 NEIS 영역별 생활기록부 초안을 쌤핀 작성란에 저장하도록 허용 — 법정 공식기록이라 별도 고위험 토글, 모든 초안은 교사 검토가 필요한 상태로 저장됩니다"
          checked={allowRecordWrite}
          disabled={capBusy}
          onChange={(v) => handleHighRiskToggle('allowRecordWrite', v)}
        />
        {pendingGate === 'allowRecordWrite' && (
          <GateConsentRow
            checked={pendingChecked}
            onCheck={setPendingChecked}
            onConfirm={confirmPendingGate}
            onCancel={cancelPendingGate}
            busy={capBusy}
          />
        )}
        <p className="text-[0.7rem] text-sp-muted/70">
          토글은 <strong>켜는 즉시</strong> 적용됩니다 — 연결된 AI에서 바로 반영되며 재연결·재시작이
          필요 없습니다. 모두 끄면 명단·자리 같은 토큰 정보만 다룹니다.
        </p>
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
  disabled,
  badge,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'cursor-wait' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-sp-accent disabled:opacity-50"
      />
      <span className="flex-1 min-w-0">
        <span className="text-sm text-sp-text">
          {label}
          {badge}
        </span>
        <span className="block text-[0.7rem] text-sp-muted/70">{hint}</span>
      </span>
    </label>
  );
}

/**
 * 고위험 게이트(채점·생기부 쓰기)를 처음 켤 때 한 번 뜨는 인라인 고지 확인.
 * 별도 모달이 아니라 토글 아래 펼침으로 구현해 ModalCoordinator 스택·focus-trap 의존을 피한다.
 * 체크해야 [켜기]가 활성화되며, 확인하면 학기 단위로 기록되어 같은 학기엔 다시 뜨지 않는다.
 */
function GateConsentRow({
  checked,
  onCheck,
  onConfirm,
  onCancel,
  busy,
}: {
  checked: boolean;
  onCheck: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="ml-7 space-y-2.5 rounded-lg border border-sp-highlight/40 bg-sp-highlight/5 p-3">
      <p className="text-xs font-bold text-sp-text">외부 AI로 학생 자료를 내보내기 전에</p>
      <p className="text-[0.7rem] leading-relaxed text-sp-muted">
        이 기능은 학생 평가에 쓰이는 ‘고영향 AI’에 해당할 수 있습니다. 인공지능기본법에 따라 교사는
        외부 AI 활용 사실을 학생·학부모에게 알려야 하고, 학생·학부모는 거부·설명을 요구할 권리가
        있습니다.{' '}
        <strong className="text-sp-text">
          쌤핀은 자료를 토큰으로 가려 전달할 뿐, 고지·동의를 대신하지 않습니다.
        </strong>{' '}
        생기부·채점의 모든 문장은 선생님이 직접 확인해야 합니다.
      </p>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-sp-accent"
        />
        <span className="text-[0.7rem] text-sp-text">
          위 내용을 확인했고, 학생·학부모 고지·동의는 교사 책임으로 진행하겠습니다.
        </span>
      </label>
      <div className="flex items-center gap-2">
        <a
          href={NOTICE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleNoticeClick}
          className="text-[0.7rem] font-medium text-sp-accent hover:underline"
        >
          고지문 양식 보기
        </a>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-sp-muted transition-colors hover:text-sp-text"
        >
          취소
        </button>
        <button
          type="button"
          disabled={!checked || busy}
          onClick={onConfirm}
          className="rounded-md bg-sp-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-sp-accent/90 disabled:pointer-events-none disabled:opacity-50"
        >
          켜기
        </button>
      </div>
    </div>
  );
}
