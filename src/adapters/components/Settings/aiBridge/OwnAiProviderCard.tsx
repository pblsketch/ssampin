/**
 * 내 AI로 실행 — 공급자 한 장(Claude Code 또는 Codex)
 *
 * 연결 상태 4가지를 한 카드가 그린다. **판정 순서가 곧 안내 순서다** —
 * 없으면 "설치", 있는데 버전이 낮으면 "업데이트", 버전은 되는데 로그인이 없으면 "로그인".
 *
 * ★쌤핀 화면에 **로그인 입력란도 API 키 칸도 만들지 않는다.**
 *   설치는 각 회사의 공식 명령을 새 터미널에서 대신 실행해 주고, 로그인은 CLI 자체 명령을
 *   띄워 브라우저에서 끝내게 한다. 쌤핀은 결과 상태만 읽는다(ADR-082 결정 3).
 * ★로고·상표를 쓰지 않고 평문 이름만 쓴다(약관).
 */
import { useState } from 'react';

import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusStore, isOwnAiConnected } from '@adapters/stores/useOwnAiStatusStore';
import { OWN_AI_PROVIDER_LABELS, type OwnAiProviderId } from '@domain/entities/OwnAiProvider';
import { useOwnAiModelCatalog } from '@adapters/hooks/useOwnAiModelCatalog';

interface Props {
  readonly provider: OwnAiProviderId;
}

/** 상태 한 줄 — 색만으로 뜻을 전하지 않게 점 + 글자를 함께 쓴다. */
function StatusLine({ tone, text }: { readonly tone: 'ok' | 'wait'; readonly text: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-sm text-sp-muted">
      <span
        aria-hidden="true"
        className={[
          'inline-block h-1.5 w-1.5 rounded-full',
          tone === 'ok' ? 'bg-sp-accent' : 'bg-sp-muted',
        ].join(' ')}
      />
      {text}
    </p>
  );
}

export function OwnAiProviderCard({ provider }: Props) {
  const label = OWN_AI_PROVIDER_LABELS[provider];
  const connection = useOwnAiStatusStore((s) => s.connections[provider]);
  const refreshOne = useOwnAiStatusStore((s) => s.refreshOne);
  // 서버가 준 최신 모델 목록. 못 받으면 앱 기본값이 그대로 온다(빈 목록이 되지 않는다).
  const modelCatalog = useOwnAiModelCatalog(true);
  const setConnection = useOwnAiStatusStore((s) => s.setConnection);
  const model = useAssistStore((s) => s.ownAiModels[provider]);
  const setOwnAiModel = useAssistStore((s) => s.setOwnAiModel);
  const setProvider = useAssistStore((s) => s.setProvider);
  const storeProvider = useAssistStore((s) => s.provider);

  /** 지금 진행 중인 동작. 버튼을 두 번 누르는 것과 "아무 반응 없음"을 함께 막는다. */
  const [busy, setBusy] = useState<null | 'install' | 'login' | 'logout' | 'check'>(null);

  const api = window.electronAPI?.ownAi;
  const state = connection?.state ?? null;

  const run = async (
    kind: 'install' | 'login' | 'logout' | 'check',
    action: () => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const onInstall = (): void =>
    void run('install', async () => {
      await api?.install(provider);
      // 설치는 터미널에서 끝난다 — 여기서 결과를 기다리지 않고 [다시 확인]을 안내한다.
    });

  const onLogin = (): void =>
    void run('login', async () => {
      const next = await api?.login(provider);
      if (next) setConnection(next);
    });

  const onLogout = (): void =>
    void run('logout', async () => {
      const next = await api?.logout(provider);
      if (next) setConnection(next);
      // 이 공급자로 답하고 있었다면 쌤핀 AI 로 되돌린다 — 끊긴 통로를 가리키지 않게.
      if (storeProvider === provider) setProvider('ssampin');
    });

  const onCheck = (): void => void run('check', () => refreshOne(provider));

  const onModelChange = (value: string): void => {
    setOwnAiModel(provider, value);
    void api?.setModel(provider, value);
  };

  return (
    <div className="rounded-xl border border-sp-border bg-sp-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-sp-semibold text-sp-text">{label}</h4>

          {state === null && <StatusLine tone="wait" text="확인 중이에요…" />}
          {state === 'not-installed' && <StatusLine tone="wait" text="아직 설치되지 않았어요." />}
          {state === 'not-signed-in' && (
            <StatusLine tone="wait" text="설치됐어요. 로그인이 필요해요." />
          )}
          {connection?.state === 'version-unsupported' && (
            <StatusLine
              tone="wait"
              text={`설치된 버전(${connection.version})이 아직 맞지 않아요. ${connection.supportedRange} 이 필요해요.`}
            />
          )}
          {isOwnAiConnected(connection) && (
            <StatusLine tone="ok" text={`연결됨 · ${connection.version}`} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {state === 'not-installed' && (
            <button
              type="button"
              onClick={onInstall}
              disabled={busy !== null}
              className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg disabled:opacity-60"
            >
              설치하기
            </button>
          )}
          {state === 'not-signed-in' && (
            <button
              type="button"
              onClick={onLogin}
              disabled={busy !== null}
              className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg disabled:opacity-60"
            >
              {busy === 'login' ? '로그인 중…' : '로그인'}
            </button>
          )}
          {isOwnAiConnected(connection) && (
            <button
              type="button"
              onClick={onLogout}
              disabled={busy !== null}
              className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text disabled:opacity-60"
            >
              연결 해제
            </button>
          )}
          <button
            type="button"
            onClick={onCheck}
            disabled={busy !== null}
            className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text disabled:opacity-60"
          >
            {busy === 'check' ? '확인 중…' : '다시 확인'}
          </button>
        </div>
      </div>

      {state === 'not-installed' && busy === 'install' && (
        <p className="mt-3 rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-xs text-sp-muted">
          새 터미널 창에서 설치가 진행돼요. 끝나면 [다시 확인]을 눌러 주세요.
        </p>
      )}

      {state === 'not-signed-in' && (
        <p className="mt-3 rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-xs text-sp-muted">
          [로그인]을 누르면 {label} 이 브라우저를 엽니다. 쌤핀은 로그인 정보를 보지도, 저장하지도
          않아요.
        </p>
      )}

      {connection?.state === 'version-unsupported' && (
        <p className="mt-3 rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-xs text-sp-muted">
          터미널에서 {label} 을 최신으로 올린 뒤 [다시 확인]을 눌러 주세요.
        </p>
      )}

      {isOwnAiConnected(connection) && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-sp-muted">모델</span>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-sm text-sp-text"
          >
            {modelCatalog[provider].map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {api === undefined && (
        <p className="mt-3 text-xs text-sp-muted">이 기능은 쌤핀 데스크톱 앱에서만 쓸 수 있어요.</p>
      )}
    </div>
  );
}
