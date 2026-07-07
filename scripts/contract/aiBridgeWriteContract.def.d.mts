/**
 * 타입 선언 — aiBridgeWriteContract.def.mjs(SSOT 데이터)를 .ts 에서 import 할 때의 형태.
 * 런타임 값은 .mjs 가 제공한다. 이 선언이 .mjs 의 export 와 어긋나면 계약 테스트가 잡는다.
 */
export const WRITE_DOMAINS: string[];
export const WRITE_OPS: string[];
export const OBSERVATION_FIELDS: string[];
export const OBSERVATION_CONTENT_MAX: number;
export const RECORD_NOTE_FIELDS: string[];
export const RECORD_NOTE_CONTENT_MAX: number;
export const PROGRESS_FIELDS: string[];
export const PROGRESS_UNIT_MAX: number;
export const PROGRESS_LESSON_MAX: number;
export const PROGRESS_NOTE_MAX: number;
export const PROGRESS_STATUSES: string[];
export const ATTENDANCE_STATUSES: string[];
export const ATTENDANCE_REASONS: string[];
export const IDENTITY_KEY_CONTRACT: Readonly<Record<string, string>>;
export const AI_BRIDGE_WRITE_CONTRACT: {
  readonly WRITE_DOMAINS: string[];
  readonly WRITE_OPS: string[];
  readonly OBSERVATION_FIELDS: string[];
  readonly OBSERVATION_CONTENT_MAX: number;
  readonly RECORD_NOTE_FIELDS: string[];
  readonly RECORD_NOTE_CONTENT_MAX: number;
  readonly PROGRESS_FIELDS: string[];
  readonly PROGRESS_UNIT_MAX: number;
  readonly PROGRESS_LESSON_MAX: number;
  readonly PROGRESS_NOTE_MAX: number;
  readonly PROGRESS_STATUSES: string[];
  readonly ATTENDANCE_STATUSES: string[];
  readonly ATTENDANCE_REASONS: string[];
  readonly IDENTITY_KEY_CONTRACT: Readonly<Record<string, string>>;
};
