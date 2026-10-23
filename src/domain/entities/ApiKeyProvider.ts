/**
 * "내 API 키로 연결" — 선생님 본인 API 키(BYOK)로 쌤핀의 AI 기능을 쓰는 값 타입 (ADR-142 결정 8, ADR-143).
 *
 * ★키는 데스크톱 앱 본체(main 프로세스)에만 있다. 화면(렌더러)·쌤핀 서버·백업·드라이브 동기화
 *   어디에도 가지 않는다. 화면이 아는 것은 "어느 서비스에 키가 있다 + 끝 4자리"뿐이다.
 * ★호출 주소는 서비스마다 하나로 못 박는다(`API_KEY_SERVICE_ENDPOINTS`). 사용자 지정 주소를 받지
 *   않는다 — 받으면 키를 엉뚱한 곳으로 보내게 만드는 통로가 된다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 타입과 상수(그리고 작은 순수 함수)만 둔다.
 */
import type { OwnAiErrorKind, OwnAiProviderId } from './OwnAiProvider';

/** 키를 받을 수 있는 서비스. 모두 OpenAI 호환 `chat/completions` 를 제공한다(2026-10-24 문서 확인). */
export type ApiKeyServiceId = 'gemini' | 'openrouter' | 'opencode-zen' | 'opencode-go';

/** 화면에 보이는 순서 = 추천 순서. 제미나이가 처음인 이유: 구글 계정만 있으면 결제 없이 시작된다. */
export const API_KEY_SERVICES: readonly ApiKeyServiceId[] = [
  'gemini',
  'openrouter',
  'opencode-zen',
  'opencode-go',
];

/**
 * AI 를 실제로 돌리는 통로 — 구독 CLI 두 개 + API 키.
 *
 * `OwnAiProviderId`(CLI)와 따로 두는 이유: 설치·로그인·argv 처럼 CLI 에만 있는 표가 많아,
 * 'apikey' 를 그 유니온에 넣으면 전부 빈칸을 채워야 한다. 실행만 하는 자리는 이 타입을 쓴다.
 */
export type AiRunProviderId = OwnAiProviderId | 'apikey';

/** 고르기 단추·답변 배지에 쓰는 이름 */
export const AI_RUN_PROVIDER_LABELS: Readonly<Record<AiRunProviderId, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  apikey: '내 API 키',
};

/** 화면에 보일 짧은 모델 이름 — `models/gemini-flash-latest` → `gemini-flash-latest`, `anthropic/x` → `x` */
export function shortApiKeyModelLabel(model: string): string {
  return model.replace(/^models\//, '').replace(/^[a-z0-9-]+\//, '');
}

/** 서비스별 고정 주소. **사용자가 바꿀 수 없다.** */
export interface ApiKeyServiceEndpoints {
  /** OpenAI 호환 대화 주소 */
  readonly chatCompletionsUrl: string;
  /** 모델 목록 주소 — 키 확인에도 쓴다(쓰지 않은 키로 대화를 보내 요금이 나가지 않게). */
  readonly modelsUrl: string;
}

export const API_KEY_SERVICE_ENDPOINTS: Readonly<Record<ApiKeyServiceId, ApiKeyServiceEndpoints>> =
  {
    gemini: {
      chatCompletionsUrl:
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    },
    openrouter: {
      chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
      modelsUrl: 'https://openrouter.ai/api/v1/models',
    },
    'opencode-zen': {
      chatCompletionsUrl: 'https://opencode.ai/inference/openai/v1/chat/completions',
      modelsUrl: 'https://opencode.ai/inference/v1/models',
    },
    'opencode-go': {
      chatCompletionsUrl: 'https://opencode.ai/inference/go/openai/v1/chat/completions',
      modelsUrl: 'https://opencode.ai/inference/go/v1/models',
    },
  };

/** 화면에 쓰는 서비스 정보. 로고·상표는 쓰지 않고 평문 이름만 쓴다. */
export interface ApiKeyServiceInfo {
  readonly label: string;
  /** 고르기 화면의 한 줄 설명 */
  readonly summary: string;
  /** 요금 성격 — "누가 얼마를 내나"를 고르기 전에 알아야 한다 */
  readonly billing: string;
  /** 키를 받는 페이지(기본 브라우저로 연다) */
  readonly keyPageUrl: string;
  /** 키 받는 순서. 화면에 번호를 붙여 그대로 보여 준다 */
  readonly steps: readonly string[];
  /** 꼭 알려야 하는 주의 한 줄(학습 이용·약관 등). 없으면 null */
  readonly caution: string | null;
}

export const API_KEY_SERVICE_INFO: Readonly<Record<ApiKeyServiceId, ApiKeyServiceInfo>> = {
  gemini: {
    label: '제미나이 (Google AI Studio)',
    summary: '구글 계정만 있으면 바로 키를 받고, 무료로 시작할 수 있어요.',
    billing: '무료 사용량이 있고, 결제를 연결하면 쓴 만큼 구글에 청구돼요.',
    keyPageUrl: 'https://aistudio.google.com/apikey',
    steps: [
      '아래 [키 받으러 가기]를 눌러 Google AI Studio 를 열어요.',
      '구글 계정으로 로그인한 뒤 [API 키 만들기]를 눌러요.',
      '만들어진 키 옆의 복사 단추를 눌러요.',
      '쌤핀으로 돌아와 아래 칸에 붙여 넣어요.',
    ],
    caution:
      '결제를 연결하지 않은 무료 키는 보낸 내용이 구글 서비스 개선에 쓰일 수 있어요. 학생 이름은 가려서 보내지만, 생기부처럼 민감한 작업에는 결제를 연결한 키를 권해요.',
  },
  openrouter: {
    label: '오픈라우터 (OpenRouter)',
    summary: '키 하나로 여러 회사의 모델을 골라 쓸 수 있어요.',
    billing: '미리 충전한 금액에서 쓴 만큼 빠져요. 충전액이 없으면 멈춰요.',
    keyPageUrl: 'https://openrouter.ai/settings/keys',
    steps: [
      '아래 [키 받으러 가기]를 눌러 오픈라우터를 열고 로그인해요.',
      '금액을 충전해요(Credits).',
      '[Create Key]로 키를 만들고 복사해요. 키 한도(Credit limit)를 정해 두면 안심이에요.',
      '쌤핀으로 돌아와 아래 칸에 붙여 넣어요.',
    ],
    caution: null,
  },
  'opencode-zen': {
    label: '오픈코드 Zen (쓴 만큼)',
    summary: '오픈코드 콘솔에서 충전하고 쓴 만큼 내요.',
    billing:
      '충전한 금액에서 쓴 만큼 빠져요. 자동 충전이 켜져 있으면 잔액이 줄 때 알아서 충전되니, 원하지 않으면 콘솔에서 꺼 두세요.',
    keyPageUrl: 'https://opencode.ai/console',
    steps: [
      '아래 [키 받으러 가기]를 눌러 오픈코드 콘솔에 로그인해요.',
      '결제 정보를 넣고 금액을 충전해요.',
      'API 키를 복사해요.',
      '쌤핀으로 돌아와 아래 칸에 붙여 넣어요.',
    ],
    caution: '무료 모델은 보낸 내용이 학습에 쓰일 수 있어 목록에 넣지 않았어요.',
  },
  'opencode-go': {
    label: '오픈코드 Go (월 구독)',
    summary: '월 구독으로 정해진 사용량 안에서 여러 모델을 써요.',
    billing:
      '월 $10(Go) 또는 $40(Go Plus) 구독이에요. 한도에 닿으면 멈추거나 추가 요금 설정을 따라요.',
    keyPageUrl: 'https://opencode.ai/console',
    steps: [
      '아래 [키 받으러 가기]를 눌러 오픈코드 콘솔에 로그인해요.',
      'Go 또는 Go Plus 를 구독해요.',
      'API 키를 복사해요.',
      '쌤핀으로 돌아와 아래 칸에 붙여 넣어요.',
    ],
    caution:
      'Go 는 오픈코드 앱을 위해 만든 요금제예요. 쌤핀에서는 OpenAI 형식 모델만 골라 쓸 수 있어요.',
  },
};

/** 서비스 하나의 키 상태 — 화면이 아는 전부다. 키 원문은 여기 없다. */
export interface ApiKeyServiceStatus {
  readonly service: ApiKeyServiceId;
  readonly configured: boolean;
  /** "••••abcd" 꼴. 키가 없으면 null */
  readonly hint: string | null;
  /**
   * 디스크에 암호화해 저장됐는가. false 면 이번 실행 동안만 메모리에 있다 —
   * 이 컴퓨터에서 OS 암호화 저장소를 쓸 수 없을 때다(앱을 다시 켜면 다시 넣어야 한다).
   */
  readonly persisted: boolean;
}

/** 지금 AI 기능들이 쓸 서비스와 모델. */
export interface ApiKeyActiveSelection {
  readonly service: ApiKeyServiceId;
  /** 서비스가 준 모델 id 그대로 (예: `models/gemini-flash-latest`, `anthropic/claude-haiku-5.5`) */
  readonly model: string;
}

export interface ApiKeyStatusSnapshot {
  /** 이 컴퓨터에서 OS 암호화 저장소를 쓸 수 있는가 */
  readonly encryptionAvailable: boolean;
  readonly services: readonly ApiKeyServiceStatus[];
  /** 고른 서비스·모델. 키가 지워졌거나 아직 고르지 않았으면 null */
  readonly active: ApiKeyActiveSelection | null;
}

/** 모델 고르기 목록의 한 줄 */
export interface ApiKeyModelOption {
  readonly id: string;
  readonly label: string;
  readonly recommended: boolean;
}

/** 키 넣기에서 걸릴 수 있는 입력 문제(서비스에 묻기 전에 걸린다) */
export type ApiKeyInputProblem = 'empty' | 'too-short' | 'too-long' | 'invalid-chars';

/** [연결 확인] 결과 */
export type ApiKeySaveResult =
  | {
      readonly ok: true;
      readonly status: ApiKeyStatusSnapshot;
      readonly models: readonly ApiKeyModelOption[];
    }
  | {
      readonly ok: false;
      readonly reason: OwnAiErrorKind | ApiKeyInputProblem;
      /** 키 모양으로 보아 다른 서비스 키 같으면 그 서비스 — 화면이 "혹시 ○○ 키인가요?"를 덧붙인다 */
      readonly looksLike?: ApiKeyServiceId;
    };

export type ApiKeyModelsResult =
  | { readonly ok: true; readonly models: readonly ApiKeyModelOption[] }
  | { readonly ok: false; readonly reason: OwnAiErrorKind };

/** 대화 한 번의 결과. 도구 호출 인자는 모델이 만든 JSON 원문이라 **항상 불신**한다. */
export type ApiKeyChatResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly toolCalls: readonly { readonly name: string; readonly rawArguments: string }[];
      readonly service: ApiKeyServiceId;
      readonly model: string;
    }
  | { readonly ok: false; readonly reason: OwnAiErrorKind };

/** 화면이 보내는 대화 한 건 */
export interface ApiKeyChatPayload {
  readonly requestId: string;
  /** `panel` 쌤핀 AI 패널 · `draft` 생기부 초안 등 한 번에 긴 글 */
  readonly purpose: 'panel' | 'draft';
  readonly messages: readonly {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string;
  }[];
  readonly tools?: readonly unknown[];
  /** 한 대화 동안 같은 값(오픈코드 세션 머리글). 없으면 requestId */
  readonly sessionId?: string;
}
