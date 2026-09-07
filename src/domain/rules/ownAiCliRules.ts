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
 *    ★이건 "열어 둔 채 아무것도 안 준" 경우다. **써 넣고 `end()` 로 닫는 것은 다른 경우이고,
 *    정상 동작한다**(2026-09-07 실측: claude 2.1.258 텍스트만 stdin → exit 0·7초).
 *    지금은 프롬프트를 **stdin 으로 넘기는 쪽이 기본**이다 — 명령줄에 학생 근거 본문이
 *    실리지 않게 하기 위해서다(ADR-089 후속 6). `buildClaudeArgv` 주석 참조.
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

/**
 * codex 가 프롬프트를 **stdin 으로** 받게 할 수 있는 최소 버전(`codex exec … -`).
 *
 * ★**실측한 버전만 적는다.** 0.153.4 에서 완주를 확인했다(2026-09-07: exit 0 · 6초 ·
 *   `turn.completed` · 응답 도착). `--help` 원문도 *"If not provided as an argument
 *   (or if `-` is used), instructions are read from stdin"* 이라고 말한다.
 * ★그 아래 버전은 **확인한 적이 없다.** 안 되면 `-` 를 프롬프트 글자로 읽어 엉뚱한 답을
 *   내놓을 수 있는데 그건 조용한 오작동이라 더 나쁘다 → 옛 경로(위치 인자)로 둔다.
 * ★**`OWN_AI_VERSION_FLOOR` 를 올리지 않는다.** 하한을 올리면 구버전 선생님은 명령줄 노출이
 *   남는 게 아니라 **코덱스로 아무것도 못 하게** 된다. 여기서 갈라 주는 것이 옳다
 *   (`CLAUDE_PERMISSION_PROMPTS_MIN` 과 같은 모양).
 */
export const CODEX_STDIN_MIN = '0.153.4';

/**
 * 모델 목록의 **기본값(폴백)**. 평소에는 서버가 준 목록을 쓰고(`AiModelCatalogClient`),
 * 서버를 못 받았을 때만 이 값이 쓰인다.
 *
 * ★**실제 모델 이름을 쓴다**(별칭이 아니라). 선생님이 무엇으로 쓰는지 보이게 하려면
 * 화면에 판(버전)이 나와야 한다는 오너 결정(2026-09-06). 별칭(`opus`)은 최신을 따라가지만
 * 화면에 "Opus"라고만 뜨고 몇 판인지 알 수 없다.
 * → 새 모델이 나오면 **서버 목록만 갱신**한다. 앱 배포는 필요 없다.
 *
 * ★목록은 **실제로 되는 것만** 올린다. 두 CLI 로 하나씩 돌려 확인했다(2026-09-06):
 *   claude-fable-5-1 · claude-opus-5 · claude-haiku-4-5 / gpt-6-astra · gpt-5.6-sol ·
 *   gpt-5.4-mini 전부 응답 확인. 누르면 실패하는 항목을 두면 안 된다.
 *
 * ★한때 codex 목록에 `gpt-5.3-codex-spark` 가 있었는데 **실제로는 거부되는 이름**이었다.
 *   바이너리 문자열만 보고 넣었던 탓이다 — 반드시 돌려 보고 넣을 것.
 *
 * ★라벨은 **모델명만** 적는다(오너 결정 2026-09-06, ADR-085 보강 2 R4). "가장 강력함" 같은
 *   부연 설명을 붙이지 않는다. `기본 (권장)` 은 모델명이 아니라 "고르지 않음"이라 예외다.
 *   서버 목록(`supabase/functions/ssampin-ai-models`)도 같은 규칙이다.
 */
export const OWN_AI_MODELS: Readonly<Record<OwnAiProviderId, readonly OwnAiModelOption[]>> = {
  claude: [
    { id: '', label: '기본 (권장)' },
    { id: 'claude-fable-5-1', label: 'Fable 5.1' },
    { id: 'claude-opus-5', label: 'Opus 5' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  ],
  codex: [
    { id: '', label: '기본 (권장)' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
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
  // ★위 문구는 원인을 "인터넷"으로 단정한다 — 한도에 걸린 경우에는 틀린 안내이고,
  //   그대로 두면 선생님이 인터넷을 의심해 계속 다시 눌러 요청이 더 몰린다(ADR-089).
  'prompt-rate-limited-minute': {
    panel: '지금 요청이 몰렸어요. 1분 뒤에 다시 시도해 주세요.',
    draft: '지금 요청이 몰렸어요. 1분 뒤에 다시 눌러 주세요.',
  },
  'prompt-rate-limited-day': {
    panel: '오늘 받을 수 있는 횟수를 다 썼어요. 내일 다시 시도해 주세요.',
    draft: '오늘은 작성 규정을 받아올 수 있는 횟수를 다 썼어요. 내일 다시 눌러 주세요.',
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
  /**
   * 프롬프트를 argv 가 아니라 **stdin 의 stream-json 메시지**로 넘긴다.
   * 이때 `o.prompt` 는 argv 에 실리지 않는다 — `buildClaudeStdinMessage` 가 만든 한 줄을
   * 실행기가 stdin 에 쓰고 바로 닫는다.
   *
   * ★**러너는 claude 에 항상 이 값을 켠다**(ADR-089 후속 6). 처음엔 이미지 첨부 때만
   *   켰는데(ADR-090), 첨부가 없어도 같은 경로가 그대로 동작한다 — 그래서 **프롬프트가
   *   명령줄에 실릴 이유가 없어졌다.** 아래 `buildClaudeArgv` 주석 참조.
   */
  readonly promptViaStdin?: boolean;
}

/**
 * claude argv.
 *
 * ★**프롬프트를 argv 에 싣지 않는다**(`promptViaStdin`, ADR-089 후속 6).
 *   윈도우에서 명령줄은 다른 프로세스가 읽을 수 있고(작업 관리자 "명령줄" 열,
 *   `Get-CimInstance Win32_Process`, 백신·EDR 텔레메트리), 여기 실리는 것은 규정만이
 *   아니라 **선생님이 넣은 학생 근거 본문**이다. 이름 가림은 그 반 명단 안에서만 작동하므로
 *   **다른 반 학생 이름은 가려지지 않은 채** 명령줄에 실릴 수 있었다.
 *   → `-p --input-format stream-json` 으로 바꾸고 메시지 한 줄을 stdin 에 쓴 뒤 **즉시 닫는다.**
 *
 * ★실측(2026-09-07, claude 2.1.258): 첨부 **없이** 텍스트만 stdin 으로 넘겨도 정상 동작한다
 *   (exit 0, 7초, 응답 도착). 파일 머리말 2번의 "stdin 을 닫지 않으면 멈춘다"는 **열어 둔 채
 *   아무것도 안 준** 경우이고, 써 넣고 `end()` 로 닫는 것은 다른 경우다.
 *
 * ★`promptViaStdin` 이 꺼져 있으면 옛 경로(`-p <프롬프트>`)를 그대로 쓴다 — 테스트와
 *   되돌리기를 위해 남겨 둔다.
 */
export function buildClaudeArgv(o: ClaudeArgvOptions): readonly string[] {
  const argv: string[] = [
    '-p',
    ...(o.promptViaStdin ? ['--input-format', 'stream-json'] : [o.prompt]),
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
  /**
   * 첨부 이미지의 임시 파일 경로(실행기가 풀어 놓은 것). `-i <경로>` 로 붙인다.
   *
   * ★`-i` 는 여러 값을 받는 옵션이라 **프롬프트보다 앞에, 다른 옵션 사이에** 둔다.
   *   맨 뒤에 두면 위치 인자인 프롬프트까지 이미지 파일로 먹고 "No prompt provided" 로
   *   죽는다(2026-09-07 실측, 0.153.4).
   */
  readonly imagePaths?: readonly string[];
  /**
   * 프롬프트를 argv 가 아니라 **stdin** 으로 넘긴다(`codex exec … -`).
   * 러너가 `buildCodexStdinText` 로 만든 글을 stdin 에 쓰고 **즉시 닫는다.**
   * 켤지 말지는 설치 버전이 정한다 — `CODEX_STDIN_MIN` 참조.
   */
  readonly promptViaStdin?: boolean;
}

/** TOML 문자열 리터럴로 감싼다. 역슬래시·따옴표만 이스케이프하면 된다. */
function toml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * codex 로 실제로 나가는 글 — 규정 + 프롬프트를 이어 붙인 한 덩어리.
 *
 * argv 로 가든 stdin 으로 가든 **내용은 같다.** 한 자리에서 만들어야 두 경로가 어긋나지 않고,
 * 실명 유출 가드도 여기 하나만 보면 된다.
 *
 * ★규정을 맨 앞에 두는 이유: "이 조건으로 써라"라서 재료보다 먼저 와야 한다.
 *   claude 는 시스템 자리에 들어가므로 이미 앞이다 — 두 CLI 의 순서를 맞춘다.
 */
export function buildCodexStdinText(o: Pick<CodexArgvOptions, 'prompt' | 'appendSystemPrompt'>) {
  return o.appendSystemPrompt ? `${o.appendSystemPrompt}\n\n---\n\n${o.prompt}` : o.prompt;
}

/**
 * codex argv.
 *
 * ★`promptViaStdin` 이면 프롬프트 자리에 **`-` 만** 넣는다 — 본문은 러너가 stdin 에 쓴다.
 *   명령줄에 규정과 학생 근거 본문이 실리지 않게 하려는 것이다(ADR-089 후속 6).
 *   실측 2026-09-07(codex-cli 0.153.4): exit 0 · 6초 · `turn.completed`. **무한 대기 없음** —
 *   파일 머리말 2번의 경고는 stdin 을 열어 둔 채 아무것도 안 준 경우다.
 * ★꺼져 있으면 옛 경로(위치 인자)를 그대로 쓴다. 구버전에서 `-` 가 프롬프트 글자로 읽히면
 *   조용한 오작동이 되므로, 확인한 버전에서만 켠다(`CODEX_STDIN_MIN`).
 */
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
  // 이미지는 한 장마다 `-i` 를 따로 붙인다 — 값을 여러 개 받는 옵션이라 붙여 두면
  // 뒤따르는 프롬프트까지 삼킨다. 프롬프트는 여전히 맨 뒤 위치 인자다.
  for (const p of o.imagePaths ?? []) argv.push('-i', p);
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
  // ★`-` 는 "stdin 에서 읽어라"라는 뜻이다. 본문은 명령줄에 실리지 않는다.
  argv.push(o.promptViaStdin ? '-' : buildCodexStdinText(o));
  return argv;
}
