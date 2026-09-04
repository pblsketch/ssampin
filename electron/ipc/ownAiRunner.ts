/**
 * "내 AI로 실행" — CLI 실행·스트림 파싱·취소·활성 판정.
 *
 * ★S0 실측(2026-09-04)에서 확정한 것들. 고치기 전에 `S0-results.md` 를 볼 것:
 *
 * 1. **stdin 을 반드시 닫는다.** 안 닫으면 claude 는 3초를 버리고(경고 후 진행),
 *    codex 는 **무한 대기**한다(184초 타임아웃, 출력 0줄). 그래서 프롬프트를 파이프가 아니라
 *    인자로 넘기고 `stdio[0] = 'ignore'` 로 띄운다.
 *
 * 2. **`activeUntil` 은 대입만 한다.** `Math.max` 로 갱신하면 `max(Infinity, …)` 가 계속
 *    `Infinity` 라 실행이 끝나도 영원히 409 가 되어, 선생님이 다른 AI 앱에서 하는 저장까지
 *    앱 재시작 전까지 전부 막힌다.
 *
 * 3. **끝난 뒤 15초는 아직 활성이다.** 브릿지는 stdin 이 닫힌 뒤 진행 중이던 요청만 끝내고
 *    죽는데 그 상한이 12초다. 그 사이 도착하는 늦은 쓰기도 [실행] 없이 저장되면 안 된다.
 *
 * 4. **패널 실행은 capability 와 무관하게 활성으로 친다.** 쓰기 토글이 꺼진 채 시작한 실행
 *    도중에 선생님이 토글을 켜면, 브릿지는 호출마다 capability 를 다시 읽으므로 쓰기가
 *    열린다 — 그때 활성이 아니면 카드 없이 저장된다.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { graceUntil } from '../../src/domain/rules/ownAiWriteGate';
import {
  stripOwnAiEnv,
  buildClaudeArgv,
  buildCodexArgv,
  classifyOwnAiError,
} from '../../src/domain/rules/ownAiCliRules';
import type { OwnAiLaunch } from './ownAiCli';
import type {
  OwnAiProviderId,
  OwnAiRunEvent,
  OwnAiRunKind,
} from '../../src/domain/entities/OwnAiProvider';

export interface OwnAiBridgeEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface OwnAiRunRequest {
  readonly runId: string;
  readonly provider: OwnAiProviderId;
  readonly kind: OwnAiRunKind;
  readonly prompt: string;
  readonly model?: string;
  readonly appendSystemPrompt?: string;
  /** 패널에서만. claude 는 파일 경로, codex 는 엔트리를 `-c` 로 넘긴다. */
  readonly mcpConfigPath?: string;
  readonly bridge?: OwnAiBridgeEntry;
}

export interface OwnAiRunnerDeps {
  /** 어떻게 띄울지 — 실행 파일이거나, node 로 돌릴 스크립트다(`.cmd` 는 직접 못 띄운다). */
  readonly launch: (provider: OwnAiProviderId) => OwnAiLaunch | null;
  readonly version: (provider: OwnAiProviderId) => string | null;
  readonly cwd: string;
  readonly emit: (event: OwnAiRunEvent) => void;
  readonly platform: NodeJS.Platform;
  readonly now: () => number;
  readonly spawnChild: typeof spawn;
  readonly killTreeSync: (pid: number) => void;
}

interface ActiveRun {
  readonly child: ChildProcess;
  readonly kind: OwnAiRunKind;
  cancelled: boolean;
  finalized: boolean;
}

/**
 * 프로세스 트리를 통째로 죽인다 — 손자(브릿지)가 남으면 앱이 없는 줄 알고 파일을 직접 쓴다.
 *
 * ★반드시 **동기**여야 한다. `before-quit` 는 await 를 기다리지 않아서, 비동기로 죽이면
 * `will-quit` 의 `liveSyncHost.stop()`(control.json 삭제)이 먼저 끝나 버린다.
 *
 * 바깥 호출(taskkill·process.kill)은 주입할 수 있게 둔다 — ESM 에서는 node 내장 모듈의
 * export 를 스파이할 수 없어, 주입이 유일하게 테스트 가능한 방법이다.
 */
export interface KillTreeIo {
  readonly runSync: (file: string, argv: readonly string[]) => void;
  readonly killGroup: (pid: number) => void;
}

export function defaultKillTreeIo(): KillTreeIo {
  return {
    runSync: (file, argv) => {
      spawnSync(file, [...argv], { windowsHide: true });
    },
    killGroup: (pid) => process.kill(-pid, 'SIGKILL'),
  };
}

export function defaultKillTreeSync(
  pid: number,
  platform: NodeJS.Platform = process.platform,
  io: KillTreeIo = defaultKillTreeIo(),
): void {
  try {
    if (platform === 'win32') {
      io.runSync('taskkill', ['/PID', String(pid), '/T', '/F']);
      return;
    }
    // detached 로 띄웠으므로 프로세스 그룹째 보낸다.
    io.killGroup(pid);
  } catch {
    /* 이미 죽었으면 그만이다 */
  }
}

export function createOwnAiRunner(deps: OwnAiRunnerDeps) {
  const runs = new Map<string, ActiveRun>();

  /**
   * 쓰기 게이트가 보는 값. 기본 0(비활성).
   * 패널 실행이 시작되면 `Infinity`, 끝나면 `now + 15초` 를 **대입**한다.
   */
  let activeUntil = 0;

  function ownAiActiveUntil(): number {
    return activeUntil;
  }

  /** 패널 실행은 동시에 하나만. 두 개가 겹치면 활성값이 서로를 덮어쓴다. */
  function hasActivePanelRun(): boolean {
    for (const r of runs.values()) if (r.kind === 'panel') return true;
    return false;
  }

  function finalize(
    runId: string,
    run: ActiveRun,
    outcome: { stderr: string; text: string; exitCode: number | null; spawnErrorCode?: string },
  ): void {
    if (run.finalized) return;
    run.finalized = true;
    runs.delete(runId);

    if (run.kind === 'panel') {
      // ★대입이다. max 를 쓰면 실행 후에도 영원히 활성으로 남는다.
      activeUntil = graceUntil(deps.now());
    }

    if (run.cancelled) {
      deps.emit({ type: 'error', runId, kind: 'cancelled' });
      return;
    }
    if (outcome.exitCode === 0 && !outcome.spawnErrorCode) {
      deps.emit({ type: 'done', runId, text: outcome.text });
      return;
    }
    const kind = classifyOwnAiError({
      stderr: outcome.stderr,
      text: outcome.text,
      exitCode: outcome.exitCode,
      ...(outcome.spawnErrorCode === undefined ? {} : { spawnErrorCode: outcome.spawnErrorCode }),
    });
    deps.emit({ type: 'error', runId, kind });
  }

  function start(req: OwnAiRunRequest): { ok: boolean; kind?: 'not-installed' | 'busy' } {
    if (req.kind === 'panel' && hasActivePanelRun()) return { ok: false, kind: 'busy' };

    const launch = deps.launch(req.provider);
    if (!launch) {
      deps.emit({ type: 'error', runId: req.runId, kind: 'not-installed' });
      return { ok: false, kind: 'not-installed' };
    }

    const argv =
      req.provider === 'claude'
        ? buildClaudeArgv({
            kind: req.kind,
            prompt: req.prompt,
            ...(req.mcpConfigPath === undefined ? {} : { mcpConfigPath: req.mcpConfigPath }),
            ...(req.model === undefined ? {} : { model: req.model }),
            ...(req.appendSystemPrompt === undefined
              ? {}
              : { appendSystemPrompt: req.appendSystemPrompt }),
            version: deps.version(req.provider),
          })
        : buildCodexArgv({
            kind: req.kind,
            prompt: req.prompt,
            cwd: deps.cwd,
            ...(req.model === undefined ? {} : { model: req.model }),
            ...(req.bridge === undefined ? {} : { bridge: req.bridge }),
            ...(req.appendSystemPrompt === undefined
              ? {}
              : { appendSystemPrompt: req.appendSystemPrompt }),
          });

    const prev = activeUntil;
    // ★spawn 직전에 대입한다 — 자식은 살아 있는데 게이트가 아직 안 켜진 창을 0으로 만든다.
    if (req.kind === 'panel') activeUntil = Number.POSITIVE_INFINITY;

    let child: ChildProcess;
    try {
      child = deps.spawnChild(launch.file, [...launch.args, ...argv], {
        cwd: deps.cwd,
        // node 스크립트로 띄우는 경우에만 Electron 을 node 모드로 돌린다.
        // ★API 키는 뺀다 — 있으면 CLI 가 구독 대신 그 키로 붙어 따로 청구된다(UltraQA P2).
        env: {
          ...stripOwnAiEnv(process.env),
          ...(launch.asNode ? { ELECTRON_RUN_AS_NODE: '1', MCP_TIMEOUT: '45000' } : {}),
        },
        // ★stdin 을 닫는다. 안 닫으면 codex 는 영원히 기다린다(실측).
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // 프로세스 그룹을 만들어야 손자까지 죽일 수 있다(win32 는 taskkill /T 를 쓴다).
        detached: deps.platform !== 'win32',
      });
    } catch (e) {
      activeUntil = prev; // 못 띄웠으면 되돌린다
      const code = (e as { code?: string }).code;
      deps.emit({
        type: 'error',
        runId: req.runId,
        kind: classifyOwnAiError(code === undefined ? {} : { spawnErrorCode: code }),
      });
      return { ok: false, kind: 'not-installed' };
    }

    const run: ActiveRun = { child, kind: req.kind, cancelled: false, finalized: false };
    runs.set(req.runId, run);
    deps.emit({ type: 'started', runId: req.runId });

    const parse = req.provider === 'claude' ? parseClaudeLine : parseCodexLine;
    let stderr = '';
    let text = '';
    let buffer = '';

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        for (const ev of parse(line, req.runId)) {
          if (ev.type === 'delta') text += ev.text;
          if (ev.type === 'done') text = ev.text;
          if (ev.type !== 'done') deps.emit(ev);
        }
        nl = buffer.indexOf('\n');
      }
    });

    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      // stderr 는 마지막 꼬리만 들고 있는다 — 오류 분류에 필요한 만큼.
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    child.on('error', (e) => {
      const code = (e as Error & { code?: string }).code;
      finalize(req.runId, run, {
        stderr,
        text,
        exitCode: null,
        ...(code === undefined ? {} : { spawnErrorCode: code }),
      });
    });
    child.on('close', (code) => {
      finalize(req.runId, run, { stderr, text, exitCode: code });
    });

    return { ok: true };
  }

  function cancel(runId: string): void {
    const run = runs.get(runId);
    if (!run) return;
    run.cancelled = true;
    const pid = run.child.pid;
    if (pid !== undefined) deps.killTreeSync(pid);
  }

  /**
   * 앱이 닫힐 때 **동기로** 전부 죽인다.
   *
   * ★`before-quit` 는 await 를 기다리지 않는다. 비동기로 죽이면 `will-quit` 의
   * `liveSyncHost.stop()`(control.json 삭제)이 먼저 끝나, 남은 자식이 "앱이 없다"고 보고
   * 파일을 직접 쓸 수 있다. `storageLocation` 의 `app.exit(0)` 경로에서도 같은 이유로 쓴다.
   */
  function cancelAllSync(): void {
    for (const [runId, run] of runs) {
      run.cancelled = true;
      const pid = run.child.pid;
      if (pid !== undefined) deps.killTreeSync(pid);
      run.finalized = true;
      runs.delete(runId);
    }
    // ★0 이 아니라 **유예창**이다. 이 함수는 앱 종료뿐 아니라 `uncaughtException` 에서도
    //   불리는데, 그때 앱은 안 죽을 수 있다. 0 으로 두면 방금 죽인 자식이 보낸 늦은 쓰기가
    //   다음 15초 안에 게이트를 그냥 지나간다(UltraQA P1). 종료 경로에서는 어차피 무해하다.
    activeUntil = graceUntil(deps.now());
  }

  return { start, cancel, cancelAllSync, ownAiActiveUntil, hasActivePanelRun };
}

export type OwnAiRunner = ReturnType<typeof createOwnAiRunner>;

/** claude `--output-format stream-json` 한 줄 → 이벤트들. 모르는 줄은 조용히 버린다. */
export function parseClaudeLine(line: string, runId: string): readonly OwnAiRunEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const type = msg['type'];

  if (type === 'stream_event') {
    const event = msg['event'] as
      | { type?: string; delta?: { type?: string; text?: string } }
      | undefined;
    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const t = event.delta.text ?? '';
      return t ? [{ type: 'delta', runId, text: t }] : [];
    }
    return [];
  }

  if (type === 'assistant') {
    const content = (msg['message'] as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) return [];
    const out: OwnAiRunEvent[] = [];
    for (const block of content) {
      const b = block as { type?: string; name?: string };
      if (b.type === 'tool_use' && typeof b.name === 'string') {
        out.push({ type: 'tool', runId, tool: b.name });
      }
    }
    return out;
  }

  if (type === 'rate_limit_event') {
    const info = msg['rate_limit_info'] as
      | { unifiedWindows?: { five_hour?: { utilization?: number; resetsAt?: number } } }
      | undefined;
    const five = info?.unifiedWindows?.five_hour;
    return [
      {
        type: 'usage',
        runId,
        fiveHourUtilization: typeof five?.utilization === 'number' ? five.utilization : null,
        resetsAt: typeof five?.resetsAt === 'number' ? five.resetsAt : null,
      },
    ];
  }

  if (type === 'result') {
    const result = msg['result'];
    return [{ type: 'done', runId, text: typeof result === 'string' ? result : '' }];
  }

  return [];
}

/**
 * codex `exec --json` 한 줄(JSONL) → 이벤트들.
 *
 * ★`item.type === 'error'` 는 **치명적이지 않다** — 스킬 예산 경고도 이 모양으로 온다(실측).
 * 그래서 여기서 오류로 올리지 않는다. 실패 판정은 종료 코드가 한다.
 */
export function parseCodexLine(line: string, runId: string): readonly OwnAiRunEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (msg['type'] !== 'item.completed') return [];

  const item = msg['item'] as
    | { type?: string; text?: string; tool?: string; server?: string }
    | undefined;
  if (item?.type === 'mcp_tool_call' && typeof item.tool === 'string') {
    return [{ type: 'tool', runId, tool: item.tool }];
  }
  if (item?.type === 'agent_message' && typeof item.text === 'string') {
    // codex 는 델타를 주지 않는다 — 완성된 메시지가 통째로 온다.
    return [{ type: 'delta', runId, text: item.text }];
  }
  return [];
}
