/**
 * 서사 장면 쓰기 규율(ADR-103) — **근거 먼저, 장면 나중**.
 *
 * 여기서 지키는 것들은 전부 "두 파일에 걸쳐 있어 관문 하나로는 못 막는" 것들이다:
 *  - 다른 줄기로 끌면 소유가 먼저 바뀌고, 옛 주제의 장면에서 **뗀다**
 *  - 소유를 못 얻으면 장면에 **아무것도 안 들어간다**(그리고 카드는 있던 자리 그대로)
 *  - 지우기·미분류로 되돌리기 뒤에 그 근거가 옛 장면 자리에 **되살아나지 않는다**
 *  - 원본을 다시 열어 다른 주제로 저장해도 마찬가지다(일곱째 경로)
 *  - 평가 장면은 0개·2개가 되지 않는다
 *  - 근거 파일을 못 읽으면 **자르지 않는다**(읽기 실패를 "없음"으로 치지 않는다)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { InquiryThread, NarrativeScene } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';

const { threadRepo, evidenceRepo } = vi.hoisted(() => {
  const threads: {
    stored: { records: InquiryThread[] } | null;
    failRead: boolean;
    getInquiryThreads(): Promise<{ records: InquiryThread[] } | null>;
    saveInquiryThreads(d: { records: readonly InquiryThread[] }): Promise<void>;
  } = {
    stored: null,
    failRead: false,
    async getInquiryThreads() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveInquiryThreads(d) {
      this.stored = { records: [...d.records] };
    },
  };
  const evidence: {
    stored: { records: RecordEvidence[] } | null;
    failRead: boolean;
    getRecordEvidence(): Promise<{ records: RecordEvidence[] } | null>;
    saveRecordEvidence(d: { records: readonly RecordEvidence[] }): Promise<void>;
  } = {
    stored: null,
    failRead: false,
    async getRecordEvidence() {
      if (this.failRead) throw new Error('디스크를 읽지 못했습니다');
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordEvidence(d) {
      this.stored = { records: [...d.records] };
    },
  };
  return { threadRepo: threads, evidenceRepo: evidence };
});

vi.mock('@adapters/di/container', () => ({
  inquiryThreadRepository: threadRepo,
  recordEvidenceRepository: evidenceRepo,
}));

import { useInquiryThreadStore } from '../useInquiryThreadStore';
import { useRecordEvidenceStore } from '../useRecordEvidenceStore';
import { applyNarrativeSuggestion, placeEvidenceInScene } from '../placeEvidenceInScenes';
import { VIRTUAL_EVALUATION_SCENE_ID } from '@domain/rules/narrativeScenes';
import { NARRATIVE_SCENE_MAX } from '@domain/entities/InquiryThread';

const STUDENT = 'tc:c1:1-2-3';

describe('같은 근거의 여러 장면 연결', () => {
  it('같은 장면 안에서 재정렬하면 다른 장면의 연결과 메모를 보존한다', async () => {
    const store = useInquiryThreadStore.getState();
    await store.attachEvidenceToScene('t1', 'sc-motive', ['e2']);
    await store.attachEvidenceToScene('t1', 'sc-process', ['e2']);
    await store.setSceneEvidenceFocus('t1', 'sc-motive', 'e2', '과정에서 쓰는 대목');
    await store.insertIntoScenes('t1', [{ sceneId: 'sc-motive', evidenceIds: ['e2'] }], 0);
    expect(savedScenes('t1').filter((s) => s.evidenceIds.includes('e2'))).toHaveLength(2);
    expect(
      threadRepo.stored?.records[0]?.scenes?.find((s) => s.id === 'sc-motive')?.evidenceFocus?.[0]
        ?.note,
    ).toBe('과정에서 쓰는 대목');
  });
  it('중간 장면 삭제와 추가도 달라진 앞 장면의 이음말을 검토 대상으로 표시한다', async () => {
    const store = useInquiryThreadStore.getState();
    await store.setSceneLeadIn('t1', 'sc-process', '물음이 비교로 이어짐');
    await store.removeScene('t1', 'sc-motive');
    expect(
      threadRepo.stored?.records[0]?.scenes?.find((s) => s.id === 'sc-process')?.leadInNeedsCheck,
    ).toBe(true);
    await store.setSceneLeadIn('t1', 'sc-process', '관찰이 비교로 이어짐');
    await store.addScene('t1', { role: 'motive' }, 1);
    expect(
      threadRepo.stored?.records[0]?.scenes?.find((s) => s.id === 'sc-process')?.leadInNeedsCheck,
    ).toBe(true);
  });
  it('더 잇기, 연결별 메모, 한 선 이동, 해제는 원본과 다른 선을 보존한다', async () => {
    const store = useInquiryThreadStore.getState();
    await store.attachEvidenceToScene('t1', 'sc-motive', ['e2']);
    await store.attachEvidenceToScene('t1', 'sc-process', ['e2']);
    await store.setSceneEvidenceFocus('t1', 'sc-motive', 'e2', '질문을 만든 부분');
    await store.changeEvidenceConnection('t1', 'sc-motive', 'sc-eval', 'e2');
    const scenes = threadRepo.stored?.records.find((t) => t.id === 't1')?.scenes ?? [];
    expect(scenes.find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual([]);
    expect(scenes.find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e2']);
    expect(scenes.find((s) => s.id === 'sc-eval')?.evidenceFocus).toEqual([
      { evidenceId: 'e2', note: '질문을 만든 부분' },
    ]);
    await store.detachEvidenceFromScene('t1', 'sc-eval', ['e2']);
    expect(savedScenes('t1').find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e2']);
    expect(evidenceRepo.stored?.records.find((e) => e.id === 'e2')?.threadId).toBe('t1');
  });
  it('이미 연결된 곳으로 선을 옮기거나 다른 주제의 근거를 더 잇지 않는다', async () => {
    const store = useInquiryThreadStore.getState();
    await store.attachEvidenceToScene('t1', 'sc-motive', ['e2']);
    await store.attachEvidenceToScene('t1', 'sc-process', ['e2']);
    await expect(
      store.changeEvidenceConnection('t1', 'sc-motive', 'sc-process', 'e2'),
    ).rejects.toThrow();
    expect(await store.attachEvidenceToScene('t2', 'sc-motive', ['e2'])).toEqual([]);
    expect(savedScenes('t1').filter((s) => s.evidenceIds.includes('e2'))).toHaveLength(2);
  });
  it('마친 주제는 기존 연결을 그대로 둔다', async () => {
    threadRepo.stored!.records[0] = { ...threadRepo.stored!.records[0]!, status: 'closed' };
    const store = useInquiryThreadStore.getState();
    await expect(store.attachEvidenceToScene('t1', 'sc-motive', ['e2'])).rejects.toThrow();
    await expect(store.detachEvidenceFromScene('t1', 'sc-motive', ['e2'])).rejects.toThrow();
  });
});

function thread(id: string, scenes: InquiryThread['scenes']): InquiryThread {
  return {
    id,
    studentRef: STUDENT,
    title: id,
    keywords: [],
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    ...(scenes === undefined ? {} : { scenes }),
  };
}

function evidence(id: string, threadId?: string): RecordEvidence {
  return {
    id,
    studentRef: STUDENT,
    areas: ['subject'],
    content: `${id} 근거`,
    sourceType: 'manual',
    createdAt: 1,
    updatedAt: 1,
    ...(threadId === undefined ? {} : { threadId }),
  };
}

const SCENES = [
  { id: 'sc-eval', role: 'evaluation' as const, evidenceIds: [] },
  { id: 'sc-motive', role: 'motive' as const, evidenceIds: [] },
  { id: 'sc-process', role: 'process' as const, evidenceIds: [] },
];

/** ★`load()` 는 이미 읽었으면 그냥 돌아간다(인자를 안 본다) — 테스트에서는 반드시 forceReload. */
async function reload(): Promise<void> {
  await useInquiryThreadStore.getState().forceReload();
  await useRecordEvidenceStore.getState().forceReload();
}

function savedScenes(threadId: string): readonly { id: string; evidenceIds: readonly string[] }[] {
  return (threadRepo.stored?.records.find((t) => t.id === threadId)?.scenes ?? []).map((s) => ({
    id: s.id,
    evidenceIds: s.evidenceIds,
  }));
}

beforeEach(async () => {
  threadRepo.stored = { records: [thread('t1', SCENES), thread('t2', SCENES)] };
  evidenceRepo.stored = { records: [evidence('e1'), evidence('e2', 't1')] };
  evidenceRepo.failRead = false;
  useInquiryThreadStore.setState({ records: [], loaded: false });
  useRecordEvidenceStore.setState({ records: [], loaded: false });
  await reload();
});

describe('놓기 — 소유 먼저, 장면 나중', () => {
  it('미분류 근거를 놓으면 소유와 자리가 함께 생긴다', async () => {
    const r = await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e1'],
    });
    expect(r.placedIds).toEqual(['e1']);
    expect(evidenceRepo.stored?.records.find((e) => e.id === 'e1')?.threadId).toBe('t1');
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual(['e1']);
  });

  it('★다른 줄기로 옮기면 옛 주제의 장면에서 뗀다 — 되살아나지 않게', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual(['e2']);

    await placeEvidenceInScene({
      threadId: 't2',
      studentRef: STUDENT,
      sceneId: 'sc-process',
      evidenceIds: ['e2'],
    });
    expect(evidenceRepo.stored?.records.find((e) => e.id === 'e2')?.threadId).toBe('t2');
    expect(savedScenes('t2').find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e2']);
    // 옛 주제에는 흔적이 남지 않는다.
    expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).toEqual([]);
  });

  it('남의 학생 근거는 소유를 못 얻어 장면에도 안 들어간다', async () => {
    evidenceRepo.stored = {
      records: [{ ...evidence('e9'), studentRef: 'tc:c1:9-9-9' }],
    };
    await reload();
    const r = await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e9'],
    });
    expect(r.placedIds).toEqual([]);
    expect(r.skippedIds).toEqual(['e9']);
    expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).toEqual([]);
  });

  it('같은 근거가 두 장면에 남지 않는다 — 옮기면 앞 자리에서 빠진다', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-process',
      evidenceIds: ['e2'],
    });
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual([]);
    expect(savedScenes('t1').find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e2']);
  });
});

describe('★소유를 바꾸는 경로는 모두 장면에서 뗀다 (7경로)', () => {
  beforeEach(async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
  });

  it('미분류로 되돌리면 장면에서 빠지고, 다시 묶어도 옛 자리로 돌아오지 않는다', async () => {
    await useRecordEvidenceStore
      .getState()
      .unclassify({ studentRef: STUDENT, evidenceIds: ['e2'] });
    expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).toEqual([]);

    await useRecordEvidenceStore.getState().setThread(['e2'], 't1');
    // 소유는 t1 로 돌아왔지만 자리는 "아직 안 놓음" 이다.
    expect(evidenceRepo.stored?.records.find((e) => e.id === 'e2')?.threadId).toBe('t1');
    expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).toEqual([]);
  });

  it('근거를 지우면 장면에서도 빠진다', async () => {
    await useRecordEvidenceStore.getState().remove('e2');
    expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).toEqual([]);
  });

  it('setThread 로 다른 주제에 묶어도 옛 장면에서 빠진다', async () => {
    await useRecordEvidenceStore.getState().setThread(['e2'], 't2');
    expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).toEqual([]);
  });
});

describe('장면 편집', () => {
  it('장면을 지우면 놓여 있던 근거는 "아직 안 놓음" 으로 돌아간다 (주제 소속은 그대로)', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    await useInquiryThreadStore.getState().removeScene('t1', 'sc-motive');
    expect(savedScenes('t1').map((s) => s.id)).toEqual(['sc-eval', 'sc-process']);
    expect(evidenceRepo.stored?.records.find((e) => e.id === 'e2')?.threadId).toBe('t1');
  });

  it('평가 장면은 지울 수 없고 둘이 될 수도 없다', async () => {
    await useInquiryThreadStore.getState().removeScene('t1', 'sc-eval');
    expect(savedScenes('t1').map((s) => s.id)).toContain('sc-eval');
    await useInquiryThreadStore.getState().addScene('t1', { role: 'evaluation' });
    const roles = (threadRepo.stored?.records.find((t) => t.id === 't1')?.scenes ?? []).filter(
      (s) => s.role === 'evaluation',
    );
    expect(roles).toHaveLength(1);
  });

  it('장면 메모는 200자로 자르고, 비우면 칸을 지운다', async () => {
    await useInquiryThreadStore.getState().setSceneNote('t1', 'sc-motive', 'ㄱ'.repeat(300));
    const s1 = threadRepo.stored?.records
      .find((t) => t.id === 't1')
      ?.scenes?.find((s) => s.id === 'sc-motive');
    expect(s1?.note?.length).toBe(200);
    expect(s1?.noteSource).toBe('teacher');

    await useInquiryThreadStore.getState().setSceneNote('t1', 'sc-motive', '   ');
    const s2 = threadRepo.stored?.records
      .find((t) => t.id === 't1')
      ?.scenes?.find((s) => s.id === 'sc-motive');
    expect(s2?.note).toBeUndefined();
    expect(s2?.noteSource).toBeUndefined();
  });

  it('AI 가 쓴 메모는 출처가 남는다', async () => {
    await useInquiryThreadStore.getState().setSceneNote('t1', 'sc-motive', 'AI 가 본 이유', 'ai');
    const s = threadRepo.stored?.records
      .find((t) => t.id === 't1')
      ?.scenes?.find((x) => x.id === 'sc-motive');
    expect(s?.noteSource).toBe('ai');
  });
});

describe('주제 잇기', () => {
  it('앞 주제를 이으면 이음말과 함께 저장된다', async () => {
    await useInquiryThreadStore
      .getState()
      .setLink('t2', { fromThreadId: 't1', note: '기초에서 확장' });
    const t2 = threadRepo.stored?.records.find((t) => t.id === 't2');
    expect(t2?.link).toEqual({ fromThreadId: 't1', note: '기초에서 확장' });
  });

  it('★고리는 만들 수 없다', async () => {
    await useInquiryThreadStore.getState().setLink('t2', { fromThreadId: 't1' });
    await expect(
      useInquiryThreadStore.getState().setLink('t1', { fromThreadId: 't2' }),
    ).rejects.toThrow();
  });

  it('자기 자신과는 이을 수 없다', async () => {
    await expect(
      useInquiryThreadStore.getState().setLink('t1', { fromThreadId: 't1' }),
    ).rejects.toThrow();
  });

  it('null 이면 연결을 끊는다', async () => {
    await useInquiryThreadStore.getState().setLink('t2', { fromThreadId: 't1' });
    await useInquiryThreadStore.getState().setLink('t2', null);
    expect(threadRepo.stored?.records.find((t) => t.id === 't2')?.link).toBeUndefined();
  });
});

describe('★근거 파일을 못 읽으면 자르지 않는다', () => {
  it('읽기 실패에도 주제 쓰기는 성공하고 장면은 그대로다', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    evidenceRepo.failRead = true;
    // 이름 바꾸기는 근거를 읽지 않는다 — 그래도 성공해야 한다.
    await useInquiryThreadStore.getState().update('t1', { title: '새 이름' });
    expect(threadRepo.stored?.records.find((t) => t.id === 't1')?.title).toBe('새 이름');
    // 장면을 건드리는 쓰기도 자르지 않는다.
    await useInquiryThreadStore.getState().setSceneNote('t1', 'sc-motive', '메모');
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual(['e2']);
  });
});

describe('AI 서사 초안 [적용] (ADR-103 §5-5)', () => {
  /** 저장 횟수를 센다 — 제안은 화면 상태일 뿐이고, 적용은 파일마다 한 번씩이어야 한다. */
  function countSaves(): { threads: number; evidence: number } {
    return { threads: threadSaves, evidence: evidenceSaves };
  }

  let threadSaves = 0;
  let evidenceSaves = 0;
  // ★원본을 한 번만 붙잡아 둔다. `beforeEach` 에서 매번 감싸면 감싼 것을 또 감싸 수가 곱절이 된다.
  const originalThreadSave = threadRepo.saveInquiryThreads.bind(threadRepo);
  const originalEvidenceSave = evidenceRepo.saveRecordEvidence.bind(evidenceRepo);
  beforeEach(() => {
    threadSaves = 0;
    evidenceSaves = 0;
    threadRepo.saveInquiryThreads = async (d) => {
      threadSaves += 1;
      await originalThreadSave(d);
    };
    evidenceRepo.saveRecordEvidence = async (d) => {
      evidenceSaves += 1;
      await originalEvidenceSave(d);
    };
  });
  afterEach(() => {
    threadRepo.saveInquiryThreads = originalThreadSave;
    evidenceRepo.saveRecordEvidence = originalEvidenceSave;
  });

  it('★뼈대·배치·메모·이음말이 주제 파일 한 번의 쓰기로 들어간다', async () => {
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [
        { role: 'evaluation', moduleId: 'teacherJudgement', note: '마무리', evidenceIds: [] },
        { role: 'motive', moduleId: 'legacyMotive', note: '여기서 시작', evidenceIds: ['e2'] },
      ],
      link: { fromThreadId: 't2', note: '기초에서 확장' },
    });
    expect(r.placedIds).toEqual(['e2']);
    expect(countSaves().threads).toBe(1);
    // e2 는 이미 t1 소유라 근거 파일은 손대지 않는다.
    expect(countSaves().evidence).toBe(0);
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1');
    expect(saved?.scenes?.map((sc) => sc.role)).toEqual(['evaluation', 'motive']);
    expect(saved?.scenes?.[1]?.evidenceIds).toEqual(['e2']);
    expect(saved?.link).toEqual({ fromThreadId: 't2', note: '기초에서 확장' });
  });

  it('★AI 가 쓴 이유는 장면 메모로 저장되고 출처가 남는다 (오너 결정)', async () => {
    await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', note: '쿠폰 물음에서 시작했습니다', evidenceIds: ['e2'] }],
    });
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1');
    const motive = saved?.scenes?.find((sc) => sc.role === 'motive');
    expect(motive?.note).toBe('쿠폰 물음에서 시작했습니다');
    expect(motive?.noteSource).toBe('ai');
  });

  it('AI가 제안한 평가 위치와 앞 장면 이음말을 보존하고 원래 메모로 되돌린다', async () => {
    const before = useInquiryThreadStore.getState().records.find((t) => t.id === 't1')!;
    const originalScenes = before.scenes ?? [];
    const originalLink = before.link ?? null;
    await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [
        { role: 'motive', evidenceIds: ['e2'], note: '질문' },
        { role: 'evaluation', evidenceIds: [], note: '종합', leadIn: '질문을 종합해 판단함' },
      ],
    });
    const saved = useInquiryThreadStore.getState().records.find((t) => t.id === 't1')!;
    expect(saved.scenes?.map((s) => s.role)).toEqual(['motive', 'evaluation']);
    expect(saved.scenes?.[1]?.leadIn).toBe('질문을 종합해 판단함');
    await useInquiryThreadStore.getState().restoreScenes('t1', originalScenes, originalLink);
    const restored = useInquiryThreadStore.getState().records.find((t) => t.id === 't1')!;
    expect(restored.scenes).toEqual(originalScenes);
    expect(restored.link ?? null).toEqual(originalLink);
  });

  it('미분류 근거가 섞이면 근거 파일 1회 + 주제 파일 1회다', async () => {
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', evidenceIds: ['e1', 'e2'] }],
    });
    expect([...r.placedIds].sort()).toEqual(['e1', 'e2']);
    expect(countSaves().evidence).toBe(1);
    expect(countSaves().threads).toBe(1);
  });

  it('★평가 자리가 없으면 저장 시점에 하나 세운다 — 파서가 놓쳐도 여기서 걸린다', async () => {
    await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', evidenceIds: ['e2'] }],
    });
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1');
    expect(saved?.scenes?.filter((sc) => sc.role === 'evaluation')).toHaveLength(1);
  });

  it('★소유를 못 얻은 근거는 장면에 안 들어간다 — 뼈대는 그대로 깔린다', async () => {
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', evidenceIds: ['없는근거'] }],
    });
    expect(r.placedIds).not.toContain('없는근거');
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1');
    expect(saved?.scenes?.every((sc) => sc.evidenceIds.length === 0)).toBe(true);
  });

  it('이음말을 안 주면 기존 연결을 손대지 않는다', async () => {
    await useInquiryThreadStore.getState().setLink('t1', { fromThreadId: 't2', note: '옛 이음말' });
    await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', evidenceIds: ['e2'] }],
    });
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1');
    expect(saved?.link?.note).toBe('옛 이음말');
  });
});

/**
 * 적대적 검토(2026-09-10)가 잡은 것들 — **게이트 4종이 전부 초록인 채 존재하던 결함**이다.
 *
 * 공통 뿌리 하나: `scenes.map(...)` 은 대상이 없어도 **새 배열**이라 `write` 의 "바뀐 것이 있나"
 * 판정을 늘 통과했다. 그래서 선생님이 쓴 글이 버려진 채 파일과 `updatedAt` 만 올라갔다.
 */
describe('★대상 장면이 없으면 아무것도 쓰지 않는다', () => {
  let saves = 0;
  const original = threadRepo.saveInquiryThreads.bind(threadRepo);
  beforeEach(() => {
    saves = 0;
    threadRepo.saveInquiryThreads = async (d) => {
      saves += 1;
      await original(d);
    };
  });
  afterEach(() => {
    threadRepo.saveInquiryThreads = original;
  });

  it('★가상 평가 자리에 메모를 쓰면 저장하지 않는다 — 버릴 글을 저장한 척하지 않는다', async () => {
    await expect(
      useInquiryThreadStore
        .getState()
        .setSceneNote('t1', VIRTUAL_EVALUATION_SCENE_ID, '이 학생은 꾸준했다'),
    ).rejects.toThrow();
    expect(saves).toBe(0);
  });

  it('없는 장면의 카테고리를 바꾸려 해도 저장하지 않는다', async () => {
    await useInquiryThreadStore.getState().setSceneCategory('t1', '없는장면', {
      moduleId: 'legacyMotive',
    });
    expect(saves).toBe(0);
  });

  it('★끝에서 더 밀면 저장하지 않는다 — 화면은 그대로인데 동기화만 나가던 것', async () => {
    await useInquiryThreadStore.getState().moveScene('t1', 'sc-eval', -1);
    expect(saves).toBe(0);
    await useInquiryThreadStore.getState().moveScene('t1', 'sc-process', 1);
    expect(saves).toBe(0);
    await useInquiryThreadStore.getState().moveScene('t1', '없는장면', 1);
    expect(saves).toBe(0);
  });

  it('실제로 옮길 때는 저장하고 차례가 바뀐다', async () => {
    await useInquiryThreadStore.getState().moveScene('t1', 'sc-motive', -1);
    expect(saves).toBe(1);
    expect(savedScenes('t1').map((x) => x.id)).toEqual(['sc-motive', 'sc-eval', 'sc-process']);
  });
});

/**
 * 연결점으로 차례 바꾸기(오너 결정 2026-09-13) — 지도에서 A 의 ‘다음’을 D 의 ‘시작’에 놓았을 때.
 * ★앞/뒤 단추와 **같은 길**을 지난다. 길이 둘이면 한쪽만 이음말 검토를 잃는다.
 */
describe('장면 연결점으로 차례 바꾸기', () => {
  let saves = 0;
  beforeEach(async () => {
    threadRepo.stored = {
      records: [
        thread('t1', [
          { id: 'A', role: 'evaluation', evidenceIds: [] },
          { id: 'B', role: 'motive', evidenceIds: [], leadIn: 'A에서 B로' },
          { id: 'C', role: 'process', evidenceIds: [], leadIn: 'B에서 C로' },
          { id: 'D', role: 'result', evidenceIds: [], leadIn: 'C에서 D로' },
        ]),
      ],
    };
    evidenceRepo.stored = { records: [] };
    useInquiryThreadStore.setState({ records: [], loaded: false });
    await useInquiryThreadStore.getState().forceReload();
    saves = 0;
    const real = threadRepo.saveInquiryThreads.bind(threadRepo);
    threadRepo.saveInquiryThreads = async (d) => {
      saves += 1;
      await real(d);
    };
  });

  it('A 다음에 D 를 놓으면 A → D → B → C 로 저장된다', async () => {
    const rechecked = await useInquiryThreadStore.getState().placeSceneAfter('t1', 'A', 'D');
    expect(savedScenes('t1').map((x) => x.id)).toEqual(['A', 'D', 'B', 'C']);
    // 앞 장면이 달라진 이음말 둘(D·B)만 확인 대상이다. C 의 앞은 B 그대로다.
    expect(rechecked).toBe(2);
  });

  it('앞 장면이 달라진 이음말은 지우지 않고 확인 표시만 붙인다', async () => {
    await useInquiryThreadStore.getState().placeSceneAfter('t1', 'A', 'D');
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1')?.scenes ?? [];
    const byId = new Map(saved.map((sc) => [sc.id, sc]));
    expect(byId.get('D')?.leadIn).toBe('C에서 D로');
    expect(byId.get('D')?.leadInNeedsCheck).toBe(true);
    expect(byId.get('C')?.leadInNeedsCheck).toBeUndefined();
  });

  it('이음말을 저장하면 확인 표시가 풀린다', async () => {
    await useInquiryThreadStore.getState().placeSceneAfter('t1', 'A', 'D');
    await useInquiryThreadStore.getState().setSceneLeadIn('t1', 'D', '판단을 결과로 확인함');
    const saved = threadRepo.stored?.records.find((t) => t.id === 't1')?.scenes ?? [];
    const d = saved.find((sc) => sc.id === 'D');
    expect(d?.leadIn).toBe('판단을 결과로 확인함');
    expect(d?.leadInNeedsCheck).toBeUndefined();
  });

  it('★같은 장면·없는 장면·이미 바로 다음이면 저장하지 않는다', async () => {
    expect(await useInquiryThreadStore.getState().placeSceneAfter('t1', 'A', 'A')).toBeNull();
    expect(await useInquiryThreadStore.getState().placeSceneAfter('t1', 'A', '없음')).toBeNull();
    expect(await useInquiryThreadStore.getState().placeSceneAfter('t1', 'A', 'B')).toBeNull();
    expect(saves).toBe(0);
  });

  it('앞/뒤 단추도 같은 검토 규칙을 지난다', async () => {
    const rechecked = await useInquiryThreadStore.getState().moveScene('t1', 'B', 1);
    expect(savedScenes('t1').map((x) => x.id)).toEqual(['A', 'C', 'B', 'D']);
    expect(rechecked).toBe(3);
  });
});

/**
 * 하나의 근거를 여러 장면에 잇기(오너 결정 2026-09-13) — 자료를 복제하지 않고 관점만 나눈다.
 */
describe('근거를 여러 장면에 잇기', () => {
  beforeEach(async () => {
    threadRepo.stored = { records: [thread('t1', SCENES)] };
    evidenceRepo.stored = { records: [evidence('e1', 't1'), evidence('e2', 't1')] };
    useInquiryThreadStore.setState({ records: [], loaded: false });
    useRecordEvidenceStore.setState({ records: [], loaded: false });
    await reload();
  });

  it('더 이으면 기존 연결이 끊기지 않는다', async () => {
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-motive', ['e1']);
    const added = await useInquiryThreadStore
      .getState()
      .attachEvidenceToScene('t1', 'sc-process', ['e1']);
    expect(added).toEqual(['e1']);
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual(['e1']);
    expect(savedScenes('t1').find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e1']);
  });

  it('★옮기기는 기존 연결을 끊는다 — 더하기와 다른 동작이다', async () => {
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-motive', ['e1']);
    await useInquiryThreadStore
      .getState()
      .insertIntoScenes('t1', [{ sceneId: 'sc-process', evidenceIds: ['e1'] }]);
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual([]);
    expect(savedScenes('t1').find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e1']);
  });

  it('이미 이어져 있으면 두 번 넣지 않는다', async () => {
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-motive', ['e1']);
    const again = await useInquiryThreadStore
      .getState()
      .attachEvidenceToScene('t1', 'sc-motive', ['e1']);
    expect(again).toEqual([]);
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual(['e1']);
  });

  it('이 주제 소유가 아닌 근거는 잇지 않는다', async () => {
    evidenceRepo.stored = { records: [evidence('e9')] };
    const added = await useInquiryThreadStore
      .getState()
      .attachEvidenceToScene('t1', 'sc-motive', ['e9']);
    expect(added).toEqual([]);
  });

  it('연결 하나만 끊으면 다른 장면의 연결과 근거는 그대로다', async () => {
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-motive', ['e1']);
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-process', ['e1']);
    await useInquiryThreadStore.getState().detachEvidenceFromScene('t1', 'sc-motive', ['e1']);
    expect(savedScenes('t1').find((s) => s.id === 'sc-motive')?.evidenceIds).toEqual([]);
    expect(savedScenes('t1').find((s) => s.id === 'sc-process')?.evidenceIds).toEqual(['e1']);
    // 근거 자체는 지워지지 않고 주제 소속도 그대로다.
    expect(evidenceRepo.stored?.records.find((e) => e.id === 'e1')?.threadId).toBe('t1');
  });

  it('「쓸 부분」은 장면마다 따로 저장되고, 연결을 끊으면 함께 사라진다', async () => {
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-motive', ['e1']);
    await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-process', ['e1']);
    await useInquiryThreadStore
      .getState()
      .setSceneEvidenceFocus('t1', 'sc-motive', 'e1', '기준을 세운 대목');
    await useInquiryThreadStore
      .getState()
      .setSceneEvidenceFocus('t1', 'sc-process', 'e1', '기준을 고친 대목');
    const scenesOfT1 = (): readonly NarrativeScene[] =>
      threadRepo.stored?.records.find((t) => t.id === 't1')?.scenes ?? [];
    expect(scenesOfT1().find((s) => s.id === 'sc-motive')?.evidenceFocus).toEqual([
      { evidenceId: 'e1', note: '기준을 세운 대목' },
    ]);
    await useInquiryThreadStore.getState().detachEvidenceFromScene('t1', 'sc-motive', ['e1']);
    expect(scenesOfT1().find((s) => s.id === 'sc-motive')?.evidenceFocus).toBeUndefined();
    expect(scenesOfT1().find((s) => s.id === 'sc-process')?.evidenceFocus).toEqual([
      { evidenceId: 'e1', note: '기준을 고친 대목' },
    ]);
  });

  it('★이어져 있지 않은 근거의 「쓸 부분」은 조용히 버리지 않고 알린다', async () => {
    await expect(
      useInquiryThreadStore.getState().setSceneEvidenceFocus('t1', 'sc-motive', 'e2', '없는 연결'),
    ).rejects.toThrow();
  });
});

describe('★넣을 자리를 확인한 뒤에 뗀다', () => {
  it('★없는 장면을 향해 놓으면 근거가 원래 자리에서 빠지지 않는다', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    expect(savedScenes('t1').find((x) => x.id === 'sc-motive')?.evidenceIds).toEqual(['e2']);

    // 가상 평가 자리(저장된 자리가 아니다)로 끌면 예전에는 카드가 사라졌다.
    const r = await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: VIRTUAL_EVALUATION_SCENE_ID,
      evidenceIds: ['e2'],
    });
    expect(savedScenes('t1').find((x) => x.id === 'sc-motive')?.evidenceIds).toEqual(['e2']);
    // ★"놓았습니다"라고 거짓말하지 않는다.
    expect(r.placedIds).toEqual([]);
    expect(r.skippedIds).toEqual(['e2']);
  });

  it('★근거 파일에 없는 id 는 놓았다고 세지 않는다', async () => {
    const r = await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['없는근거'],
    });
    expect(r.placedIds).toEqual([]);
    expect(r.skippedIds).toEqual(['없는근거']);
  });
});

describe('★장면을 더하면 평가 자리도 함께 선다', () => {
  it('평가 없는 주제에 장면을 더하면 평가 자리가 실제로 저장된다', async () => {
    threadRepo.stored = { records: [thread('t3', [])] };
    await reload();
    const id = await useInquiryThreadStore.getState().addScene('t3', { role: 'process' });
    const scenes = threadRepo.stored?.records.find((t) => t.id === 't3')?.scenes ?? [];
    expect(scenes.filter((sc) => sc.role === 'evaluation')).toHaveLength(1);
    expect(scenes[0]?.role).toBe('evaluation');
    // 넣었으니 id 를 돌려준다.
    expect(scenes.some((sc) => sc.id === id)).toBe(true);
  });

  it('★못 넣었으면 id 대신 null 을 돌려준다 — 저장된 적 없는 id 로 메모를 쓰지 않게', async () => {
    // 평가가 이미 있는 주제에 평가를 더하려 하면 넣지 않는다(ADR-094).
    expect(
      await useInquiryThreadStore.getState().addScene('t1', { role: 'evaluation' }),
    ).toBeNull();
    // 상한에 닿아도 넣지 않는다.
    const many = Array.from({ length: NARRATIVE_SCENE_MAX }, (_, i) => ({
      id: `x${i}`,
      role: i === 0 ? ('evaluation' as const) : ('process' as const),
      evidenceIds: [],
    }));
    threadRepo.stored = { records: [thread('t4', many)] };
    await reload();
    expect(await useInquiryThreadStore.getState().addScene('t4', { role: 'process' })).toBeNull();
  });

  it('★평가 자리를 함께 세울 때도 상한을 넘지 않는다', async () => {
    // 평가가 없는 상태에서 상한 직전(19개)이면, 하나 더하면 평가까지 21개가 되므로 넣지 않는다.
    const body = Array.from({ length: NARRATIVE_SCENE_MAX - 1 }, (_, i) => ({
      id: `y${i}`,
      role: 'process' as const,
      evidenceIds: [],
    }));
    threadRepo.stored = { records: [thread('t5', body)] };
    await reload();
    expect(await useInquiryThreadStore.getState().addScene('t5', { role: 'process' })).toBeNull();
    const scenes = threadRepo.stored?.records.find((t) => t.id === 't5')?.scenes ?? [];
    expect(scenes).toHaveLength(NARRATIVE_SCENE_MAX - 1);
  });
});

describe('★같은 주제로 보내면 그 주제 장면에서 떼지 않는다', () => {
  it('setThread 로 이미 그 주제인 근거를 다시 보내도 자리가 그대로다', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    await useRecordEvidenceStore.getState().setThread(['e2'], 't1');
    expect(savedScenes('t1').find((x) => x.id === 'sc-motive')?.evidenceIds).toEqual(['e2']);
  });
});

describe('★AI 적용은 소유를 하나도 못 얻으면 장면을 갈아엎지 않는다', () => {
  it('없는 근거만 놓으라고 하면 짜 둔 배열이 그대로 남는다', async () => {
    await placeEvidenceInScene({
      threadId: 't1',
      studentRef: STUDENT,
      sceneId: 'sc-motive',
      evidenceIds: ['e2'],
    });
    const before = savedScenes('t1');
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'result', evidenceIds: ['없는근거'] }],
    });
    expect(r.placedIds).toEqual([]);
    // ★"안 썼다"를 결과로 말한다 — 화면이 "적용했습니다"라고 거짓말하지 않도록.
    expect(r.applied).toBe(false);
    expect(savedScenes('t1')).toEqual(before);
  });

  it('근거를 하나라도 놓았으면 applied 가 참이다', async () => {
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', evidenceIds: ['e2'] }],
    });
    expect(r.applied).toBe(true);
  });

  it('★그 사이 주제가 지워졌으면 applied 가 거짓이다 — 저장도 예외도 없는 길이다', async () => {
    await useInquiryThreadStore.getState().remove('t1');
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'result', evidenceIds: [] }],
    });
    expect(r.applied).toBe(false);
    expect(r.placedIds).toEqual([]);
  });

  it('★근거 파일을 못 읽으면 근거를 놓았다고 세지 않는다', async () => {
    const before = structuredClone(threadRepo.stored);
    evidenceRepo.failRead = true;
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'motive', evidenceIds: ['e2'] }],
    });
    expect(r.applied).toBe(false);
    expect(threadRepo.stored).toEqual(before);
    expect(r.placedIds).toEqual([]);
    expect(r.skippedIds).toContain('e2');
  });

  it('이미 목표 주제의 근거여도 다른 학생 요청이면 저장하지 않는다', async () => {
    const before = structuredClone(threadRepo.stored);
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: 'other',
      frame: 'inquiry',
      scenes: [{ role: 'process', evidenceIds: ['e2'] }],
    });
    expect(r.applied).toBe(false);
    expect(threadRepo.stored).toEqual(before);
    const placement = await placeEvidenceInScene({
      threadId: 't1',
      studentRef: 'other',
      sceneId: 'sc-process',
      evidenceIds: ['e2'],
    });
    expect(placement.placedIds).toEqual([]);
    expect(threadRepo.stored).toEqual(before);
  });

  it('없는 장면에 메모를 저장하면 실패를 알려 준다', async () => {
    const before = structuredClone(threadRepo.stored);
    await expect(
      useInquiryThreadStore.getState().setSceneNote('t1', 'missing', '보존할 메모'),
    ).rejects.toThrow();
    expect(threadRepo.stored).toEqual(before);
  });

  it('근거를 아예 안 놓는 제안(뼈대만)도 적용된다', async () => {
    const r = await applyNarrativeSuggestion({
      threadId: 't1',
      studentRef: STUDENT,
      frame: 'inquiry',
      scenes: [{ role: 'result', evidenceIds: [] }],
    });
    expect(r.applied).toBe(true);
    expect(savedScenes('t1').length).toBeGreaterThan(0);
  });
});

describe('미분류로 돌릴 때 근거 자체 보존', () => {
  it.each(['manual', 'observation'] as const)(
    '%s 근거의 내용과 메모를 보존하며 모든 장면 배치를 해제한다',
    async (sourceType) => {
      const original = {
        ...evidence('preserve', 't1'),
        sourceType,
        sourceId: 'source-original',
        content: '교사가 다듬은 구체적인 비교 내용',
        note: '다음 시간 확인',
        excludedFromAi: true,
      };
      evidenceRepo.stored = { records: [original] };
      await reload();
      await useInquiryThreadStore.getState().attachEvidenceToScene('t1', 'sc-motive', ['preserve']);
      const result = await useRecordEvidenceStore
        .getState()
        .unclassify({ studentRef: STUDENT, evidenceIds: ['preserve'] });
      expect(result.movedIds).toEqual(['preserve']);
      const { threadId: _thread, updatedAt: _updated, ...preserved } = original;
      expect(evidenceRepo.stored?.records.find((e) => e.id === 'preserve')).toMatchObject(
        preserved,
      );
      expect(
        evidenceRepo.stored?.records.find((e) => e.id === 'preserve')?.threadId,
      ).toBeUndefined();
      expect(savedScenes('t1').flatMap((s) => s.evidenceIds)).not.toContain('preserve');
    },
  );
});
