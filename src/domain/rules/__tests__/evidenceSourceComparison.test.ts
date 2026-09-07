/**
 * 원본 vs 정리한 근거 비교 (계획 §5.3, AC-13·14).
 *
 * ★"달라요"가 거짓말이면 교사가 매번 비교창을 열었다가 같은 걸 보고 닫는다.
 *   반대로 다른데 같다고 하면 원본 수정이 근거에 영영 반영되지 않는다. 정규화가 핵심이다.
 */
import { describe, it, expect } from 'vitest';
import {
  diffFromSource,
  isSameAsSource,
  normalizeForComparison,
  recheckBeforeApply,
  type ComparisonCapture,
} from '../evidenceSourceComparison';

describe('normalizeForComparison', () => {
  it('★줄바꿈만 통일하고 글자는 손대지 않는다', () => {
    const n = normalizeForComparison({ content: '가\r\n나\r다  라 ' });
    expect(n.content).toBe('가\n나\n다  라 '); // 가운데 두 칸·끝 공백 보존
  });

  it('날짜 부재·null·빈 문자열은 모두 같다', () => {
    expect(normalizeForComparison({ content: '' }).date).toBe('');
    expect(normalizeForComparison({ content: '', date: null }).date).toBe('');
    expect(normalizeForComparison({ content: '', date: '' }).date).toBe('');
  });

  it('장면은 중복을 없애고 정렬한다', () => {
    const n = normalizeForComparison({ content: '', slots: ['나', '가', '나'] });
    expect(n.slots).toEqual(['가', '나']);
  });
});

describe('isSameAsSource', () => {
  it('줄바꿈 표기만 다르면 같다', () => {
    expect(isSameAsSource({ content: '가\r\n나' }, { content: '가\n나' })).toBe(true);
  });

  it('★띄어쓰기가 다르면 다르다 — 교사가 일부러 고친 것일 수 있다', () => {
    expect(isSameAsSource({ content: '가 나' }, { content: '가  나' })).toBe(false);
  });

  it('장면 순서만 다르면 같다', () => {
    expect(
      isSameAsSource({ content: 'x', slots: ['가', '나'] }, { content: 'x', slots: ['나', '가'] }),
    ).toBe(true);
  });

  it('장면 부재와 빈 배열은 비교에서 같다', () => {
    expect(isSameAsSource({ content: 'x' }, { content: 'x', slots: [] })).toBe(true);
  });

  it('날짜가 다르면 다르다', () => {
    expect(
      isSameAsSource({ content: 'x', date: '2026-09-01' }, { content: 'x', date: '2026-09-02' }),
    ).toBe(false);
  });
});

describe('diffFromSource', () => {
  it('바뀐 필드만 표시한다', () => {
    const d = diffFromSource(
      { content: '가', date: '2026-09-01', slots: ['A'] },
      { content: '나', date: '2026-09-01', slots: ['A'] },
    );
    expect(d).toEqual({ content: true, date: false, slots: false });
  });
});

describe('recheckBeforeApply — 대화상자를 열어 둔 사이에 바뀌었는가', () => {
  const capture: ComparisonCapture = {
    sourceId: 'obs-1',
    evidenceId: 'ev-1',
    studentRef: 'tc:c1:1-2-3',
    source: { content: '원본', date: '2026-09-01', slots: [] },
    evidence: { content: '근거', date: '2026-09-01', slots: [] },
  };
  const latest = (over = {}) => ({
    source: { content: '원본', date: '2026-09-01', studentRef: 'tc:c1:1-2-3' },
    evidence: { content: '근거', date: '2026-09-01', studentRef: 'tc:c1:1-2-3' },
    ...over,
  });

  it('둘 다 그대로면 반영해도 된다', () => {
    expect(recheckBeforeApply(capture, latest())).toEqual({ ok: true });
  });

  it('★원본이 그사이 바뀌었으면 쓰지 않고 다시 확인받는다', () => {
    const r = recheckBeforeApply(
      capture,
      latest({ source: { content: '원본이 바뀜', date: '2026-09-01', studentRef: 'tc:c1:1-2-3' } }),
    );
    expect(r).toEqual({ ok: false, reason: 'changed' });
  });

  it('★근거가 그사이 바뀌었어도 쓰지 않는다', () => {
    const r = recheckBeforeApply(
      capture,
      latest({
        evidence: { content: '근거를 다듬음', date: '2026-09-01', studentRef: 'tc:c1:1-2-3' },
      }),
    );
    expect(r).toEqual({ ok: false, reason: 'changed' });
  });

  it('★한쪽이 사라졌으면 쓰지 않는다', () => {
    expect(recheckBeforeApply(capture, latest({ source: null }))).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(recheckBeforeApply(capture, latest({ evidence: null }))).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('★주인이 달라졌으면 쓰지 않는다 — 남의 기록에 반영하는 사고를 막는다', () => {
    const r = recheckBeforeApply(
      capture,
      latest({ evidence: { content: '근거', date: '2026-09-01', studentRef: 'tc:c1:9-9-9' } }),
    );
    expect(r).toEqual({ ok: false, reason: 'missing' });
  });

  it('줄바꿈 표기만 달라진 것은 "바뀜"이 아니다', () => {
    const r = recheckBeforeApply(
      capture,
      latest({ source: { content: '원본', date: '2026-09-01', studentRef: 'tc:c1:1-2-3' } }),
    );
    expect(r.ok).toBe(true);
  });
});
