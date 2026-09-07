/**
 * AI 초안 판 스토어 — 상한 20개(오래된 미반영 우선 삭제)·[버리기]=삭제·반영 표시(ADR-085 §5-2).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordAiDraft } from '@domain/entities/RecordAiDraft';

const { repoFake } = vi.hoisted(() => {
  const fake: {
    stored: { records: RecordAiDraft[] } | null;
    saveCalls: number;
    getRecordAiDrafts(): Promise<{ records: RecordAiDraft[] } | null>;
    saveRecordAiDrafts(data: { records: readonly RecordAiDraft[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: 0,
    async getRecordAiDrafts() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordAiDrafts(data) {
      this.stored = { records: [...data.records] };
      this.saveCalls += 1;
    },
  };
  return { repoFake: fake };
});

vi.mock('@adapters/di/container', () => ({
  recordAiDraftRepository: repoFake,
}));

import { useRecordAiDraftStore } from '@adapters/stores/useRecordAiDraftStore';
import { enforceAiDraftCap, RECORD_AI_DRAFT_MAX } from '@domain/entities/RecordAiDraft';

const KEY = { area: 'subject' as const, studentRef: 'sA', subject: '수학' };

function version(id: string, createdAt: number, appliedAt?: number): RecordAiDraft {
  return {
    id,
    draftKey: KEY,
    provider: 'claude',
    paragraphs: [{ role: null, text: `판 ${id}` }],
    excluded: '',
    createdAt,
    ...(appliedAt !== undefined ? { appliedAt } : {}),
  };
}

beforeEach(() => {
  repoFake.stored = null;
  repoFake.saveCalls = 0;
  useRecordAiDraftStore.setState({ records: [], loaded: false });
});

describe('add — 판을 남기고 파일에 쓴다', () => {
  it('실명 복원·표식 분리가 끝난 문단을 그대로 저장한다', async () => {
    const id = await useRecordAiDraftStore.getState().add({
      draftKey: KEY,
      provider: 'codex',
      model: 'gpt-x',
      paragraphs: [{ role: 'motive', text: '왜 그런지 물었다.' }],
      excluded: '제외됨 1건 (내용이 비어 있음)',
    });
    const saved = repoFake.stored?.records ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(id);
    expect(saved[0]?.model).toBe('gpt-x');
    expect(saved[0]?.appliedAt).toBeUndefined();
    expect(useRecordAiDraftStore.getState().getForKey(KEY)).toHaveLength(1);
  });

  it('★상한을 넘으면 가장 오래된 미반영 판부터 지운다 — 반영한 판은 남는다', async () => {
    const olds: RecordAiDraft[] = [];
    for (let i = 0; i < RECORD_AI_DRAFT_MAX; i += 1) {
      // 짝수는 반영됨, 홀수는 미반영. 가장 오래된 미반영은 id 'v1'.
      olds.push(version(`v${i}`, 1000 + i, i % 2 === 0 ? 5000 : undefined));
    }
    repoFake.stored = { records: olds };

    await useRecordAiDraftStore.getState().add({
      draftKey: KEY,
      provider: 'claude',
      paragraphs: [{ role: null, text: '새 판' }],
      excluded: '',
    });
    const ids = (repoFake.stored?.records ?? []).map((r) => r.id);
    expect(ids).toHaveLength(RECORD_AI_DRAFT_MAX);
    expect(ids).not.toContain('v1'); // 가장 오래된 미반영
    expect(ids).toContain('v0'); // 더 오래됐지만 반영된 판은 남는다
    expect(ids).toContain('v3');
  });

  it('다른 칸의 판은 상한 계산에 섞이지 않는다', () => {
    const other = { ...version('o1', 1), draftKey: { ...KEY, studentRef: 'sB' } };
    const mine = Array.from({ length: 3 }, (_, i) => version(`m${i}`, 10 + i));
    const out = enforceAiDraftCap([other, ...mine], KEY, 2);
    expect(out.map((r) => r.id)).toEqual(['o1', 'm1', 'm2']);
  });
});

describe('markApplied / remove', () => {
  it('반영하면 시각이 찍히고, 버리면 판이 사라진다', async () => {
    repoFake.stored = { records: [version('a', 1), version('b', 2)] };
    const s = useRecordAiDraftStore.getState();
    await s.markApplied('a');
    expect(repoFake.stored?.records.find((r) => r.id === 'a')?.appliedAt).toBeTypeOf('number');

    await useRecordAiDraftStore.getState().remove('b');
    expect(repoFake.stored?.records.map((r) => r.id)).toEqual(['a']);
    expect(useRecordAiDraftStore.getState().records.map((r) => r.id)).toEqual(['a']);
  });

  it('미로드 상태에서 저장해도 파일의 기존 판을 잃지 않는다', async () => {
    repoFake.stored = { records: [version('old', 1)] };
    await useRecordAiDraftStore.getState().add({
      draftKey: KEY,
      provider: 'claude',
      paragraphs: [{ role: null, text: '새 판' }],
      excluded: '',
    });
    expect(repoFake.stored?.records).toHaveLength(2);
  });
});

describe('★분량 조절 내역이 저장을 넘어 살아남는다 (ADR-086)', () => {
  /**
   * `add` 는 필드를 **하나씩 열거해** 새 객체를 만든다(스프레드가 아니다).
   * 그래서 입력 타입에만 필드를 넣으면 값이 **조용히 사라진다** — 게이트는 전부 초록이고,
   * 화면은 [원문과 비교]가 빈 채로 뜬다. 그때 원문 스냅숏은 이미 없다.
   */
  it('adjust 가 파일까지 그대로 간다 — 원문 스냅숏 포함', async () => {
    await useRecordAiDraftStore.getState().add({
      draftKey: KEY,
      provider: 'claude',
      paragraphs: [{ role: null, text: '줄인 글.' }],
      excluded: '',
      adjust: {
        kind: 'shrink',
        targetBytes: 1500,
        sourceVersionId: 'v2',
        sourceText: '줄이기 전 원문.',
        resultBytes: 1463,
        attempts: 2,
        pickedAttempt: 1,
      },
    });

    const saved = repoFake.stored?.records[0];
    expect(saved?.adjust?.kind).toBe('shrink');
    expect(saved?.adjust?.sourceText).toBe('줄이기 전 원문.');
    expect(saved?.adjust?.resultBytes).toBe(1463);
    // ★왕복 횟수와 "고른 쪽"은 다른 값이다. 뭉개면 두 번 돈 사실이 기록에서 사라진다.
    expect(saved?.adjust?.attempts).toBe(2);
    expect(saved?.adjust?.pickedAttempt).toBe(1);
  });

  it('새로 쓴 판에는 adjust 가 붙지 않는다 (부재 = 조절이 아님)', async () => {
    await useRecordAiDraftStore.getState().add({
      draftKey: KEY,
      provider: 'claude',
      paragraphs: [{ role: null, text: '새로 쓴 글.' }],
      excluded: '',
    });
    expect(repoFake.stored?.records[0]?.adjust).toBeUndefined();
  });

  it('★상한에 밀려 원문 판이 지워져도 스냅숏으로 비교할 수 있다', async () => {
    const id = await useRecordAiDraftStore.getState().add({
      draftKey: KEY,
      provider: 'claude',
      paragraphs: [{ role: null, text: '줄인 글.' }],
      excluded: '',
      adjust: {
        kind: 'shrink',
        targetBytes: 1500,
        sourceVersionId: 'v-지워질-판',
        sourceText: '원문 스냅숏.',
        resultBytes: 1463,
        attempts: 1,
        pickedAttempt: 1,
      },
    });
    // 원문 판은 이미 없다(상한에 밀려 지워졌다고 본다).
    const mine = useRecordAiDraftStore.getState().getForKey(KEY);
    const adjusted = mine.find((r) => r.id === id);
    expect(mine.some((r) => r.id === 'v-지워질-판')).toBe(false);
    // 그래도 비교할 원문이 판 안에 있다.
    expect(adjusted?.adjust?.sourceText).toBe('원문 스냅숏.');
  });
});
