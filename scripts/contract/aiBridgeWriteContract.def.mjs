/**
 * AI 브릿지 쓰기 계약 — 단일 정의(SSOT, single source of truth).
 *
 * 이 파일이 외부 AI(MCP 브릿지)와 본체 사이 "쓰기 계약"의 유일한 원천이다:
 *   - 허용 쓰기 도메인(WRITE_DOMAINS)·연산(WRITE_OPS)
 *   - 관찰기록/담임노트 필드 화이트리스트 + 내용 상한
 *   - 출결 status/reason enum(서버가 클라를 신뢰하지 않고 재검증하는 값)
 *
 * 이 데이터로부터 `scripts/gen-bridge-contract.mjs` 가 빌드 트리별로 3개를 생성한다:
 *   ⓐ src/domain/contracts/aiBridgeWriteContract.ts   (renderer 트리; applyLiveSyncWrite 가 import)
 *   ⓑ electron/ipc/_generated/aiBridgeWriteContract.ts (electron main 트리; rootDir:electron 준수)
 *   ⓒ contracts/aiBridgeWriteContract.json            (크로스레포 스냅샷; 브릿지 레포가 참조)
 *
 * 왜 "공유 import" 가 아니라 "def → codegen" 인가:
 *   electron main 은 분리된 빌드 트리(tsconfig.electron.json: rootDir:"electron")라
 *   src/domain/**.ts 를 import 하면 rootDir 위반(TS6059)으로 빌드가 깨진다.
 *   → 정의는 1곳(이 파일), 산출은 트리별로 생성하고 parity check 로 어긋남을 빌드에서 잡는다.
 *
 * 수정 절차: 이 파일만 고치고 `npm run gen:contract` 실행 → 생성물 3개 갱신 → 커밋.
 *   (생성물을 직접 수정하면 `npm run check:contract-sync` 가 실패한다.)
 */

/** 허용 쓰기 도메인 10종(외부 AI 가 R/W 할 수 있는 표면). */
export const WRITE_DOMAINS = [
  'todos',
  'events',
  'recordDrafts',
  'memos',
  'bookmarks',
  'notes',
  'attendance',
  'homeroomAttendance',
  'observations',
  'recordNote',
];

/** 허용 쓰기 연산. (도메인별 미지원 연산은 적용 단계에서 별도 거부.) */
export const WRITE_OPS = ['create', 'update', 'complete', 'delete'];

/** 관찰기록(observations) create payload 허용 필드 + 내용 상한. */
export const OBSERVATION_FIELDS = ['studentId', 'content', 'date', 'tags', 'classId'];
export const OBSERVATION_CONTENT_MAX = 500;

/** 담임 노트(recordNote) create payload 허용 필드 + 내용 상한. */
export const RECORD_NOTE_FIELDS = ['studentId', 'content', 'categoryId', 'subcategory', 'date'];
export const RECORD_NOTE_CONTENT_MAX = 2000;

/** 출결 status enum — 서버(loopback)가 클라를 신뢰하지 않고 재검증하는 값. */
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'earlyLeave', 'classAbsence'];

/** 출결 reason enum(결석/지각/조퇴/결과의 사유). */
export const ATTENDANCE_REASONS = ['질병', '인정', '미인정', '기타'];

/**
 * 식별키 형식 계약(고정 — 이 작업에서 변경 금지, 회귀 가드 대상).
 *  - homeroomStudentId: 담임 기록은 Student.id(raw, 변환 없음)로 식별한다.
 *  - classObservationStudentKey: 수업반 관찰은 "학년-반-번호"(grade-classNo-studentNo) + classId 복합키.
 *  - attendanceMatch: 출결은 studentNumber(명단 내 번호) 매칭.
 * 형식이 바뀌면 외부 AI R/W 가 빈 응답 또는 오귀속(개인정보 사고)으로 이어진다.
 */
export const IDENTITY_KEY_CONTRACT = {
  homeroomStudentId: 'Student.id',
  classObservationStudentKey: 'grade-classNo-studentNo+classId',
  attendanceMatch: 'studentNumber',
};

/** 계약 전체를 하나의 객체로(생성기·체크·테스트가 공유). */
export const AI_BRIDGE_WRITE_CONTRACT = {
  WRITE_DOMAINS,
  WRITE_OPS,
  OBSERVATION_FIELDS,
  OBSERVATION_CONTENT_MAX,
  RECORD_NOTE_FIELDS,
  RECORD_NOTE_CONTENT_MAX,
  ATTENDANCE_STATUSES,
  ATTENDANCE_REASONS,
  IDENTITY_KEY_CONTRACT,
};
