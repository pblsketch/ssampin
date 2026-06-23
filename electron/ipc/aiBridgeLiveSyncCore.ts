/**
 * AI 브릿지 live-sync 쓰기 — 순수 로직(electron 비의존, 단위 테스트 가능).
 *
 * 배경: 외부 AI 의 쓰기를 쌤핀이 "실행 중"일 때도 안전하게 받기 위한 loopback 제어 서버의 핵심 규칙.
 * 직접 파일쓰기는 앱 실행 중이면 렌더러 메모리 저장이 덮어쓸 수 있어(write.ts 한계), 실행 중에는
 * 이 창구를 통해 렌더러 store 액션으로 위임한다(앱 닫힘 시에만 브릿지가 직접 파일쓰기로 폴백).
 *
 * 구성:
 *  - control.json: 서버 포트·토큰·pid·heartbeat 광고 → 브릿지가 읽어 "앱 실행 중" 판정.
 *  - capability.json: 쓰기/내용 허용 토글(설정에서 기록, 브릿지가 매 호출 읽음 — env 게이트 대체).
 *  - 요청 인증: 127.0.0.1 전용 + POST + 토큰 일치 + Origin 부재(브라우저 SSRF 차단).
 *  - 페이로드 검증: 허용 도메인(todos/events)·연산(create/update/complete/delete)만.
 *
 * 보안·판정 로직을 여기 모아 테스트하고, http 서버/electron 창 위임은 aiBridgeLiveSync.ts 가 주입한다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = '.ssampin-aibridge';
const CONTROL_FILE = 'control.json';
const CAPABILITY_FILE = 'capability.json';

export function stateDir(dataDir: string): string {
  return path.join(dataDir, STATE_DIR);
}
export function controlPath(dataDir: string): string {
  return path.join(stateDir(dataDir), CONTROL_FILE);
}
export function capabilityPath(dataDir: string): string {
  return path.join(stateDir(dataDir), CAPABILITY_FILE);
}

// ─────────────────────────── control 파일(서버 광고) ───────────────────────────

export interface ControlInfo {
  /** loopback 서버 포트(127.0.0.1). */
  readonly port: number;
  /** 요청 인증 토큰(불투명). */
  readonly token: string;
  /** 서버(쌤핀 main) 프로세스 pid — 브릿지가 생존 확인. */
  readonly pid: number;
  /** 마지막 heartbeat(epoch ms) — 신선도로 좀비 control 차단. */
  readonly heartbeatAt: number;
}

/** 불투명 제어 토큰(urlsafe 32자) — loopback 요청 인증용. */
export function generateControlToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function atomicWriteJson(filePath: string, value: unknown, mode?: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  // mode 지정 시 생성 시점부터 소유자 전용으로 만든다(umask 영향이 남을 수 있어 rename 후 chmod 로 재강제).
  fs.writeFileSync(
    tmp,
    JSON.stringify(value),
    mode === undefined ? { encoding: 'utf-8' } : { encoding: 'utf-8', mode },
  );
  fs.renameSync(tmp, filePath);
  if (mode !== undefined) {
    // #8: 인증 토큰이 평문으로 담기는 control.json 은 소유자 전용(0600). POSIX 에선 권한이 적용되고,
    //   Windows 는 POSIX 권한 비트를 무시하므로 best-effort 다(NTFS ACL 은 OS 기본값에 맡김) — 실패 무시.
    try {
      fs.chmodSync(filePath, mode);
    } catch {
      /* Windows 등 미지원 플랫폼 — best-effort */
    }
  }
}

export function writeControlFile(dataDir: string, info: ControlInfo): void {
  atomicWriteJson(controlPath(dataDir), info, 0o600); // #8: 토큰 파일이라 소유자 전용
}

/** control.json 파싱(없거나 손상/형식위반이면 null). */
export function readControlFile(dataDir: string): ControlInfo | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(controlPath(dataDir), 'utf-8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const port = o['port'];
  const token = o['token'];
  const pid = o['pid'];
  const heartbeatAt = o['heartbeatAt'];
  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    typeof token !== 'string' ||
    token.length === 0 ||
    typeof pid !== 'number' ||
    typeof heartbeatAt !== 'number'
  ) {
    return null;
  }
  return { port, token, pid, heartbeatAt };
}

export function removeControlFile(dataDir: string): void {
  try {
    fs.unlinkSync(controlPath(dataDir));
  } catch {
    /* 이미 없음 */
  }
}

/**
 * control.json 이 이 서버(token 일치)의 것일 때만 제거(#3 재시작 레이스 방어).
 * off→on 토글로 새 서버가 이미 control 을 자기 token 으로 덮어썼다면, 종료 중인 이전 서버의 close 콜백이
 * 그것을 지우지 않게 한다 — 새 서버가 listen 중인데 control 이 absent 가 되어(브릿지가 "앱 닫힘"으로 오판해
 * 직접 파일쓰기로 덮어쓰는) 위험을 막는다. token 부재/일치면 제거(자기 것 또는 미상).
 */
export function removeControlFileIfOwned(dataDir: string, token: string): void {
  const cur = readControlFile(dataDir);
  if (cur) {
    if (cur.token !== token) return; // 다른(새) 서버가 소유 중 → 보존
    removeControlFile(dataDir); // 내 것 → 제거
    return;
  }
  // cur=null: 파일이 손상(존재하나 파싱 불가)이면 소유 판별이 불가능하므로 fail-closed 로 보존한다
  //   (새 서버가 막 쓰는 중일 수 있음). 아예 없으면 지울 것도 없다.
  if (fs.existsSync(controlPath(dataDir))) return; // 손상 → 건드리지 않음
  removeControlFile(dataDir); // 파일 없음 → no-op
}

/**
 * heartbeat 가 maxAgeMs 이내로 신선한가(앱 생존 추정).
 * fail-closed: 미래로 과도하게(>1s) 앞선 시각이나 오래된 시각은 신선하지 않음으로 본다.
 */
export function isHeartbeatFresh(info: ControlInfo, now: number, maxAgeMs: number): boolean {
  if (!Number.isFinite(info.heartbeatAt)) return false;
  const age = now - info.heartbeatAt;
  return age >= -1000 && age <= maxAgeMs;
}

// ─────────────────────────── capability 파일(쓰기/내용 토글) ───────────────────────────

export interface Capability {
  readonly allowWrite: boolean;
  readonly allowContent: boolean;
  /** 수행평가 채점 쓰기(공식 성적기록) — allowWrite 와 독립한 별도 고위험 토글. fail-closed 기본 OFF. */
  readonly allowGradeWrite: boolean;
  /** 생기부 초안 쓰기(법정 공식기록) — allowWrite 와 독립한 별도 고위험 토글. fail-closed 기본 OFF. */
  readonly allowRecordWrite: boolean;
  readonly updatedAt: number;
}

export function writeCapability(dataDir: string, caps: Capability): void {
  atomicWriteJson(capabilityPath(dataDir), caps);
}

/** setCapability 부분 갱신 입력 — 지정한 키만 바꾸고 나머지는 보존한다. */
export type CapabilityPatch = Partial<
  Pick<Capability, 'allowWrite' | 'allowContent' | 'allowGradeWrite' | 'allowRecordWrite'>
>;

/**
 * capability.json 부분 갱신(병합 쓰기). 지정한 토글만 바꾸고 나머지는 이전 값으로 보존하되,
 * **이 타입이 모르는 필드도 그대로 보존**한다(다른 기능 소유 토글). 토글 하나를 바꿔 다른 기능의
 * 토글을 조용히 끄는 사고(클로버)를 막는다. 갱신된 Capability 를 반환.
 */
export function mergeCapability(dataDir: string, patch: CapabilityPatch): Capability {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(capabilityPath(dataDir), 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    /* 없거나 손상 → 빈 객체에서 시작(fail-closed: 미지정 토글은 false 로) */
  }
  const next: Record<string, unknown> = {
    ...raw, // 알 수 없는 필드 보존
    allowWrite: patch.allowWrite ?? raw['allowWrite'] === true,
    allowContent: patch.allowContent ?? raw['allowContent'] === true,
    allowGradeWrite: patch.allowGradeWrite ?? raw['allowGradeWrite'] === true,
    allowRecordWrite: patch.allowRecordWrite ?? raw['allowRecordWrite'] === true,
    updatedAt: Date.now(),
  };
  atomicWriteJson(capabilityPath(dataDir), next);
  return readCapability(dataDir);
}

/**
 * capability.json 읽기. 없거나 손상이면 모든 권한 OFF(fail-closed) 반환 —
 * 설정에서 명시적으로 켜야만 쓰기/내용 노출이 허용된다.
 */
export function readCapability(dataDir: string): Capability {
  const off: Capability = {
    allowWrite: false,
    allowContent: false,
    allowGradeWrite: false,
    allowRecordWrite: false,
    updatedAt: 0,
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(capabilityPath(dataDir), 'utf-8'));
  } catch {
    return off;
  }
  if (!parsed || typeof parsed !== 'object') return off;
  const o = parsed as Record<string, unknown>;
  return {
    allowWrite: o['allowWrite'] === true,
    allowContent: o['allowContent'] === true,
    allowGradeWrite: o['allowGradeWrite'] === true,
    allowRecordWrite: o['allowRecordWrite'] === true,
    updatedAt: typeof o['updatedAt'] === 'number' ? o['updatedAt'] : 0,
  };
}

// ─────────────────────────── 요청 인증 ───────────────────────────

export type AuthResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly reason: string };

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * loopback 쓰기 요청 인증. 127.0.0.1 바인드는 서버가 보장하고, 여기서는:
 *  - POST 만 허용(405)
 *  - Origin 헤더가 있으면 거부(403) — 브라우저/웹페이지의 교차출처 요청(SSRF) 차단
 *  - 토큰 불일치 거부(401, 상수시간 비교)
 */
export function authorizeWriteRequest(input: {
  readonly method: string | undefined;
  readonly token: string | undefined;
  readonly expectedToken: string;
  readonly origin: string | undefined;
}): AuthResult {
  if ((input.method ?? '').toUpperCase() !== 'POST') {
    return { ok: false, status: 405, reason: 'POST 만 허용됩니다.' };
  }
  // #9: Origin 헤더가 조금이라도 있으면 거부한다('null'·빈문자 포함). 정상 경로인 Node/MCP 로컬
  //   요청은 Origin 헤더 자체가 없다(undefined). 'null' Origin(샌드박스 iframe·file: 컨텍스트 등)도
  //   브라우저발 요청이므로 허용하면 SSRF 우회 표면이 된다 — 없을 때만 통과시킨다.
  if (input.origin !== undefined) {
    return { ok: false, status: 403, reason: 'Origin 헤더가 있는 요청(브라우저)은 거부됩니다.' };
  }
  if (!input.token || !timingSafeEqualStr(input.token, input.expectedToken)) {
    return { ok: false, status: 401, reason: '토큰이 일치하지 않습니다.' };
  }
  return { ok: true };
}

// ─────────────────────────── 쓰기 페이로드 검증 ───────────────────────────

export type WriteDomain =
  | 'todos'
  | 'events'
  | 'recordDrafts'
  | 'memos'
  | 'bookmarks'
  | 'notes'
  | 'attendance'
  | 'homeroomAttendance';
export type WriteOp = 'create' | 'update' | 'complete' | 'delete';

/**
 * 도메인별 쓰기 게이트 판정(fail-closed) — loopback 서버는 allowWrite 또는 allowRecordWrite 중
 * 하나만 켜져도 가동하므로 "서버 가동"이 곧 "이 쓰기 허용"이 아니다. 생기부 초안은 allowRecordWrite,
 * 그 외(할일·일정·메모·북마크·노트)는 allowWrite 가 켜진 경우에만 허용한다(꺼진 권한으로의 우회 차단).
 */
export function isDomainWriteAllowed(domain: WriteDomain, caps: Capability): boolean {
  return domain === 'recordDrafts' ? caps.allowRecordWrite : caps.allowWrite;
}

const DOMAINS: ReadonlySet<string> = new Set([
  'todos',
  'events',
  'recordDrafts',
  'memos',
  'bookmarks',
  'notes',
  'attendance',
  'homeroomAttendance',
]);
const OPS: ReadonlySet<string> = new Set(['create', 'update', 'complete', 'delete']);

// 출결 enum — 브릿지 entities/attendance 와 동일(서버가 클라를 신뢰하지 않고 재검증).
const ATTENDANCE_STATUSES: ReadonlySet<string> = new Set([
  'present',
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
]);
const ATTENDANCE_REASONS: ReadonlySet<string> = new Set(['질병', '인정', '미인정', '기타']);
const MEMO_ATT_MAX = 500;

/** 출결 학생 1명(교시별 단건)의 status/reason/memo 검증. 정상이면 null. */
function checkAttendanceStudentFields(s: unknown, requireNumber: boolean): string | null {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'students 항목은 객체여야 합니다.';
  const o = s as Record<string, unknown>;
  if (requireNumber && (typeof o['number'] !== 'number' || !Number.isInteger(o['number']))) {
    return 'students.number 는 정수여야 합니다.';
  }
  if (typeof o['status'] !== 'string' || !ATTENDANCE_STATUSES.has(o['status'])) {
    return 'students.status 는 present|absent|late|earlyLeave|classAbsence 여야 합니다.';
  }
  if (
    o['reason'] !== undefined &&
    (typeof o['reason'] !== 'string' || !ATTENDANCE_REASONS.has(o['reason']))
  ) {
    return 'students.reason 은 질병|인정|미인정|기타 여야 합니다.';
  }
  if (
    o['memo'] !== undefined &&
    (typeof o['memo'] !== 'string' || o['memo'].length > MEMO_ATT_MAX)
  ) {
    return `students.memo 는 최대 ${MEMO_ATT_MAX}자 문자열이어야 합니다.`;
  }
  return null;
}

/** 교과반 출결(attendance) payload 검증. create/delete 공통 키 + create 의 students 검증. */
function checkAttendancePayload(op: string, d: Record<string, unknown>): string | null {
  if (typeof d['classId'] !== 'string' || d['classId'].trim().length === 0) {
    return 'attendance 에는 classId 가 필요합니다.';
  }
  if (d['groupId'] !== undefined && typeof d['groupId'] !== 'string') {
    return 'groupId 는 문자열이어야 합니다.';
  }
  if (typeof d['date'] !== 'string' || !DATE_RE.test(d['date'])) {
    return 'date 는 YYYY-MM-DD 형식이어야 합니다.';
  }
  if (
    typeof d['period'] !== 'number' ||
    !Number.isInteger(d['period']) ||
    d['period'] < 0 ||
    d['period'] > 20
  ) {
    return 'period 는 0 이상 20 이하의 정수여야 합니다.';
  }
  if (op === 'create') {
    if (!Array.isArray(d['students'])) return 'attendance 생성에는 students 배열이 필요합니다.';
    for (const s of d['students']) {
      const err = checkAttendanceStudentFields(s, true);
      if (err) return err;
    }
  }
  return null;
}

/** 담임 일일 출결(homeroomAttendance) payload 검증. create 만 지원. 학생별 allDay 또는 periods. */
function checkHomeroomAttendancePayload(d: Record<string, unknown>): string | null {
  if (typeof d['date'] !== 'string' || !DATE_RE.test(d['date'])) {
    return 'date 는 YYYY-MM-DD 형식이어야 합니다.';
  }
  if (!Array.isArray(d['students']) || d['students'].length === 0) {
    return 'homeroomAttendance 에는 students 배열(1명 이상)이 필요합니다.';
  }
  for (const s of d['students']) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return 'students 항목은 객체여야 합니다.';
    const o = s as Record<string, unknown>;
    if (typeof o['number'] !== 'number' || !Number.isInteger(o['number'])) {
      return 'students.number(학생 번호) 는 정수여야 합니다.';
    }
    const hasAllDay = o['allDay'] !== undefined;
    const hasPeriods = o['periods'] !== undefined;
    if (hasAllDay === hasPeriods) {
      return 'students 각 항목은 allDay 또는 periods 중 하나만 가져야 합니다.';
    }
    if (hasAllDay) {
      const err = checkAttendanceStudentFields(o['allDay'], false);
      if (err) return err;
    } else {
      if (!Array.isArray(o['periods']) || o['periods'].length === 0) {
        return 'students.periods 는 1개 이상의 배열이어야 합니다.';
      }
      for (const p of o['periods']) {
        if (!p || typeof p !== 'object' || Array.isArray(p))
          return 'periods 항목은 객체여야 합니다.';
        const po = p as Record<string, unknown>;
        if (
          typeof po['period'] !== 'number' ||
          !Number.isInteger(po['period']) ||
          po['period'] < 0 ||
          po['period'] > 20
        ) {
          return 'periods.period 는 0 이상 20 이하의 정수여야 합니다.';
        }
        const err = checkAttendanceStudentFields(po, false);
        if (err) return err;
      }
    }
  }
  return null;
}

const RECORD_AREAS: ReadonlySet<string> = new Set([
  'autonomy',
  'career',
  'behavior',
  'subject',
  'individualSubject',
  'club',
  'subjectDev',
]);

// #5: 앱 측(서버) 검증을 브릿지 writeTools 와 동일 강도로 — 토큰을 가진 로컬 호출자가 브릿지의
//   길이/형식/enum 검증을 건너뛰고 잘못된 값을 주입하는 것을 서버에서도 막는다(서버가 클라를 신뢰하지 않음).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/; // 할일 시간(일정 time 은 '09:00 - 10:00' 등 자유서술 — 브릿지와 동일하게 미강제)
const PRIORITIES: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'none']);
const TODO_STATUS: ReadonlySet<string> = new Set(['todo', 'inProgress', 'done']);

/** todos data 필드값 검증(create·update 공통). 위반 시 사유 문자열, 정상이면 null. */
function checkTodoFields(d: Record<string, unknown>): string | null {
  if (d['text'] !== undefined) {
    if (typeof d['text'] !== 'string') return 'text 는 문자열이어야 합니다.';
    if (d['text'].length > 500) return 'text 는 최대 500자입니다.';
  }
  if (
    d['dueDate'] !== undefined &&
    (typeof d['dueDate'] !== 'string' || !DATE_RE.test(d['dueDate']))
  ) {
    return 'dueDate 는 YYYY-MM-DD 형식이어야 합니다.';
  }
  if (
    d['priority'] !== undefined &&
    (typeof d['priority'] !== 'string' || !PRIORITIES.has(d['priority']))
  ) {
    return 'priority 는 high|medium|low|none 이어야 합니다.';
  }
  if (d['time'] !== undefined && (typeof d['time'] !== 'string' || !TIME_RE.test(d['time']))) {
    return 'time 은 HH:mm 형식이어야 합니다.';
  }
  if (
    d['status'] !== undefined &&
    (typeof d['status'] !== 'string' || !TODO_STATUS.has(d['status']))
  ) {
    return 'status 는 todo|inProgress|done 이어야 합니다.';
  }
  if (d['category'] !== undefined && typeof d['category'] !== 'string') {
    return 'category 는 문자열이어야 합니다.';
  }
  // completed 는 브리지 update 스키마에 없고 complete op 전용이라 검증 집합에서 제외(렌더러도 적용 안 함, #5).
  return null;
}

/** events data 필드값 검증(create·update 공통). 위반 시 사유 문자열, 정상이면 null. (브리지와 동일하게 description 미지원.) */
function checkEventFields(d: Record<string, unknown>): string | null {
  if (d['title'] !== undefined) {
    if (typeof d['title'] !== 'string') return 'title 은 문자열이어야 합니다.';
    if (d['title'].length > 200) return 'title 은 최대 200자입니다.';
  }
  if (d['date'] !== undefined && (typeof d['date'] !== 'string' || !DATE_RE.test(d['date']))) {
    return 'date 는 YYYY-MM-DD 형식이어야 합니다.';
  }
  for (const k of ['category', 'time', 'location'] as const) {
    if (d[k] !== undefined && typeof d[k] !== 'string') return `${k} 는 문자열이어야 합니다.`;
  }
  return null;
}

const MEMO_COLORS: ReadonlySet<string> = new Set(['yellow', 'pink', 'green', 'blue']);
const MEMO_MAX = 2000;

/** memos data 필드값 검증(create·update 공통). 위반 시 사유 문자열, 정상이면 null. (브리지 memoTools 와 동일 강도.) */
function checkMemoFields(d: Record<string, unknown>): string | null {
  if (d['content'] !== undefined) {
    if (typeof d['content'] !== 'string') return 'content 는 문자열이어야 합니다.';
    if (d['content'].length > MEMO_MAX) return `content 는 최대 ${MEMO_MAX}자입니다.`;
  }
  if (
    d['color'] !== undefined &&
    (typeof d['color'] !== 'string' || !MEMO_COLORS.has(d['color']))
  ) {
    return 'color 는 yellow|pink|green|blue 여야 합니다.';
  }
  if (d['archived'] !== undefined && typeof d['archived'] !== 'boolean') {
    return 'archived 는 boolean 이어야 합니다.';
  }
  return null;
}

const BOOKMARK_NAME_MAX = 200;
const BOOKMARK_URL_MAX = 2048;
const BOOKMARK_EMOJI_MAX = 16;
const BOOKMARK_KINDS: ReadonlySet<string> = new Set(['bookmark', 'group']);

/** http/https URL 만 허용(쌤핀 validateBookmarkUrl 미러). */
function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** bookmarks data 필드값 검증(create·update 공통). 위반 시 사유 문자열, 정상이면 null. (브리지 bookmarkTools 와 동일 강도.) */
function checkBookmarkFields(d: Record<string, unknown>): string | null {
  if (
    d['kind'] !== undefined &&
    (typeof d['kind'] !== 'string' || !BOOKMARK_KINDS.has(d['kind']))
  ) {
    return 'kind 는 bookmark|group 이어야 합니다.';
  }
  if (d['name'] !== undefined) {
    if (typeof d['name'] !== 'string') return 'name 은 문자열이어야 합니다.';
    if (d['name'].length > BOOKMARK_NAME_MAX) return `name 은 최대 ${BOOKMARK_NAME_MAX}자입니다.`;
  }
  if (d['url'] !== undefined) {
    if (typeof d['url'] !== 'string') return 'url 은 문자열이어야 합니다.';
    if (d['url'].length > BOOKMARK_URL_MAX) return `url 은 최대 ${BOOKMARK_URL_MAX}자입니다.`;
    if (!isHttpUrl(d['url'])) return 'url 은 http:// 또는 https:// 로 시작해야 합니다.';
  }
  if (d['groupId'] !== undefined && typeof d['groupId'] !== 'string')
    return 'groupId 는 문자열이어야 합니다.';
  if (d['emoji'] !== undefined) {
    if (typeof d['emoji'] !== 'string') return 'emoji 는 문자열이어야 합니다.';
    if (d['emoji'].length > BOOKMARK_EMOJI_MAX)
      return `emoji 는 최대 ${BOOKMARK_EMOJI_MAX}자입니다.`;
  }
  return null;
}

const NOTE_TITLE_MAX = 200;
const NOTE_BODY_MAX = 100_000;
const NOTE_KINDS: ReadonlySet<string> = new Set(['notebook', 'section', 'page']);

/** notes data 필드값 검증(create·update 공통). 위반 시 사유 문자열, 정상이면 null. (브리지 noteTools 와 동일 강도.) */
function checkNoteFields(d: Record<string, unknown>): string | null {
  if (d['kind'] !== undefined && (typeof d['kind'] !== 'string' || !NOTE_KINDS.has(d['kind']))) {
    return 'kind 는 notebook|section|page 이어야 합니다.';
  }
  if (d['title'] !== undefined) {
    if (typeof d['title'] !== 'string') return 'title 은 문자열이어야 합니다.';
    if (d['title'].length > NOTE_TITLE_MAX) return `title 은 최대 ${NOTE_TITLE_MAX}자입니다.`;
  }
  if (d['body'] !== undefined) {
    if (typeof d['body'] !== 'string') return 'body 는 문자열이어야 합니다.';
    if (d['body'].length > NOTE_BODY_MAX) return `body 는 최대 ${NOTE_BODY_MAX}자입니다.`;
  }
  if (d['notebookId'] !== undefined && typeof d['notebookId'] !== 'string')
    return 'notebookId 는 문자열이어야 합니다.';
  if (d['sectionId'] !== undefined && typeof d['sectionId'] !== 'string')
    return 'sectionId 는 문자열이어야 합니다.';
  if (d['pinned'] !== undefined && typeof d['pinned'] !== 'boolean')
    return 'pinned 는 boolean 이어야 합니다.';
  return null;
}

// #5: (도메인×연산)별 허용 필드 — 브리지 writeTools 의 args 와 1:1 정렬. data 에 이 밖의 필드가 있으면 거부
//   ("out-of-spec 필드 거부" — 토큰 보유 로컬 호출자가 브리지 스키마 밖 필드를 주입하지 못하게). complete/delete
//   는 대상 id 만. (startDate·completed·description 등은 브리지에 없어 제외 → 자동으로 거부된다.)
const TODO_FIELDS: Readonly<Record<WriteOp, ReadonlySet<string>>> = {
  create: new Set(['text', 'dueDate', 'priority', 'category', 'time']),
  update: new Set(['id', 'text', 'dueDate', 'priority', 'category', 'time', 'status']),
  complete: new Set(['id']),
  delete: new Set(['id']),
};
const EVENT_FIELDS: Readonly<Record<WriteOp, ReadonlySet<string>>> = {
  create: new Set(['title', 'date', 'category', 'time', 'location']),
  update: new Set(['id', 'title', 'date', 'category', 'time', 'location']),
  complete: new Set(['id']), // events 는 complete 미지원 — 필드검사는 통과시키되 적용 단계에서 거부
  delete: new Set(['id']),
};
const MEMO_FIELDS: Readonly<Record<WriteOp, ReadonlySet<string>>> = {
  create: new Set(['content', 'color']),
  update: new Set(['id', 'content', 'color', 'archived']),
  complete: new Set(['id']), // memos 는 complete 미지원 — 필드검사는 통과, 적용 단계에서 거부
  delete: new Set(['id']),
};
const BOOKMARK_FIELDS: Readonly<Record<WriteOp, ReadonlySet<string>>> = {
  // create 는 kind 로 분기(bookmark=name/url/groupId, group=name/emoji) — 둘의 합집합을 허용.
  create: new Set(['kind', 'name', 'url', 'groupId', 'emoji']),
  update: new Set(['id', 'name', 'url']), // 북마크 항목 수정만(그룹 수정은 본체 UI)
  complete: new Set(['id']), // bookmarks 는 complete 미지원 — 적용 단계에서 거부
  delete: new Set(['id']),
};
const NOTE_FIELDS: Readonly<Record<WriteOp, ReadonlySet<string>>> = {
  // create 는 kind 로 분기(notebook=title, section=notebookId/title, page=sectionId/title/body) — 합집합 허용.
  create: new Set(['kind', 'title', 'notebookId', 'sectionId', 'body']),
  update: new Set(['id', 'title', 'body', 'pinned']), // 페이지 수정만(노트북·섹션 수정은 본체 UI)
  complete: new Set(['id']), // notes 는 complete 미지원 — 적용 단계에서 거부
  delete: new Set(['id']),
};

/** data 에 (도메인×연산) 허용 밖 필드가 있으면 사유 반환(필드명은 echo 하지 않음 — 임의 문자열 누출 방지). 정상이면 null. */
function checkAllowedFields(
  allowed: ReadonlySet<string>,
  d: Record<string, unknown>,
): string | null {
  for (const k of Object.keys(d)) {
    if (!allowed.has(k)) return '허용되지 않은 필드가 포함되어 있습니다.';
  }
  return null;
}

export interface ApplyWriteRequest {
  readonly domain: WriteDomain;
  readonly op: WriteOp;
  /** 멱등성 키 — 동일 키 재요청은 중복 적용하지 않는다(앱경유·직접쓰기 공유). */
  readonly idempotencyKey: string;
  /** 도메인별 안전 필드만(text/title/date 등). 식별자·내부 메타는 어댑터가 무시. */
  readonly data: Record<string, unknown>;
}

export type ValidateResult =
  | { readonly ok: true; readonly value: ApplyWriteRequest }
  | { readonly ok: false; readonly reason: string };

/**
 * 위임 쓰기 페이로드 검증. 허용 도메인·연산만, 멱등키 필수, create 는 도메인별 필수 필드 확인.
 * (실제 store 적용은 렌더러가 하며, 여기서는 형태·범위만 본다.)
 */
export function validateApplyWrite(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: '본문이 객체가 아닙니다.' };
  }
  const o = raw as Record<string, unknown>;
  const domain = o['domain'];
  const op = o['op'];
  const idempotencyKey = o['idempotencyKey'];
  const data = o['data'];
  if (typeof domain !== 'string' || !DOMAINS.has(domain)) {
    return {
      ok: false,
      reason:
        'domain 은 todos|events|recordDrafts|memos|bookmarks|notes|attendance|homeroomAttendance 여야 합니다.',
    };
  }
  if (typeof op !== 'string' || !OPS.has(op)) {
    return { ok: false, reason: 'op 은 create|update|complete|delete 여야 합니다.' };
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    return { ok: false, reason: 'idempotencyKey 가 필요합니다.' };
  }
  // 길이 상한 — 멱등키는 렌더러 영속 가드의 합성키(localStorage)에 쓰이므로, 무한 길이를 막아
  //   저장 용량을 bounded 하게 유지한다(#7). 정상 경로(브리지 파생키)는 수십 자 수준.
  if (idempotencyKey.length > 256) {
    return { ok: false, reason: 'idempotencyKey 가 너무 깁니다(최대 256자).' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'data 는 객체여야 합니다.' };
  }
  const d = data as Record<string, unknown>;
  // #5: 브리지와 동일 강도 — (1) 허용 밖 필드 거부(strict allowlist) + (2) 존재 필드의 형식·길이·enum 검증.
  //   둘 다 op 와 무관하게 적용된다(필수 여부는 아래 op 별 분기에서).
  if (
    domain === 'todos' ||
    domain === 'events' ||
    domain === 'memos' ||
    domain === 'bookmarks' ||
    domain === 'notes'
  ) {
    const fieldMap =
      domain === 'todos'
        ? TODO_FIELDS
        : domain === 'events'
          ? EVENT_FIELDS
          : domain === 'memos'
            ? MEMO_FIELDS
            : domain === 'bookmarks'
              ? BOOKMARK_FIELDS
              : NOTE_FIELDS;
    const fieldErr = checkAllowedFields(fieldMap[op as WriteOp], d);
    if (fieldErr) return { ok: false, reason: fieldErr };
    const valErr =
      domain === 'todos'
        ? checkTodoFields(d)
        : domain === 'events'
          ? checkEventFields(d)
          : domain === 'memos'
            ? checkMemoFields(d)
            : domain === 'bookmarks'
              ? checkBookmarkFields(d)
              : checkNoteFields(d);
    if (valErr) return { ok: false, reason: valErr };
  }
  // 생기부 초안은 create(upsert)만 지원 — 수정·삭제는 본체 UI 에서 한다(법정기록 보수화).
  if (domain === 'recordDrafts' && op !== 'create') {
    return { ok: false, reason: '생기부 초안은 create(저장)만 지원합니다.' };
  }
  // 교과반 출결 — create(upsert)/delete 지원, 중첩 students 검증.
  if (domain === 'attendance') {
    if (op !== 'create' && op !== 'delete') {
      return { ok: false, reason: '출결은 create(저장) 또는 delete(삭제)만 지원합니다.' };
    }
    const err = checkAttendancePayload(op, d);
    if (err) return { ok: false, reason: err };
  }
  // 담임 일일 출결 — create(upsert)만. 학생별 allDay/periods 검증.
  if (domain === 'homeroomAttendance') {
    if (op !== 'create') {
      return { ok: false, reason: '담임 출결은 create(저장)만 지원합니다.' };
    }
    const err = checkHomeroomAttendancePayload(d);
    if (err) return { ok: false, reason: err };
  }
  if (op === 'create') {
    if (domain === 'todos' && (typeof d['text'] !== 'string' || d['text'].trim().length === 0)) {
      return { ok: false, reason: '할일 생성에는 text 가 필요합니다.' };
    }
    if (
      domain === 'memos' &&
      (typeof d['content'] !== 'string' || d['content'].trim().length === 0)
    ) {
      return { ok: false, reason: '메모 생성에는 content 가 필요합니다.' };
    }
    if (domain === 'bookmarks') {
      const kind = d['kind'];
      if (kind !== 'bookmark' && kind !== 'group') {
        return { ok: false, reason: '북마크 생성에는 kind(bookmark|group)가 필요합니다.' };
      }
      if (typeof d['name'] !== 'string' || d['name'].trim().length === 0) {
        return { ok: false, reason: '북마크 생성에는 name 이 필요합니다.' };
      }
      if (kind === 'bookmark') {
        if (typeof d['url'] !== 'string' || !isHttpUrl(d['url'])) {
          return { ok: false, reason: '북마크 생성에는 url(http/https)이 필요합니다.' };
        }
        if (typeof d['groupId'] !== 'string' || d['groupId'].trim().length === 0) {
          return { ok: false, reason: '북마크 생성에는 groupId 가 필요합니다.' };
        }
      }
    }
    if (domain === 'notes') {
      const kind = d['kind'];
      if (kind !== 'notebook' && kind !== 'section' && kind !== 'page') {
        return { ok: false, reason: '노트 생성에는 kind(notebook|section|page)가 필요합니다.' };
      }
      if (typeof d['title'] !== 'string' || d['title'].trim().length === 0) {
        return { ok: false, reason: '노트 생성에는 title 이 필요합니다.' };
      }
      if (
        kind === 'section' &&
        (typeof d['notebookId'] !== 'string' || d['notebookId'].trim().length === 0)
      ) {
        return { ok: false, reason: '섹션 생성에는 notebookId 가 필요합니다.' };
      }
      if (
        kind === 'page' &&
        (typeof d['sectionId'] !== 'string' || d['sectionId'].trim().length === 0)
      ) {
        return { ok: false, reason: '페이지 생성에는 sectionId 가 필요합니다.' };
      }
    }
    if (domain === 'events') {
      if (typeof d['title'] !== 'string' || d['title'].trim().length === 0) {
        return { ok: false, reason: '일정 생성에는 title 이 필요합니다.' };
      }
      if (typeof d['date'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d['date'])) {
        return { ok: false, reason: '일정 생성에는 date(YYYY-MM-DD)가 필요합니다.' };
      }
    }
    if (domain === 'recordDrafts') {
      if (typeof d['area'] !== 'string' || !RECORD_AREAS.has(d['area'])) {
        return { ok: false, reason: '생기부 초안 저장에는 유효한 area 가 필요합니다.' };
      }
      if (typeof d['studentRef'] !== 'string' || d['studentRef'].trim().length === 0) {
        return { ok: false, reason: '생기부 초안 저장에는 studentRef 가 필요합니다.' };
      }
      if (typeof d['content'] !== 'string' || d['content'].trim().length === 0) {
        return { ok: false, reason: '생기부 초안 저장에는 content 가 필요합니다.' };
      }
    }
  }
  return {
    ok: true,
    value: { domain: domain as WriteDomain, op: op as WriteOp, idempotencyKey, data: d },
  };
}
