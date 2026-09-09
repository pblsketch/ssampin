/**
 * @vitest-environment jsdom
 *
 * 쌤핀 AI — 답변 글이 화면에 어떻게 그려지는가 (2026-09-10 오너 신고)
 *
 * ★이 자리를 보는 검사가 **한 건도 없었다.** 기존 AssistThread 검사 3종은 답변 글을
 *   전부 빈 문자열(`answer: ''`)로 두고 카드만 봤다. 그래서 게이트 4종이 초록인 채로
 *   "마크다운이 글자로 보이고 줄바꿈이 사라지는" 결함이 출시까지 갔다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { AssistThread } from '../AssistThread';
import type { AssistTurn } from '@adapters/stores/useAssistStore';

afterEach(cleanup);

/** 내 AI(Claude Code)가 실제로 돌려준 모양 — 제목·표·굵게·수평선. */
const MARKDOWN_ANSWER = [
  '## 📅 이번 주 일정',
  '',
  '| 날짜 | 시간 | 일정 |',
  '|------|------|------|',
  '| 9/8(화) | 20:30~22:55 | 교직 실무 연수 |',
  '',
  '이번 주 등록된 할 일은 **없습니다**.',
].join('\n');

function turnWith(answer: string): AssistTurn {
  return {
    id: 't1',
    question: '이번 주 일정과 할 일 정리해줘',
    cards: [],
    answer,
    outboundAnswer: answer,
    outboundCards: [],
    degraded: null,
    status: 'done',
    maskedCount: 0,
    blankedCount: 0,
  };
}

function answerNode(container: HTMLElement): HTMLElement {
  const el = container.querySelector('p.whitespace-pre-wrap');
  if (!el) throw new Error('답변 문단을 찾지 못했다');
  return el as HTMLElement;
}

describe('AssistThread — 답변 글', () => {
  it('★마크다운 기호가 화면에 글자로 남지 않는다', () => {
    const { container } = render(<AssistThread turns={[turnWith(MARKDOWN_ANSWER)]} />);
    const text = answerNode(container).textContent ?? '';

    expect(text.includes('##')).toBe(false);
    expect(text.includes('|')).toBe(false);
    expect(text.includes('**')).toBe(false);
    expect(text.includes('---')).toBe(false);
  });

  it('★내용은 하나도 사라지지 않는다 — 기호만 뗀다', () => {
    const { container } = render(<AssistThread turns={[turnWith(MARKDOWN_ANSWER)]} />);
    const text = answerNode(container).textContent ?? '';

    for (const kept of ['이번 주 일정', '9/8(화)', '20:30~22:55', '교직 실무 연수', '없습니다']) {
      expect(text.includes(kept)).toBe(true);
    }
  });

  it('★줄바꿈이 살아 있다 — 없으면 표가 한 덩어리로 뭉친다(신고된 증상)', () => {
    const { container } = render(<AssistThread turns={[turnWith(MARKDOWN_ANSWER)]} />);
    const el = answerNode(container);

    // ① 글자에 줄바꿈이 남아 있고
    expect((el.textContent ?? '').includes('\n')).toBe(true);
    // ② 그 줄바꿈을 화면에 그리라는 설정도 붙어 있다(둘 중 하나만이면 여전히 뭉친다)
    expect(el.className.includes('whitespace-pre-wrap')).toBe(true);
  });

  it('평문으로 온 답은 그대로 보인다', () => {
    const plain = '이번 주 등록된 할 일은 없어요.\n필요하면 등록해 드릴까요?';
    const { container } = render(<AssistThread turns={[turnWith(plain)]} />);

    expect(answerNode(container).textContent).toBe(plain);
  });
});
