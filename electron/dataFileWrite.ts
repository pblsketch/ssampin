/**
 * JSON 데이터 파일 쓰기 — 백업 + 임시 파일 + 검증 + 교체(atomic).
 *
 * `data:write` IPC 핸들러가 쓰던 로직을 그대로 옮겼다. 달라진 것은 **결과를 돌려준다**는 점뿐이다.
 * 예전에는 실패해도 아무 신호 없이 끝나서 렌더러는 저장된 줄 알고 화면만 갱신했고, 다음에 디스크를
 * 다시 읽을 때 방금 입력한 내용이 사라졌다("할 일을 입력해도 목록에 안 뜬다").
 *
 * 파일 내용(`data`)은 로그에 남기지 않는다 — 학생 정보가 들어 있다.
 */
import fs from 'fs';
import path from 'path';

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

export function writeDataFileAtomic(
  dataDir: string,
  filename: string,
  data: string,
): DataFileWriteResult {
  if (!isSafeDataFileName(dataDir, filename)) {
    console.error('[data:write] 허용되지 않는 파일 이름');
    return { ok: false, reason: 'write' };
  }
  const filePath = path.join(dataDir, `${filename}.json`);
  const backupPath = path.join(dataDir, `${filename}.backup.json`);
  const tempPath = path.join(dataDir, `${filename}.tmp.json`);

  // Step 1: 기존 파일이 있으면 백업 생성 (실패해도 저장은 계속 진행)
  try {
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf-8');
      if (existing.length > 10) {
        fs.writeFileSync(backupPath, existing, 'utf-8');
      }
    }
  } catch {
    // 백업 실패해도 저장은 계속 진행
  }

  try {
    // Step 2: 임시 파일에 먼저 쓰기
    fs.writeFileSync(tempPath, data, 'utf-8');

    // Step 3: 쓰기 검증 — 다시 읽어서 맞는지 확인
    const verification = fs.readFileSync(tempPath, 'utf-8');
    if (verification.length !== data.length) {
      console.error(
        `[data:write] 검증 실패: ${filename} (기대 ${data.length}바이트, 실제 ${verification.length}바이트)`,
      );
      removeQuietly(tempPath);
      return { ok: false, reason: 'verify' };
    }

    // Step 4: 검증 통과 → 임시 파일을 원본으로 교체 (rename 은 atomic)
    fs.renameSync(tempPath, filePath);
    return { ok: true };
  } catch (writeErr) {
    console.error(`[data:write] 저장 실패: ${filename}`, writeErr);
    removeQuietly(tempPath);
    return { ok: false, reason: 'write' };
  }
}

function removeQuietly(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}
