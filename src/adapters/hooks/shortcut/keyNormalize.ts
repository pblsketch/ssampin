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

function normalizeKey(rawKey: string): string {
  // 한글/IME 키 등 특수 처리는 단순화: lowercase 처리만
  // Arrow/Function 키는 원형 유지
  if (rawKey.length === 1) return rawKey.toLowerCase();
  if (rawKey.startsWith('Arrow')) return rawKey;
  if (/^F\d+$/.test(rawKey)) return rawKey;
  // Enter/Escape/Tab/Space 등은 lowercase 통일
  return rawKey.toLowerCase();
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
  const tokens = combo.toLowerCase().split('+').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  const mod = tokens.includes('mod') || tokens.includes('ctrl') || tokens.includes('cmd') || tokens.includes('meta');
  const alt = tokens.includes('alt') || tokens.includes('option');
  const shift = tokens.includes('shift');
  const key = tokens.find((t) => !['mod', 'ctrl', 'cmd', 'meta', 'alt', 'option', 'shift'].includes(t));
  if (!key) return null;
  return { mod, alt, shift, key };
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
  parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return parts.join('+');
}

/**
 * canonical 조합 → Electron globalShortcut accelerator.
 * 예: "mod+alt+t" → "CommandOrControl+Alt+T".
 */
export function comboToAccelerator(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed) return '';
  const parts: string[] = [];
  if (parsed.mod) parts.push('CommandOrControl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return parts.join('+');
}

/** macOS 감지 (renderer 안전). */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}
