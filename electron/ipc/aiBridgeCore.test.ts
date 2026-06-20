import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildEntry,
  clientConfigPath,
  registerFileClient,
  registerCodex,
  codexAddArgs,
  shellQuote,
  winQuote,
  fileClientStatus,
  safeErrorMessage,
  type ServerEntry,
} from './aiBridgeCore';

const CTX = {
  exePath: 'C:/Programs/쌤핀/쌤핀.exe',
  serverPath: 'C:/Programs/쌤핀/resources/ai-bridge/index.mjs',
  dataDir: 'C:/AppData/쌤핀/data',
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-aibridge-'));
});

describe('buildEntry — ELECTRON_RUN_AS_NODE', () => {
  it('게이트 기본 OFF — ELECTRON_RUN_AS_NODE + 데이터 경로만', () => {
    const e = buildEntry(CTX, {});
    expect(e.command).toBe(CTX.exePath);
    expect(e.args).toEqual([CTX.serverPath]);
    expect(e.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', SSAMPIN_DATA_DIR: CTX.dataDir });
  });
  it('게이트 옵션 → 해당 env 포함', () => {
    const e = buildEntry(CTX, { allowContent: true, allowWrite: true });
    expect(e.env['SSAMPIN_BRIDGE_ALLOW_CONTENT']).toBe('1');
    expect(e.env['SSAMPIN_BRIDGE_ALLOW_WRITE']).toBe('1');
  });
  it('allowContent 만 → write 게이트 미포함', () => {
    const e = buildEntry(CTX, { allowContent: true });
    expect(e.env['SSAMPIN_BRIDGE_ALLOW_CONTENT']).toBe('1');
    expect(e.env['SSAMPIN_BRIDGE_ALLOW_WRITE']).toBeUndefined();
  });
  it('비-boolean truthy 값(문자열/객체)은 게이트를 켜지 않는다(IPC 타입혼동 차단)', () => {
    for (const bad of ['false', '0', {}, 1, 'true']) {
      const e = buildEntry(CTX, {
        allowContent: bad as unknown as boolean,
        allowWrite: bad as unknown as boolean,
      });
      expect(e.env['SSAMPIN_BRIDGE_ALLOW_CONTENT']).toBeUndefined();
      expect(e.env['SSAMPIN_BRIDGE_ALLOW_WRITE']).toBeUndefined();
    }
  });
});

describe('clientConfigPath 플랫폼', () => {
  it('claude win32 → APPDATA/Claude', () => {
    const p = clientConfigPath(
      'claude',
      'win32',
      { APPDATA: 'C:/AppData' } as NodeJS.ProcessEnv,
      'C:/home',
    );
    expect(p).toBe(path.join('C:/AppData', 'Claude', 'claude_desktop_config.json'));
  });
  it('claude darwin → Library/Application Support', () => {
    expect(clientConfigPath('claude', 'darwin', {} as NodeJS.ProcessEnv, '/Users/x')).toMatch(
      /Library[\\/]Application Support[\\/]Claude[\\/]claude_desktop_config\.json$/,
    );
  });
  it('antigravity → home/.gemini/antigravity', () => {
    expect(clientConfigPath('antigravity', 'win32', {} as NodeJS.ProcessEnv, 'C:/home')).toMatch(
      /[\\/]\.gemini[\\/]antigravity[\\/]mcp_config\.json$/,
    );
  });
});

describe('registerFileClient — 안전 병합', () => {
  const entry: ServerEntry = buildEntry(CTX, { allowContent: true });

  it('신규 파일 생성', () => {
    const cfg = path.join(dir, 'mcp.json');
    const r = registerFileClient(cfg, entry);
    expect(r.created).toBe(true);
    expect(r.backupPath).toBeUndefined();
    const w = JSON.parse(fs.readFileSync(cfg, 'utf-8'));
    expect(w.mcpServers.ssampin.command).toBe(CTX.exePath);
    expect(w.mcpServers.ssampin.env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('기존 서버 보존 + 최상위 키 보존 + 백업', () => {
    const cfg = path.join(dir, 'claude.json');
    fs.writeFileSync(
      cfg,
      JSON.stringify({ mcpServers: { other: { command: 'o' } }, ui: { keep: true } }),
    );
    const r = registerFileClient(cfg, entry);
    expect(r.created).toBe(false);
    expect(r.backupPath).toBeTruthy();
    expect(fs.existsSync(r.backupPath!)).toBe(true);
    const w = JSON.parse(fs.readFileSync(cfg, 'utf-8'));
    expect(w.mcpServers.other).toEqual({ command: 'o' });
    expect(w.ui.keep).toBe(true);
    expect(w.mcpServers.ssampin.env.SSAMPIN_BRIDGE_ALLOW_CONTENT).toBe('1');
  });

  it('최상위가 배열 → throw + 원본 보존', () => {
    const cfg = path.join(dir, 'arr.json');
    fs.writeFileSync(cfg, JSON.stringify([1, 2]));
    expect(() => registerFileClient(cfg, entry)).toThrow();
    expect(fs.readFileSync(cfg, 'utf-8')).toBe('[1,2]');
  });

  it('mcpServers 가 문자열 → throw', () => {
    const cfg = path.join(dir, 'bad.json');
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: 'oops' }));
    expect(() => registerFileClient(cfg, entry)).toThrow();
  });

  it('연속 등록 → 고유 백업명', () => {
    const cfg = path.join(dir, 'x.json');
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: {} }));
    const r1 = registerFileClient(cfg, entry);
    const r2 = registerFileClient(cfg, entry);
    expect(r1.backupPath).not.toBe(r2.backupPath);
  });
});

describe('codex 등록', () => {
  const entry = buildEntry(CTX, {});
  it('codexAddArgs — mcp add + --env + -- 뒤 command/args', () => {
    const a = codexAddArgs(entry);
    expect(a.slice(0, 3)).toEqual(['mcp', 'add', 'ssampin']);
    expect(a).toContain('ELECTRON_RUN_AS_NODE=1');
    const dash = a.indexOf('--');
    expect(a.slice(dash + 1)).toEqual([CTX.exePath, CTX.serverPath]);
  });
  it('shellQuote — 메타문자 중화, 한글 안전', () => {
    expect(shellQuote('C:/쌤핀/data')).toBe('C:/쌤핀/data');
    expect(shellQuote('a;b')).toBe('"a;b"');
    expect(shellQuote('$(x)')).toBe('"\\$(x)"');
  });
  it('winQuote — 안전한 인자는 그대로, 공백·비ASCII·메타문자는 큰따옴표(Windows shell 실행용)', () => {
    expect(winQuote('mcp')).toBe('mcp');
    expect(winQuote('--')).toBe('--');
    expect(winQuote('ELECTRON_RUN_AS_NODE=1')).toBe('ELECTRON_RUN_AS_NODE=1'); // alnum+= 는 안전
    expect(winQuote('C:/path with space/x')).toBe('"C:/path with space/x"'); // 공백 → 따옴표
    expect(winQuote('SSAMPIN_DATA_DIR=C:/쌤핀/data')).toBe('"SSAMPIN_DATA_DIR=C:/쌤핀/data"'); // 비ASCII → 따옴표
    expect(winQuote('a&b')).toBe('"a&b"'); // cmd 메타문자 차단
  });
  it('미설치(ENOENT) → cliMissing, throw 안 함', () => {
    const r = registerCodex(entry, () => ({
      status: null,
      error: Object.assign(new Error('e'), { code: 'ENOENT' }),
    }));
    expect(r.cliMissing).toBe(true);
    expect(r.command).toContain('codex mcp add ssampin');
  });
  it('성공(0) → registered', () => {
    expect(registerCodex(entry, () => ({ status: 0 })).registered).toBe(true);
  });
  it('실패(비0) → throw', () => {
    expect(() => registerCodex(entry, () => ({ status: 2 }))).toThrow();
  });
});

describe('safeErrorMessage — 경로 유출 차단', () => {
  it('fs syscall 에러(경로 포함)는 일반 메시지로 치환', () => {
    const e = Object.assign(
      new Error(
        "EACCES: permission denied, open 'C:\\Users\\wnsdl\\AppData\\Roaming\\Claude\\claude_desktop_config.json'",
      ),
      { code: 'EACCES' },
    );
    const m = safeErrorMessage(e);
    expect(m).not.toContain('wnsdl');
    expect(m).not.toContain('C:\\');
    expect(m).toContain('권한');
  });
  it('ENOENT → 경로 없는 메시지', () => {
    const e = Object.assign(new Error("ENOENT: no such file, open 'C:/x/y'"), { code: 'ENOENT' });
    expect(safeErrorMessage(e)).not.toContain('C:/x');
  });
  it('경로 없는 도메인 메시지는 그대로', () => {
    expect(safeErrorMessage(new Error('mcpServers 가 객체가 아님 — 안전 병합 불가'))).toContain(
      'mcpServers',
    );
  });
  it('경로가 든 코드없는 메시지도 일반화', () => {
    const m = safeErrorMessage(new Error('failed at C:\\Users\\secret\\file.json'));
    expect(m).not.toContain('secret');
  });
});

describe('fileClientStatus', () => {
  it('등록된 경우 true', () => {
    const cfg = path.join(dir, 's.json');
    registerFileClient(cfg, buildEntry(CTX, {}));
    expect(fileClientStatus('claude', cfg)).toBe(true);
  });
  it('파일 없음 → false', () => {
    expect(fileClientStatus('claude', path.join(dir, 'none.json'))).toBe(false);
  });
});
