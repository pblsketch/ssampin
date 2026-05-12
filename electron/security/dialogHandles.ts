/**
 * dialog 핸들 레지스트리 — 저장/열기 다이얼로그가 발급하는 1회용 경로 핸들.
 *
 * 배경: 기존에는 렌더러가 `export:writeFile(filePath, data)` / `export:openFile(filePath)`
 * 처럼 임의의 절대 경로 문자열을 메인에 던질 수 있었다 → 침해된 렌더러(예: 챗봇/담벼락
 * 컨텐츠를 통한 XSS)가 메인에게 임의 위치에 쓰기/실행을 시킬 수 있는 신뢰 경계 누수.
 *
 * 변경: 경로 문자열은 메인이 dialog(showSaveDialog / showOpenDialog)에서 직접 사용자에게
 * 받은 것만 핸들 레지스트리에 등록되고, 후속 IPC(write/open)는 핸들(불투명 UUID)만 받는다.
 * 렌더러는 경로 문자열을 만질 수 없다. (Capability over name.)
 *
 * - 키: `crypto.randomUUID()`
 * - TTL: 5분 (그 이상 묵힌 핸들은 만료)
 * - write 핸들: 1회 write 소비. write 전·후 모두 같은 핸들로 open 가능(소비 안 됨).
 * - open 핸들: 소비 안 함 — 같은 파일을 여러 번 열 수 있음. 단 TTL 적용.
 * - 만료 청소는 lazy(접근 시 검사) — 별도 타이머 불필요.
 */
import { randomUUID } from 'crypto';

const HANDLE_TTL_MS = 5 * 60 * 1000;

interface HandleEntry {
  readonly filePath: string;
  readonly issuedAt: number;
  /** write 가능 핸들인지 (showSaveDialog 발급분). false 면 open 전용(showOpenDialog 발급분). */
  readonly canWrite: boolean;
  /** write 가 이미 소비됐는지. */
  writeConsumed: boolean;
}

const registry = new Map<string, HandleEntry>();

function isExpired(entry: HandleEntry, now: number): boolean {
  return now - entry.issuedAt > HANDLE_TTL_MS;
}

/** lazy GC — 만료 엔트리 제거. 접근 경로에서 호출. */
function sweep(now: number): void {
  for (const [key, entry] of registry) {
    if (isExpired(entry, now)) registry.delete(key);
  }
}

/**
 * write 1회 + open 가능 핸들 발급. showSaveDialog 결과 경로용.
 */
export function issueWriteHandle(filePath: string): string {
  const now = Date.now();
  sweep(now);
  const handle = randomUUID();
  registry.set(handle, {
    filePath,
    issuedAt: now,
    canWrite: true,
    writeConsumed: false,
  });
  return handle;
}

/**
 * open 전용(소비 안 함) 핸들 발급. showOpenDialog 결과 경로용.
 */
export function issueOpenHandle(filePath: string): string {
  const now = Date.now();
  sweep(now);
  const handle = randomUUID();
  registry.set(handle, {
    filePath,
    issuedAt: now,
    canWrite: false,
    writeConsumed: false,
  });
  return handle;
}

/**
 * write 핸들 검증·소비 후 경로 반환. 없거나 만료/이미소비/write불가면 throw.
 */
export function consumeWritePath(handle: string): string {
  const now = Date.now();
  if (typeof handle !== 'string' || handle.length === 0) {
    throw new Error('잘못된 파일 핸들입니다. 저장 대화상자를 다시 열어 주세요.');
  }
  const entry = registry.get(handle);
  if (!entry || isExpired(entry, now)) {
    if (entry) registry.delete(handle);
    throw new Error('파일 핸들이 만료되었습니다. 저장 대화상자를 다시 열어 주세요.');
  }
  if (!entry.canWrite) {
    throw new Error('이 핸들은 쓰기에 사용할 수 없습니다.');
  }
  if (entry.writeConsumed) {
    throw new Error('이미 저장된 파일 핸들입니다. 저장 대화상자를 다시 열어 주세요.');
  }
  entry.writeConsumed = true;
  return entry.filePath;
}

/**
 * open 핸들 검증(TTL만) 후 경로 반환. 없거나 만료면 throw. 소비하지 않음.
 * write 핸들도 (write 전·후 무관) open 에 쓸 수 있다.
 */
export function peekOpenPath(handle: string): string {
  const now = Date.now();
  if (typeof handle !== 'string' || handle.length === 0) {
    throw new Error('잘못된 파일 핸들입니다.');
  }
  const entry = registry.get(handle);
  if (!entry || isExpired(entry, now)) {
    if (entry) registry.delete(handle);
    throw new Error('파일 핸들이 만료되었습니다. 다시 시도해 주세요.');
  }
  return entry.filePath;
}

/**
 * 테스트·진단용 — 현재 살아있는 핸들 수.
 */
export function activeHandleCount(): number {
  sweep(Date.now());
  return registry.size;
}
