/**
 * 쌤핀 자료 폴더(content root) 위치 결정 · 이사 · 용량 측정
 *
 * ## 왜 필요한가
 * 기본값은 Electron `app.getPath('userData')`다. 선생님이 "학교 자료 드라이브"에 쌤핀
 * 자료도 함께 모아두고 싶어 하는 요구가 있어, **선생님 자료만** 다른 폴더로 옮길 수 있게 한다.
 *
 * ## 무엇을 옮기고 무엇을 남기나 (CONTENT_DIRS / CACHE_DIRS)
 * 옮김 — data(모든 JSON + archives 학기보관함 + stickers) · forms(서식) ·
 *        obs-attachments(관찰 첨부, data/ 밖!) · miniapps
 * 남김 — Chromium 캐시/세션(Cache·Code Cache·Local Storage·Network·Partitions…) · bin(cloudflared) · 로그
 *
 * 이 분리가 핵심 설계다:
 *  1. 학교 드라이브가 수백 MB 캐시로 지저분해지지 않는다.
 *  2. **구글 로그인 세션(Local Storage·Network)이 기본 위치에 남아 재로그인이 불필요**하다.
 *  3. `app.setPath('userData')`를 쓰지 않으므로 app ready 이전 타이밍 제약이 없다.
 *
 * ## 닭-달걀 문제
 * "어디로 옮겼는지"를 적은 포인터(`data-location.json`)는 **항상 기본 userData 루트**에 둔다.
 * settings.json은 옮김 대상인 data/ 안에 있어 포인터로 쓸 수 없다(그걸 읽으려면 위치를 이미 알아야 함).
 *
 * ## 안전 원칙
 * - 이사는 "복사 → 검증(파일 수·바이트) → 포인터 기록 → 원본 보존(.moved-<ts>)" 순서.
 *   검증 실패 시 대상의 부분 복사본을 지우고 포인터는 건드리지 않는다(원상 복귀).
 * - 시작 시 포인터가 가리키는 폴더가 없거나(외장 드라이브 미연결) 쓸 수 없으면
 *   **조용히 기본 위치로 폴백**하고 사유를 남긴다 — 앱이 못 켜지는 것보다 낫다.
 *   이때 포인터는 지우지 않는다(드라이브가 다시 붙으면 원래 위치로 복귀해야 하므로).
 */
import fs from 'fs';
import path from 'path';

/** 선생님 자료 — 이사 대상. */
export const CONTENT_DIRS: readonly string[] = ['data', 'forms', 'obs-attachments', 'miniapps'];

/**
 * Chromium·런타임 부산물 — 기본 위치에 남기고, "임시 파일 정리"의 삭제 대상.
 * 지워도 앱이 다시 만든다. 로그인 세션(Local Storage·Network·Partitions)은 여기 없다 —
 * 정리 버튼이 로그아웃을 유발하면 안 되므로 의도적으로 제외했다.
 */
export const CACHE_DIRS: readonly string[] = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'ShaderCache',
  'blob_storage',
];

/** 포인터 파일명. 항상 기본 userData 루트에 위치한다. */
export const POINTER_FILENAME = 'data-location.json';

interface PointerFile {
  /** 선생님이 고른 자료 폴더 절대경로. */
  readonly contentRoot: string;
  /** 기록 시각(ISO). 문제 추적용. */
  readonly updatedAt: string;
}

/** 현재 자료 루트가 왜 그 값인지. UI에서 폴백 사실을 알리기 위해 노출한다. */
export type ContentRootReason =
  | 'default'
  | 'custom'
  | 'fallback-missing'
  | 'fallback-unwritable'
  | 'fallback-invalid';

export interface ContentRootState {
  /** 실제로 사용 중인 자료 루트. */
  readonly contentRoot: string;
  /** Electron 기본 userData 경로. 캐시·로그·포인터는 항상 여기. */
  readonly defaultRoot: string;
  /** 포인터에 적힌 사용자 지정 경로(있으면). 폴백 중이어도 값은 유지된다. */
  readonly configuredRoot: string | null;
  readonly reason: ContentRootReason;
}

let state: ContentRootState | null = null;

function pointerPath(defaultRoot: string): string {
  return path.join(defaultRoot, POINTER_FILENAME);
}

function readPointer(defaultRoot: string): string | null {
  try {
    const raw = fs.readFileSync(pointerPath(defaultRoot), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PointerFile>;
    const value = parsed.contentRoot;
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    if (!path.isAbsolute(value)) return null;
    return path.resolve(value);
  } catch {
    return null;
  }
}

/** 디렉토리에 실제로 쓸 수 있는지 — 권한만 보지 않고 임시 파일을 만들어 확인한다. */
function canWrite(dir: string): boolean {
  const probe = path.join(dir, `.ssampin-write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, 'ok', 'utf-8');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * 앱 시작 시 1회 호출. 포인터를 읽어 자료 루트를 확정한다.
 * @param defaultRoot `app.getPath('userData')`
 */
export function initContentRoot(defaultRoot: string): ContentRootState {
  const resolvedDefault = path.resolve(defaultRoot);
  const configured = readPointer(resolvedDefault);

  if (configured === null) {
    state = {
      contentRoot: resolvedDefault,
      defaultRoot: resolvedDefault,
      configuredRoot: null,
      reason: 'default',
    };
    return state;
  }

  // 자기 자신을 가리키면 사용자 지정이 아닌 것으로 취급
  if (path.relative(configured, resolvedDefault) === '') {
    state = {
      contentRoot: resolvedDefault,
      defaultRoot: resolvedDefault,
      configuredRoot: null,
      reason: 'default',
    };
    return state;
  }

  let reason: ContentRootReason = 'custom';
  let contentRoot = configured;

  if (!fs.existsSync(configured)) {
    // 외장·네트워크 드라이브 미연결 등. 포인터는 남겨 두고 이번 실행만 기본 위치를 쓴다.
    reason = 'fallback-missing';
    contentRoot = resolvedDefault;
  } else if (!fs.statSync(configured).isDirectory()) {
    reason = 'fallback-invalid';
    contentRoot = resolvedDefault;
  } else if (!canWrite(configured)) {
    reason = 'fallback-unwritable';
    contentRoot = resolvedDefault;
  }

  state = {
    contentRoot,
    defaultRoot: resolvedDefault,
    configuredRoot: configured,
    reason,
  };
  return state;
}

/**
 * 현재 자료 루트. `initContentRoot` 이전에 부르면 예외 — 조용히 기본값으로 흘러가면
 * 일부 도메인만 다른 폴더를 쓰는 최악의 분열이 생기므로 일찍 크게 실패시킨다.
 */
export function getContentRoot(): string {
  if (state === null) {
    throw new Error('[dataRoot] initContentRoot() 가 먼저 호출돼야 합니다');
  }
  return state.contentRoot;
}

/** 기본 userData 루트(캐시·로그·포인터·기기 상태 전용). */
export function getDefaultRoot(): string {
  if (state === null) {
    throw new Error('[dataRoot] initContentRoot() 가 먼저 호출돼야 합니다');
  }
  return state.defaultRoot;
}

export function getContentRootState(): ContentRootState {
  if (state === null) {
    throw new Error('[dataRoot] initContentRoot() 가 먼저 호출돼야 합니다');
  }
  return state;
}

/** 테스트 전용 — 모듈 상태 초기화. */
export function __resetContentRootForTest(): void {
  state = null;
}

/** =================  용량 측정  ================= */

export interface DirUsage {
  readonly name: string;
  readonly bytes: number;
}

export interface StorageUsage {
  /** 선생님 자료 합계(자료 루트 기준). */
  readonly contentBytes: number;
  /** 정리 가능한 임시 파일 합계(기본 루트 기준). */
  readonly cacheBytes: number;
  readonly contentDirs: readonly DirUsage[];
  readonly cacheDirs: readonly DirUsage[];
}

/**
 * 디렉토리 바이트 합계. 심볼릭 링크는 따라가지 않는다(순환·외부 유출 방지).
 * 접근 불가 항목은 0으로 계산하고 넘어간다 — 측정 실패가 기능 전체를 막지 않게.
 */
export function dirSize(target: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        // 측정 중 삭제된 파일 등 — 무시
      }
    }
  }
  return total;
}

export function measureUsage(): StorageUsage {
  const current = getContentRootState();
  const contentDirs: DirUsage[] = [];
  const cacheDirs: DirUsage[] = [];
  let contentBytes = 0;
  let cacheBytes = 0;

  for (const name of CONTENT_DIRS) {
    const bytes = dirSize(path.join(current.contentRoot, name));
    contentDirs.push({ name, bytes });
    contentBytes += bytes;
  }
  for (const name of CACHE_DIRS) {
    const bytes = dirSize(path.join(current.defaultRoot, name));
    if (bytes === 0) continue;
    cacheDirs.push({ name, bytes });
    cacheBytes += bytes;
  }

  return { contentBytes, cacheBytes, contentDirs, cacheDirs };
}

/** =================  임시 파일 정리  ================= */

export interface ClearCacheResult {
  readonly ok: boolean;
  readonly freedBytes: number;
  /** 지우지 못한 폴더(앱이 사용 중인 경우). 부분 성공도 성공으로 본다. */
  readonly skipped: readonly string[];
}

/**
 * 임시 파일 삭제. Chromium이 붙잡고 있는 파일은 실패할 수 있으므로 폴더 단위로
 * 최선 노력(best effort) 삭제하고, 실패분은 skipped로 표면화한다.
 * 로그인 세션·선생님 자료는 대상에 없다.
 */
export function clearCaches(): ClearCacheResult {
  const root = getDefaultRoot();
  let freed = 0;
  const skipped: string[] = [];

  for (const name of CACHE_DIRS) {
    const target = path.join(root, name);
    if (!fs.existsSync(target)) continue;
    const before = dirSize(target);
    try {
      fs.rmSync(target, { recursive: true, force: true });
      freed += before;
    } catch {
      const after = dirSize(target);
      freed += Math.max(0, before - after);
      skipped.push(name);
    }
  }

  return { ok: true, freedBytes: freed, skipped };
}

/** =================  이사  ================= */

export type MoveFailure =
  | 'same-location'
  | 'inside-default'
  | 'nested'
  | 'not-a-directory'
  | 'unwritable'
  | 'occupied'
  | 'copy-failed'
  | 'verify-failed';

export interface MoveResult {
  readonly ok: boolean;
  readonly failure?: MoveFailure;
  /** 사용자에게 그대로 보여줄 한국어 사유. */
  readonly message?: string;
  /** 성공 시 새 자료 루트. */
  readonly contentRoot?: string;
  /** 성공 시 원본이 보관된 이름(`data.moved-…`). 사용자가 직접 지울 수 있게 안내한다. */
  readonly preservedOriginals?: readonly string[];
}

/** 대상 폴더가 이사받을 수 있는 상태인지 — 실패 사유를 한국어로 돌려준다. */
export function validateTarget(target: string): MoveResult {
  const current = getContentRootState();
  const resolved = path.resolve(target);

  if (path.relative(resolved, current.contentRoot) === '') {
    return {
      ok: false,
      failure: 'same-location',
      message: '이미 이 폴더를 쓰고 있어요.',
    };
  }

  // 기본 userData 안쪽을 고르면 캐시와 뒤섞이고 앱 삭제 시 함께 지워진다.
  const relFromDefault = path.relative(current.defaultRoot, resolved);
  if (
    relFromDefault === '' ||
    (!relFromDefault.startsWith('..') && !path.isAbsolute(relFromDefault))
  ) {
    return {
      ok: false,
      failure: 'inside-default',
      message: '쌤핀이 기본으로 쓰는 폴더 안쪽은 고를 수 없어요. 다른 위치를 선택해 주세요.',
    };
  }

  // 현재 자료 루트의 하위를 고르면 복사 중 자기 자신을 무한히 복사한다.
  const relFromContent = path.relative(current.contentRoot, resolved);
  if (!relFromContent.startsWith('..') && !path.isAbsolute(relFromContent)) {
    return {
      ok: false,
      failure: 'nested',
      message: '지금 자료가 들어 있는 폴더의 하위 폴더는 고를 수 없어요.',
    };
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return {
      ok: false,
      failure: 'not-a-directory',
      message: '폴더를 찾을 수 없어요.',
    };
  }

  if (!canWrite(resolved)) {
    return {
      ok: false,
      failure: 'unwritable',
      message: '이 폴더에 저장할 권한이 없어요. 다른 위치를 선택해 주세요.',
    };
  }

  // 이미 쌤핀 자료가 있는 폴더면 덮어쓰기 사고가 난다 — 사용자가 정리하도록 막는다.
  const occupied = CONTENT_DIRS.filter((name) => fs.existsSync(path.join(resolved, name)));
  if (occupied.length > 0) {
    return {
      ok: false,
      failure: 'occupied',
      message: `이 폴더에는 이미 쌤핀 자료(${occupied.join(', ')})가 있어요. 비어 있는 폴더를 선택해 주세요.`,
    };
  }

  return { ok: true, contentRoot: resolved };
}

/** 복사 결과 검증용 — 파일 개수와 바이트 합계. */
function countFilesAndBytes(target: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return { files, bytes };
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const sub = countFilesAndBytes(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      try {
        bytes += fs.statSync(full).size;
      } catch {
        /* 무시 */
      }
    }
  }
  return { files, bytes };
}

function writePointer(defaultRoot: string, contentRoot: string | null): void {
  const file = pointerPath(defaultRoot);
  if (contentRoot === null) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* 무시 */
    }
    return;
  }
  const payload: PointerFile = { contentRoot, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
}

/**
 * 자료를 새 폴더로 이사한다.
 *
 * 순서 — 검증 → 복사 → 개수·바이트 대조 → 포인터 기록 → 원본을 `.moved-<ts>`로 개명.
 * 복사·대조 단계에서 실패하면 대상에 만든 부분 복사본을 지우고 포인터는 그대로 둔다.
 * 원본은 지우지 않는다(사용자가 눈으로 확인한 뒤 직접 삭제).
 *
 * @param target 사용자가 고른 폴더
 * @returns 성공 시 새 루트. **호출자는 앱 재시작을 안내해야 한다** — 일부 모듈이
 *          시작 시점 경로를 캐시하므로 재시작 전까지는 옛 경로를 계속 본다.
 */
export function moveContentTo(target: string): MoveResult {
  const validated = validateTarget(target);
  if (!validated.ok) return validated;

  const current = getContentRootState();
  const resolved = path.resolve(target);
  const copied: string[] = [];

  try {
    for (const name of CONTENT_DIRS) {
      const from = path.join(current.contentRoot, name);
      if (!fs.existsSync(from)) continue;
      const to = path.join(resolved, name);
      fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
      copied.push(name);
    }
  } catch (error) {
    for (const name of copied) {
      try {
        fs.rmSync(path.join(resolved, name), { recursive: true, force: true });
      } catch {
        /* 무시 */
      }
    }
    return {
      ok: false,
      failure: 'copy-failed',
      message: `자료를 복사하지 못했어요. (${error instanceof Error ? error.message : '알 수 없는 오류'}) 원래 위치의 자료는 그대로예요.`,
    };
  }

  // 검증 — 원본과 사본의 파일 수·바이트가 정확히 같아야 채택한다.
  for (const name of copied) {
    const src = countFilesAndBytes(path.join(current.contentRoot, name));
    const dst = countFilesAndBytes(path.join(resolved, name));
    if (src.files !== dst.files || src.bytes !== dst.bytes) {
      for (const done of copied) {
        try {
          fs.rmSync(path.join(resolved, done), { recursive: true, force: true });
        } catch {
          /* 무시 */
        }
      }
      return {
        ok: false,
        failure: 'verify-failed',
        message:
          '복사된 자료가 원본과 달라서 중단했어요. 원래 위치의 자료는 그대로예요. 디스크 여유 공간을 확인해 주세요.',
      };
    }
  }

  writePointer(current.defaultRoot, resolved);

  // 원본 보존 — 즉시 삭제하지 않는다. 사용자가 새 위치를 확인한 뒤 직접 지우게 한다.
  const stamp = new Date().toISOString().replace(/[:.]/g, '').replace(/[TZ]/g, '');
  const preserved: string[] = [];
  for (const name of copied) {
    const from = path.join(current.contentRoot, name);
    const parked = path.join(current.contentRoot, `${name}.moved-${stamp}`);
    try {
      fs.renameSync(from, parked);
      preserved.push(path.basename(parked));
    } catch {
      // 개명 실패(사용 중 등)는 치명적이지 않다 — 포인터는 이미 새 위치를 가리킨다.
    }
  }

  state = {
    contentRoot: resolved,
    defaultRoot: current.defaultRoot,
    configuredRoot: resolved,
    reason: 'custom',
  };

  return { ok: true, contentRoot: resolved, preservedOriginals: preserved };
}

/**
 * 기본 위치로 되돌린다. 자료를 되가져오는 것이 아니라 포인터만 지우므로,
 * 호출자는 "기본 위치로 이사"를 원하면 `moveContentTo(defaultRoot)`가 아니라
 * 이 함수 + 사용자 안내를 조합해야 한다. 되돌린 뒤엔 재시작이 필요하다.
 */
export function resetToDefault(): void {
  const current = getContentRootState();
  writePointer(current.defaultRoot, null);
  state = {
    contentRoot: current.defaultRoot,
    defaultRoot: current.defaultRoot,
    configuredRoot: null,
    reason: 'default',
  };
}
