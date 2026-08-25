/**
 * @vitest-environment jsdom
 *
 * 「나갈 문장」 줄 — **화면에 실제로 무엇이 그려지는가** (2026-08-25)
 *
 * 앞의 `assistOutboundPreview.test.ts` 는 "같은 문장이 나오는가"를 계산으로 본다.
 * 여기서는 그 결과가 **화면에 어떻게 놓이는지**를 본다 — 줄이 하나인가 둘인가,
 * 이름표가 실제로 나가는 쪽을 가리키는가, 원문이 사라지지 않았는가.
 *
 * 이 저장소는 "자동 검사가 전부 초록인데 실화면을 열어 봐야만 드러난" 사고를 겪었다.
 * 그래서 계산이 아니라 **그려진 것**을 단언한다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { rosterFromAll } from '@domain/rules/redactOutbound';
import { screenAssistInput } from '@domain/rules/screenAssistInput';
import { OutboundLine } from '../OutboundLine';

const ROSTER = rosterFromAll(
  [{ name: '박서연', studentNumber: 15 }],
  [{ students: [{ number: 7, name: '최민호' }] }],
);

// ★이 저장소는 vitest `globals: false` 라 자동 정리가 돌지 않는다. 손으로 치운다 —
//   안 치우면 앞 테스트의 DOM 이 남아 "같은 글자가 두 개"로 잡힌다.
afterEach(cleanup);

function draw(text: string) {
  return render(
    <OutboundLine
      text={text}
      screening={screenAssistInput(text)}
      roster={ROSTER}
      onRemoveFinding={() => {}}
    />,
  );
}

describe('★가릴 것이 없으면 예전과 똑같이 한 줄이다 (가장 흔한 경우)', () => {
  it('이름표는 「나갈 문장」 하나뿐 — 「쓴 문장」은 나타나지 않는다', () => {
    draw('이번 주 할 일 알려줘');

    expect(screen.getByText('나갈 문장')).toBeTruthy();
    expect(screen.queryByText('쓴 문장')).toBeNull();
    expect(screen.getByText(/이번 주 할 일 알려줘/)).toBeTruthy();
  });

  it('같은 문장이 두 번 뜨지 않는다', () => {
    const { container } = draw('이번 주 할 일 알려줘');
    const shown = container.textContent ?? '';
    expect(shown.split('이번 주 할 일 알려줘').length - 1).toBe(1);
  });
});

describe('★이름이 들어가면 두 줄로 갈라진다', () => {
  it('위는 「쓴 문장」(원문), 아래는 「나갈 문장」(가린 것)', () => {
    const { container } = draw('오늘 박서연 결석이야');

    expect(screen.getByText('쓴 문장')).toBeTruthy();
    expect(screen.getByText('나갈 문장')).toBeTruthy();

    const shown = container.textContent ?? '';
    // 원문은 남는다 — 없애면 물결 밑줄과 [이 부분 지우기]가 함께 깨진다.
    expect(shown).toContain('박서연');
    // 그리고 실제로 나가는 문장이 눈에 보인다.
    expect(shown).toContain('［이름1］');
  });

  it('★이름표는 언제나 실제로 나가는 쪽에 붙는다', () => {
    const { container } = draw('오늘 박서연 결석이야');
    const text = container.textContent ?? '';
    // "나갈 문장" 뒤에 오는 것이 가린 문장이어야 한다(원문이 아니라).
    const after = text.slice(text.indexOf('나갈 문장'));
    expect(after).toContain('［이름1］');
    expect(after).not.toContain('박서연');
  });

  it('별칭은 칩으로 떠서 눈에 띈다', () => {
    draw('오늘 박서연 결석이야');
    expect(screen.getByText('［이름1］')).toBeTruthy();
  });

  it('여러 명이면 별칭도 여럿 뜬다', () => {
    draw('오늘 박서연 결석이고, 최민호도 조퇴');
    expect(screen.getByText('［이름1］')).toBeTruthy();
    expect(screen.getByText('［이름2］')).toBeTruthy();
  });
});

describe('★경고와 가림이 동시에 걸려도 서로 안 밀어낸다', () => {
  it('⚠ 는 쓴 문장 줄에, 가린 문장은 아래에, 경고 안내는 그 밑에', () => {
    const { container } = draw('박서연 부모님 이혼하셨대요');
    const shown = container.textContent ?? '';

    // 물결 밑줄은 **원문 줄에만** 그어진다 — 위치가 원문 기준이기 때문이다.
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    // ★걸린 단어가 **그대로 남아 있어야** 한다. 예전에는 aria-label 이 내용을 대체해
    //   듣는 사람만 "이혼"을 통째로 잃었다(문장이 그 자리에서 끊겼다).
    expect(marks[0]?.textContent).toContain('이혼');
    expect(marks[0]?.getAttribute('aria-label')).toBeNull();
    expect(marks[0]?.getAttribute('title')).toContain('가정 형편');
    // 무엇에 걸렸는지는 대체가 아니라 덧붙임으로 알린다.
    expect(marks[0]?.querySelector('.sr-only')?.textContent).toBe('(가정 형편 이야기)');

    expect(screen.getByText('쓴 문장')).toBeTruthy();
    expect(shown).toContain('［이름1］ 부모님 이혼하셨대요');
    expect(shown).toContain('이 부분 지우기');
  });

  it('소리 알림은 두 상태를 합쳐 한 번만 알린다', () => {
    const { container } = draw('박서연 부모님 이혼하셨대요');
    const live = container.querySelector('[aria-live]')?.textContent ?? '';
    expect(live).toContain('가려서 보냅니다');
    expect(live).toContain('주의');
    expect(container.querySelectorAll('[aria-live]').length).toBe(1);
  });
});

describe('★연락처가 있으면 "안 나가요"로 갈라진다', () => {
  it('나간다고 말하지 않는다 — 실제로 요청이 안 나가기 때문이다', () => {
    const { container } = draw('박서연 어머니 010-1234-5678 로 연락드렸어요');
    const shown = container.textContent ?? '';

    expect(screen.getByText('안 나가요')).toBeTruthy();
    expect(screen.queryByText('나갈 문장')).toBeNull();
    expect(shown).toContain('연락처·주민번호는 AI에 보내지 않아요');
    // 원문은 그대로 남는다 — 선생님이 어디를 고쳐야 하는지 봐야 한다.
    expect(shown).toContain('010-1234-5678');
  });
});

describe('★비어 있을 때', () => {
  it('안내 문구만 뜨고 둘째 줄은 없다', () => {
    draw('');
    expect(screen.getByText('입력하면 나갈 문장이 여기 미리 보여요')).toBeTruthy();
    expect(screen.queryByText('쓴 문장')).toBeNull();
    expect(screen.queryByText('안 나가요')).toBeNull();
  });
});

describe('★스크린 리더 — 문장이 아니라 상태 요약만 알린다', () => {
  it('알림 영역은 하나뿐이고, 문장 전체를 담지 않는다', () => {
    const { container } = draw('오늘 박서연 결석이야');
    const live = container.querySelectorAll('[aria-live]');

    expect(live.length).toBe(1);
    expect(live[0]?.textContent).toContain('학생 이름을 가려서 보냅니다');
    // 문장을 담으면 글자 하나 칠 때마다 전체가 다시 낭독된다.
    expect(live[0]?.textContent).not.toContain('결석이야');
  });

  it('가릴 것이 없으면 알릴 것도 없다', () => {
    const { container } = draw('이번 주 할 일 알려줘');
    expect(container.querySelector('[aria-live]')?.textContent).toBe('');
  });
});

describe('★디자인 제약 — 회귀 방지', () => {
  it('하드코딩 색이 없다 (sp-* 토큰만)', () => {
    const { container } = draw('오늘 박서연 결석이야');
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('rounded-sp-* 를 쓰지 않는다', () => {
    const { container } = draw('오늘 박서연 결석이야');
    expect(container.innerHTML).not.toContain('rounded-sp-');
  });

  it('sp-* 토큰에 투명도 수식을 걸지 않는다 (조용히 투명해진다)', () => {
    const { container } = draw('오늘 박서연 결석이야');
    expect(container.innerHTML).not.toMatch(/sp-[a-z-]+\/\d/);
  });
});
