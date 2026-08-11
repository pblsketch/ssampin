import { describe, it, expect } from 'vitest';
import { decideTimetableTermRefresh } from './timetableTermRefresh';

const base = { currentTerm: '2026-2', ackedTerm: '2026-1', hasTimetableData: true };

describe('decideTimetableTermRefresh', () => {
  it('학기가 넘어갔고 시간표에 내용이 있으면 갱신 여부를 묻는다', () => {
    expect(decideTimetableTermRefresh(base)).toEqual({
      kind: 'ask',
      fromTerm: '2026-1',
      toTerm: '2026-2',
    });
  });

  it('이미 이번 학기로 확인했으면 아무것도 하지 않는다', () => {
    expect(decideTimetableTermRefresh({ ...base, ackedTerm: '2026-2' })).toEqual({ kind: 'none' });
  });

  it('스탬프가 없으면(구버전 이력) 배너 없이 조용히 채운다 — 업데이트 직후 전원 배너 방지', () => {
    expect(decideTimetableTermRefresh({ ...base, ackedTerm: undefined })).toEqual({
      kind: 'silent-stamp',
      term: '2026-2',
    });
  });

  it('시간표가 비어 있으면 물을 것이 없다 — 스탬프만 갱신', () => {
    expect(decideTimetableTermRefresh({ ...base, hasTimetableData: false })).toEqual({
      kind: 'silent-stamp',
      term: '2026-2',
    });
  });

  it('학년도가 바뀐 경우에도 묻는다', () => {
    expect(
      decideTimetableTermRefresh({ ...base, ackedTerm: '2025-2', currentTerm: '2026-1' }),
    ).toEqual({ kind: 'ask', fromTerm: '2025-2', toTerm: '2026-1' });
  });

  it('현재 학기를 알 수 없으면 아무 판단도 하지 않는다', () => {
    expect(decideTimetableTermRefresh({ ...base, currentTerm: '' })).toEqual({ kind: 'none' });
  });

  it('한 번 "이미 최신"이라고 답하면 같은 학기에는 다시 묻지 않는다', () => {
    const asked = decideTimetableTermRefresh(base);
    expect(asked.kind).toBe('ask');
    // 사용자가 확인 → ack 이 현재 학기로 올라간 뒤 재판정
    expect(decideTimetableTermRefresh({ ...base, ackedTerm: '2026-2' })).toEqual({ kind: 'none' });
  });
});
