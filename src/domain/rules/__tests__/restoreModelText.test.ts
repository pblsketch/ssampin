/**
 * 별칭 되돌리기 — **실측 기반** 테스트
 *
 * ★여기 있는 입력 문자열은 지어낸 것이 아니라 solar-pro3 가 **실제로 뱉은 형태**다
 * (2026-08-21, 30회 호출 측정. 결과: `docs/03-analysis/inapp-ai-assist/`).
 *
 * 재 보기 전 가정: "모델이 `［이름1］` 을 그대로 돌려줄 것이다."
 * **실측 결과: 원형 보존 16.7%.** 모델은 괄호를 11가지로 바꿔 놓았다 —
 * `〈이름1〉` · `[이름1]` · `(이름 1)` · 마크다운 escape `\[이름1\]` · 괄호 없는 `학번1` …
 *
 * 그래서 정확 일치(`maskEngine.restore`)로는 6개만 잡혔고,
 * **선생님이 `〈이름1〉` 같은 찌꺼기를 그대로 보게 된다.**
 *
 * ★되돌리기 규칙은 둘뿐 — **우리 괄호(`［］`)만 떼고, 모델이 쓴 괄호는 그대로 둔다.**
 * 모델 괄호까지 떼려다 `면담(이름1)이` → `면담김지훈이` 로 한글이 붙는 사고가 났다.
 */
import { describe, expect, it } from 'vitest';

import { restoreModelText } from '../redactOutbound';
import type { MaskMapping } from '../../privacy/types';

const MAPPINGS: readonly MaskMapping[] = [
  { alias: '［이름1］', original: '김지훈', kind: 'keyword' },
  { alias: '［이름2］', original: '박서연', kind: 'keyword' },
  { alias: '［학번1］', original: '15번', kind: 'keyword' },
];

describe('★모델이 실제로 뱉은 형태를 전부 되돌린다', () => {
  it.each([
    // 우리 괄호 → 괄호째 사라진다
    ['전각 대괄호(원형)', '［이름1］ 면담이 급해요', '김지훈 면담이 급해요'],
    // 모델 괄호 → 속만 바뀌고 괄호는 남는다
    [
      '홑화살괄호',
      '오늘 마감인 〈이름1〉 상담이 급합니다',
      '오늘 마감인 〈김지훈〉 상담이 급합니다',
    ],
    [
      '반각 대괄호',
      '‘[이름1] 상담 기록 작성’이 가장 급합니다',
      '‘[김지훈] 상담 기록 작성’이 가장 급합니다',
    ],
    ['소괄호', '학부모 면담(이름1)이 25일입니다', '학부모 면담(김지훈)이 25일입니다'],
    ['소괄호 + 공백', '**학부모 면담** (이름 1)', '**학부모 면담** (김지훈)'],
    ['괄호 없음', '학번1 상담이 24일 마감입니다', '15번 상담이 24일 마감입니다'],
    ['마크다운 강조 안', '**[학번1] 상담** – 마감', '**[15번] 상담** – 마감'],
    ['닫는 괄호 누락', '[이름1 면담', '[김지훈 면담'],
    ['마크다운 escape', '학부모 면담(\\[이름1\\])이', '학부모 면담(\\[김지훈\\])이'],
  ])('%s', (_label, input, expected) => {
    expect(restoreModelText(input, MAPPINGS)).toBe(expected);
  });

  it('한 문장에 여러 학생이 나와도 각각 제 이름으로 돌아간다', () => {
    expect(restoreModelText('〈이름1〉 상담과 〈이름2〉 연락이 남았어요', MAPPINGS)).toBe(
      '〈김지훈〉 상담과 〈박서연〉 연락이 남았어요',
    );
  });
});

describe('★되돌린 뒤 별칭 흔적이 남지 않는다', () => {
  it.each([
    '［이름1］ 면담',
    '〈이름1〉 면담',
    '[이름1] 면담',
    '(이름1) 면담',
    '(이름 1) 면담',
    '이름1 면담',
    '\\[이름1\\] 면담',
    '**[학번1]** 상담',
    '학번1 상담',
  ])('%s → 별칭 흔적 0', (input) => {
    expect(restoreModelText(input, MAPPINGS)).not.toMatch(/(이름|학번)\s*\d/);
  });
});

describe('★한글이 붙어 버리지 않는다 (실제로 겪은 사고)', () => {
  it.each([
    ['학번1 상담이 24일', '15번 상담이 24일'],
    ['면담(이름1)이 25일', '면담(김지훈)이 25일'],
    ['오늘 이름1 면담', '오늘 김지훈 면담'],
  ])('%s', (input, expected) => {
    expect(restoreModelText(input, MAPPINGS)).toBe(expected);
  });
});

describe('경계 — 엉뚱한 것을 건드리지 않는다', () => {
  it('★이름1 규칙이 이름11 을 먼저 먹지 않는다', () => {
    const many: readonly MaskMapping[] = [
      { alias: '［이름1］', original: '김지훈', kind: 'keyword' },
      { alias: '［이름11］', original: '최유진', kind: 'keyword' },
    ];
    expect(restoreModelText('［이름11］ 과 ［이름1］ 상담', many)).toBe('최유진 과 김지훈 상담');
  });

  it('매핑에 없는 별칭은 그대로 둔다', () => {
    expect(restoreModelText('［이름9］ 면담', MAPPINGS)).toBe('［이름9］ 면담');
  });

  it('별칭이 없는 평범한 문장은 손대지 않는다', () => {
    const plain = '오늘 출석 26명, 결석 2명, 지각 1명입니다.';
    expect(restoreModelText(plain, MAPPINGS)).toBe(plain);
  });

  it('매핑이 비면 원문 그대로다', () => {
    expect(restoreModelText('［이름1］ 면담', [])).toBe('［이름1］ 면담');
  });

  it('숫자가 든 평범한 문장을 망가뜨리지 않는다', () => {
    const plain = '3학년 2반은 30명이고 결석은 2명입니다.';
    expect(restoreModelText(plain, MAPPINGS)).toBe(plain);
  });
});
