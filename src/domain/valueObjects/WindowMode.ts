/**
 * 앱이 화면에 노출되는 윈도우 모드 (v2.0.2~).
 *
 * - main:    풀앱 (920×700)
 * - widget:  위젯 (사용자 설정 크기, transparent, alwaysOnTop)
 * - icon:    아이콘 (56×56 floating, screen-saver level, fullscreen 위 표시)
 * - sidePin: 옆핀 (화면 오른쪽 가장자리 손잡이, 호버로 펼침)
 *
 * 이 넷은 **서로 배타적**이다. 하나를 켜면 나머지는 숨는다.
 *
 * 전환은 infrastructure 레이어의 `executeWindowTransition(target)` 단일 진입점을 통과한다.
 */
export type WindowMode = 'icon' | 'widget' | 'main' | 'sidePin';

export const WINDOW_MODES = ['icon', 'widget', 'main', 'sidePin'] as const;

export function isValidWindowMode(value: unknown): value is WindowMode {
  return typeof value === 'string' && (WINDOW_MODES as readonly string[]).includes(value);
}
