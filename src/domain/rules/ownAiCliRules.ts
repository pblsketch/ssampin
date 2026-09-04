/**
 * "내 AI로 실행" — CLI 실행 규칙(순수).
 *
 * argv 는 **추측이 아니라 실측**으로 정했다(2026-09-04, claude 2.1.258 / codex 0.144.4).
 * 원자료: `E:\test\ssampin-own-ai-spike\S0-results.md`
 *
 * ★실측에서 뒤집힌 것 두 가지 — 고치지 말 것:
 *
 * 1. **`--disallowedTools` 로 막으면 샌다.** 블랙리스트라서, 나열하지 않은 내장 도구
 *    (`CronCreate`, `ListAgents`, `Monitor`, `ScheduleWakeup` 등 12개 이상)가 모델에게 그대로
 *    보였다. `--allowedTools` 는 *자동 승인* 목록이지 *가용 목록*이 아니다.
 *    → `--tools ''`(내장 도구 전부 제거) + `--restricted`(사용자·프로젝트 설정과 훅 무시).
 *    실측 A/B: 34.3초·3턴·훅 7건 → **15.6초·2턴·훅 0건**, 도구 72개 → 54개(브릿지만).
 *
 * 2. **stdin 을 닫지 않으면 멈춘다.** claude 는 3초를 버리고(경고 후 진행),
 *    codex 는 **무한 대기**한다(실측 184초 타임아웃, 출력 0줄). 러너는 stdin 을 반드시 닫는다.
 *
 * ★`--bare` 금지: CLI `--help` 원문이 "Anthropic auth is strictly ANTHROPIC_API_KEY …
 *   (OAuth and keychain are never read)" 라, 구독 로그인을 아예 안 읽는다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type {
  OwnAiErrorKind,
  OwnAiModelOption,
  OwnAiProviderId,
  OwnAiRunKind,
} from '../entities/OwnAiProvider';

/** MCP 서버 이름. 도구는 `mcp__<이름>__<도구>` 로 노출된다(실측 확인). */
export const OWN_AI_MCP_SERVER_NAME = 'ssampin';

/**
 * 브릿지 도구 자동 승인 패턴.
 *
 * ★`get_*` 같은 접두사 필터를 쓰면 안 된다 — 읽기 도구가 `list_classes`·`list_students`·
 * `check_record_draft` 처럼 다른 동사로도 시작한다(실측 54개 확인).
 * 쓰기 도구까지 포함해 전부 허용하되, **실제 저장은 앱의 쓰기 게이트가 막는다**(ADR-082 C3′).
 */
export const OWN_AI_ALLOWED_TOOLS = `mcp__${OWN_AI_MCP_SERVER_NAME}__*`;

/**
 * 지원 버전 창.
 *
 * 하한: 이 아래는 실측한 적이 없다. 상한: 없음(열어 둔다) — 대신 인증 오류가 나면
 * `version` 후보로 분류해 "업데이트가 필요할 수 있다"고 안내한다.
 * ★`--permission-prompts` 는 2.1.259 부터 생겼다(2.1.258 에는 옵션 자체가 없어 거부된다).
 */
export const OWN_AI_VERSION_FLOOR: Readonly<Record<OwnAiProviderId, string>> = {
  claude: '2.1.200',
  codex: '0.140.0',
};

/**
 * 자식 프로세스 env 에서 **빼는** 변수.
 *
 * ★선생님 PC 에 이 변수가 있으면 CLI 는 구독 로그인 대신 그 키로 붙는다 — 그러면 "이미 내고
 * 있는 구독"이 아니라 **종량제 API 로 따로 청구**된다. 쌤핀은 새 비용을 만들지 않기로 했다
 * (오너 결정, ADR-082). 키를 읽지도 쓰지도 않고, 그냥 자식에게 보이지 않게 한다(UltraQA P2).
 * 베드록·버텍스 전환 스위치도 같은 이유로 뺀다 — 구독이 아닌 다른 청구 경로다.
 */
export const OWN_AI_STRIPPED_ENV: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
];

/** `env` 에서 위 변수를 뺀 사본. 원본은 건드리지 않는다. */
export function stripOwnAiEnv<T extends Record<string, string | undefined>>(env: T): T {
  const out = { ...env };
  for (const k of OWN_AI_STRIPPED_ENV) delete out[k];
  return out;
}

/** `--permission-prompts none` 을 붙일 수 있는 최소 버전(claude 전용). */
export const CLAUDE_PERMISSION_PROMPTS_MIN = '2.1.259';

export const OWN_AI_MODELS: Readonly<Record<OwnAiProviderId, readonly OwnAiModelOption[]>> = {
  claude: [
    { id: '', label: '기본 (권장)' },
    { id: 'sonnet', label: 'Sonnet — 빠름' },
    { id: 'opus', label: 'Opus — 꼼꼼함' },
    { id: 'haiku', label: 'Haiku — 가장 빠름' },
  ],
  codex: [
    { id: '', label: '기본 (권장)' },
    { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
  ],
};

/** 오류 갈래 → 선생님에게 보여줄 한국어. 패널과 생기부는 이어지는 안내가 달라 따로 둔다. */
export const OWN_AI_ERROR_MESSAGES: Readonly<
  Record<OwnAiErrorKind, { readonly panel: string; readonly draft: string }>
> = {
  'not-installed': {
    panel: '내 AI 가 아직 설치되지 않았어요. 설정 > AI 연결에서 설치할 수 있어요.',
    draft:
      '생기부 초안은 선생님 구독 AI 로만 만들 수 있어요. 설정 > AI 연결에서 먼저 연결해 주세요.',
  },
  'not-signed-in': {
    panel: '내 AI 에 로그인이 필요해요. 설정 > AI 연결에서 로그인해 주세요.',
    draft: '내 AI 에 로그인이 필요해요. 설정 > AI 연결에서 로그인한 뒤 다시 눌러 주세요.',
  },
  version: {
    panel: '설치된 버전이 아직 맞지 않아요. 업데이트한 뒤 다시 시도해 주세요.',
    draft: '설치된 버전이 아직 맞지 않아요. 업데이트한 뒤 다시 시도해 주세요.',
  },
  'model-unavailable': {
    panel: '고른 모델을 지금 구독으로는 쓸 수 없어요. 기본 모델로 바꿔 볼까요?',
    draft: '고른 모델을 지금 구독으로는 쓸 수 없어요. 기본 모델로 바꿔 주세요.',
  },
  'usage-limit': {
    panel: '구독 사용량 한도에 닿았어요. 쌤핀 AI 로 이어서 답할까요?',
    draft: '구독 사용량 한도에 닿았어요. 잠시 뒤에 이어 할 수 있어요.',
  },
  'mcp-boot': {
    panel: '쌤핀 자료를 잇는 통로가 열리지 않았어요. 잠시 뒤 다시 시도해 주세요.',
    draft: '내 AI 를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  },
  'write-server-unavailable': {
    panel:
      '저장 준비에 실패해서 실행하지 않았어요. 다시 시도하거나, 설정 > AI 연결에서 쓰기를 끄면 조회만 할 수 있어요.',
    draft: '내 AI 를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  },
  'prompt-unavailable': {
    panel: '지금은 이 기능을 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    draft:
      '생기부 작성 규정을 서버에서 받아오지 못해 초안을 만들지 않았어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요.',
  },
  cancelled: { panel: '중단했어요.', draft: '중단했어요.' },
  crashed: {
    panel: '내 AI 실행이 도중에 멈췄어요.',
    draft: '내 AI 실행이 도중에 멈췄어요. 다시 시도해 주세요.',
  },
};

/**
 * 실패했을 때 쌤핀 AI 가 대신 답해도 되는가.
 *
 * ★`cancelled` 만 안 된다. 선생님이 [중단]을 눌렀는데 곧바로 다른 데로 같은 질문을 보내면,
 * 그건 멈춘 게 아니라 **다른 곳으로 보낸** 것이다. 나머지(설치 안 됨·로그인 없음·한도 등)는
 * "그래도 답은 받고 싶다"가 자연스러운 상황이라 넘긴다.
 */
export function canFallbackToSolar(kind: OwnAiErrorKind): boolean {
  return kind !== 'cancelled';
}

/** "2.1.258 (Claude Code)" · "codex-cli 0.144.4" 처럼 섞여 오는 출력에서 첫 버전을 뽑는다. */
export function parseCliVersion(output: string): string | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function toParts(v: string): readonly number[] {
  return v.split('.').map((p) => Number.parseInt(p, 10) || 0);
}

/** a >= b 인가. 자리수가 달라도 짧은 쪽을 0 으로 채워 비교한다. */
export function isVersionAtLeast(a: string, b: string): boolean {
  const x = toParts(a);
  const y = toParts(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

export function isVersionSupported(provider: OwnAiProviderId, version: string | null): boolean {
  if (!version) return false;
  return isVersionAtLeast(version, OWN_AI_VERSION_FLOOR[provider]);
}

/** 지원 범위를 사람이 읽는 문장으로. */
export function supportedRangeLabel(provider: OwnAiProviderId): string {
  return `${OWN_AI_VERSION_FLOOR[provider]} 이상`;
}

/**
 * 오류 분류. 실행 산출물(stderr·마지막 텍스트·종료 코드)을 함께 본다.
 *
 * 실측한 문자열을 근거로 삼는다:
 * - 없는 모델(claude): stderr `[claude-code:unrecognized_model] {"model":"…"}` · exit 1
 * - codex 의 `item.type === 'error'` 는 **치명적이지 않다**(스킬 예산 경고도 여기로 온다) —
 *   그래서 이 함수는 `item.error` 를 입력으로 받지 않고 종료 코드·stderr 만 본다.
 */
export function classifyOwnAiError(input: {
  readonly stderr?: string;
  readonly text?: string;
  readonly exitCode?: number | null;
  readonly spawnErrorCode?: string;
  readonly cancelled?: boolean;
}): OwnAiErrorKind {
  if (input.cancelled) return 'cancelled';
  if (input.spawnErrorCode === 'ENOENT') return 'not-installed';

  const hay = `${input.stderr ?? ''}\n${input.text ?? ''}`.toLowerCase();

  if (hay.includes('unrecognized_model') || hay.includes('model not found')) {
    return 'model-unavailable';
  }
  if (
    hay.includes('rate limit') ||
    hay.includes('rate_limit') ||
    hay.includes('usage limit') ||
    hay.includes('quota')
  ) {
    return 'usage-limit';
  }
  if (
    hay.includes('not signed in') ||
    hay.includes('not logged in') ||
    hay.includes('unauthorized') ||
    hay.includes('authentication_failed') ||
    hay.includes('oauth_org_not_allowed') ||
    hay.includes('invalid api key') ||
    hay.includes('401') ||
    hay.includes('403')
  ) {
    return 'not-signed-in';
  }
  if (hay.includes('mcp') && (hay.includes('failed to connect') || hay.includes('timed out'))) {
    return 'mcp-boot';
  }
  return 'crashed';
}

/** `rate_limit_event` 가 "이제 못 쓴다"고 말하는가. */
export function isUsageBlocked(status: string | undefined): boolean {
  return status !== undefined && status !== 'allowed';
}

export interface ClaudeArgvOptions {
  readonly kind: OwnAiRunKind;
  readonly prompt: string;
  /** 브릿지 MCP 설정 파일 경로. `panel` 에서만 넘긴다. */
  readonly mcpConfigPath?: string;
  /** 빈 문자열이면 붙이지 않는다(CLI 기본 모델). */
  readonly model?: string;
  /** 시스템 프롬프트 뒤에 덧붙일 지시 + 대응 힌트. */
  readonly appendSystemPrompt?: string;
  /** 설치된 CLI 버전 — `--permission-prompts` 를 붙일지 정한다. */
  readonly version?: string | null;
}

/**
 * claude argv. **프롬프트는 argv 가 아니라 `-p <프롬프트>` 로 넘긴다.**
 * (stdin 은 닫아야 하므로 파이프로 넣지 않는다.)
 */
export function buildClaudeArgv(o: ClaudeArgvOptions): readonly string[] {
  const argv: string[] = [
    '-p',
    o.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    // 내장 도구를 전부 없앤다. MCP 도구는 별개라 그대로 남는다(실측).
    '--tools',
    '',
    // 사용자·프로젝트·로컬 설정 파일과 훅을 무시한다(실측: 훅 7건 → 0건).
    '--restricted',
    '--permission-mode',
    'dontAsk',
    // 대화 기록을 디스크에 남기지 않는다 — 별칭 텍스트라도 남기지 않는다.
    '--no-session-persistence',
  ];

  if (o.kind === 'panel' && o.mcpConfigPath) {
    argv.push('--mcp-config', o.mcpConfigPath, '--strict-mcp-config');
    argv.push('--allowedTools', OWN_AI_ALLOWED_TOOLS);
  }
  if (o.version && isVersionAtLeast(o.version, CLAUDE_PERMISSION_PROMPTS_MIN)) {
    argv.push('--permission-prompts', 'none');
  }
  if (o.model) argv.push('--model', o.model);
  if (o.appendSystemPrompt) argv.push('--append-system-prompt', o.appendSystemPrompt);
  return argv;
}

export interface CodexArgvOptions {
  readonly kind: OwnAiRunKind;
  readonly prompt: string;
  readonly cwd: string;
  readonly model?: string;
  /**
   * 시스템 프롬프트 뒤에 덧붙일 지시 + 대응 힌트.
   *
   * ★codex 에는 claude 의 `--append-system-prompt` 에 해당하는 옵션이 없다. 파일로 넘기는
   * 길(`experimental_instructions_file`)은 있지만, 생기부 작성 규정을 디스크에 쓰지 않기로
   * 했으므로(D7) 쓰지 않는다. 그래서 **프롬프트 맨 앞에 붙여** 보낸다.
   */
  readonly appendSystemPrompt?: string;
  /** 브릿지 실행 정보. `panel` 에서만 넘긴다. */
  readonly bridge?: {
    readonly command: string;
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
  };
}

/** TOML 문자열 리터럴로 감싼다. 역슬래시·따옴표만 이스케이프하면 된다. */
function toml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** codex argv. 프롬프트는 위치 인자로 넘긴다(stdin 을 닫아야 하므로). */
export function buildCodexArgv(o: CodexArgvOptions): readonly string[] {
  const argv: string[] = [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '-C',
    o.cwd,
    '-s',
    'read-only',
    // ~/.codex/config.toml 을 무시한다. 인증(auth.json)은 그대로 살아 있다(실측 확인).
    '--ignore-user-config',
  ];
  if (o.model) argv.push('-m', o.model);
  if (o.kind === 'panel' && o.bridge) {
    const key = `mcp_servers.${OWN_AI_MCP_SERVER_NAME}`;
    const args = o.bridge.args.map(toml).join(',');
    const env = Object.entries(o.bridge.env)
      .map(([k, v]) => `${k}=${toml(v)}`)
      .join(',');
    argv.push('-c', `${key}.command=${toml(o.bridge.command)}`);
    argv.push('-c', `${key}.args=[${args}]`);
    argv.push('-c', `${key}.env={${env}}`);
  }
  // ★붙이는 자리가 맨 앞인 이유: 규정은 "이 조건으로 써라"라서 재료보다 먼저 와야 한다.
  //   claude 는 시스템 자리에 들어가므로 이미 앞이다 — 두 CLI 의 순서를 맞춘다.
  argv.push(o.appendSystemPrompt ? `${o.appendSystemPrompt}\n\n---\n\n${o.prompt}` : o.prompt);
  return argv;
}
