/**
 * 할 일 본문에서 "@" 로 사람을 부르는 입력을 해석하는 규칙 — 순수 함수.
 *
 * 화면은 "지금 커서 자리가 @ 뒤인가, 그렇다면 무엇을 검색해야 하는가"만 알면 된다.
 * 그 판단을 여기 모아 두어 입력창이 여러 개로 늘어도 규칙이 갈라지지 않게 한다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/** 커서 앞에서 "@" 를 찾을 때 거슬러 올라갈 최대 글자 수. 이름은 이보다 길지 않다. */
const MAX_MENTION_LENGTH = 20;

export interface MentionQuery {
  /** "@" 가 있는 위치 */
  readonly atIndex: number;
  /** "@" 다음부터 커서까지의 글자 — 이 값으로 연락처를 검색한다 */
  readonly query: string;
}

/** 멘션을 끊는 글자 — 공백류. 이름 중간에 공백이 오면 거기서 끊긴다. */
function isBreak(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

/**
 * 커서 자리가 멘션 입력 중인지 판정하고, 맞으면 검색어를 돌려준다.
 *
 * 멘션으로 **인정하지 않는** 경우:
 *  - "@" 바로 앞에 글자가 붙어 있을 때 → `a@b.com` 같은 **이메일**이다. 이걸 멘션으로 보면
 *    이메일을 적을 때마다 팝오버가 튀어나온다.
 *  - "@" 와 커서 사이에 공백이 있을 때 → 이름 입력이 이미 끝난 것으로 본다.
 *
 * 한글 초성 한 글자("@ㄱ")도 그대로 검색어로 돌려준다 — 연락처 검색이 초성을 지원한다.
 *
 * @param caretIndex 커서 위치(0 = 맨 앞). 범위를 벗어나면 null.
 */
export function extractMentionQuery(text: string, caretIndex: number): MentionQuery | null {
  if (caretIndex < 0 || caretIndex > text.length) return null;

  for (let i = caretIndex - 1; i >= 0 && caretIndex - i <= MAX_MENTION_LENGTH; i--) {
    const ch = text[i];
    if (ch === undefined) return null;
    if (isBreak(ch)) return null;

    if (ch === '@') {
      // "@" 앞에 글자가 붙어 있으면 이메일이다 — 멘션이 아니다.
      const prev = i > 0 ? text[i - 1] : undefined;
      if (prev !== undefined && !isBreak(prev)) return null;
      return { atIndex: i, query: text.slice(i + 1, caretIndex) };
    }
  }
  return null;
}

export interface MentionApplyResult {
  readonly text: string;
  /** 이름을 넣은 뒤 커서가 있어야 할 자리 */
  readonly caretIndex: number;
}

/**
 * 고른 이름을 본문에 채워 넣는다. `@김` → `@김민호 `
 *
 * 끝에 공백을 하나 붙인다 — 이어서 글을 쓸 때 매번 띄어쓰기를 하지 않아도 되고,
 * 다음 글자가 붙어도 방금 넣은 이름이 다시 검색어로 잡히지 않는다.
 * 멘션 자리가 아니면 원본을 그대로 돌려준다.
 */
export function applyMention(text: string, caretIndex: number, name: string): MentionApplyResult {
  const mention = extractMentionQuery(text, caretIndex);
  if (mention === null) return { text, caretIndex };

  const before = text.slice(0, mention.atIndex);
  const after = text.slice(caretIndex);
  const inserted = `@${name} `;
  return { text: before + inserted + after, caretIndex: before.length + inserted.length };
}
