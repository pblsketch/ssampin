/**
 * 근거 지도의 저장 관문(ADR-106) — `linkEvidence` · `unlinkEvidence` · `setEvidenceLinkNote` · `reverseEvidenceLink`.
 *
 * 여기서 지키는 것:
 *  - 연결은 **앞 근거의 `links`** 에만 산다. 뒤 근거·주제 소유·본문은 그대로다.
 *  - 이을 수 없는 경우(자기 자신·없는 근거·남의 학생·중복·반대 방향)는 **저장 0회**로 사유를 돌려준다.
 *  - 끊으면 근거는 둘 다 남는다. 마지막 연결을 끊으면 `links` 칸 자체가 없어진다(옛 자료와 같은 모양).
 *  - 방향 바꾸기는 이음말을 데리고 간다.
 *  - 저장 실패는 실패로 던지고 메모리에 거짓 성공을 남기지 않는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';

const { evidenceRepo } = vi.hoisted(() => {
  const ev: {
    stored: { records: RecordEvidence[] } | null;
    saveCalls: number;
    failNextSave: boolean;
    getRecordEvidence(): Promise<{ records: RecordEvidence[] } | null>;
    saveRecordEvidence(data: { records: readonly RecordEvidence[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: 0,
    failNextSave: false,
    async getRecordEvidence() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordEvidence(data) {
      if (this.failNextSave) {
        this.failNextSave = false;
        throw new Error('disk full');
      }
      this.stored = { records: [...data.records] };
      this.saveCalls += 1;
    },
  };
  return { evidenceRepo: ev };
});

vi.mock('@adapters/di/container', () => ({
  recordEvidenceRepository: evidenceRepo,
  inquiryThreadRepository: {
    getInquiryThreads: async () => ({ records: [] }),
    saveInquiryThreads: async () => {},
  },
}));
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));

import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';

const evidence = (
  p: Partial<RecordEvidence> & Pick<RecordEvidence, 'id' | 'studentRef'>,
): RecordEvidence => ({
  areas: ['subject'],
  content: `근거 ${p.id}`,
  sourceType: 'manual',
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

const EVIDENCE = [
  evidence({ id: 'a', studentRef: 'sA', threadId: 'thr-1' }),
  evidence({ id: 'b', studentRef: 'sA' }),
  evidence({ id: 'c', studentRef: 'sA', links: [{ toId: 'a', note: '뒷받침' }] }),
  evidence({ id: 'z', studentRef: 'sB' }),
];

const disk = () => evidenceRepo.stored?.records ?? [];
const on = (id: string) => disk().find((r) => r.id === id);
const store = () => useRecordEvidenceStore.getState();

beforeEach(() => {
  evidenceRepo.stored = { records: [...EVIDENCE] };
  evidenceRepo.saveCalls = 0;
  evidenceRepo.failNextSave = false;
  useRecordEvidenceStore.setState({ records: [], loaded: false });
});

describe('linkEvidence', () => {
  it('앞 근거의 links 에만 쓰고, 뒤 근거·주제 소유·본문은 그대로다', async () => {
    const why = await store().linkEvidence('a', 'b', '  변화 ');
    expect(why).toBeNull();
    expect(on('a')?.links).toEqual([{ toId: 'b', note: '변화' }]);
    expect(on('a')?.threadId).toBe('thr-1');
    expect(on('b')?.links).toBeUndefined();
    expect(on('b')?.content).toBe('근거 b');
    expect(evidenceRepo.saveCalls).toBe(1);
  });

  it('빈 이음말은 칸을 만들지 않는다', async () => {
    await store().linkEvidence('a', 'b', '   ');
    expect(on('a')?.links).toEqual([{ toId: 'b' }]);
  });

  it.each([
    ['a', 'a', 'self'],
    ['a', 'ghost', 'missing'],
    ['a', 'z', 'other-student'],
    ['c', 'a', 'duplicate'],
    ['a', 'c', 'reverse-exists'],
  ] as const)('★%s → %s 는 %s 로 거절하고 저장 0회', async (from, to, why) => {
    expect(await store().linkEvidence(from, to)).toBe(why);
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('저장이 실패하면 던지고 메모리에 연결을 남기지 않는다', async () => {
    await store().load();
    evidenceRepo.failNextSave = true;
    await expect(store().linkEvidence('a', 'b')).rejects.toThrow('disk full');
    expect(store().records.find((r) => r.id === 'a')?.links).toBeUndefined();
  });
});

describe('unlinkEvidence', () => {
  it('연결만 지우고 근거는 둘 다 남는다. 마지막 연결이면 links 칸이 없어진다', async () => {
    await store().unlinkEvidence('c', 'a');
    expect(on('c')).toBeDefined();
    expect(on('a')).toBeDefined();
    expect('links' in (on('c') as object)).toBe(false);
    expect(evidenceRepo.saveCalls).toBe(1);
  });

  it('없는 연결이면 저장 0회', async () => {
    await store().unlinkEvidence('a', 'b');
    expect(evidenceRepo.saveCalls).toBe(0);
  });
});

describe('setEvidenceLinkNote', () => {
  it('이음말을 고치고, 빈 글이면 칸을 지운다', async () => {
    await store().setEvidenceLinkNote('c', 'a', '다른 모습');
    expect(on('c')?.links).toEqual([{ toId: 'a', note: '다른 모습' }]);
    await store().setEvidenceLinkNote('c', 'a', '');
    expect(on('c')?.links).toEqual([{ toId: 'a' }]);
    expect(evidenceRepo.saveCalls).toBe(2);
  });

  it('같은 글이면 저장 0회', async () => {
    await store().setEvidenceLinkNote('c', 'a', '뒷받침');
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('AI 가 만든 연결에 손대면 출처가 선생님으로 바뀐다', async () => {
    evidenceRepo.stored = {
      records: [
        evidence({
          id: 'a',
          studentRef: 'sA',
          links: [{ toId: 'b', source: 'ai', note: 'AI 이유' }],
        }),
        evidence({ id: 'b', studentRef: 'sA' }),
      ],
    };
    await store().setEvidenceLinkNote('a', 'b', 'AI 이유');
    expect(on('a')?.links).toEqual([{ toId: 'b', note: 'AI 이유' }]);
  });
});

describe('reverseEvidenceLink', () => {
  it('A→B 를 B→A 로 바꾸고 이음말은 따라간다', async () => {
    expect(await store().reverseEvidenceLink('c', 'a')).toBeNull();
    expect('links' in (on('c') as object)).toBe(false);
    expect(on('a')?.links).toEqual([{ toId: 'c', note: '뒷받침' }]);
    expect(evidenceRepo.saveCalls).toBe(1);
  });

  it('없는 연결은 missing, 저장 0회', async () => {
    expect(await store().reverseEvidenceLink('a', 'b')).toBe('missing');
    expect(evidenceRepo.saveCalls).toBe(0);
  });
});
