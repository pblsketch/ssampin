/**
 * 타입 선언 — emit-entity-samples.mjs(WS2 픽스처 생성기)를 .ts 에서 import 할 때의 형태.
 * 런타임 값/함수는 .mjs 가 제공한다.
 */
export interface InterfaceFieldContract {
  readonly mirrored: string[];
  readonly notMirrored: string[];
}
export interface EntityFieldContract {
  readonly file: string;
  readonly interfaces: Record<string, InterfaceFieldContract>;
}
export const ENTITY_FIELD_CONTRACT: Record<string, EntityFieldContract>;
export const SAMPLES: Record<string, unknown>;
export function assertSynthetic(node: unknown, path?: string): void;
