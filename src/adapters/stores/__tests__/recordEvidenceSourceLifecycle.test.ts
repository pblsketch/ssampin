/**
 * 원본 → 근거 저장 안정성 (계획 §5.1~5.2, AC-04·06·07·08·09·19).
 *
 * 화면이 아니라 **디스크를 다시 읽어(readback)** 판정한다. 메모리만 보면
 * "저장됐다고 표시했는데 파일에는 없는" 유령을 못 잡는다.
 *
 * 잠그는 것:
 *   - 저장 실패가 성공으로 보이지 않는다 — 메모리 유령 0.
 *   - 같은 원본이 두 번 근거가 되지 않는다 — 동시 요청에도 1개.
 *   - 읽기 실패가 "0건"으로 둔갑해 남의 근거를 지우지 않는다.
 *   - 공개 이동 함수가 중첩 잠금으로 교착하지 않는다(제한 시간 안에 끝난다).
 *   - 새 주제 생성/이동/보상 삭제가 각각 구별되고, 남이 쓰기 시작한 주제는 보존한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';

const { evidenceRepo, threadRepo } = vi.hoisted(() => {
  interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
  }
  const makeDeferred = (): Deferred => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const ev = {
    stored: null as { records: RecordEvidence[] } | null,
    saveCalls: 0,
    readCalls: 0,
    failSave: null as string | null,
    failRead: null as string | null,
    /** 다음 저장을 이 게이트가 풀릴 때까지 붙든다 — 두 흐름을 실제로 겹치게 만든다. */
    gateSave: null as Deferred | null,
    makeDeferred,
    async getRecordEvidence(): Promise<{ records: RecordEvidence[] } | null> {
      this.readCalls += 1;
      if (this.failRead) throw new Error(this.failRead);
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordEvidence(data: { records: readonly RecordEvidence[] }): Promise<void> {
      if (this.gateSave) {
        const gate = this.gateSave;
        this.gateSave = null;
        await gate.promise;
      }
      if (this.failSave) {
        const msg = this.failSave;
        this.failSave = null;
        throw new Error(msg);
      }
      this.stored = { records: [...data.records] };
      this.saveCalls += 1;
    },
  };
  const th = {
    stored: null as { records: InquiryThread[] } | null,
    saveCalls: 0,
    failSave: null as string | null,
    async getInquiryThreads(): Promise<{ records: InquiryThread[] } | null> {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveInquiryThreads(data: { records: readonly InquiryThread[] }): Promise<void> {
      if (this.failSave) {
        const msg = this.failSave;
        this.failSave = null;
        throw new Error(msg);
      }
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
import { resetFileWriteLocksForTest } from '@usecases/shared/fileWriteLock';

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

const store = () => useRecordEvidenceStore.getState();
const disk = () => evidenceRepo.stored?.records ?? [];
const threadDisk = () => threadRepo.stored?.records ?? [];

/** 제한 시간 안에 끝나는지 — 중첩 잠금 교착은 "영원히 안 끝남"으로 나타난다. */
async function withinTimeout<T>(p: Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`교착 의심: ${ms}ms 안에 끝나지 않음`)), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

const SRC = { studentRef: 'tc:c1:1-2-3', sourceId: 'obs-1', sourceType: 'observation' as const };

beforeEach(() => {
  resetFileWriteLocksForTest();
  evidenceRepo.stored = { records: [] };
  evidenceRepo.saveCalls = 0;
  evidenceRepo.readCalls = 0;
  evidenceRepo.failSave = null;
  evidenceRepo.failRead = null;
  evidenceRepo.gateSave = null;
  threadRepo.stored = { records: [thread({ id: 'thr-1', studentRef: SRC.studentRef })] };
  threadRepo.saveCalls = 0;
  threadRepo.failSave = null;
  useRecordEvidenceStore.setState({ records: [], loaded: false, loadError: null });
  useInquiryThreadStore.setState({ records: [], loaded: false, loadError: null });
});

describe('AC-04 주제 선택 여부에 따른 저장 결과', () => {
  it('주제를 고르지 않으면 근거 1개가 미분류로 저장된다(주제 미선택이 저장을 막지 않는다)', async () => {
    const r = await store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '수업 중 근거를 들어 반박했다',
    });
    expect(r.reused).toBe(false);
    expect(r.threadLinked).toBe(false);
    expect(disk()).toHaveLength(1);
    expect('threadId' in disk()[0]!).toBe(false);
  });

  it('주제를 고르면 근거 1개가 그 주제로 연결되어 저장된다', async () => {
    const r = await store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '내용',
      threadId: 'thr-1',
    });
    expect(r.threadLinked).toBe(true);
    expect(disk()).toHaveLength(1);
    expect(disk()[0]?.threadId).toBe('thr-1');
  });
});

describe('AC-06·08 저장 실패가 성공으로 보이지 않는다', () => {
  it('★저장이 실패하면 메모리에 유령이 남지 않는다', async () => {
    evidenceRepo.failSave = 'disk full';
    await expect(
      store().ensureEvidenceFromSource({ ...SRC, areas: ['subject'], content: '내용' }),
    ).rejects.toThrow('disk full');
    expect(store().records).toHaveLength(0); // 화면에도 없고
    expect(disk()).toHaveLength(0); // 파일에도 없다
  });

  it('★읽기가 실패하면 저장까지 가지 않는다 — 읽기 실패가 "0건 저장"으로 둔갑하지 않는다', async () => {
    evidenceRepo.stored = {
      records: [
        {
          id: 'keep-me',
          studentRef: 'other',
          areas: ['subject'],
          content: '남의 근거',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    evidenceRepo.failRead = 'EIO read error';
    await expect(
      store().ensureEvidenceFromSource({ ...SRC, areas: ['subject'], content: '내용' }),
    ).rejects.toThrow('EIO read error');
    expect(evidenceRepo.saveCalls).toBe(0);
    expect(disk().map((r) => r.id)).toEqual(['keep-me']); // 남의 근거가 살아 있다
  });

  it('load 실패는 빈 목록과 구별되게 loadError 로 남는다', async () => {
    evidenceRepo.failRead = 'EIO';
    await store().load();
    expect(store().loaded).toBe(true);
    expect(store().records).toHaveLength(0);
    expect(store().loadError).toContain('EIO');
  });

  it('실패 뒤 재시도는 같은 원본으로 근거를 하나만 만든다(시도 ID 재확인)', async () => {
    evidenceRepo.failSave = 'disk full';
    await expect(
      store().ensureEvidenceFromSource({ ...SRC, areas: ['subject'], content: '내용' }),
    ).rejects.toThrow('disk full');
    const retry = await store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '내용',
    });
    expect(retry.reused).toBe(false);
    expect(disk()).toHaveLength(1);
  });
});

describe('AC-07 같은 원본은 한 번만 근거가 된다', () => {
  it('★동시에 두 번 요청해도 근거는 1개다(저장 순서를 실제로 겹치게 만든 뒤 확인)', async () => {
    // 첫 저장을 붙들어 둔 채 두 번째 요청을 넣는다 — 락이 없다면 둘 다 "없음"을 읽어 2개가 된다.
    const gate = evidenceRepo.makeDeferred();
    evidenceRepo.gateSave = gate;
    const first = store().ensureEvidenceFromSource({ ...SRC, areas: ['subject'], content: '내용' });
    const second = store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '내용',
    });
    gate.resolve();
    const [a, b] = await withinTimeout(Promise.all([first, second]));

    expect(disk()).toHaveLength(1);
    expect(a.evidenceId).toBe(b.evidenceId);
    expect(a.reused !== b.reused).toBe(true); // 하나는 만들고 하나는 재사용
  });

  it('다른 학생의 같은 sourceId 는 별개로 보존한다', async () => {
    await store().ensureEvidenceFromSource({ ...SRC, areas: ['subject'], content: 'A' });
    await store().ensureEvidenceFromSource({
      ...SRC,
      studentRef: 'tc:c1:1-2-9',
      areas: ['subject'],
      content: 'B',
    });
    expect(disk()).toHaveLength(2);
  });

  it('add 로 들어와도 같은 원본이면 새로 만들지 않고 기존 id 를 돌려준다', async () => {
    const id1 = await store().add({ ...SRC, areas: ['subject'], content: '내용' });
    const id2 = await store().add({ ...SRC, areas: ['subject'], content: '내용' });
    expect(id2).toBe(id1);
    expect(disk()).toHaveLength(1);
  });

  it('addMany 는 디스크 중복과 묶음 안 중복을 모두 거른다', async () => {
    await store().add({ ...SRC, areas: ['subject'], content: '이미 있음' });
    const n = await store().addMany([
      { ...SRC, areas: ['subject'], content: '중복' },
      { ...SRC, sourceId: 'obs-2', areas: ['subject'], content: '새것' },
      { ...SRC, sourceId: 'obs-2', areas: ['subject'], content: '묶음 안 중복' },
    ]);
    expect(n).toBe(1);
    expect(disk()).toHaveLength(2);
  });
});

describe('ensureEvidenceFromSource — 재사용 시 교사가 다듬은 내용을 보존한다', () => {
  it('★재사용은 본문·영역·AI 제외를 덮지 않는다. 바꾸는 것은 주제 연결뿐이다', async () => {
    const id = await store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '원본 그대로',
    });
    // 교사가 근거를 다듬고 AI 제외로 두었다.
    await store().update(id.evidenceId, {
      content: '교사가 다듬은 문장',
      areas: ['subject', 'career'],
    });
    await store().setExcludedFromAi(id.evidenceId, true);

    const again = await store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '원본이 나중에 바뀐 내용',
      threadId: 'thr-1',
    });

    expect(again.reused).toBe(true);
    expect(again.evidenceId).toBe(id.evidenceId);
    const saved = disk().find((r) => r.id === id.evidenceId);
    expect(saved?.content).toBe('교사가 다듬은 문장'); // 본문 보존
    expect(saved?.areas).toEqual(['subject', 'career']); // 영역 보존
    expect(saved?.excludedFromAi).toBe(true); // 제외 보존
    expect(saved?.threadId).toBe('thr-1'); // 주제만 바뀐다
  });

  it('같은 키인데 출처 종류가 다르면 임의로 잇지 않고 거부한다', async () => {
    await store().add({ ...SRC, areas: ['subject'], content: '내용' });
    await expect(
      store().ensureEvidenceFromSource({
        ...SRC,
        sourceType: 'studentRecord',
        areas: ['subject'],
        content: '내용',
      }),
    ).rejects.toThrow('출처 정보가 맞지 않습니다');
    expect(evidenceRepo.saveCalls).toBe(1); // 처음 add 한 1회뿐
  });

  it('같은 원본 근거가 이미 2개 이상이면 하나를 골라 쓰지 않고 거부한다', async () => {
    evidenceRepo.stored = {
      records: [
        { id: 'd1', ...SRC, areas: ['subject'], content: 'a', createdAt: 1, updatedAt: 1 },
        { id: 'd2', ...SRC, areas: ['subject'], content: 'b', createdAt: 1, updatedAt: 1 },
      ],
    };
    await expect(
      store().ensureEvidenceFromSource({ ...SRC, areas: ['subject'], content: 'c' }),
    ).rejects.toThrow('이미 여러 개');
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('★마친 주제에는 연결하지 않는다 — 다시 연 뒤에만 연결된다', async () => {
    threadRepo.stored = {
      records: [thread({ id: 'thr-1', studentRef: SRC.studentRef, status: 'closed' })],
    };
    await expect(
      store().ensureEvidenceFromSource({
        ...SRC,
        areas: ['subject'],
        content: '내용',
        threadId: 'thr-1',
      }),
    ).rejects.toThrow('마친 주제');
    expect(evidenceRepo.saveCalls).toBe(0);

    // 다시 열고 나면 연결된다.
    await useInquiryThreadStore.getState().update('thr-1', { status: 'open' });
    const ok = await store().ensureEvidenceFromSource({
      ...SRC,
      areas: ['subject'],
      content: '내용',
      threadId: 'thr-1',
    });
    expect(ok.threadLinked).toBe(true);
  });

  it('★다른 학생의 주제에는 연결하지 않는다', async () => {
    await expect(
      store().ensureEvidenceFromSource({
        ...SRC,
        studentRef: 'tc:c1:9-9-9',
        areas: ['subject'],
        content: '내용',
        threadId: 'thr-1',
      }),
    ).rejects.toThrow('다른 학생의 주제');
    expect(evidenceRepo.saveCalls).toBe(0);
  });
});

describe('AC-08 이동 함수가 중첩 잠금으로 교착하지 않는다', () => {
  it('moveToThread · unclassify · moveToNewThread 가 제한 시간 안에 끝난다', async () => {
    const a = await store().add({ ...SRC, areas: ['subject'], content: '1' });
    const b = await store().add({ ...SRC, sourceId: 'obs-2', areas: ['subject'], content: '2' });

    await withinTimeout(
      store().moveToThread({ studentRef: SRC.studentRef, evidenceIds: [a], threadId: 'thr-1' }),
    );
    await withinTimeout(store().unclassify({ studentRef: SRC.studentRef, evidenceIds: [a] }));
    const created = await withinTimeout(
      store().moveToNewThread({
        studentRef: SRC.studentRef,
        evidenceIds: [a, b],
        title: '새 주제',
      }),
    );
    expect(created.threadId).not.toBeNull();
    expect(created.movedIds).toEqual([a, b]);
  });

  it('연달아 부른 쓰기가 서로를 삼키지 않는다(마지막 쓰기 승리 금지)', async () => {
    const results = await withinTimeout(
      Promise.all([
        store().add({ ...SRC, sourceId: 's1', areas: ['subject'], content: '1' }),
        store().add({ ...SRC, sourceId: 's2', areas: ['subject'], content: '2' }),
        store().add({ ...SRC, sourceId: 's3', areas: ['subject'], content: '3' }),
      ]),
    );
    expect(new Set(results).size).toBe(3);
    expect(disk()).toHaveLength(3); // 락이 없으면 1개만 남는다
  });
});

describe('AC-09 새 주제 — 생성·이동·보상을 구별한다', () => {
  it('주제 생성이 실패하면 "주제 생성 실패"이고 근거는 그대로다', async () => {
    const a = await store().add({ ...SRC, areas: ['subject'], content: '1' });
    threadRepo.failSave = '주제 파일 쓰기 실패';
    const before = evidenceRepo.saveCalls;
    await expect(
      store().moveToNewThread({ studentRef: SRC.studentRef, evidenceIds: [a], title: '새 주제' }),
    ).rejects.toMatchObject({ stage: 'thread-create' });
    expect(evidenceRepo.saveCalls).toBe(before); // 근거는 건드리지 않았다
    expect(disk().find((r) => r.id === a)?.threadId).toBeUndefined();
  });

  it('이동이 실패하면 방금 만든 빈 주제를 되돌린다(절반 성공 금지)', async () => {
    const a = await store().add({ ...SRC, areas: ['subject'], content: '1' });
    const threadsBefore = threadDisk().map((t) => t.id);
    evidenceRepo.failSave = 'disk full';
    await expect(
      store().moveToNewThread({ studentRef: SRC.studentRef, evidenceIds: [a], title: '새 주제' }),
    ).rejects.toMatchObject({ stage: 'evidence-link', compensation: 'removed' });
    expect(threadDisk().map((t) => t.id)).toEqual(threadsBefore);
    expect(disk().find((r) => r.id === a)?.threadId).toBeUndefined();
  });

  it('★보상 대상 주제를 그 사이 다른 근거가 쓰기 시작했으면 보존한다', async () => {
    const a = await store().add({ ...SRC, areas: ['subject'], content: '1' });
    const b = await store().add({ ...SRC, sourceId: 'obs-2', areas: ['subject'], content: '2' });

    // moveToNewThread 의 이동 저장이 실패하도록 두되, 그 실패 저장 직전에 다른 근거가
    // 같은 주제를 쓰게 만든다. 보상은 "아직 아무도 안 쓸 때만" 지워야 한다.
    const origAdd = useInquiryThreadStore.getState().add;
    let createdThreadId = '';
    useInquiryThreadStore.setState({
      add: async (input) => {
        createdThreadId = await origAdd(input);
        // 다른 경로가 이 주제를 이미 쓰기 시작한 상태를 만든다.
        evidenceRepo.stored = {
          records: (evidenceRepo.stored?.records ?? []).map((r) =>
            r.id === b ? { ...r, threadId: createdThreadId } : r,
          ),
        };
        return createdThreadId;
      },
    });

    evidenceRepo.failSave = 'disk full';
    await expect(
      store().moveToNewThread({ studentRef: SRC.studentRef, evidenceIds: [a], title: '새 주제' }),
    ).rejects.toMatchObject({ stage: 'evidence-link', compensation: 'kept' });

    useInquiryThreadStore.setState({ add: origAdd });
    expect(threadDisk().some((t) => t.id === createdThreadId)).toBe(true); // 보존됐다
  });

  it('빈 제목이면 주제도 근거도 저장하지 않는다', async () => {
    const a = await store().add({ ...SRC, areas: ['subject'], content: '1' });
    const evBefore = evidenceRepo.saveCalls;
    const thBefore = threadRepo.saveCalls;
    await expect(
      store().moveToNewThread({ studentRef: SRC.studentRef, evidenceIds: [a], title: '   ' }),
    ).rejects.toThrow('주제 이름');
    expect(evidenceRepo.saveCalls).toBe(evBefore);
    expect(threadRepo.saveCalls).toBe(thBefore);
  });
});

describe('AC-19 동기화 reload 와 사용자 저장이 겹쳐도 파일과 메모리가 일치한다', () => {
  it('★사용자 저장 중 들어온 동기화 reload 가 낡은 스냅샷을 뒤늦게 게시하지 않는다', async () => {
    await store().add({ ...SRC, areas: ['subject'], content: '먼저 있던 근거' });

    // 저장을 붙들어 두고, 그 사이 동기화가 파일을 갈아 끼운 뒤 reload 를 건다.
    const gate = evidenceRepo.makeDeferred();
    evidenceRepo.gateSave = gate;
    const saving = store().add({
      ...SRC,
      sourceId: 'obs-2',
      areas: ['subject'],
      content: '나중 근거',
    });
    const reloading = store().forceReload();

    gate.resolve();
    await withinTimeout(Promise.all([saving, reloading]));

    // 파일과 메모리가 같아야 한다 — reload 가 저장 전 스냅샷을 덮어쓰면 여기서 어긋난다.
    expect(
      store()
        .records.map((r) => r.sourceId)
        .sort(),
    ).toEqual(
      disk()
        .map((r) => r.sourceId)
        .sort(),
    );
    expect(disk()).toHaveLength(2);
  });

  it('reload 가 내려받은 내용을 반영한다(loaded 를 내리지 않고도)', async () => {
    await store().load();
    expect(store().records).toHaveLength(0);
    // 동기화가 파일을 갈아 끼웠다.
    evidenceRepo.stored = {
      records: [
        {
          id: 'from-cloud',
          ...SRC,
          areas: ['subject'],
          content: '다른 기기',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    await store().forceReload();
    expect(store().records.map((r) => r.id)).toEqual(['from-cloud']);
  });
});

describe('AC-14 원본 내용으로 바꾸기 — 적용 직전 재검증', () => {
  const capture = (over = {}) => ({
    sourceId: 'obs-1',
    evidenceId: 'ev-1',
    studentRef: SRC.studentRef,
    source: { content: '원본', date: '2026-09-01', slots: [] as readonly string[] },
    evidence: { content: '근거', date: '2026-09-01', slots: [] as readonly string[] },
    ...over,
  });
  const seed = (over: Record<string, unknown> = {}) => {
    evidenceRepo.stored = {
      records: [
        {
          id: 'ev-1',
          studentRef: SRC.studentRef,
          areas: ['subject'],
          content: '근거',
          date: '2026-09-01',
          sourceType: 'observation',
          sourceId: 'obs-1',
          threadId: 'thr-1',
          createdAt: 1,
          updatedAt: 1,
          ...over,
        },
      ],
    };
    evidenceRepo.saveCalls = 0;
  };
  const liveSource = (content = '원본') =>
    Promise.resolve({ content, date: '2026-09-01', studentRef: SRC.studentRef });

  it('둘 다 그대로면 세 필드를 원본 값으로 맞춘다', async () => {
    seed();
    const r = await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      capture: capture(),
      fields: { content: '원본', date: '2026-09-02', slots: ['수업'] },
      readLatestSource: () => liveSource(),
    });
    expect(r).toEqual({ ok: true });
    const saved = disk()[0]!;
    expect(saved.content).toBe('원본');
    expect(saved.date).toBe('2026-09-02');
    expect(saved.slots).toEqual(['수업']);
  });

  it('★주제·영역·AI 제외는 그동안 바뀌었어도 최신값을 보존한다', async () => {
    seed({ threadId: 'thr-바뀜', areas: ['subject', 'career'], excludedFromAi: true });
    await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      capture: capture(),
      fields: { content: '원본', date: null, slots: null },
      readLatestSource: () => liveSource(),
    });
    const saved = disk()[0]!;
    expect(saved.threadId).toBe('thr-바뀜');
    expect(saved.areas).toEqual(['subject', 'career']);
    expect(saved.excludedFromAi).toBe(true);
  });

  it('★date·slots 에 null 을 주면 키를 지운다(빈 값을 저장하지 않는다)', async () => {
    seed({ slots: ['옛장면'] });
    await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      // 캡처는 지금 근거 상태와 같아야 한다 - 다르면 재검증이 먼저 걸린다(그건 위 케이스가 잠근다).
      capture: capture({
        evidence: { content: '근거', date: '2026-09-01', slots: ['옛장면'] as readonly string[] },
      }),
      fields: { content: '원본', date: null, slots: null },
      readLatestSource: () => liveSource(),
    });
    const saved = disk()[0]!;
    expect('date' in saved).toBe(false);
    expect('slots' in saved).toBe(false);
  });

  it('★대화상자를 열어 둔 사이 원본이 바뀌었으면 쓰기 0회', async () => {
    seed();
    const r = await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      capture: capture(),
      fields: { content: '원본', date: null, slots: null },
      readLatestSource: () => liveSource('원본이 그사이 바뀜'),
    });
    expect(r).toEqual({ ok: false, reason: 'changed' });
    expect(evidenceRepo.saveCalls).toBe(0);
    expect(disk()[0]?.content).toBe('근거'); // 그대로다
  });

  it('★근거가 그사이 바뀌었어도 쓰기 0회', async () => {
    seed({ content: '교사가 다듬음' });
    const r = await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      capture: capture(),
      fields: { content: '원본', date: null, slots: null },
      readLatestSource: () => liveSource(),
    });
    expect(r).toEqual({ ok: false, reason: 'changed' });
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('★원본이 사라졌으면 쓰지 않는다', async () => {
    seed();
    const r = await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      capture: capture(),
      fields: { content: '원본', date: null, slots: null },
      readLatestSource: () => Promise.resolve(null),
    });
    expect(r).toEqual({ ok: false, reason: 'missing' });
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('★원본 읽기가 실패하면 던지고 쓰지 않는다 — "삭제됨"으로 둔갑시키지 않는다', async () => {
    seed();
    await expect(
      store().applySourceFields({
        evidenceId: 'ev-1',
        studentRef: SRC.studentRef,
        capture: capture(),
        fields: { content: '원본', date: null, slots: null },
        readLatestSource: () => Promise.reject(new Error('EIO')),
      }),
    ).rejects.toThrow('EIO');
    expect(evidenceRepo.saveCalls).toBe(0);
  });

  it('반영한 본문에 금지 표현이 있으면 AI 제외를 붙인다', async () => {
    seed();
    await store().applySourceFields({
      evidenceId: 'ev-1',
      studentRef: SRC.studentRef,
      capture: capture({
        source: { content: '○○학원에서 배웠다', date: '2026-09-01', slots: [] },
      }),
      fields: { content: '○○학원에서 배웠다', date: null, slots: null },
      readLatestSource: () =>
        Promise.resolve({
          content: '○○학원에서 배웠다',
          date: '2026-09-01',
          studentRef: SRC.studentRef,
        }),
    });
    expect(disk()[0]?.excludedFromAi).toBe(true);
  });
});
