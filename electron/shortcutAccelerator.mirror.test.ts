/**
 * 단축키 가속기 변환 미러 테스트.
 *
 * `electron/shortcutAccelerator.ts`는 `src/adapters/hooks/shortcut/keyNormalize.ts`의
 * 같은 변환을 복제한 것이다. 화면은 렌더러 쪽으로 조합을 그리고, 실제 등록은 electron
 * 쪽으로 한다. **한쪽만 고치면 화면에는 멀쩡히 보이는데 등록이 조용히 실패한다.**
 *
 * 실제로 그렇게 망가져 있었다 — 화살표·F키 조합은 지정할 수는 있어도 눌러서 동작한
 * 적이 없고, 사용자에게는 "다른 조합을 선택해주세요"라는 남 탓 안내만 떴다.
 *
 * 다른 미러 테스트들과 같은 방식으로 **소스를 읽어 표를 대조한다.** electron 은
 * rootDir 제약이 있어 `src/`를 직접 import 하면 타입 검사(`tsconfig.electron.json`)가
 * 깨진다 — 그물을 놓으려다 다른 그물을 부수는 셈이라 이 방식을 쓴다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { comboToAccelerator } from './shortcutAccelerator';

const REPO_ROOT = resolve(__dirname, '..');

/** `const ACCELERATOR_KEY_NAMES ... = { arrowup: 'Up', ... };` 에서 쌍을 뽑는다 */
function readAcceleratorTable(relativePath: string): Record<string, string> {
  const src = readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8');
  const block = src.match(/ACCELERATOR_KEY_NAMES[^=]*=\s*\{([^}]*)\}/);
  if (block?.[1] === undefined) {
    throw new Error(`${relativePath} 에서 ACCELERATOR_KEY_NAMES 를 찾지 못했다`);
  }
  const table: Record<string, string> = {};
  for (const [, key, value] of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
    table[key] = value;
  }
  return table;
}

describe('두 벌의 키 이름 표가 같다', () => {
  test('한쪽만 늘리거나 고치면 여기서 걸린다', () => {
    const electronTable = readAcceleratorTable('electron/shortcutAccelerator.ts');
    const rendererTable = readAcceleratorTable('src/adapters/hooks/shortcut/keyNormalize.ts');

    expect(Object.keys(electronTable).length).toBeGreaterThan(0);
    expect(electronTable).toEqual(rendererTable);
  });

  test('화살표 4종이 모두 들어 있다 — 이게 빠져서 등록이 실패했었다', () => {
    const electronTable = readAcceleratorTable('electron/shortcutAccelerator.ts');

    expect(electronTable).toMatchObject({
      arrowup: 'Up',
      arrowdown: 'Down',
      arrowleft: 'Left',
      arrowright: 'Right',
    });
  });
});

describe('Electron 이 아는 이름으로 바꾼다', () => {
  test.each([
    ['mod+alt+arrowup', 'CommandOrControl+Alt+Up'],
    ['mod+alt+arrowdown', 'CommandOrControl+Alt+Down'],
    ['mod+alt+arrowleft', 'CommandOrControl+Alt+Left'],
    ['mod+alt+arrowright', 'CommandOrControl+Alt+Right'],
    ['mod+alt+f9', 'CommandOrControl+Alt+F9'],
    ['mod+alt+t', 'CommandOrControl+Alt+T'],
    ['mod+shift+alt+arrowup', 'CommandOrControl+Alt+Shift+Up'],
  ])('%s → %s', (combo, expected) => {
    // `arrowup` 을 그대로 넘기면 Electron 이 거부해 등록 자체가 실패한다.
    expect(comboToAccelerator(combo)).toBe(expected);
  });

  test('날것의 arrowup 이 새어 나가지 않는다', () => {
    for (const combo of ['mod+alt+arrowup', 'alt+arrowdown', 'mod+shift+alt+arrowright']) {
      expect(comboToAccelerator(combo)).not.toMatch(/arrow/i);
    }
  });
});
