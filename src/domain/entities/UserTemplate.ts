/**
 * UserTemplate — 교사가 보드에서 직접 저장한 "내 템플릿" (PDCA-4 / G006)
 *
 * 내장 템플릿(BoardTemplate, 도메인 규칙이 생성)과 달리, 내 템플릿은
 * 교사가 그린 보드의 Excalidraw 요소를 그대로 보관한다. 요소 페이로드는
 * 도메인이 내부 구조를 해석하지 않는 불투명 데이터다 — 직렬화·재시딩은
 * infrastructure(boardSnapshotCodec)가 담당.
 *
 * **요소 보존 원칙**: 요소 id 는 절대 재생성하지 않는다. 포스트잇의 bound
 * text 가 `containerId`/`boundElements` 로 다른 요소 id 를 참조하므로,
 * id 를 바꾸면 라벨-도형 연결이 끊어진다. 보드마다 Y.Doc 이 분리되어
 * 같은 id 가 여러 보드에 존재해도 충돌하지 않는다.
 */

/** 도메인이 해석하지 않는 Excalidraw 요소 평면 객체 */
export type OpaqueBoardElement = Readonly<Record<string, unknown>>;

/** 목록·카드 표시용 메타 (요소 페이로드 제외) */
export interface UserTemplateMeta {
  readonly id: string;
  readonly name: string;
  /** 저장 시각 (Unix ms) */
  readonly createdAt: number;
  /** 저장 당시 Excalidraw 버전 — 향후 마이그레이션 분기용 (Plan R7) */
  readonly versionSchema: string;
  readonly elementCount: number;
}

export interface UserTemplate extends UserTemplateMeta {
  readonly elements: ReadonlyArray<OpaqueBoardElement>;
}

/** 템플릿 이름 최대 글자 (UTF-16 code unit 기준) */
export const USER_TEMPLATE_NAME_MAX_LENGTH = 40;

/**
 * 저장 직전 이름 정리 — 앞뒤 공백 제거 + 최대 40자.
 * 비어 있으면 null (호출 측이 기본 이름으로 대체).
 */
export function sanitizeUserTemplateName(raw: string): string | null {
  const trimmed = raw.trim().slice(0, USER_TEMPLATE_NAME_MAX_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : null;
}
