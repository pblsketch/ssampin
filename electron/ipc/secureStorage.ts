/**
 * 안전한 키-값 저장소 IPC 핸들러
 *
 * Electron safeStorage를 사용하여 민감한 데이터(구글 로그인 토큰, 마크다운 변환의 실명 복원표 등)를
 * OS 키체인/DPAPI 로 암호화 저장한다.
 *
 * ★평문으로는 **절대 디스크에 쓰지 않는다.** 암호화를 쓸 수 없는 환경에서는 메인 프로세스
 *   메모리에만 두고(앱을 다시 켜면 비어 다시 로그인해야 한다), 같은 키의 옛 평문 파일은 지운다.
 * ★암호화를 쓸 수 있는데 옛 평문 파일이 남아 있으면(예전 폴백이 남긴 것) 읽는 순간 암호화해
 *   다시 쓴다. 지금까지는 복호화 실패로 조용히 로그아웃돼 있었다.
 * ★이 규칙은 키를 가리지 않고 모두에 적용된다.
 */
import { ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { getContentRoot } from '../dataRoot';

/** 암호화를 쓸 수 없을 때 값을 두는 곳(디스크에 쓰지 않는다). */
const memoryOnly = new Map<string, string>();
let warnedMemoryOnly = false;

/**
 * 보안 파일 경로 생성
 * userData/data/.<key> 형식으로 저장 (숨김 파일)
 */
function getSecurePath(key: string): string {
  const dir = path.join(getContentRoot(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `.${key}`);
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** JSON 으로 읽히는 텍스트인가 — 암호화된 값은 JSON 텍스트가 아니라서 오인되지 않는다. */
function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Secure Storage IPC 핸들러 등록
 * - secure:write — 암호화 쓰기
 * - secure:read  — 복호화 읽기
 * - secure:delete — 삭제
 */
export function registerSecureStorageHandlers(): void {
  /**
   * secure:write — 값을 암호화하여 파일에 저장
   * @param key 키 이름 (파일명으로 사용)
   * @param value 저장할 문자열 값
   */
  ipcMain.handle('secure:write', (_event, key: string, value: string): void => {
    const filePath = getSecurePath(key);

    if (encryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      fs.writeFileSync(filePath, encrypted);
      memoryOnly.delete(key);
      return;
    }

    // 암호화 불가 — 디스크에 평문을 쓰지 않는다. 메모리에만 두고 옛 평문 파일은 지운다.
    memoryOnly.set(key, value);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (!warnedMemoryOnly) {
      warnedMemoryOnly = true;
      // 값은 남기지 않는다.
      console.warn(
        '[secureStorage] 암호화 저장소를 쓸 수 없어 이번 실행 동안만 메모리에 보관합니다 (앱을 다시 켜면 다시 로그인해야 합니다)',
      );
    }
  });

  /**
   * secure:read — 파일에서 복호화하여 읽기
   * @param key 키 이름
   * @returns 복호화된 문자열 또는 null (파일 없음/오류)
   */
  ipcMain.handle('secure:read', (_event, key: string): string | null => {
    const filePath = getSecurePath(key);

    if (!encryptionAvailable()) {
      const held = memoryOnly.get(key);
      if (held !== undefined) return held;
      // 예전에 평문으로 남은 파일 — 읽기만 하고 다시 쓰지 않는다.
      if (!fs.existsSync(filePath)) return null;
      try {
        const text = fs.readFileSync(filePath, 'utf-8');
        return isJsonText(text) ? text : null;
      } catch {
        console.error('[secureStorage] Failed to read:', key);
        return null;
      }
    }

    if (!fs.existsSync(filePath)) return null;

    let raw: Buffer;
    try {
      raw = fs.readFileSync(filePath);
    } catch {
      console.error('[secureStorage] Failed to read:', key);
      return null;
    }

    try {
      return safeStorage.decryptString(raw);
    } catch {
      // 복호화 실패 — 예전 폴백이 남긴 평문 JSON 이면 암호화해 옮기고 값을 돌려준다.
      const text = raw.toString('utf-8');
      if (isJsonText(text)) {
        try {
          fs.writeFileSync(filePath, safeStorage.encryptString(text));
        } catch {
          // 옮기지 못해도 읽은 값은 돌려준다 — 다음 읽기에서 다시 시도한다.
        }
        return text;
      }
      // JSON 도 아니고 복호화도 안 된다 — 파일은 그대로 두고 값 없음으로 본다.
      console.error('[secureStorage] Failed to decrypt:', key);
      return null;
    }
  });

  /**
   * secure:delete — 저장된 파일 삭제
   * @param key 키 이름
   */
  ipcMain.handle('secure:delete', (_event, key: string): void => {
    memoryOnly.delete(key);
    const filePath = getSecurePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}
