/**
 * 안전한 키-값 저장소 IPC 핸들러
 *
 * Electron safeStorage를 사용하여 민감한 데이터(OAuth 토큰 등)를
 * OS 키체인/DPAPI 로 암호화 저장한다.
 * safeStorage 사용 불가 환경에서는 평문으로 폴백(경고 출력).
 */
import { ipcMain, safeStorage, app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * 보안 파일 경로 생성
 * userData/data/.<key> 형식으로 저장 (숨김 파일)
 */
function getSecurePath(key: string): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `.${key}`);
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

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      fs.writeFileSync(filePath, encrypted);
    } else {
      // safeStorage 불가 시 평문 폴백 (경고 로그)
      console.warn('[secureStorage] safeStorage not available, storing in plaintext');
      fs.writeFileSync(filePath, value, 'utf-8');
    }
  });

  /**
   * secure:read — 파일에서 복호화하여 읽기
   * @param key 키 이름
   * @returns 복호화된 문자열 또는 null (파일 없음/오류)
   */
  ipcMain.handle('secure:read', (_event, key: string): string | null => {
    const filePath = getSecurePath(key);

    if (!fs.existsSync(filePath)) return null;

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = fs.readFileSync(filePath);
        return safeStorage.decryptString(encrypted);
      } else {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch {
      console.error('[secureStorage] Failed to read/decrypt:', key);
      return null;
    }
  });

  /**
   * secure:delete — 저장된 파일 삭제
   * @param key 키 이름
   */
  ipcMain.handle('secure:delete', (_event, key: string): void => {
    const filePath = getSecurePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}
