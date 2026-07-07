/* eslint-disable */
/**
 * 생성 파일 — 직접 수정 금지.
 * 원천: scripts/contract/aiBridgeWriteContract.def.mjs
 * 재생성: npm run gen:contract  ·  정합 검사: npm run check:contract-sync
 */

export const WRITE_DOMAINS = [
  "todos",
  "events",
  "recordDrafts",
  "memos",
  "bookmarks",
  "notes",
  "attendance",
  "homeroomAttendance",
  "observations",
  "recordNote",
  "progress",
] as const;
export type WriteDomain = (typeof WRITE_DOMAINS)[number];

export const WRITE_OPS = [
  "create",
  "update",
  "complete",
  "delete",
] as const;
export type WriteOp = (typeof WRITE_OPS)[number];

export const OBSERVATION_FIELDS = [
  "studentId",
  "content",
  "date",
  "tags",
  "classId",
] as const;
export const OBSERVATION_CONTENT_MAX = 500;

export const RECORD_NOTE_FIELDS = [
  "studentId",
  "content",
  "categoryId",
  "subcategory",
  "date",
] as const;
export const RECORD_NOTE_CONTENT_MAX = 2000;

export const PROGRESS_FIELDS = [
  "classId",
  "date",
  "period",
  "unit",
  "lesson",
  "status",
  "note",
] as const;
export const PROGRESS_UNIT_MAX = 200;
export const PROGRESS_LESSON_MAX = 500;
export const PROGRESS_NOTE_MAX = 500;
export const PROGRESS_STATUSES = [
  "planned",
  "completed",
  "skipped",
] as const;

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "earlyLeave",
  "classAbsence",
] as const;
export const ATTENDANCE_REASONS = [
  "질병",
  "인정",
  "미인정",
  "기타",
] as const;

/** 식별키 형식 계약(고정 — 회귀 가드 대상). */
export const IDENTITY_KEY_CONTRACT = {
  homeroomStudentId: "Student.id",
  classObservationStudentKey: "grade-classNo-studentNo+classId",
  attendanceMatch: "studentNumber",
} as const;
