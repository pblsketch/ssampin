/**
 * 쌤핀 AI — 전송 직전 관문 (egress 4중 그물 ③)
 *
 * ★이 층은 **차단**이다. 경고 전환 대상이 아니다.
 * 기계가 확실히 판정할 수 있는 것(전화번호 형태·명단에 있는 이름)만 다루기 때문이다.
 */
import { describe, expect, it } from 'vitest';

import { checkOutboundText, checkOutboundValue } from '@domain/rules/assertNoPii';
import type { KeywordGroup } from '@domain/privacy/types';

const roster: readonly KeywordGroup[] = [{ label: '이름', values: ['김지훈', '박서연'] }];

describe('assertNoPii — 전송 직전 차단', () => {
  it('집계 숫자·학급명은 통과한다 (오탐 0건)', () => {
    expect(checkOutboundText('3학년 2반은 27명 출석했습니다.', roster).blocked).toBe(false);
    expect(checkOutboundText('이번 달 기록 34건, 학습 12건입니다.', roster).blocked).toBe(false);
    expect(checkOutboundText('', roster).blocked).toBe(false);
  });

  it('★함정 픽스처 — 할 일 제목에 심어 둔 실명을 잡는다', () => {
    const result = checkOutboundText('김지훈 상담 전화', roster);

    expect(result.blocked).toBe(true);
    expect(result.hits.map((h) => h.kind)).toContain('keyword');
    expect(result.hits[0]?.label).toBe('이름');
  });

  it('★함정 픽스처 — 전화번호를 잡는다', () => {
    const result = checkOutboundText('010-9999-8888 로 연락 주세요', roster);

    expect(result.blocked).toBe(true);
    expect(result.hits.map((h) => h.kind)).toContain('phone');
  });

  it('주민등록번호·이메일도 잡는다', () => {
    expect(checkOutboundText('990101-1234567', roster).blocked).toBe(true);
    expect(checkOutboundText('teacher@example.com', roster).blocked).toBe(true);
  });

  it('걸린 원문 값 자체는 결과에 담기지 않는다 — 로그로 새면 관문의 의미가 없다', () => {
    const result = checkOutboundText('010-9999-8888', roster);
    const serialized = JSON.stringify(result);

    expect(result.blocked).toBe(true);
    expect(serialized).not.toContain('9999');
    expect(serialized).not.toContain('8888');
  });

  it('명단을 안 주면 이름은 못 잡는다 — 주입이 빠지면 방어도 빠진다', () => {
    // domain 이 스토어를 import 하지 않는 대가다. 부르는 쪽이 명단을 반드시 넘겨야 한다.
    expect(checkOutboundText('김지훈 상담 전화', []).blocked).toBe(false);
  });

  it('★중첩 구조 안의 문자열까지 훑는다 — 위험이 정확히 그 모양이다', () => {
    const toolResult = {
      items: [
        { title: '수행평가 채점', due: '2026-08-25', done: false },
        { title: '김지훈 학부모 면담', due: '2026-08-26', done: false },
      ],
    };

    const result = checkOutboundValue(toolResult, roster);

    expect(result.blocked).toBe(true);
    expect(result.hits.some((h) => h.kind === 'keyword')).toBe(true);
  });

  it('깨끗한 중첩 구조는 통과한다', () => {
    const toolResult = {
      className: '3학년 2반',
      byCategory: [
        { category: '학습', count: 12 },
        { category: '생활', count: 15 },
      ],
      total: 27,
    };

    expect(checkOutboundValue(toolResult, roster).blocked).toBe(false);
  });
});
