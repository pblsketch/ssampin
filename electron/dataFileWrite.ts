/**
 * JSON 데이터 파일 쓰기 — 백업 + 임시 파일 + 디스크 반영(fsync) + 검증 + 교체(atomic).
 *
 * `data:write` IPC 핸들러가 쓰던 로직을 그대로 옮겼다. 달라진 것은 **결과를 돌려준다**는 점뿐이다.
 * 예전에는 실패해도 아무 신호 없이 끝나서 렌더러는 저장된 줄 알고 화면만 갱신했고, 다음에 디스크를
 * 다시 읽을 때 방금 입력한 내용이 사라졌다("할 일을 입력해도 목록에 안 뜬다").
 *
 * 2026-11 보강(PC 가 비정상 종료된 뒤 원본·백업이 함께 0x00 으로 채워진 사고):
 *  - 임시 파일을 **디스크에 내려 쓴(fsync) 뒤** 이름을 바꾼다. 안 그러면 이름만 바뀌고 내용은
 *    아직 디스크에 없는 채로 전원이 끊겨, 길이만 맞는 빈(0x00) 파일이 남는다.
 *  - 백업은 **기존 원본이 JSON 으로 읽힐 때만** 만들고, 백업도 임시 파일을 거쳐 교체한다.
 *    깨진 원본이 멀쩡한 백업을 덮지 않고, 백업 쓰기가 실패해도 기존 백업은 그대로다.
 *  - 이름 바꾸기가 EPERM/EBUSY/EACCES(백신·색인이 파일을 잠깐 잡은 경우)면 짧게 다시 시도한다.
 *
 * 파일 내용(`data`)은 로그에 남기지 않는다 — 학생 정보가 들어 있다. 오류는 코드만 남긴다.
 */
import fs from 'fs';
import path from 'path';
import { quarantineFileName } from './dataFileRules';

/**
 * 화면이 넘긴 데이터 파일 이름이 데이터 폴더 **안**을 가리키는지 확인한다.
 *
 * ★`../` 로 폴더 밖 아무 `*.json` 이나 읽고 쓰고 지울 수 있었다(ADR-143 보안 점검에서 발견 — 예:
 *   `../byok/active` 로 내 API 키 금고의 "고른 모델" 파일을 덮어쓸 수 있었다). 하위 폴더 이름은 그대로
 *   받는다 — 바깥으로 나가는 것만 막는다.
 */
export function isSafeDataFileName(dataDir: string, filename: unknown): filename is string {
  if (typeof filename !== 'string' || filename.length === 0 || filename.length > 260) return false;
  if (filename.includes('\0') || path.isAbsolute(filename)) return false;
  const root = path.resolve(dataDir);
  const target = path.resolve(root, `${filename}.json`);
  const rel = path.relative(root, target);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export type DataFileWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'verify' | 'write' };

/** 한 데이터 파일에 딸린 경로들. 임시 파일 이름은 백업 수집 규칙(`.tmp` 부산물 제외)에 걸린다. */
export interface DataFilePaths {
  readonly filePath: string;
  readonly backupPath: string;
  readonly tempPath: string;
  readonly backupTempPath: string;
}

export function dataFilePaths(dataDir: string, filename: string): DataFilePaths {
  return {
    filePath: path.join(dataDir, `${filename}.json`),
    backupPath: path.join(dataDir, `${filename}.backup.json`),
    tempPath: path.join(dataDir, `${filename}.tmp.json`),
    backupTempPath: path.join(dataDir, `${filename}.backup.tmp.json`),
  };
}

/** 이름 바꾸기를 다시 시도할 오류 — 다른 프로그램(백신·색인·동기화)이 파일을 잠깐 잡은 경우다. */
const RENAME_RETRY_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** 다시 시도하기 전 기다리는 시간(ms). 길이가 곧 최대 재시도 횟수(3회)다. */
const RENAME_RETRY_DELAYS_MS: readonly number[] = [20, 40, 80];

/** 오류 객체에서 코드(`EPERM` 등)만 꺼낸다. 메시지·내용은 로그에 싣지 않는다. */
export function fileErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'UNKNOWN';
}

/** 동기 대기. 쓰기 경로가 전부 동기라 여기서도 동기로 기다린다(최대 140ms). */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 이름을 바꾼다. EPERM/EBUSY/EACCES 면 짧게 기다렸다 최대 3회 다시 시도하고,
 * 끝까지 안 되거나 다른 오류면 그 오류를 던진다.
 */
export function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !RENAME_RETRY_CODES.has(fileErrorCode(err))) throw err;
      sleepSync(delay);
    }
  }
}

/**
 * "이 저장소(파일 시스템)는 fsync 를 지원하지 않는다"는 뜻의 오류 코드.
 *
 *  - EINVAL·ENOTSUP·EOPNOTSUPP·ENOSYS: 일부 네트워크 폴더·가상 파일 시스템이 돌려준다.
 *  - EISDIR: Windows 에서 드라이버가 flush 를 구현하지 않으면(ERROR_INVALID_FUNCTION) Node 가
 *    이 코드로 옮긴다. 우리는 파일 핸들에만 fsync 를 걸므로 "폴더라서"라는 뜻일 수 없다.
 *
 * 여기 없는 코드(EIO·ENOSPC·EDQUOT·EPERM 등)는 **내용이 디스크에 내려가지 못했다**는 뜻이므로
 * 저장 실패로 돌린다 — 삼키면 길이만 맞는 빈 파일로 원본을 덮을 수 있다.
 */
const FSYNC_UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  'EINVAL',
  'ENOTSUP',
  'EOPNOTSUPP',
  'ENOSYS',
  'EISDIR',
]);

let fsyncUnsupportedLogged = false;

/**
 * 임시 파일에 쓰고 디스크에 내려 쓴다(fsync).
 *
 * fsync 는 파일 핸들에만 건다 — Windows 는 폴더 핸들에 fsync 를 걸 수 없다(선례:
 * `sidePinDeviceState.ts` 의 writeFileAtomic). fsync 자체를 지원하지 않는 저장소(일부 네트워크 폴더
 * 등)에서만 예전처럼 fsync 없이 진행한다 — 여기서 실패로 돌리면 그 PC 는 아무것도 저장하지 못한다.
 * 그 밖의 fsync 오류는 그대로 던진다(호출 쪽이 임시 파일을 지우고 저장 실패로 돌린다).
 *
 * `flag` 를 `'wx'` 로 주면 이미 있는 파일을 덮지 않는다(손상 파일 격리 사본 — `dataFileRead.ts`).
 */
export function writeFileSynced(
  targetPath: string,
  data: string | Buffer,
  flag: 'w' | 'wx' = 'w',
): void {
  const handle = fs.openSync(targetPath, flag);
  try {
    fs.writeFileSync(handle, data, 'utf-8');
    try {
      fs.fsyncSync(handle);
    } catch (err) {
      if (!FSYNC_UNSUPPORTED_CODES.has(fileErrorCode(err))) throw err;
      if (!fsyncUnsupportedLogged) {
        fsyncUnsupportedLogged = true;
        console.warn(`[data:write] fsync 를 지원하지 않는 저장소입니다 (${fileErrorCode(err)})`);
      }
    }
  } finally {
    fs.closeSync(handle);
  }
}

export type DurableReplaceResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'verify';
      readonly expected: number;
      readonly actual: number;
    }
  | { readonly ok: false; readonly reason: 'write'; readonly code: string };

/**
 * `targetPath` 를 `data` 로 바꿔치기한다: 임시 파일에 쓰기 → fsync → 내용 검증 → 이름 바꾸기.
 *
 * 예외를 던지지 않는다. 실패하면 `targetPath` 는 손대지 않은 그대로이고 임시 파일은 남기지 않는다.
 * `data:write`·`data:writeIfUnchanged`·`data:read` 의 백업 복구 쓰기·백업 만들기·시작 시 백업이
 * 모두 이 길을 쓴다.
 */
export function replaceFileDurably(
  targetPath: string,
  tempPath: string,
  data: string,
): DurableReplaceResult {
  try {
    writeFileSynced(tempPath, data);

    // 쓰기 검증 — 다시 읽어서 **내용 전체**가 같은지 확인한다. 길이만 보면 길이는 맞는데 내용이
    // 다른 파일(0x00 으로 채워진 경우 등)을 통과시킨다. 디스크가 가득 차면 잘린 채 성공처럼 보일 수도 있다.
    const verification = fs.readFileSync(tempPath, 'utf-8');
    if (verification !== data) {
      removeQuietly(tempPath);
      return {
        ok: false,
        reason: 'verify',
        expected: data.length,
        actual: verification.length,
      };
    }

    // 검증 통과 → 임시 파일을 제자리로 (rename 은 atomic)
    renameWithRetry(tempPath, targetPath);
    return { ok: true };
  } catch (err) {
    removeQuietly(tempPath);
    return { ok: false, reason: 'write', code: fileErrorCode(err) };
  }
}

/** JSON 으로 읽히는 내용인가. */
export function isParsableJson(raw: string): boolean {
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * 기존 원본을 백업으로 남긴다 — **원본이 JSON 으로 읽힐 때만.**
 *
 * 예전에는 길이만 보고 복사해서, 깨진(0x00 으로 채워진) 원본이 마지막 정상 백업을 덮었다.
 * 실패해도 저장은 계속 진행하고, 기존 백업은 건드리지 않는다(임시 파일을 거친다).
 */
function backupExistingIfValid(paths: DataFilePaths): void {
  try {
    if (!fs.existsSync(paths.filePath)) return;
    const existing = fs.readFileSync(paths.filePath, 'utf-8');
    if (existing.length <= 10) return;
    if (!isParsableJson(existing)) return;
    replaceFileDurably(paths.backupPath, paths.backupTempPath, existing);
  } catch {
    // 백업 실패해도 저장은 계속 진행
  }
}

export function writeDataFileAtomic(
  dataDir: string,
  filename: string,
  data: string,
): DataFileWriteResult {
  if (!isSafeDataFileName(dataDir, filename)) {
    console.error('[data:write] 허용되지 않는 파일 이름');
    return { ok: false, reason: 'write' };
  }
  const paths = dataFilePaths(dataDir, filename);

  // Step 1: 기존 파일이 온전하면 백업 생성 (실패해도 저장은 계속 진행)
  backupExistingIfValid(paths);

  // Step 2~4: 임시 파일에 쓰기 → fsync → 검증 → 원본으로 교체
  const result = replaceFileDurably(paths.filePath, paths.tempPath, data);
  if (result.ok) return { ok: true };

  if (result.reason === 'verify') {
    console.error(
      `[data:write] 검증 실패: ${filename} (기대 ${result.expected}바이트, 실제 ${result.actual}바이트)`,
    );
    return { ok: false, reason: 'verify' };
  }
  console.error(`[data:write] 저장 실패: ${filename} (${result.code})`);
  return { ok: false, reason: 'write' };
}

function removeQuietly(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/**
 * 깨진 파일을 **복사로** 옆에 남긴다(`<이름>.corrupt-<시각>`). 원래 파일은 그대로 둔다 —
 * 옮긴 직후 전원이 꺼지면 원본이 "없음"이 되어 빈 자료로 시작하기 때문이다.
 * 바이트 그대로 복사하고 디스크에 내려 쓴 뒤(fsync) 다시 읽어 같은지 확인한다. 실패하면 예외.
 */
export function copyFileAside(source: string, now: Date): string {
  const name = quarantineFileName(path.basename(source), now);
  const target = path.join(path.dirname(source), name);
  const bytes = fs.readFileSync(source);
  try {
    writeFileSynced(target, bytes, 'wx');
    if (!fs.readFileSync(target).equals(bytes)) {
      throw Object.assign(new Error('격리 사본 검증 실패'), { code: 'EVERIFY' });
    }
  } catch (err) {
    if (fileErrorCode(err) !== 'EEXIST') {
      try {
        fs.unlinkSync(target);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
  return name;
}
