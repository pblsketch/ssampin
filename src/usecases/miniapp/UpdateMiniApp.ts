import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';
import type { MiniApp, MiniAppIcon } from '@domain/entities/MiniApp';
import { validateMiniApp, MINIAPP_HTML_MAX_BYTES } from '@domain/entities/MiniApp';
import { formatMiniAppValidationError } from './RegisterMiniApp';

export interface UpdateMiniAppDeps {
  readonly repo: IMiniAppRepository;
}

/**
 * 수정 입력. id로 기존 앱을 찾아 메타(이름·설명·아이콘)를 갱신한다.
 * - htmlBytes 제공 시에만 앱 파일(index.html)을 교체하고, 없으면 기존 파일을 유지한다.
 * - icon이 image이고 iconBytes가 있으면 새 이미지를 저장한다. iconBytes가 없으면
 *   icon.fileName(기존 파일명)을 그대로 유지한다(호출부가 채워 보낸다).
 */
export interface UpdateMiniAppInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: MiniAppIcon;
  readonly htmlBytes?: Uint8Array;
  readonly iconBytes?: Uint8Array;
  readonly iconExt?: string;
}

/** HTML 상한(MB, 내림) — 오류 문구 조립용. */
const MINIAPP_HTML_MAX_MB = Math.floor(MINIAPP_HTML_MAX_BYTES / (1024 * 1024));

/**
 * 미니앱 수정 — 기존 앱의 메타(이름·설명·아이콘)를 갱신하고, 필요 시 HTML·이미지 아이콘
 * 파일을 교체한다. id·등록일·순서는 보존한다.
 *
 * 실패 사유는 사용자에게 그대로 보여줄 수 있는 한국어 메시지로 throw한다.
 *
 * @param existing 현재 등록된 미니앱 메타 목록
 * @returns 해당 앱만 갱신된 새 목록
 */
export async function updateMiniApp(
  deps: UpdateMiniAppDeps,
  input: UpdateMiniAppInput,
  existing: readonly MiniApp[],
): Promise<readonly MiniApp[]> {
  const target = existing.find((a) => a.id === input.id);
  if (!target) {
    throw new Error('수정할 앱을 찾을 수 없어요.');
  }

  const errors = validateMiniApp(input);
  if (errors.length > 0) {
    throw new Error(formatMiniAppValidationError(errors[0]!));
  }

  // 파일 교체는 선택 — htmlBytes가 있을 때만.
  if (input.htmlBytes) {
    if (input.htmlBytes.byteLength > MINIAPP_HTML_MAX_BYTES) {
      throw new Error(`HTML 파일은 최대 ${MINIAPP_HTML_MAX_MB}MB까지 등록할 수 있어요.`);
    }
    await deps.repo.save(input.id, input.htmlBytes);
  }

  // 이미지 아이콘 교체는 새 바이트가 있을 때만. 없으면 input.icon(기존 fileName 포함)을 그대로 쓴다.
  let icon: MiniAppIcon = input.icon;
  if (icon.kind === 'image' && input.iconBytes) {
    const fileName = await deps.repo.saveIcon(input.id, input.iconBytes, input.iconExt ?? 'png');
    icon = { kind: 'image', fileName };
  }

  const updated: MiniApp = {
    ...target,
    name: input.name.trim(),
    description: input.description.trim(),
    icon,
  };

  return existing.map((a) => (a.id === input.id ? updated : a));
}
