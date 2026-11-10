import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isAiBridgeLaunch } from './aiBridgeLaunchGuard';

describe('isAiBridgeLaunch', () => {
  it('AI 연결 서버 파일을 인자로 받은 실행을 알아본다 (윈도우·맥 경로)', () => {
    expect(
      isAiBridgeLaunch([
        'C:\\Users\\t\\AppData\\Local\\Programs\\ssampin\\쌤핀.exe',
        'C:\\Users\\t\\AppData\\Local\\Programs\\ssampin\\resources\\ai-bridge\\index.mjs',
      ]),
    ).toBe(true);
    expect(
      isAiBridgeLaunch([
        '/Applications/쌤핀.app/Contents/MacOS/쌤핀',
        '/Applications/쌤핀.app/Contents/Resources/ai-bridge/index.mjs',
      ]),
    ).toBe(true);
  });

  it('평범한 실행과 공유 파일 열기는 건드리지 않는다', () => {
    expect(isAiBridgeLaunch(['C:\\Programs\\ssampin\\쌤핀.exe'])).toBe(false);
    expect(isAiBridgeLaunch(['쌤핀.exe', 'C:\\자료\\우리반.ssampin'])).toBe(false);
    expect(isAiBridgeLaunch(['쌤핀.exe', '--remote-debugging-port=9333'])).toBe(false);
    expect(isAiBridgeLaunch(['쌤핀.exe', 'C:\\ai-bridge\\index.mjs.bak'])).toBe(false);
    expect(isAiBridgeLaunch(['쌤핀.exe', 'C:\\my-ai-bridge\\index.mjs'])).toBe(false);
    expect(isAiBridgeLaunch(['쌤핀.exe', 'C:\\other\\index.mjs'])).toBe(false);
  });
});

/**
 * main.ts 계약 — 이 판정이 실제로 창을 막는 자리에 걸려 있는지.
 * (main.ts 는 electron 런타임 없이 불러올 수 없어 소스 글자로 확인한다.)
 */
describe('main.ts 가 AI 연결용 실행에서 창을 띄우지 않는다', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf-8');

  it('단일 실행 잠금을 요청하기 전에 판정하고 끝낸다', () => {
    const guard = main.indexOf('isAiBridgeLaunch(process.argv)');
    const lock = main.indexOf('app.requestSingleInstanceLock()');
    expect(guard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(-1);
    // 잠금을 요청하면 이미 떠 있는 쌤핀에 second-instance 가 가서 창이 올라온다 — 그 전에 끝내야 한다.
    expect(guard).toBeLessThan(lock);
  });

  it('두 번째 실행 알림이 와도 AI 연결용이면 창을 올리지 않는다', () => {
    const start = main.indexOf("app.on('second-instance'");
    const end = main.indexOf('app.whenReady()', start);
    const handler = main.slice(start, end);
    expect(handler).toContain('isAiBridgeLaunch(argv)');
    expect(handler.indexOf('isAiBridgeLaunch(argv)')).toBeLessThan(
      handler.indexOf("executeWindowTransition('main')"),
    );
  });
});
