export interface KeyboardShortcut {
  /** 키 이름: 'Escape', ' ' (Space), 'r', 'Enter', '1' 등 */
  readonly key: string;
  /** 한글 표시명: '시작/일시정지' */
  readonly label: string;
  /** 설명 */
  readonly description: string;
  /** 실행 함수 */
  readonly handler: () => void;
  /** 수식키 */
  readonly modifiers?: {
    readonly shift?: boolean;
    readonly ctrl?: boolean;
  };
}
