/**
 * 내 API 키 금고 — main 프로세스만 연다 (ADR-143).
 *
 * ★어디에 두나: `userData/byok/<서비스>.key`. 데이터 폴더(getContentRoot)가 아니다 —
 *   데이터 폴더는 선생님이 OneDrive·구글 드라이브 같은 동기화 폴더로 옮길 수 있고, 백업·
 *   드라이브 동기화가 그 안을 훑는다. 키는 그런 곳에 한 바이트도 두지 않는다.
 * ★어떻게 두나: OS 암호화(safeStorage — 윈도우 DPAPI·맥 키체인). 암호화를 못 쓰면 디스크에
 *   **쓰지 않고** 이번 실행 동안 메모리에만 둔다(보안 저장소와 같은 규칙).
 * ★누가 꺼내나: 이 파일의 `getKey` 는 같은 프로세스의 호출 코드(apiKeyClient)만 부른다.
 *   화면(렌더러)으로 키를 돌려주는 IPC 는 **없다**. `secure:read` 처럼 아무 키나 읽는 통로와
 *   섞이지 않게 저장 자리부터 따로 뒀다.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  ApiKeyActiveSelection,
  ApiKeyServiceId,
  ApiKeyServiceStatus,
  ApiKeyStatusSnapshot,
} from '../../src/domain/entities/ApiKeyProvider';
import { API_KEY_SERVICES } from '../../src/domain/entities/ApiKeyProvider';
import {
  isApiKeyServiceId,
  isPlausibleModelId,
  maskApiKey,
} from '../../src/domain/rules/apiKeyRules';

export interface ApiKeyVaultDeps {
  /** 금고 폴더 — 보통 `userData/byok` */
  readonly dir: string;
  readonly encryptionAvailable: () => boolean;
  readonly encrypt: (plain: string) => Buffer;
  readonly decrypt: (cipher: Buffer) => string;
  /** 값은 싣지 않는다 — 무슨 일이 있었는지만 */
  readonly warn?: (message: string) => void;
}

export interface ApiKeyVault {
  getKey(service: ApiKeyServiceId): string | null;
  /** 저장하고, 디스크에 암호화해 남겼는지 돌려준다 */
  setKey(service: ApiKeyServiceId, key: string): { persisted: boolean };
  removeKey(service: ApiKeyServiceId): void;
  getActive(): ApiKeyActiveSelection | null;
  setActive(selection: ApiKeyActiveSelection | null): void;
  status(): ApiKeyStatusSnapshot;
}

const ACTIVE_FILE = 'active.json';

export function createApiKeyVault(deps: ApiKeyVaultDeps): ApiKeyVault {
  /** 암호화를 못 쓸 때만 쓰는 자리. 디스크에 쓰지 않는다. */
  const memoryOnly = new Map<ApiKeyServiceId, string>();
  let warnedMemoryOnly = false;

  function canEncrypt(): boolean {
    try {
      return deps.encryptionAvailable();
    } catch {
      return false;
    }
  }

  function keyPath(service: ApiKeyServiceId): string {
    // 서비스 id 는 고정 목록에서만 온다 — 그래도 파일 이름이 되기 전에 한 번 더 본다.
    if (!isApiKeyServiceId(service)) throw new Error('[apiKeyVault] 알 수 없는 서비스');
    return path.join(deps.dir, `${service}.key`);
  }

  function ensureDir(): void {
    fs.mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
  }

  /** 임시 파일에 쓰고 바꿔 끼운다 — 쓰다 죽어도 반쪽 파일이 남지 않는다. 소유자만 읽게. */
  function writeAtomic(target: string, data: Buffer | string): void {
    ensureDir();
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  function readDisk(service: ApiKeyServiceId): string | null {
    const file = keyPath(service);
    if (!fs.existsSync(file)) return null;
    if (!canEncrypt()) return null;
    try {
      const plain = deps.decrypt(fs.readFileSync(file));
      return plain.length > 0 ? plain : null;
    } catch {
      // 복호화 실패(다른 사용자·다른 PC 에서 옮겨 온 파일 등). 지우지 않는다 — 값 없음으로만 본다.
      deps.warn?.(`[apiKeyVault] ${service} 키를 열지 못했습니다`);
      return null;
    }
  }

  function getKey(service: ApiKeyServiceId): string | null {
    return memoryOnly.get(service) ?? readDisk(service);
  }

  function setKey(service: ApiKeyServiceId, key: string): { persisted: boolean } {
    const file = keyPath(service);
    if (canEncrypt()) {
      writeAtomic(file, deps.encrypt(key));
      memoryOnly.delete(service);
      return { persisted: true };
    }
    memoryOnly.set(service, key);
    // 암호화를 못 쓰는데 옛 파일이 있으면 지운다 — 새 키와 옛 키가 엇갈려 남지 않게.
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    if (!warnedMemoryOnly) {
      warnedMemoryOnly = true;
      deps.warn?.(
        '[apiKeyVault] 암호화 저장소를 쓸 수 없어 API 키를 이번 실행 동안만 메모리에 보관합니다',
      );
    }
    return { persisted: false };
  }

  function removeKey(service: ApiKeyServiceId): void {
    memoryOnly.delete(service);
    fs.rmSync(keyPath(service), { force: true });
    const active = getActive();
    if (active?.service === service) setActive(null);
  }

  function getActive(): ApiKeyActiveSelection | null {
    const file = path.join(deps.dir, ACTIVE_FILE);
    if (!fs.existsSync(file)) return null;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (typeof parsed !== 'object' || parsed === null) return null;
      const { service, model } = parsed as { service?: unknown; model?: unknown };
      if (!isApiKeyServiceId(service) || !isPlausibleModelId(model)) return null;
      return { service, model };
    } catch {
      return null;
    }
  }

  function setActive(selection: ApiKeyActiveSelection | null): void {
    const file = path.join(deps.dir, ACTIVE_FILE);
    if (selection === null) {
      fs.rmSync(file, { force: true });
      return;
    }
    // 키가 아니라 "어느 서비스·어느 모델"뿐이다 — 평문으로 둬도 된다.
    writeAtomic(file, JSON.stringify({ service: selection.service, model: selection.model }));
  }

  function status(): ApiKeyStatusSnapshot {
    const services: ApiKeyServiceStatus[] = API_KEY_SERVICES.map((service) => {
      const held = memoryOnly.get(service);
      const key = held ?? readDisk(service);
      return {
        service,
        configured: key !== null,
        hint: key === null ? null : maskApiKey(key),
        persisted: key !== null && held === undefined,
      };
    });
    const active = getActive();
    // 고른 서비스의 키가 없어졌으면(복호화 실패·파일 삭제) 고른 것도 없는 것으로 본다.
    const activeUsable =
      active !== null && services.some((s) => s.service === active.service && s.configured);
    return {
      encryptionAvailable: canEncrypt(),
      services,
      active: activeUsable ? active : null,
    };
  }

  return { getKey, setKey, removeKey, getActive, setActive, status };
}
