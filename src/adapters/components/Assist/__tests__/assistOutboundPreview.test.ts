/**
 * 쌤핀 AI — 「나갈 문장」 줄이 **진짜 나갈 문장**을 보여주는가 (2026-08-25)
 *
 * 이 줄은 입력창 위에 고정돼 실시간으로 다시 쓰인다. 그래서 실제 전송 경로(`ask`)와
 * **같은 세션을 물릴 수 없다** — 물리면 타이핑하는 내내 별칭 번호가 올라간다
 * (［이름1］ → ［이름7］). 세션 없이 부르는데도 번호가 실제 전송과 일치하는 근거는
 * 딱 하나다: **`ask` 가 카드보다 질문을 먼저 가린다.**
 *
 * ★그 순서가 뒤집히면 이 줄은 **조용히 틀린 번호**를 보여준다. 화면은 멀쩡해 보이고,
 * 타입 검사도 린트도 아무 말 하지 않는다. 사람이 기억해서 지킬 수 있는 종류가 아니라
 * 여기서 못 박는다.
 */
import { describe, expect, it } from 'vitest';

import { createMaskSession } from '@domain/privacy/maskEngine';
import {
  questionHasBlockingPii,
  redactOutbound,
  redactQuestion,
  rosterFromAll,
} from '@domain/rules/redactOutbound';
import { findAssistTool } from '@domain/services/assistToolRegistry';

const ROSTER = rosterFromAll(
  [
    { name: '박서연', studentNumber: 15 },
    { name: '김지훈', studentNumber: 1 },
  ],
  [{ students: [{ number: 7, name: '최민호' }] }],
);

/** 미리보기가 하는 일 그대로 — 세션 없이 부른다(OutboundLine.tsx 의 useMemo). */
function preview(text: string): string {
  return redactQuestion(text, ROSTER).masked;
}

describe('★미리보기와 실제 전송이 같은 문장을 만든다', () => {
  it('한 명', () => {
    const text = '오늘 박서연 결석이야';
    const session = createMaskSession();
    expect(preview(text)).toBe(redactQuestion(text, ROSTER, session).masked);
  });

  it('여러 명 — 번호가 등장 순서대로 같게 매겨진다', () => {
    const text = '오늘 박서연 결석이고, 최민호도 조퇴, 김지훈은 지각';
    const session = createMaskSession();
    const real = redactQuestion(text, ROSTER, session).masked;

    expect(preview(text)).toBe(real);
    // 실제로 가려졌는지도 함께 본다 — 둘 다 원문이면 위 단언은 통과해도 의미가 없다.
    expect(real).not.toContain('박서연');
    expect(real).toContain('［이름1］');
    expect(real).toContain('［이름3］');
  });

  it('같은 학생이 두 번 나오면 별칭도 하나다', () => {
    const text = '박서연 결석인데 박서연 어머니께 연락드릴까요';
    const masked = preview(text);
    expect(masked).toContain('［이름1］');
    expect(masked).not.toContain('［이름2］');
  });

  it('가릴 것이 없으면 원문 그대로 — 이때 화면은 한 줄만 뜬다', () => {
    const text = '이번 주 할 일 알려줘';
    expect(preview(text)).toBe(text);
  });
});

describe('★순서 계약 — ask 는 카드보다 질문을 먼저 가린다', () => {
  it('질문을 먼저 가려야 미리보기 번호가 맞는다', () => {
    // `ask` 의 실제 순서를 그대로 흉내 낸다: 질문 → 그다음 카드.
    const question = '오늘 박서연 결석이야';
    const tool = findAssistTool('get_my_todos');
    if (!tool) throw new Error('레지스트리에 get_my_todos 가 없다');
    // ★진짜로 가려지는 카드여야 한다. `title` 이 이 도구의 자유 입력 칸이라
    //   여기 든 이름이 별칭 번호를 한 칸 가져간다(안 가려지면 이 테스트는 무의미해진다).
    const card = { items: [{ title: '최민호 상담 전화' }] } as never;
    expect(
      redactOutbound(tool, card, ROSTER, createMaskSession()).mappings.length,
      '카드가 안 가려지면 아래 순서 시연이 성립하지 않는다',
    ).toBe(1);

    const right = createMaskSession();
    const questionFirst = redactQuestion(question, ROSTER, right).masked;
    redactOutbound(tool, card, ROSTER, right);

    expect(questionFirst).toBe(preview(question));

    // ── 뒤집으면 어떻게 되는지도 함께 남긴다 ──
    // 카드를 먼저 가리면 카드 속 이름이 ［이름1］ 을 가져가고, 질문의 박서연은
    // ［이름2］ 가 된다. 화면(미리보기)은 여전히 ［이름1］ 이라고 말한다.
    const wrong = createMaskSession();
    redactOutbound(tool, card, ROSTER, wrong);
    const cardFirst = redactQuestion(question, ROSTER, wrong).masked;

    expect(
      cardFirst,
      '카드를 먼저 가리면 미리보기와 실제 전송의 번호가 어긋난다 — ask 의 순서를 되돌릴 것',
    ).not.toBe(preview(question));
  });
});

describe('★연락처가 있으면 미리보기도 "안 나간다"로 갈라진다', () => {
  it('연락처·주민번호는 전송 자체가 막힌다', () => {
    for (const bad of [
      '박서연 어머니 010-1234-5678 로 연락',
      '990101-1234567 확인 부탁',
      'teacher@example.com 으로 보내줘',
    ]) {
      expect(questionHasBlockingPii(bad), bad).toBe(true);
    }
  });

  it('평범한 질문은 막히지 않는다 — 오탐이면 이 줄이 늘 "안 나가요"가 된다', () => {
    for (const ok of [
      '오늘 우리 반 출결 어때요?',
      '이번 주 할 일 알려줘',
      '2026-08-25 진도 정리해줘',
      '15번 학생 결석 처리해줘',
    ]) {
      expect(questionHasBlockingPii(ok), ok).toBe(false);
    }
  });
});

describe('★별칭 칩 쪼개기 — 위치 계산 없이 별칭만 골라낸다', () => {
  // OutboundLine.tsx 의 ALIAS_SPLIT 과 같은 규칙. 여기가 깨지면 칩이 안 뜬다.
  const ALIAS_SPLIT = /(［[^］]+］)/;

  it('별칭만 홀수 자리에 떨어진다', () => {
    const parts = '오늘 ［이름1］ 결석이고, ［이름2］도 조퇴'.split(ALIAS_SPLIT);
    const aliases = parts.filter((_, i) => i % 2 === 1);
    expect(aliases).toEqual(['［이름1］', '［이름2］']);
  });

  it('실제로 가린 문장에도 그대로 먹는다', () => {
    const masked = preview('오늘 박서연 결석이고, 최민호도 조퇴');
    const aliases = masked.split(ALIAS_SPLIT).filter((_, i) => i % 2 === 1);
    expect(aliases.length).toBe(2);
    for (const alias of aliases) {
      expect(alias.startsWith('［')).toBe(true);
      expect(alias.endsWith('］')).toBe(true);
    }
  });
});
