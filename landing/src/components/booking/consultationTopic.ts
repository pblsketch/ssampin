/**
 * 상담 주제 담는 규칙 — 앱(`src/domain/rules/consultationTopic.ts`)의 짝.
 *
 * 랜딩은 별도 Next.js 프로젝트라 앱 소스를 import 할 수 없어 같은 규칙이 한 벌 더 있다.
 * **한쪽을 고치면 반드시 다른 쪽도 고칠 것** — 접두사나 구분자가 어긋나면 선생님 화면에서
 * 고른 주제가 칩이 아니라 글자 그대로 보인다.
 *
 * 담는 모양:
 * ```
 * [주제] 학교생활 · 교우관계
 * 요즘 친구 문제로 힘들어하는 것 같습니다.
 * ```
 * 고른 주제가 없으면 접두사 없이 직접 적은 글만 들어간다(이 기능 이전과 같은 모양).
 */

export const TOPIC_PREFIX = '[주제] ';
export const TOPIC_SEPARATOR = ' · ';

/** 예약자가 고른 주제와 직접 적은 글을 저장할 한 덩어리로 만든다. 둘 다 비면 빈 문자열. */
export function composeConsultationTopic(selectedTopics: readonly string[], note: string): string {
  const topics = selectedTopics.map((t) => t.trim()).filter((t) => t.length > 0);
  const trimmedNote = note.trim();
  if (topics.length === 0) return trimmedNote;
  const head = `${TOPIC_PREFIX}${topics.join(TOPIC_SEPARATOR)}`;
  return trimmedNote ? `${head}\n${trimmedNote}` : head;
}
