/**
 * 사용자가 정한 단축키 조합을 Electron 가속기 문자열로 바꾼다.
 *
 * `main.ts` 안에 있던 함수를 여기로 뺐다. 그 파일은 첫 줄부터 `electron`을 불러오므로
 * **테스트에서 열 수가 없고**(저장소에 `main.ts`를 import 하는 테스트가 0건), 그러면
 * 렌더러 쪽 같은 함수(`src/adapters/hooks/shortcut/keyNormalize.ts`)와 어긋나도
 * 아무도 모른다. 실제로 화살표 키가 그렇게 조용히 망가져 있었다.
 * 이제 `shortcutAccelerator.mirror.test.ts`가 두 벌을 맞대어 본다.
 *
 * 저장·비교용 정본은 전부 소문자다(`mod+alt+arrowup`). 화면과 Electron은 각자
 * 다른 표기를 요구하므로 아래 표에서 되돌린다.
 */

/**
 * 소문자 정본 → Electron 가속기 이름.
 *
 * Electron은 `Up`/`Down`/`Left`/`Right`만 받는다. `arrowup`을 그대로 넘기면
 * **등록이 실패하고**, 사용자에게는 "다른 조합을 선택해주세요"라는 남 탓 안내가 뜬다.
 * 새 특수 키가 필요하면 여기 한 줄을 더한다.
 */
const ACCELERATOR_KEY_NAMES: Readonly<Record<string, string>> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
};

const MODIFIER_TOKENS = ['mod', 'ctrl', 'cmd', 'meta', 'alt', 'option', 'shift'];

/** 함수 키(f1~f12)는 대문자 한 글자 + 숫자다 */
function functionKeyName(key: string): string | null {
  return /^f([1-9]|1[0-2])$/.test(key) ? key.toUpperCase() : null;
}

/** 소문자 정본 키 이름 → Electron이 아는 이름 */
export function acceleratorKeyName(key: string): string {
  const special = ACCELERATOR_KEY_NAMES[key];
  if (special !== undefined) return special;
  const fkey = functionKeyName(key);
  if (fkey !== null) return fkey;
  return key.length === 1 ? key.toUpperCase() : key;
}

export function comboToAccelerator(combo: string): string {
  const tokens = combo
    .toLowerCase()
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);
  const mod =
    tokens.includes('mod') ||
    tokens.includes('ctrl') ||
    tokens.includes('cmd') ||
    tokens.includes('meta');
  const alt = tokens.includes('alt') || tokens.includes('option');
  const shift = tokens.includes('shift');
  const key = tokens.find((t) => !MODIFIER_TOKENS.includes(t));
  if (key === undefined) return '';
  const parts: string[] = [];
  if (mod) parts.push('CommandOrControl');
  if (alt) parts.push('Alt');
  if (shift) parts.push('Shift');
  parts.push(acceleratorKeyName(key));
  return parts.join('+');
}

/** 일반 문자 입력을 가로채지 않도록 Ctrl/Cmd 또는 Alt를 요구한다 */
export function isSafeGlobalShortcutCombo(combo: string): boolean {
  const tokens = combo
    .toLowerCase()
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.some((token) => ['mod', 'ctrl', 'cmd', 'meta', 'alt', 'option'].includes(token));
}
