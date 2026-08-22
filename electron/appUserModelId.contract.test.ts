import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * 윈도우 알림 창의 **앱 이름·아이콘**을 지키는 계약.
 *
 * 윈도우는 알림이 올라오면 앱이 선언한 AppUserModelID 로 **시작 메뉴 바로가기**를 찾아
 * 거기서 이름과 아이콘을 가져온다. 바로가기에 새겨지는 값은 설치 프로그램 설정
 * (`electron-builder.yml` 의 `appId`)이고, 앱이 선언하는 값은 `main.ts` 에 있다.
 * **두 값이 어긋나면 윈도우가 바로가기를 못 찾아 "Electron" 이라고 띄운다.**
 *
 * 실제로 그렇게 됐다 — `setAppUserModelId` 를 부르는 곳이 아예 없었다.
 * 한쪽만 고치면 조용히 다시 어긋나므로 두 값이 같은지를 여기서 못 박는다.
 *
 * 이건 문자열 두 개를 맞추는 검사다. "설치한 앱에서 실제로 쌤핀이라고 뜨는가"는
 * 여기서 확인할 수 없다 — 실기기로만 확인된다.
 */

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('알림 창 앱 이름 — AppUserModelID 계약', () => {
  test('main.ts 의 값과 설치 프로그램의 appId 가 같다', () => {
    const main = source('electron/main.ts');
    const builder = source('electron-builder.yml');

    const declared = /const APP_USER_MODEL_ID = '([^']+)'/.exec(main);
    expect(declared, 'main.ts 에서 APP_USER_MODEL_ID 선언을 찾지 못했다').not.toBeNull();

    const appId = /^appId:\s*(\S+)\s*$/m.exec(builder);
    expect(appId, 'electron-builder.yml 에서 appId 를 찾지 못했다').not.toBeNull();

    expect(declared?.[1]).toBe(appId?.[1]);
  });

  test('선언만 해 두고 실제로 부르지 않는 일이 없도록 호출을 확인한다', () => {
    // 이 저장소는 "층은 만들었는데 배선을 잊은" 사고를 여러 번 겪었다.
    const main = source('electron/main.ts');

    expect(main).toContain('app.setAppUserModelId(APP_USER_MODEL_ID)');
  });

  test('창을 만들기 전에 부른다 — 늦게 부르면 첫 알림이 옛 이름으로 뜬다', () => {
    const main = source('electron/main.ts');

    const callAt = main.indexOf('app.setAppUserModelId(APP_USER_MODEL_ID)');
    const readyAt = main.indexOf('app.whenReady()');

    expect(callAt).toBeGreaterThan(-1);
    expect(readyAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(readyAt);
  });
});
