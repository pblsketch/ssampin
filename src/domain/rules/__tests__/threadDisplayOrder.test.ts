/**
 * 주제 차례(오너 요청 2026-09-11) — 열린 주제 먼저, ↑↓ 로 정한 차례, 정하지 않은 주제는 뒤에 만든 차례대로.
 */
import { describe, it, expect } from 'vitest';

import { sortThreadsForDisplay } from '../../entities/InquiryThread';

const t = (id: string, status: 'open' | 'closed', order?: number) => ({
  id,
  status,
  ...(order === undefined ? {} : { order }),
});

describe('sortThreadsForDisplay', () => {
  it('정한 차례가 없으면 만든 차례 그대로다(열린 것 먼저)', () => {
    const out = sortThreadsForDisplay([t('a', 'closed'), t('b', 'open'), t('c', 'open')]);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('↑↓ 로 정한 차례를 따르고, 정하지 않은 새 주제는 뒤에 온다', () => {
    const out = sortThreadsForDisplay([t('a', 'open', 1), t('b', 'open', 0), t('new', 'open')]);
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'new']);
  });

  it('★닫힌 주제는 차례 값이 작아도 열린 주제 위로 오지 않는다', () => {
    const out = sortThreadsForDisplay([t('x', 'closed', 0), t('y', 'open', 5)]);
    expect(out.map((x) => x.id)).toEqual(['y', 'x']);
  });
});
