import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';
import type { MiniApp, MiniAppIcon, MiniAppValidationError } from '@domain/entities/MiniApp';
import {
  validateMiniApp,
  MINIAPP_NAME_MAX,
  MINIAPP_DESC_MAX,
  MINIAPP_HTML_MAX_BYTES,
  MINIAPP_MAX_COUNT,
} from '@domain/entities/MiniApp';

export interface RegisterMiniAppDeps {
  readonly repo: IMiniAppRepository;
  /**
   * 앱 id 생성기(주입) — usecases 레이어는 인프라(uuid)에 직접 의존하지 않는다.
   * 결과는 안전한 id 형식(영숫자·`-`·`_`, 64자 이하)이어야 한다(예: UUID v4).
   */
  readonly generateId: () => string;
}

/** 등록 입력. icon이 image kind면 iconBytes/iconExt를 함께 넘겨야 실제 파일로 저장된다. */
export interface RegisterMiniAppInput {
  readonly name: string;
  readonly description: string;
  readonly icon: MiniAppIcon;
  readonly htmlBytes: Uint8Array;
  readonly iconBytes?: Uint8Array;
  readonly iconExt?: string;
}

/** HTML 상한(MB, 내림) — 오류 문구 조립용. */
const MINIAPP_HTML_MAX_MB = Math.floor(MINIAPP_HTML_MAX_BYTES / (1024 * 1024));

const VALIDATION_MESSAGES: Readonly<Record<MiniAppValidationError, string>> = {
  'name-empty': '앱 이름을 입력해 주세요.',
  'name-too-long': `이름은 ${MINIAPP_NAME_MAX}자 이하로 입력해 주세요.`,
  'desc-too-long': `설명은 ${MINIAPP_DESC_MAX}자 이하로 입력해 주세요.`,
  'icon-invalid': '아이콘을 선택해 주세요.',
};

/** validateMiniApp 오류 코드를 그대로 사용자에게 보여줄 한국어 문구로 바꾼다. */
export function formatMiniAppValidationError(code: MiniAppValidationError): string {
  return VALIDATION_MESSAGES[code];
}

/**
 * 미니앱 등록 — HTML(및 선택 시 이미지 아이콘)을 파일로 저장하고, 메타를 목록 끝에 추가한다.
 *
 * 실패 사유는 모두 사용자에게 그대로 보여줄 수 있는 한국어 메시지로 throw한다
 * (호출부인 UI가 try/catch로 받아 토스트에 표시하는 것을 전제로 한다).
 *
 * @param existing 현재 등록된 미니앱 메타 목록 (순서 불문 — order 계산은 내부에서 처리)
 * @returns 새 앱이 끝에 추가된 다음 목록
 */
export async function registerMiniApp(
  deps: RegisterMiniAppDeps,
  input: RegisterMiniAppInput,
  existing: readonly MiniApp[],
): Promise<readonly MiniApp[]> {
  const errors = validateMiniApp(input);
  if (errors.length > 0) {
    throw new Error(formatMiniAppValidationError(errors[0]!));
  }
  if (existing.length >= MINIAPP_MAX_COUNT) {
    throw new Error(`앱은 최대 ${MINIAPP_MAX_COUNT}개까지 등록할 수 있어요.`);
  }
  if (input.htmlBytes.byteLength > MINIAPP_HTML_MAX_BYTES) {
    throw new Error(`HTML 파일은 최대 ${MINIAPP_HTML_MAX_MB}MB까지 등록할 수 있어요.`);
  }

  const id = deps.generateId();
  await deps.repo.save(id, input.htmlBytes);

  let icon: MiniAppIcon = input.icon;
  if (icon.kind === 'image' && input.iconBytes) {
    const fileName = await deps.repo.saveIcon(id, input.iconBytes, input.iconExt ?? 'png');
    icon = { kind: 'image', fileName };
  }

  // 표시 순서는 기존 목록 맨 뒤(빈 목록이면 0).
  const nextOrder = existing.reduce((max, app) => Math.max(max, app.order), -1) + 1;

  const app: MiniApp = {
    id,
    name: input.name.trim(),
    description: input.description.trim(),
    icon,
    createdAt: Date.now(),
    order: nextOrder,
  };

  return [...existing, app];
}
