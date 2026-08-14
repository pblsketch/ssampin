import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('옆핀 전용 HTML 진입점', () => {
  test('공용 쌤핀이 스플래시를 포함하지 않는다', () => {
    const html = source('sidepin.html');

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('/src/sidepin-main.tsx');
    expect(html).not.toContain('id="splash"');
    expect(html).not.toContain('floating-pin.png');

    const entry = source('src/sidepin-main.tsx');
    expect(entry).toContain('<SidePinApp />');
    expect(entry).not.toContain("import { App } from './App'");
  });

  test('개발 서버와 패키지 빌드가 모두 sidepin.html을 사용한다', () => {
    const browserWindow = source('electron/sidePinBrowserWindow.ts');
    const vite = source('vite.config.ts');

    expect(browserWindow).toContain("new URL('sidepin.html', base)");
    expect(browserWindow).toContain("'dist', 'sidepin.html'");
    expect(vite).toContain("sidepin: path.resolve(__dirname, 'sidepin.html')");
  });

  test('작업표시줄 재실행은 메인 창만 직접 띄우지 않고 창 모드를 동기화한다', () => {
    const main = source('electron/main.ts');
    const start = main.indexOf("app.on('second-instance'");
    const end = main.indexOf('app.whenReady()', start);
    const handler = main.slice(start, end);

    expect(handler).toContain("executeWindowTransition('main')");
    expect(handler).not.toContain('mainWindow.show()');
  });

  test('Windows가 프레임 없는 옆핀 창의 크기를 다시 보정하지 못하게 한다', () => {
    const browserWindow = source('electron/sidePinBrowserWindow.ts');

    expect(browserWindow).toContain('thickFrame: false');
    expect(browserWindow).toContain('roundedCorners: false');
    expect(browserWindow).toContain('win.setBounds(requestedBounds, false)');
    expect(browserWindow).not.toContain('const actual = win.getBounds()');
  });
});
