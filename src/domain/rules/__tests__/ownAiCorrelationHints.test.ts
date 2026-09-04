import { describe, it, expect } from 'vitest';
import type { MaskMapping } from '@domain/privacy/types';
import { redactQuestion, rosterFrom, rosterFromAll } from '@domain/rules/redactOutbound';
import { createMaskSession } from '@domain/privacy/maskEngine';
import {
  buildCorrelationHints,
  formatCorrelationHintBlock,
  type StudentNumberRef,
} from '@domain/rules/ownAiCorrelationHints';

/** 학생 이름·학번은 명단 기반이라 kind 가 'keyword' 다(패턴이 아니다). */
function kw(alias: string, original: string): MaskMapping {
  return { alias, original, kind: 'keyword' };
}

describe('별칭 접두사는 실제 명단 규칙과 붙어 있다', () => {
  it('rosterFrom 이 이름과 학번 두 묶음을 만든다 — 힌트 빌더가 이 라벨을 그대로 쓴다', () => {
    const groups = rosterFrom([{ name: '김지훈', studentNumber: 15 }]);
    const labels = groups.map((g) => g.label);
    expect(labels).toContain('이름');
    expect(labels).toContain('학번');
    // 학번은 "15번" 형태로 들어간다(숫자만 넣으면 평범한 숫자까지 잡힌다)
    const numberGroup = groups.find((g) => g.label === '학번');
    expect(numberGroup?.values).toContain('15번');
  });
});

describe('별칭 ↔ 번호 대응 힌트', () => {
  it('이름 별칭에 소속과 번호를 붙인다', () => {
    const lines = buildCorrelationHints([kw('［이름1］', '김지훈')], (n) =>
      n === '김지훈' ? [{ scope: '담임', number: 15 }] : [],
    );
    expect(lines).toEqual(['［이름1］ = 담임 15번']);
  });

  it('★반환 문자열에 실명이 절대 들어가지 않는다', () => {
    const lines = buildCorrelationHints(
      [kw('［이름1］', '김지훈'), kw('［이름2］', '박서연')],
      () => [{ scope: '담임', number: 3 }],
    );
    const joined = lines.join('\n') + formatCorrelationHintBlock(lines);
    expect(joined).not.toContain('김지훈');
    expect(joined).not.toContain('박서연');
  });

  it('학번 별칭은 해석기 없이 되돌려 준다 — 가려진 값이 곧 번호다', () => {
    const lines = buildCorrelationHints([kw('［학번1］', '15번')], () => []);
    expect(lines).toEqual(['［학번1］ = 15번']);
  });

  it('동명이인은 후보를 전부 나열한다 — 모델이 임의로 고르지 않게', () => {
    const refs: StudentNumberRef[] = [
      { scope: '담임', number: 15 },
      { scope: '2반', number: 7 },
    ];
    const lines = buildCorrelationHints([kw('［이름1］', '김지훈')], () => refs);
    expect(lines).toEqual(['［이름1］ = 담임 15번 또는 2반 7번']);
  });

  it('번호를 못 찾은 이름은 줄을 만들지 않는다 — 없는 정보를 지어내지 않는다', () => {
    expect(buildCorrelationHints([kw('［이름9］', '모르는사람')], () => [])).toEqual([]);
  });

  it('패턴 별칭(전화 등)은 대응시키지 않는다', () => {
    const lines = buildCorrelationHints(
      [{ alias: '［전화1］', original: '010-0000-0000', kind: 'phone' }],
      () => [{ scope: '담임', number: 1 }],
    );
    expect(lines).toEqual([]);
  });

  it('이름·학번이 아닌 키워드 묶음은 건너뛴다', () => {
    expect(
      buildCorrelationHints([kw('［학교1］', '○○중학교')], () => [{ scope: '담임', number: 1 }]),
    ).toEqual([]);
  });

  it('같은 별칭이 여러 번 나와도 한 줄만 만든다', () => {
    const lines = buildCorrelationHints(
      [kw('［이름1］', '김지훈'), kw('［이름1］', '김지훈')],
      () => [{ scope: '담임', number: 15 }],
    );
    expect(lines).toHaveLength(1);
  });

  it('이름과 학번이 같이 오면 둘 다 줄을 만든다', () => {
    const lines = buildCorrelationHints(
      [kw('［이름1］', '김지훈'), kw('［학번1］', '15번')],
      () => [{ scope: '담임', number: 15 }],
    );
    expect(lines).toHaveLength(2);
  });

  it('힌트가 없으면 붙일 덩어리도 비어 있다', () => {
    expect(formatCorrelationHintBlock([])).toBe('');
    expect(formatCorrelationHintBlock(['［이름1］ = 담임 15번'])).toContain('［이름1］');
  });
});

/**
 * ★힌트를 만드는 자리와 실제로 질문을 가리는 자리가 **다르다**(화면 vs 스토어).
 *
 * 둘 다 "새 세션으로 질문부터 가린다"라서 별칭 번호가 맞아떨어지는데, 이건 눈에 안 보이는
 * 약속이다. 깨지면 힌트가 **남의 학생 번호**를 가리키게 된다 — 화면에는 아무 표시도 없이.
 * 그래서 그 약속 자체를 여기서 붙잡아 둔다.
 */
describe('★같은 질문·같은 명단이면 별칭이 똑같이 매겨진다', () => {
  const roster = rosterFromAll(
    [
      { name: '김지훈', studentNumber: 15 },
      { name: '박서연', studentNumber: 3 },
    ],
    [],
  );

  it('세션을 따로 만들어도 같은 별칭이 나온다', () => {
    const a = redactQuestion('박서연이랑 김지훈 이번 주 어땠어?', roster, createMaskSession());
    const b = redactQuestion('박서연이랑 김지훈 이번 주 어땠어?', roster, createMaskSession());

    expect(a.masked).toBe(b.masked);
    expect(a.mappings.map((m) => `${m.alias}=${m.original}`)).toEqual(
      b.mappings.map((m) => `${m.alias}=${m.original}`),
    );
  });

  it('그 별칭으로 만든 힌트가 실제 소속 번호를 가리킨다', () => {
    const { mappings } = redactQuestion('김지훈 어땠어?', roster, createMaskSession());
    const hints = buildCorrelationHints(mappings, (name) =>
      name === '김지훈' ? [{ scope: '담임', number: 15 }] : [],
    );

    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('담임 15번');
    // 힌트에도 실명은 없다.
    expect(hints[0]).not.toContain('김지훈');
  });
});
