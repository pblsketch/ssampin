import { describe, it, expect } from 'vitest';
import { decideTermEndPrompt } from '../termEndPrompt';

const BASE = {
  currentTerm: '2026-2',
  progressViewOpened: true,
} as const;

describe('decideTermEndPrompt — 물어야 하는 때', () => {
  it('진도 화면에 들어왔고 종료일을 모르면 묻는다', () => {
    expect(decideTermEndPrompt({ ...BASE })).toEqual({ kind: 'ask', term: '2026-2' });
  });

  it('등록된 학기가 다른 학기뿐이면 현재 학기를 묻는다', () => {
    expect(decideTermEndPrompt({ ...BASE, termEndDates: { '2026-1': '2026-07-18' } })).toEqual({
      kind: 'ask',
      term: '2026-2',
    });
  });
});

describe('decideTermEndPrompt — 묻지 않는 조건 4가지', () => {
  it('① 진도 관리 화면에 들어오지 않았다 — 앱 시작만으로는 묻지 않는다', () => {
    expect(decideTermEndPrompt({ ...BASE, progressViewOpened: false })).toEqual({ kind: 'none' });
  });

  it('② 그 학기 종료일이 이미 등록돼 있다', () => {
    expect(decideTermEndPrompt({ ...BASE, termEndDates: { '2026-2': '2026-12-31' } })).toEqual({
      kind: 'none',
    });
  });

  it('③ 사용자가 "나중에"로 넘긴 학기다', () => {
    expect(decideTermEndPrompt({ ...BASE, skippedTerm: '2026-2' })).toEqual({ kind: 'none' });
  });

  it('④ 학기 라벨 형식이 아니다 — 예외 대신 조용히 넘어간다', () => {
    expect(decideTermEndPrompt({ ...BASE, currentTerm: '' })).toEqual({ kind: 'none' });
    expect(decideTermEndPrompt({ ...BASE, currentTerm: '2026' })).toEqual({ kind: 'none' });
    expect(decideTermEndPrompt({ ...BASE, currentTerm: '2026-3' })).toEqual({ kind: 'none' });
    expect(decideTermEndPrompt({ ...BASE, currentTerm: '올해 2학기' })).toEqual({ kind: 'none' });
  });

  it('다른 학기를 넘겼다고 해서 이번 학기까지 조용해지지는 않는다', () => {
    expect(decideTermEndPrompt({ ...BASE, skippedTerm: '2026-1' })).toEqual({
      kind: 'ask',
      term: '2026-2',
    });
  });
});

describe('decideTermEndPrompt — 사용자가 직접 고치러 부른 경우', () => {
  it('이미 등록된 학기라도 연다 — 종업식이 바뀌면 고칠 길이 있어야 한다', () => {
    expect(
      decideTermEndPrompt({
        ...BASE,
        termEndDates: { '2026-2': '2026-12-31' },
        editRequested: true,
      }),
    ).toEqual({ kind: 'ask', term: '2026-2' });
  });

  it('"나중에"로 넘긴 학기도 연다', () => {
    expect(decideTermEndPrompt({ ...BASE, skippedTerm: '2026-2', editRequested: true })).toEqual({
      kind: 'ask',
      term: '2026-2',
    });
  });

  it('진도 화면이 아니면 불러도 열리지 않는다 — 종료일을 안 쓰는 곳에서 뜨면 고장이다', () => {
    expect(
      decideTermEndPrompt({ ...BASE, progressViewOpened: false, editRequested: true }),
    ).toEqual({ kind: 'none' });
  });

  it('학기 라벨 형식이 아니면 불러도 열리지 않는다', () => {
    expect(decideTermEndPrompt({ ...BASE, currentTerm: '2026-3', editRequested: true })).toEqual({
      kind: 'none',
    });
  });
});
