import { describe, it, expect } from 'vitest';

import { WRITE_DOMAINS, WRITE_OPS } from '@domain/contracts/aiBridgeWriteContract';
import {
  proposalPreview,
  proposalTitle,
  OWN_AI_PROPOSAL_SOURCE_NOTE,
} from '../ownAiProposalLabels';

describe('제안 카드 제목', () => {
  it('★쓰기 계약의 모든 갈래에 한국어 이름이 있다 — 하나라도 비면 카드가 영어로 뜬다', () => {
    for (const d of WRITE_DOMAINS) {
      for (const op of WRITE_OPS) {
        const t = proposalTitle(d, op);
        expect(t).not.toContain('undefined');
        // 한글이 한 글자라도 있어야 한다
        expect(/[가-힣]/.test(t)).toBe(true);
      }
    }
  });

  it('무엇을 어디에 하는지 둘 다 말한다', () => {
    expect(proposalTitle('todos', 'create')).toBe('할 일 추가');
    expect(proposalTitle('homeroomAttendance', 'update')).toBe('담임 출결 수정');
  });
});

describe('제안 카드 미리보기', () => {
  it('알아볼 값만 골라 낸다', () => {
    expect(proposalPreview({ text: '수행평가 채점', date: '2026-09-05', junk: { a: 1 } })).toEqual([
      '수행평가 채점',
      '2026-09-05',
    ]);
  });

  it('★긴 값은 잘라 보여 준다 — 카드가 길면 읽지 않고 누른다', () => {
    const long = '가'.repeat(100);
    const [line] = proposalPreview({ text: long });
    expect(line).toHaveLength(41); // 40자 + …
    expect(line?.endsWith('…')).toBe(true);
  });

  it('빈 문자열·공백은 없는 것으로 본다', () => {
    expect(proposalPreview({ text: '   ', title: '진짜' })).toEqual(['진짜']);
  });

  it('숫자도 보여 준다(교시 등)', () => {
    expect(proposalPreview({ period: 3 })).toEqual(['3']);
  });

  it('개수 상한을 지킨다', () => {
    const many = { text: 'a', title: 'b', content: 'c', date: 'd', status: 'e' };
    expect(proposalPreview(many)).toHaveLength(3);
  });

  it('보여 줄 게 없으면 빈 배열 — 카드는 제목만 보여 준다', () => {
    expect(proposalPreview({ id: 'x-1' })).toEqual([]);
  });
});

describe('출처 안내', () => {
  it('★"다른 앱일 수 있다"고 분명히 말한다 — 구독 실행 중에는 출처를 못 가른다', () => {
    expect(OWN_AI_PROPOSAL_SOURCE_NOTE).toContain('다른 AI 앱');
  });
});
