/**
 * useRecordDraftsStore — 생기부 초안 스토어 단위 테스트.
 *
 * 핵심 회귀 방어(법정기록 유실 방지):
 *   - 스토어가 통째로 저장하는 구조라, 미로드 상태에서 upsert 시 기존 record-drafts.json 을
 *     덮어쓰면 안 된다(load 가드). getRecordDrafts 로 먼저 디스크를 읽어 합쳐야 한다.
 *   - upsert 는 (area+studentRef+subject) 키로 동작(같은 키=갱신 / 다른 과목=별도).
 *
 * container 의 recordDraftsRepository 를 인메모리 가짜로 모킹한다(useStudentStore.test 패턴).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordDraft } from '@domain/entities/RecordDraft';

const { recordDraftsRepoFake } = vi.hoisted(() => {
  const fake: {
    stored: { records: RecordDraft[] } | null;
    saveCalls: RecordDraft[][];
    getRecordDrafts(): Promise<{ records: RecordDraft[] } | null>;
    saveRecordDrafts(data: { records: readonly RecordDraft[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: [],
    async getRecordDrafts() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordDrafts(data) {
      this.stored = { records: [...data.records] };
      this.saveCalls.push([...data.records]);
    },
  };
  return { recordDraftsRepoFake: fake };
});

vi.mock('@adapters/di/container', () => ({
  recordDraftsRepository: recordDraftsRepoFake,
}));

import { useRecordDraftsStore } from '../useRecordDraftsStore';

function makeDraft(
  p: Partial<RecordDraft> & Pick<RecordDraft, 'area' | 'studentRef' | 'content'>,
): RecordDraft {
  return {
    id: `pre-${p.area}-${p.studentRef}`,
    requiresTeacherReview: true,
    status: 'draft',
    byteLength: p.content.length,
    basisObservationIds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...p,
  };
}

beforeEach(() => {
  recordDraftsRepoFake.stored = null;
  recordDraftsRepoFake.saveCalls = [];
  // 스토어를 미로드 초기 상태로 리셋.
  useRecordDraftsStore.setState({ records: [], loaded: false });
});

describe('useRecordDraftsStore — 유실 방지(load 가드)', () => {
  it('미로드 상태에서 upsert 해도 기존 디스크 초안을 덮어쓰지 않는다', async () => {
    // 디스크에는 이미 2건이 있고, 스토어는 아직 로드 전(records=[], loaded=false).
    recordDraftsRepoFake.stored = {
      records: [
        makeDraft({ area: 'autonomy', studentRef: 's1', content: '기존 자율 A' }),
        makeDraft({ area: 'career', studentRef: 's1', content: '기존 진로 B' }),
      ],
    };

    // load() 없이 곧바로 upsert — 가드가 없으면 records:[새것] 한 건으로 파일을 덮어써 2건이 유실됨.
    await useRecordDraftsStore.getState().upsert({
      area: 'behavior',
      studentRef: 's1',
      content: '새 행동특성 C',
    });

    const saved = recordDraftsRepoFake.stored!.records;
    expect(saved).toHaveLength(3); // 기존 2 + 신규 1 (유실 0)
    expect(saved.map((r) => r.area).sort()).toEqual(['autonomy', 'behavior', 'career']);
    expect(saved.find((r) => r.area === 'autonomy')?.content).toBe('기존 자율 A');
    expect(saved.find((r) => r.area === 'career')?.content).toBe('기존 진로 B');
  });

  it('setStatus 도 미로드 상태에서 기존 초안을 보존한다', async () => {
    recordDraftsRepoFake.stored = {
      records: [
        makeDraft({ id: 'd1', area: 'autonomy', studentRef: 's1', content: 'A' }),
        makeDraft({ id: 'd2', area: 'career', studentRef: 's1', content: 'B' }),
      ],
    };
    await useRecordDraftsStore.getState().setStatus('d1', 'confirmed');
    const saved = recordDraftsRepoFake.stored!.records;
    expect(saved).toHaveLength(2); // 유실 0
    expect(saved.find((r) => r.id === 'd1')?.status).toBe('confirmed');
    expect(saved.find((r) => r.id === 'd2')?.content).toBe('B');
  });
});

describe('useRecordDraftsStore — upsert 키(area+studentRef+subject)', () => {
  it('같은 키는 갱신(중복 생성 없음), requiresTeacherReview=true 강제', async () => {
    const id1 = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's1', content: '초안 1' });
    const id2 = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's1', content: '초안 1 수정' });
    expect(id1).toBe(id2); // 동일 키 → 동일 레코드
    const recs = useRecordDraftsStore.getState().records;
    expect(recs).toHaveLength(1);
    expect(recs[0]!.content).toBe('초안 1 수정');
    expect(recs[0]!.requiresTeacherReview).toBe(true);
  });

  it('과목이 다르면 별도 초안(과목별 세특)', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'tc:c1:5', subject: '수학', content: '수학 세특' });
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'tc:c1:5', subject: '영어', content: '영어 세특' });
    expect(useRecordDraftsStore.getState().records).toHaveLength(2);
  });

  it('byteLength 는 저장 시 재계산된다(한글 3B)', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'behavior', studentRef: 's1', content: '가나다' });
    expect(useRecordDraftsStore.getState().getDraft('behavior', 's1')?.byteLength).toBe(9);
  });

  it('getByStudentRef / getDraft 파생 조회', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 's1', content: 'A' });
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's1', content: 'B' });
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 's2', content: 'C' });
    expect(useRecordDraftsStore.getState().getByStudentRef('s1')).toHaveLength(2);
    expect(useRecordDraftsStore.getState().getDraft('career', 's1')?.content).toBe('B');
    expect(useRecordDraftsStore.getState().getDraft('career', 's2')).toBeUndefined();
  });
});
