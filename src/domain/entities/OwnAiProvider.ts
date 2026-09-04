/**
 * "내 AI로 실행" — 선생님 본인 구독 CLI(Claude Code·Codex)의 값 타입.
 *
 * 쌤핀은 CLI 를 **원본 그대로** 자식 프로세스로 띄우기만 한다. 토큰을 받지도, 저장하지도,
 * 중계하지도 않는다(Anthropic 법적 문서가 허용하는 형태의 상한 — ADR-082 결정 3).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 타입과 상수만 둔다.
 */

/** 인앱 실행을 지원하는 공급자. 구글(Antigravity)은 약관상 제외한다(ADR-082 결정 2). */
export type OwnAiProviderId = 'claude' | 'codex';

export const OWN_AI_PROVIDERS: readonly OwnAiProviderId[] = ['claude', 'codex'];

/** 화면에 쓰는 공급자 이름. 로고·상표는 쓰지 않고 평문으로만 표기한다(약관). */
export const OWN_AI_PROVIDER_LABELS: Readonly<Record<OwnAiProviderId, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

/** 공식 설치 명령 — 쌤핀은 이 명령을 새 터미널에서 대신 실행해 줄 뿐이다. */
export const OWN_AI_INSTALL_COMMANDS: Readonly<
  Record<OwnAiProviderId, { readonly win32: string; readonly posix: string }>
> = {
  claude: {
    win32: 'irm https://claude.ai/install.ps1 | iex',
    posix: 'curl -fsSL https://claude.ai/install.sh | bash',
  },
  codex: {
    win32: 'winget install OpenAI.Codex',
    posix: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  },
};

/**
 * 실행 갈래.
 *
 * - `panel`  오른쪽 AI 패널. 브릿지 MCP 를 물리고, 쓰기 게이트의 "활성" 판정 대상이다.
 * - `draft`  생기부 초안. 도구를 하나도 주지 않고 한 번에 답을 받는다.
 *            **활성 판정을 건드리지 않는다** — 브릿지가 없어 쓰기가 올 수 없다.
 */
export type OwnAiRunKind = 'panel' | 'draft';

/** 연결 상태 — 설정 카드가 이 값 하나로 3상태를 그린다. */
export type OwnAiConnection =
  | { readonly provider: OwnAiProviderId; readonly state: 'not-installed' }
  | {
      readonly provider: OwnAiProviderId;
      readonly state: 'not-signed-in';
      readonly version: string;
    }
  | {
      readonly provider: OwnAiProviderId;
      readonly state: 'version-unsupported';
      readonly version: string;
      /** 지원 범위를 사람이 읽는 형태로. 예: "2.1.200 이상" */
      readonly supportedRange: string;
    }
  | {
      readonly provider: OwnAiProviderId;
      readonly state: 'connected';
      readonly version: string;
      readonly model: string;
    };

/** 설정에서 고를 수 있는 모델(D9). 목록은 쌤핀이 관리하고, 기본값은 CLI 에 맡긴다. */
export interface OwnAiModelOption {
  /** CLI 에 넘길 값. 빈 문자열이면 `--model` 을 붙이지 않는다(= CLI 기본값). */
  readonly id: string;
  readonly label: string;
}

/**
 * 오류 갈래 — 원인이 다르면 선생님이 할 일도 다르다.
 * (`AssistDegraded` 가 같은 이유로 `offline`·`timeout`·`unreachable` 을 나눈 것과 같은 원칙.)
 */
export type OwnAiErrorKind =
  | 'not-installed'
  | 'not-signed-in'
  | 'version'
  | 'model-unavailable'
  | 'usage-limit'
  /** 브릿지 MCP 가 뜨지 못했다 */
  | 'mcp-boot'
  /** 쓰기 토글은 켜져 있는데 앱의 loopback 서버가 못 떴다 — 이 상태로는 실행하지 않는다 */
  | 'write-server-unavailable'
  /** 생기부 1층 프롬프트를 못 받아 왔다 — 규정을 못 지키므로 초안을 만들지 않는다 */
  | 'prompt-unavailable'
  | 'cancelled'
  | 'crashed';

/** 실행 중 렌더러로 흘려보내는 이벤트. */
export type OwnAiRunEvent =
  | { readonly type: 'started'; readonly runId: string }
  /** 모델이 글자를 뱉는 중 */
  | { readonly type: 'delta'; readonly runId: string; readonly text: string }
  /** 브릿지 도구를 불렀다 — 화면에는 "무엇을 봤는지"만 요약해 보여 준다 */
  | { readonly type: 'tool'; readonly runId: string; readonly tool: string }
  /** 남은 사용량(claude `rate_limit_event`) — 한도를 맞기 전에 알려 주려고 흘린다 */
  | {
      readonly type: 'usage';
      readonly runId: string;
      /** 0~1. 5시간 창 소진율 */
      readonly fiveHourUtilization: number | null;
      /** epoch seconds */
      readonly resetsAt: number | null;
    }
  | { readonly type: 'done'; readonly runId: string; readonly text: string }
  | { readonly type: 'error'; readonly runId: string; readonly kind: OwnAiErrorKind };
