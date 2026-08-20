import { describe, expect, test } from 'vitest';
import {
  canonicalizeCombo,
  comboToAccelerator,
  comboToDisplay,
  eventToCombo,
  isSafeGlobalCombo,
  matchesCombo,
} from './keyNormalize';

describe('단축키 조합 정규화', () => {
  test('Ctrl/Cmd 별칭과 입력 순서를 같은 조합으로 본다', () => {
    expect(canonicalizeCombo('ctrl+alt+t')).toBe('mod+alt+t');
    expect(canonicalizeCombo('Alt+Cmd+T')).toBe('mod+alt+t');
  });

  test('일반 문자와 Shift 단독 조합은 글로벌 단축키로 허용하지 않는다', () => {
    expect(isSafeGlobalCombo('a')).toBe(false);
    expect(isSafeGlobalCombo('shift+a')).toBe(false);
    expect(isSafeGlobalCombo('mod+a')).toBe(true);
    expect(isSafeGlobalCombo('alt+a')).toBe(true);
  });
});

describe('화살표·F키 — 지정은 되는데 눌러도 안 먹던 결함(2026-08-20 수리)', () => {
  /** 설정 화면이 키를 잡는 순간을 흉내 낸다 */
  function keyEvent(key: string): KeyboardEvent {
    return {
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false,
    } as KeyboardEvent;
  }

  test.each([['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'], ['F5']])(
    '%s — 잡은 값과 저장한 값이 다시 만난다',
    (key) => {
      // 예전에는 잡을 때 'ArrowUp', 저장·비교할 때 'arrowup' 이라 영원히 어긋났다.
      const captured = eventToCombo(keyEvent(key));
      const stored = canonicalizeCombo(captured);

      expect(matchesCombo(keyEvent(key), stored)).toBe(true);
    },
  );

  test.each([
    ['ArrowUp', 'CommandOrControl+Alt+Up'],
    ['ArrowDown', 'CommandOrControl+Alt+Down'],
    ['F5', 'CommandOrControl+Alt+F5'],
  ])('%s 는 Electron 이 아는 이름으로 등록된다', (key, expected) => {
    expect(comboToAccelerator(canonicalizeCombo(eventToCombo(keyEvent(key))))).toBe(expected);
  });

  test.each([
    ['ArrowUp', 'Ctrl+Alt+↑'],
    ['ArrowDown', 'Ctrl+Alt+↓'],
    ['F5', 'Ctrl+Alt+F5'],
  ])('%s 는 화면에 %s 로 보인다 — arrowup 같은 날것이 노출되지 않는다', (key, expected) => {
    expect(comboToDisplay(canonicalizeCombo(eventToCombo(keyEvent(key))))).toBe(expected);
  });

  test('이미 저장된 옛 값(대소문자 섞인 것)도 그대로 동작한다 — 다시 지정할 필요가 없다', () => {
    const old = 'mod+alt+ArrowUp';

    expect(matchesCombo(keyEvent('ArrowUp'), old)).toBe(true);
    expect(comboToAccelerator(old)).toBe('CommandOrControl+Alt+Up');
  });

  test('기존 글자 조합의 결과는 하나도 바뀌지 않는다', () => {
    expect(comboToAccelerator('mod+alt+t')).toBe('CommandOrControl+Alt+T');
    expect(comboToDisplay('mod+alt+t')).toBe('Ctrl+Alt+T');
    expect(canonicalizeCombo('mod+alt+t')).toBe('mod+alt+t');
  });
});
