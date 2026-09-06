/**
 * 근거 정리 보드가 쓰는 저장 관문 — `moveToThread` · `moveToNewThread` · `unclassify` (ADR-085 §6-1).
 *
 * 화면 테스트 `recordEvidenceThreadIsolation.test.tsx` 의 의도를 스토어 단위로 옮겨 잠근다:
 *   - **남의 학생 근거는 절대 묶이지 않는다.** 앞 학생의 선택이 따라와도 여기서 걸린다(ADR-072 회고).
 *   - A 학생 주제에 B 학생 근거를 묶으려 하면 아무것도 저장하지 않는다.
 *   - 새 주제로 보내기는 "주제 생성 + 이동"이 한 동작이다 — 빈 주제만 남는 절반 성공이 없다.
 *   - AI 분류 제안은 저장하지 않는다. 제안(`ThreadSuggestion`)을 적용할 때 위 동작을 그대로 쓴다.
 *
 * 저장소 스키마는 그대로다(threadId 필드는 이미 있음) — 두 저장소 모두 인메모리 가짜.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { ThreadSuggestion } from '@domain/rules/threadSuggestionParser';

const { evidenceRepo, threadRepo } = vi.hoisted(() => {
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
  const th: {
    stored: { records: InquiryThread[] } | null;
    saveCalls: number;
    getInquiryThreads(): Promise<{ records: InquiryThread[] } | null>;
    saveInquiryThreads(data: { records: readonly InquiryThread[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: 0,
    async getInquiryThreads() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveInquiryThreads(data) {
      this.stored = { records: [...data.records] };
      this.saveCalls += 1;
    },
  };
  return { evidenceRepo: ev, threadRepo: th };
});

vi.mock('@adapters/di/container', () => ({
  recordEvidenceRepository: evidenceRepo,
  inquiryThreadRepository: threadRepo,
}));
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));

import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';

const thread = (
  p: Partial<InquiryThread> & Pick<InquiryThread, 'id' | 'studentRef'>,
): InquiryThread => ({
  title: `주제 ${p.id}`,
  keywords: [],
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

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

const THREADS = [
  thread({ id: 'thr-A', studentRef: 'sA' }),
  thread({ id: 'thr-B', studentRef: 'sB' }),
];
const EVIDENCE = [
  evidence({ id: 'e-A1', studentRef: 'sA', threadId: 'thr-A' }),
  evidence({ id: 'e-A2', studentRef: 'sA' }),
  evidence({ id: 'e-A3', studentRef: 'sA' }),
  evidence({ id: 'e-B1', studentRef: 'sB' }),
];

const disk = () => evidenceRepo.stored?.records ?? [];
const threadOf = (id: string) => disk().find((r) => r.id === id)?.threadId;
const store = () => useRecordEvidenceStore.getState();

beforeEach(() => {
  evidenceRepo.stored = { records: [...EVIDENCE] };
  evidenceRepo.saveCalls = 0;
  evidenceRepo.failNextSave = false;
  threadRepo.stored = { records: [...THREADS] };
  threadRepo.saveCalls = 0;
  useRecordEvidenceStore.setState({ records: [], loaded: false });
  useInquiryThreadStore.setState({ records: [], loaded: false });
});

describe('moveToThread — 기존 주제 열로 보내기', () => {
  it('이 학생 근거를 한 번의 저장으로 옮기고, 이미 그 주제인 것도 그대로 센다', async () => {
    const r = await store().moveToThread({
      studentRef: 'sA',
      evidenceIds: ['e-A2', 'e-A3', 'e-A1'],
      threadId: 'thr-A',
    });
    expect(r).toEqual({ movedIds: ['e-A2', 'e-A3', 'e-A1'], skippedIds: [] });
    expect(threadOf('e-A2')).toBe('thr-A');
    expect(threadOf('e-A3')).toBe('thr-A');
    expect(evidenceRepo.saveCalls).toBe(1);
  });

  it('★남의 학생 근거·없는 근거가 섞여 오면 그 건만 건너뛰고 결과에 알린다', async () => {
    const r = await store().moveToThread({
      studentRef: 'sA',
      evidenceIds: ['e-A2', 'e-B1', 'ghost'],
      threadId: 'thr-A',
    });
    expect(r).toEqual({ movedIds: ['e-A2'], skippedIds: ['e-B1', 'ghost'] });
    expect(threadOf('e-B1')).toBeUndefined();
  });

  it('★앞 학생의 선택이 다음 학생에게 따라와도(전부 남의 근거) 아무것도 저장하지 않는다', async () => {
    const r = await store().moveToThread({
      studentRef: 'sB',
      evidenceIds: ['e-A2', 'e-A3'],
      threadId: 'thr-B',
    });
    expect(r).toEqual({ movedIds: [], skippedIds: ['e-A2', 'e-A3'] });
    expect(evidenceRepo.saveCalls).toBe(0);
    expect(threadOf('e-A2')).toBeUndefined();
  });

  it('★다른 학생의 주제에는 거부하고 저장하지 않는다', async () => {
    await expect(
      store().moveToThread({ studentRef: 'sB', evidenceIds: ['e-B1'], threadId: 'thr-A' }),
    ).rejects.toThrow('다른 학생의 주제');
    expect(evidenceRepo.saveCalls).toBe(0);
    expect(threadOf('e-B1')).toBeUndefined();
  });

  it('없는 주제면 거부한다', async () => {
    await expect(
      store().moveToThread({ studentRef: 'sA', evidenceIds: ['e-A2'], threadId: 'thr-없음' }),
    ).rejects.toThrow('없는 주제');
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('같은 id 가 두 번 와도 한 번만 센다', async () => {
    const r = await store().moveToThread({
      studentRef: 'sA',
      evidenceIds: ['e-A2', 'e-A2'],
      threadId: 'thr-A',
    });
    expect(r.movedIds).toEqual(['e-A2']);
  });

  it('미로드 상태에서 불러도 디스크의 다른 근거를 덮어쓰지 않는다', async () => {
    await store().moveToThread({ studentRef: 'sA', evidenceIds: ['e-A2'], threadId: 'thr-A' });
    expect(disk().map((r) => r.id)).toEqual(['e-A1', 'e-A2', 'e-A3', 'e-B1']);
  });
});

describe('moveToNewThread — 새 주제를 만들며 보내기(한 동작)', () => {
  it('주제를 만들고 근거를 그 주제로 옮긴다. 반환에 새 주제 id 가 있다', async () => {
    const r = await store().moveToNewThread({
      studentRef: 'sA',
      evidenceIds: ['e-A2', 'e-A3'],
      title: ' 할인 문구와 선택 ',
      classId: 'c1',
      keywords: ['할인'],
    });
    expect(r.threadId).not.toBeNull();
    expect(r.movedIds).toEqual(['e-A2', 'e-A3']);
    const created = threadRepo.stored?.records.find((t) => t.id === r.threadId);
    expect(created?.studentRef).toBe('sA');
    expect(created?.title).toBe('할인 문구와 선택');
    expect(created?.keywords).toEqual(['할인']);
    expect(created?.classId).toBe('c1');
    expect(threadOf('e-A2')).toBe(r.threadId);
    expect(threadOf('e-A3')).toBe(r.threadId);
  });

  it('★옮길 근거가 하나도 없으면(전부 남의 학생) 빈 주제를 만들지 않는다', async () => {
    const r = await store().moveToNewThread({
      studentRef: 'sA',
      evidenceIds: ['e-B1'],
      title: '새 주제',
    });
    expect(r).toEqual({ movedIds: [], skippedIds: ['e-B1'], threadId: null });
    expect(threadRepo.saveCalls).toBe(0);
    expect(threadRepo.stored?.records).toHaveLength(2);
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('★이동 저장이 실패하면 방금 만든 주제를 되돌린다 — 빈 주제만 남는 절반 성공 금지', async () => {
    evidenceRepo.failNextSave = true;
    await expect(
      store().moveToNewThread({ studentRef: 'sA', evidenceIds: ['e-A2'], title: '새 주제' }),
    ).rejects.toThrow('disk full');
    expect(threadRepo.stored?.records.map((t) => t.id)).toEqual(['thr-A', 'thr-B']);
    expect(threadOf('e-A2')).toBeUndefined();
  });

  it('빈 제목이면 주제 스토어가 거부하고 근거는 그대로다', async () => {
    await expect(
      store().moveToNewThread({ studentRef: 'sA', evidenceIds: ['e-A2'], title: '   ' }),
    ).rejects.toThrow('주제 이름');
    expect(evidenceRepo.saveCalls).toBe(0);
    expect(threadRepo.saveCalls).toBe(0);
  });
});

describe('unclassify — 미분류로 되돌리기', () => {
  it('threadId 키를 지워 "부재"로 남긴다(빈 문자열이 아니다)', async () => {
    const r = await store().unclassify({ studentRef: 'sA', evidenceIds: ['e-A1'] });
    expect(r).toEqual({ movedIds: ['e-A1'], skippedIds: [] });
    const rec = disk().find((x) => x.id === 'e-A1');
    expect(rec !== undefined && 'threadId' in rec).toBe(false);
  });

  it('★남의 학생 근거는 건너뛴다', async () => {
    evidenceRepo.stored = {
      records: [...EVIDENCE, evidence({ id: 'e-B2', studentRef: 'sB', threadId: 'thr-B' })],
    };
    const r = await store().unclassify({ studentRef: 'sA', evidenceIds: ['e-A1', 'e-B2'] });
    expect(r).toEqual({ movedIds: ['e-A1'], skippedIds: ['e-B2'] });
    expect(threadOf('e-B2')).toBe('thr-B');
  });

  it('전부 남의 것이면 저장하지 않는다', async () => {
    const r = await store().unclassify({ studentRef: 'sB', evidenceIds: ['e-A1'] });
    expect(r.movedIds).toEqual([]);
    expect(evidenceRepo.saveCalls).toBe(0);
  });
});

describe('setExcludedFromAiMany — 여러 장의 AI 제외를 한 번에', () => {
  it('N건을 한 번의 저장으로 바꾼다 — 건마다 저장하지 않고, 고르지 않은 건은 그대로다', async () => {
    await store().setExcludedFromAiMany(['e-A2', 'e-A3'], true);
    expect(evidenceRepo.saveCalls).toBe(1);
    const on = (id: string) => disk().find((r) => r.id === id)?.excludedFromAi;
    expect(on('e-A2')).toBe(true);
    expect(on('e-A3')).toBe(true);
    expect(on('e-A1')).toBeUndefined();

    await store().setExcludedFromAiMany(['e-A2'], false);
    expect(evidenceRepo.saveCalls).toBe(2);
    expect(on('e-A2')).toBe(false);
    expect(on('e-A3')).toBe(true);
  });

  it('빈 목록이면 저장 0회', async () => {
    await store().setExcludedFromAiMany([], true);
    expect(evidenceRepo.saveCalls).toBe(0);
  });
});

describe('AI 분류 제안 적용 — 제안은 저장하지 않고, 적용은 위 동작을 그대로 쓴다', () => {
  it('파서 결과(`ThreadSuggestion`)를 그대로 넘겨 기존 주제/새 주제로 나눠 적용할 수 있다', async () => {
    const suggestions: readonly ThreadSuggestion[] = [
      { title: '주제 thr-A', threadId: 'thr-A', evidenceIds: ['e-A2'] },
      { title: '새로 제안된 주제', threadId: null, evidenceIds: ['e-A3', 'e-B1'] },
    ];
    // 적용 전: 제안이 있어도 디스크는 그대로다.
    expect(evidenceRepo.saveCalls).toBe(0);
    expect(threadRepo.saveCalls).toBe(0);

    const results = [];
    for (const s of suggestions) {
      results.push(
        s.threadId === null
          ? await store().moveToNewThread({
              studentRef: 'sA',
              evidenceIds: s.evidenceIds,
              title: s.title,
            })
          : await store().moveToThread({
              studentRef: 'sA',
              evidenceIds: s.evidenceIds,
              threadId: s.threadId,
            }),
      );
    }
    expect(results[0]?.movedIds).toEqual(['e-A2']);
    expect(results[1]?.movedIds).toEqual(['e-A3']);
    expect(results[1]?.skippedIds).toEqual(['e-B1']); // 제안에 섞인 남의 학생 근거는 여기서도 걸린다.
    expect(threadOf('e-A2')).toBe('thr-A');
    expect(threadOf('e-A3')).toBe(threadRepo.stored?.records[2]?.id);
    expect(threadOf('e-B1')).toBeUndefined();
  });
});
