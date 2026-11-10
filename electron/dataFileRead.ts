/**
 * JSON 데이터 파일 읽기 — 손상 감지 + 백업 복구 + (허용 목록만) 격리.
 *
 * `data:read` IPC 핸들러 안에 있던 로직을 옮겼다(electron 모듈 import 없음 — 단위 테스트 가능).
 *
 * 계약:
 *  - `raw: null` 은 **파일이 없다**는 뜻이다. 원본·백업이 모두 깨졌으면 오류를 던진다 —
 *    null("파일 없음")로 위장하면 렌더러 저장 경로가 빈 파일로 오인해 기존 데이터를 편집분만으로
 *    덮어쓴다(QA2 H3).
 *  - 예외는 하나: `dataFileRules.ts` 의 허용 목록(다시 만들 수 있는 상태 파일)은 깨진 원본·백업을
 *    `<이름>.corrupt-<시각>` 으로 **옮기고**(지우지 않는다) `raw: null`·`quarantined: true` 를 돌려준다.
 *    그 밖의 파일은 절대 조용히 비우지 않는다.
 *  - 백업으로 되돌리는 것은 원본이 **읽혔는데 깨져 있을 때만**이다. 읽기 자체가 막힌 경우(백신·색인이
 *    파일을 잠깐 잡은 EBUSY·EPERM 등)는 깨졌는지 알 수 없다 — 짧게 다시 읽어 보고, 끝까지 안 되면
 *    오류를 던진다. 그때는 백업을 읽지도, 원본을 덮지도, 격리하지도 않는다(한 세대 옛 백업이 지금
 *    내용인 것처럼 돌아가거나 온전한 원본을 덮지 않게).
 *
 * 파일 내용은 로그에 남기지 않는다 — 파일 이름과 오류 코드만 남긴다.
 */
import fs from 'fs';
import path from 'path';
import {
  isCorruptShortDataFile,
  isRebuildableStateFile,
  quarantineFileName,
} from './dataFileRules';
import {
  dataFilePaths,
  fileErrorCode,
  isParsableJson,
  isSafeDataFileName,
  renameWithRetry,
  replaceFileDurably,
  sleepSync,
} from './dataFileWrite';

export interface DataFileReadResult {
  /** 파일 내용. `null` 은 파일 없음(또는 방금 격리해서 비움). */
  readonly raw: string | null;
  /** 이번 호출에서 깨진 원본·백업을 격리했는가. */
  readonly quarantined: boolean;
}

type FileProbe =
  | { readonly state: 'missing' }
  | { readonly state: 'valid'; readonly raw: string }
  /** 읽기는 됐는데 내용이 JSON 이 아니다(0x00 으로 채워짐·잘림 등). */
  | { readonly state: 'corrupt' }
  /** 읽기 자체가 안 됐다(잠금·권한). 내용이 깨졌는지는 모른다. */
  | { readonly state: 'unreadable'; readonly code: string };

/** 읽기가 막혔을 때 다시 읽기 전 기다리는 시간(ms). 길이가 곧 최대 재시도 횟수(3회, 합 140ms)다. */
const READ_RETRY_DELAYS_MS: readonly number[] = [20, 40, 80];

function probeFileOnce(filePath: string, isValid: (raw: string) => boolean): FileProbe {
  let raw: string;
  try {
    if (!fs.existsSync(filePath)) return { state: 'missing' };
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { state: 'unreadable', code: fileErrorCode(err) };
  }
  return isValid(raw) ? { state: 'valid', raw } : { state: 'corrupt' };
}

/** 읽기가 막혔으면(`unreadable`) 짧게 기다렸다 다시 읽는다. 그 밖의 결과는 바로 돌려준다. */
function probeFile(filePath: string, isValid: (raw: string) => boolean): FileProbe {
  for (let attempt = 0; ; attempt += 1) {
    const probe = probeFileOnce(filePath, isValid);
    const delay = READ_RETRY_DELAYS_MS[attempt];
    if (probe.state !== 'unreadable' || delay === undefined) return probe;
    sleepSync(delay);
  }
}

/** 원본이 온전한가. */
function isValidOriginal(raw: string): boolean {
  // F7a: 5바이트 미만이라도 유효한 빈 구조값(`[]`·`{}`)은 정상 — 손상 오탐이
  // .backup.json에서 옛 데이터를 부활시키던 것을 제거(학년도 전환 빈 값 리셋의 전제).
  if (isCorruptShortDataFile(raw)) return false;
  return isParsableJson(raw);
}

/**
 * 깨진 원본(과 깨진 백업)을 옆으로 치운다. 원본을 치우지 못했으면 false —
 * 그때는 호출 쪽이 예전처럼 오류를 던진다(치우지 못한 파일을 "없음"으로 돌려주지 않는다).
 */
function quarantineCorruptFiles(
  filePath: string,
  backupPath: string,
  moveBackup: boolean,
  now: Date,
): boolean {
  const moveAside = (source: string): void => {
    const target = path.join(path.dirname(source), quarantineFileName(path.basename(source), now));
    renameWithRetry(source, target);
  };

  try {
    moveAside(filePath);
  } catch (err) {
    console.error(`[data:read] 손상 파일 격리 실패 (${fileErrorCode(err)})`);
    return false;
  }
  if (moveBackup) {
    try {
      moveAside(backupPath);
    } catch (err) {
      // 원본이 없으면 백업은 읽히지 않는다 — 남아도 해롭지 않다.
      console.warn(`[data:read] 손상 백업 격리 실패 (${fileErrorCode(err)})`);
    }
  }
  return true;
}

export function readDataFileWithRecovery(
  dataDir: string,
  filename: string,
  now: () => Date = () => new Date(),
): DataFileReadResult {
  // ★데이터 폴더 밖(`../`)은 읽지 않는다(ADR-143 보안 점검).
  if (!isSafeDataFileName(dataDir, filename))
    throw new Error('[data:read] 허용되지 않는 파일 이름');
  const { filePath, backupPath, tempPath } = dataFilePaths(dataDir, filename);

  // 원본 읽기 시도
  const original = probeFile(filePath, isValidOriginal);
  if (original.state === 'valid') return { raw: original.raw, quarantined: false };
  // 원본이 없으면 파일이 없는 것이다 — 백업을 되살리지 않는다(data:remove·학년도 리셋의 전제).
  if (original.state === 'missing') return { raw: null, quarantined: false };
  // 읽기 자체가 막혔다(다시 읽어도 안 됐다) — 깨졌는지 알 수 없으므로 백업으로 대체하지 않는다.
  // 백업을 읽지도, 원본을 덮지도, 격리하지도 않고 오류만 알린다. null("파일 없음")로도 넘기지 않는다.
  if (original.state === 'unreadable') {
    console.error(`[data:read] 원본을 읽지 못함: ${filename} (${original.code})`);
    throw new Error(
      `[data:read] ${filename} 파일을 읽지 못함 (${original.code}) — 잠시 뒤 다시 시도`,
    );
  }

  console.warn(`[data:read] 원본 손상 감지: ${filename}, 백업에서 복구 시도`);
  const backup = probeFile(backupPath, isParsableJson);
  if (backup.state === 'valid') {
    // 원본을 백업 내용으로 되돌린다 — 쓰기와 같은 길(임시 파일 + fsync + 교체).
    // 되돌리기가 실패해도 백업 내용은 온전하므로 그대로 돌려준다(원본은 다음 저장 때 교체된다).
    const restored = replaceFileDurably(filePath, tempPath, backup.raw);
    if (restored.ok) {
      console.log(`[data:read] 백업에서 복구 성공: ${filename}`);
    } else {
      console.warn(
        `[data:read] 백업 내용으로 읽었지만 원본을 되돌리지 못함: ${filename} (${
          restored.reason === 'write' ? restored.code : 'verify'
        })`,
      );
    }
    return { raw: backup.raw, quarantined: false };
  }
  console.error(`[data:read] 백업 복구도 실패: ${filename}`);

  // 다시 만들 수 있는 상태 파일만: 깨진 것을 옆으로 치우고 "없음"으로 시작한다.
  // (여기까지 왔으면 원본은 읽혔는데 깨진 것이다.) 백업을 읽지 못한 경우(잠금·권한)는 백업이
  // 온전할 수 있으므로 치우지 않는다.
  if (backup.state !== 'unreadable' && isRebuildableStateFile(filename)) {
    if (quarantineCorruptFiles(filePath, backupPath, backup.state === 'corrupt', now())) {
      console.warn(`[data:read] 손상된 상태 파일을 격리하고 초기화: ${filename}`);
      return { raw: null, quarantined: true };
    }
  }

  // 파일이 존재하는데 여기까지 왔다면 원본·백업 모두 복구 실패다 — null("파일 없음")로
  // 위장하지 않고 오류를 던진다. null을 받은 렌더러 저장 경로는 빈 파일로 오인해
  // 기존 데이터를 편집분만으로 덮어쓴다(QA2 H3). null은 파일 부재만 의미한다.
  let stillExists = true;
  try {
    stillExists = fs.existsSync(filePath);
  } catch {
    stillExists = true;
  }
  if (stillExists) {
    throw new Error(`[data:read] ${filename} 파일 손상 — 원본·백업 복구 실패`);
  }
  return { raw: null, quarantined: false };
}
