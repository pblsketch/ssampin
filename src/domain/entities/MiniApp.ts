/**
 * 미니앱("내가 만든 앱") 도메인 엔티티.
 *
 * 교사가 AI(Gemini 등)로 만든 **단일 HTML 웹앱**을 쌤핀에 등록해 격리 실행하는
 * 기능의 메타데이터. HTML 본문과 이미지 아이콘 파일은 domain이 아니라
 * infrastructure(userData/miniapps/<id>/)가 보관하며, 이 엔티티는 목록·표시·순서에
 * 필요한 메타만 담는다. 메타는 Settings에 실려 'settings' 동기화 도메인에 편승한다.
 *
 * 설계 문서: docs/01-plan/features/miniapp-my-apps.plan.md
 */

/** 미니앱 카드 아이콘 — 이모지(기본, 저장 0) 또는 업로드 이미지 파일. */
export type MiniAppIcon =
  | { readonly kind: 'emoji'; readonly value: string }
  | { readonly kind: 'image'; readonly fileName: string };

/** 미니앱 메타데이터. HTML/아이콘 바이트는 별도 파일 저장(IMiniAppRepository). */
export interface MiniApp {
  /** 안정적 고유 id (파일 폴더명 = userData/miniapps/<id>/). 파일명과 무관하게 생성. */
  readonly id: string;
  /** 표시 이름 (한국어) */
  readonly name: string;
  /** 짧은 설명 (선택, 빈 문자열 허용) */
  readonly description: string;
  /** 카드 아이콘 */
  readonly icon: MiniAppIcon;
  /** 등록 시각 (epoch ms) */
  readonly createdAt: number;
  /** 섹션 내 표시 순서 (오름차순) */
  readonly order: number;
}

/** 이름 최대 길이 */
export const MINIAPP_NAME_MAX = 40;
/** 설명 최대 길이 */
export const MINIAPP_DESC_MAX = 80;
/** HTML 파일 최대 크기 (20MB — 로컬 저장이라 여유. 실수로 거대 파일 등록 방지용 안전장치). */
export const MINIAPP_HTML_MAX_BYTES = 20 * 1024 * 1024;
/** 등록 가능한 미니앱 최대 개수 */
export const MINIAPP_MAX_COUNT = 50;

/** validateMiniApp가 반환하는 오류 코드. 빈 배열이면 유효. */
export type MiniAppValidationError =
  | 'name-empty'
  | 'name-too-long'
  | 'desc-too-long'
  | 'icon-invalid';

/**
 * 미니앱 메타 유효성 검사 (순수함수).
 *
 * - name: 공백 제거 후 비어있으면 'name-empty', {@link MINIAPP_NAME_MAX} 초과면 'name-too-long'
 * - description: {@link MINIAPP_DESC_MAX} 초과면 'desc-too-long' (빈 값 허용)
 * - icon: emoji면 value 비어있지 않아야, image면 fileName 비어있지 않아야 함. 아니면 'icon-invalid'
 *
 * @returns 위반 코드 배열. 빈 배열이면 유효.
 */
export function validateMiniApp(
  input: Pick<MiniApp, 'name' | 'description' | 'icon'>,
): readonly MiniAppValidationError[] {
  const errors: MiniAppValidationError[] = [];

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    errors.push('name-empty');
  } else if (trimmedName.length > MINIAPP_NAME_MAX) {
    errors.push('name-too-long');
  }

  if (input.description.length > MINIAPP_DESC_MAX) {
    errors.push('desc-too-long');
  }

  if (!isValidIcon(input.icon)) {
    errors.push('icon-invalid');
  }

  return errors;
}

/** 아이콘이 표시 가능한 유효 형태인지 검사. */
export function isValidIcon(icon: MiniAppIcon): boolean {
  if (icon.kind === 'emoji') {
    return icon.value.trim().length > 0;
  }
  return icon.fileName.trim().length > 0;
}

/** 메타가 완전 유효하면 true. */
export function isValidMiniApp(input: Pick<MiniApp, 'name' | 'description' | 'icon'>): boolean {
  return validateMiniApp(input).length === 0;
}
