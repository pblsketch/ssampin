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

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function writeControlFile(dataDir: string, info: ControlInfo): void {
  atomicWriteJson(controlPath(dataDir), info);
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
  const origin = input.origin;
  if (origin !== undefined && origin !== '' && origin.toLowerCase() !== 'null') {
    return { ok: false, status: 403, reason: 'Origin 헤더가 있는 요청(브라우저)은 거부됩니다.' };
  }
  if (!input.token || !timingSafeEqualStr(input.token, input.expectedToken)) {
    return { ok: false, status: 401, reason: '토큰이 일치하지 않습니다.' };
  }
  return { ok: true };
}

// ─────────────────────────── 쓰기 페이로드 검증 ───────────────────────────

export type WriteDomain = 'todos' | 'events' | 'recordDrafts';
export type WriteOp = 'create' | 'update' | 'complete' | 'delete';

const DOMAINS: ReadonlySet<string> = new Set(['todos', 'events', 'recordDrafts']);
const OPS: ReadonlySet<string> = new Set(['create', 'update', 'complete', 'delete']);

const RECORD_AREAS: ReadonlySet<string> = new Set([
  'autonomy',
  'career',
  'behavior',
  'subject',
  'individualSubject',
  'club',
  'subjectDev',
]);

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
    return { ok: false, reason: 'domain 은 todos|events 여야 합니다.' };
  }
  if (typeof op !== 'string' || !OPS.has(op)) {
    return { ok: false, reason: 'op 은 create|update|complete|delete 여야 합니다.' };
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    return { ok: false, reason: 'idempotencyKey 가 필요합니다.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'data 는 객체여야 합니다.' };
  }
  const d = data as Record<string, unknown>;
  // 생기부 초안은 create(upsert)만 지원 — 수정·삭제는 본체 UI 에서 한다(법정기록 보수화).
  if (domain === 'recordDrafts' && op !== 'create') {
    return { ok: false, reason: '생기부 초안은 create(저장)만 지원합니다.' };
  }
  if (op === 'create') {
    if (domain === 'todos' && (typeof d['text'] !== 'string' || d['text'].trim().length === 0)) {
      return { ok: false, reason: '할일 생성에는 text 가 필요합니다.' };
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
