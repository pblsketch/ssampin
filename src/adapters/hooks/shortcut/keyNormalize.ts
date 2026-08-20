/**
 * 키보드 조합 정규화 유틸리티.
 *
 * - canonical 형태: "mod+alt+shift+t" (mod = Ctrl on Win/Linux, Cmd on macOS)
 * - 모디파이어 순서 고정: mod → alt → shift → key
 * - key는 lowercase
 */

export interface ParsedCombo {
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt', 'Cmd']);

/**
 * 키 이름을 저장·비교용 정본으로 바꾼다 — **전부 소문자다.**
 *
 * 예전에는 `ArrowUp`·`F5`만 원형을 유지했는데, 조합을 읽는 `parseCombo`가 문자열을
 * 통째로 소문자화하는 탓에 두 값이 **영원히 어긋났다.** 그래서 설정에서 화살표나
 * F키 조합을 지정할 수는 있어도 눌러서 동작한 적이 없다(2026-08-20 수리).
 * 화면 표기와 Electron 등록 이름은 아래 두 표에서 되돌린다.
 */
function normalizeKey(rawKey: string): string {
  return rawKey.toLowerCase();
}

/** 소문자 정본 → 화면에 보여줄 이름 */
const DISPLAY_KEY_NAMES: Readonly<Record<string, string>> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};

/**
 * 소문자 정본 → Electron 가속기 이름.
 *
 * **`electron/shortcutAccelerator.ts`에 같은 표가 있다.** 한쪽만 고치면 화면에는
 * 멀쩡히 보이는데 등록이 실패한다. `shortcutAccelerator.mirror.test.ts`가 두 벌을 맞대어 본다.
 */
const ACCELERATOR_KEY_NAMES: Readonly<Record<string, string>> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
};

/** 함수 키(f1~f12)는 대문자로 되돌린다 */
function functionKeyName(key: string): string | null {
  return /^f([1-9]|1[0-2])$/.test(key) ? key.toUpperCase() : null;
}

/**
 * KeyboardEvent를 canonical 조합 문자열로 변환.
 * 모디파이어만 눌린 경우 빈 문자열 반환.
 */
export function eventToCombo(e: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(e.key)) return '';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(normalizeKey(e.key));
  return parts.join('+');
}

/**
 * 조합 문자열을 파싱. 형식이 잘못되면 null.
 */
export function parseCombo(combo: string): ParsedCombo | null {
  if (!combo.trim()) return null;
  const tokens = combo
    .toLowerCase()
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const mod =
    tokens.includes('mod') ||
    tokens.includes('ctrl') ||
    tokens.includes('cmd') ||
    tokens.includes('meta');
  const alt = tokens.includes('alt') || tokens.includes('option');
  const shift = tokens.includes('shift');
  const key = tokens.find(
    (t) => !['mod', 'ctrl', 'cmd', 'meta', 'alt', 'option', 'shift'].includes(t),
  );
  if (!key) return null;
  return { mod, alt, shift, key };
}

/** 같은 조합을 같은 문자열로 비교하기 위한 표준 형태. */
export function canonicalizeCombo(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed) return '';
  const parts: string[] = [];
  if (parsed.mod) parts.push('mod');
  if (parsed.alt) parts.push('alt');
  if (parsed.shift) parts.push('shift');
  parts.push(parsed.key);
  return parts.join('+');
}

/** 일반 문자 입력을 가로채지 않도록 글로벌 단축키에는 Ctrl/Cmd 또는 Alt를 요구한다. */
export function isSafeGlobalCombo(combo: string): boolean {
  const parsed = parseCombo(combo);
  return parsed !== null && (parsed.mod || parsed.alt);
}

/**
 * 이벤트가 주어진 조합과 일치하는지 검사.
 */
export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo);
  if (!parsed) return false;
  if (MODIFIER_KEYS.has(e.key)) return false;
  if (parsed.mod !== (e.ctrlKey || e.metaKey)) return false;
  if (parsed.alt !== e.altKey) return false;
  if (parsed.shift !== e.shiftKey) return false;
  return normalizeKey(e.key) === parsed.key;
}

/**
 * canonical 조합 → Kbd 컴포넌트의 combo prop 형식.
 * 예: "mod+alt+t" → "Ctrl+Alt+T" (Windows/Linux) / "Cmd+Alt+T" (macOS).
 */
export function comboToDisplay(combo: string, isMac: boolean = false): string {
  const parsed = parseCombo(combo);
  if (!parsed) return combo;
  const parts: string[] = [];
  if (parsed.mod) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (parsed.alt) parts.push(isMac ? 'Option' : 'Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(displayKeyName(parsed.key));
  return parts.join('+');
}

/** 소문자 정본 키 이름 → 화면 표기 */
export function displayKeyName(key: string): string {
  const special = DISPLAY_KEY_NAMES[key];
  if (special !== undefined) return special;
  const fkey = functionKeyName(key);
  if (fkey !== null) return fkey;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** 소문자 정본 키 이름 → Electron 가속기 이름 */
export function acceleratorKeyName(key: string): string {
  const special = ACCELERATOR_KEY_NAMES[key];
  if (special !== undefined) return special;
  const fkey = functionKeyName(key);
  if (fkey !== null) return fkey;
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * canonical 조합 → Electron globalShortcut accelerator.
 * 예: "mod+alt+t" → "CommandOrControl+Alt+T", "mod+alt+arrowup" → "CommandOrControl+Alt+Up".
 */
export function comboToAccelerator(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed) return '';
  const parts: string[] = [];
  if (parsed.mod) parts.push('CommandOrControl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(acceleratorKeyName(parsed.key));
  return parts.join('+');
}

/** macOS 감지 (renderer 안전). */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Windows 감지 (renderer 안전).
 *
 * 'native-desktop' 위젯 모드는 Windows 전용이므로 비Windows에서는 라디오를
 * disabled로 노출해야 한다. 이 helper는 navigator.platform/userAgent 기반의
 * 보수적 판정으로, false positive보다 false negative를 선호한다.
 */
export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false;
  // navigator.platform 표준값: 'Win32', 'Win64' (Edge/Chrome 모두)
  if (/^Win/i.test(navigator.platform)) return true;
  // 일부 환경에서 platform이 비어있을 수 있어 userAgent도 확인
  if (typeof navigator.userAgent === 'string' && /Windows/i.test(navigator.userAgent)) return true;
  return false;
}
