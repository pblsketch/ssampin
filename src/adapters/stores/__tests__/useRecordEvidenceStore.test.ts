/**
 * useRecordEvidenceStore — 생기부 근거 자료 스토어 단위/라운드트립 테스트.
 *
 * 회귀 방어:
 *   - 통째 저장 구조라 미로드 상태에서 add 시 기존 record-evidence.json 을 덮어쓰면 안 된다(load 가드).
 *   - add/update/remove CRUD 와 getByStudentRef/getByArea 파생 조회.
 *   - 영역(areas) 정규화(중복 제거) 및 엔티티 검증 헬퍼.
 *
 * container 의 recordEvidenceRepository 를 인메모리 가짜로 모킹한다(useRecordDraftsStore.test 패턴).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import { areEvidenceAreasValid, normalizeEvidenceAreas } from '@domain/entities/RecordEvidence';
import { areasForContext } from '@domain/entities/RecordDraft';

const { recordEvidenceRepoFake } = vi.hoisted(() => {
  const fake: {
    stored: { records: RecordEvidence[] } | null;
    saveCalls: RecordEvidence[][];
    getRecordEvidence(): Promise<{ records: RecordEvidence[] } | null>;
    saveRecordEvidence(data: { records: readonly RecordEvidence[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: [],
    async getRecordEvidence() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordEvidence(data) {
      this.stored = { records: [...data.records] };
      this.saveCalls.push([...data.records]);
    },
  };
  return { recordEvidenceRepoFake: fake };
});

vi.mock('@adapters/di/container', () => ({
  recordEvidenceRepository: recordEvidenceRepoFake,
}));

import { useRecordEvidenceStore } from '../useRecordEvidenceStore';

function makeEvidence(
  p: Partial<RecordEvidence> & Pick<RecordEvidence, 'studentRef' | 'areas' | 'content'>,
): RecordEvidence {
  return {
    id: `pre-${p.studentRef}-${p.content}`,
    sourceType: 'manual',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...p,
  };
}

beforeEach(() => {
  recordEvidenceRepoFake.stored = null;
  recordEvidenceRepoFake.saveCalls = [];
  useRecordEvidenceStore.setState({ records: [], loaded: false });
});

describe('RecordEvidence 엔티티 헬퍼', () => {
  it('normalizeEvidenceAreas 는 중복을 제거하고 순서를 보존한다', () => {
    expect(normalizeEvidenceAreas(['autonomy', 'career', 'autonomy'])).toEqual([
      'autonomy',
      'career',
    ]);
  });

  it('areEvidenceAreasValid — 비어 있으면 false, 허용 집합 부분집합이면 true', () => {
    expect(areEvidenceAreasValid([], ['autonomy', 'career'])).toBe(false);
    expect(areEvidenceAreasValid(['autonomy'], ['autonomy', 'career'])).toBe(true);
    // 담임 맥락에서 교과 세특(subject)을 근거로 분류하면 위반.
    expect(areEvidenceAreasValid(['subject'], ['autonomy', 'career', 'behavior'])).toBe(false);
  });
});

describe('useRecordEvidenceStore — 유실 방지(load 가드)', () => {
  it('미로드 상태에서 add 해도 기존 디스크 근거를 덮어쓰지 않는다', async () => {
    recordEvidenceRepoFake.stored = {
      records: [
        makeEvidence({ studentRef: 's1', areas: ['autonomy'], content: '기존 A' }),
        makeEvidence({ studentRef: 's1', areas: ['career'], content: '기존 B' }),
      ],
    };
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['behavior'], content: '신규 C' });
    const saved = recordEvidenceRepoFake.stored!.records;
    expect(saved).toHaveLength(3); // 기존 2 + 신규 1 (유실 0)
    expect(saved.map((r) => r.content).sort()).toEqual(['기존 A', '기존 B', '신규 C']);
  });
});

describe('useRecordEvidenceStore — CRUD + 파생 조회', () => {
  it('add 는 영역 정규화·시각·sourceType 을 채워 저장한다', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's1',
      areas: ['autonomy', 'autonomy', 'career'],
      content: '협동 활동',
      sourceType: 'manual',
    });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id);
    expect(rec).toBeDefined();
    expect(rec!.areas).toEqual(['autonomy', 'career']); // 중복 제거
    expect(rec!.sourceType).toBe('manual');
    expect(rec!.createdAt).toBeGreaterThan(0);
    // 디스크에도 반영(라운드트립).
    expect(recordEvidenceRepoFake.stored!.records).toHaveLength(1);
  });

  it('update 는 내용·영역·날짜를 갱신하고 updatedAt 을 올린다', async () => {
    const id = await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['autonomy'], content: '원본' });
    await useRecordEvidenceStore
      .getState()
      .update(id, { content: '수정본', areas: ['behavior'], date: '2026-06-01' });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id)!;
    expect(rec.content).toBe('수정본');
    expect(rec.areas).toEqual(['behavior']);
    expect(rec.date).toBe('2026-06-01');
  });

  it('remove 는 해당 근거만 삭제한다', async () => {
    const id1 = await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['autonomy'], content: 'A' });
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['career'], content: 'B' });
    await useRecordEvidenceStore.getState().remove(id1);
    const recs = useRecordEvidenceStore.getState().records;
    expect(recs).toHaveLength(1);
    expect(recs[0]!.content).toBe('B');
  });

  it('getByStudentRef / getByArea 파생 조회', async () => {
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['autonomy', 'behavior'], content: 'A' });
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['career'], content: 'B' });
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's2', areas: ['autonomy'], content: 'C' });
    expect(useRecordEvidenceStore.getState().getByStudentRef('s1')).toHaveLength(2);
    // autonomy 를 포함하는 s1 근거는 1건(A — autonomy+behavior).
    expect(useRecordEvidenceStore.getState().getByArea('s1', 'autonomy')).toHaveLength(1);
    expect(useRecordEvidenceStore.getState().getByArea('s1', 'behavior')).toHaveLength(1);
    expect(useRecordEvidenceStore.getState().getByArea('s2', 'autonomy')).toHaveLength(1);
  });

  it('update 가 없는 id 면 아무 변화 없음(중복/크래시 없음)', async () => {
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['autonomy'], content: 'A' });
    await useRecordEvidenceStore.getState().update('no-such-id', { content: 'X' });
    const recs = useRecordEvidenceStore.getState().records;
    expect(recs).toHaveLength(1);
    expect(recs[0]!.content).toBe('A');
  });

  it('update 로 날짜를 빈 문자열로 비울 수 있다(표시 falsy)', async () => {
    const id = await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['autonomy'], content: 'A', date: '2026-06-01' });
    await useRecordEvidenceStore.getState().update(id, { date: '' });
    expect(useRecordEvidenceStore.getState().records[0]!.date).toBe('');
  });

  it('getByArea 는 없는 영역이면 빈 배열', async () => {
    await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['autonomy'], content: 'A' });
    expect(useRecordEvidenceStore.getState().getByArea('s1', 'career')).toHaveLength(0);
  });
});

describe('근거 유형 분류 — 작성주체 결속(areasForContext × areEvidenceAreasValid)', () => {
  it('담임 맥락은 교과 영역(subject/individualSubject)을 근거 유형으로 허용하지 않는다', () => {
    const allowed = areasForContext('high', 'homeroom');
    expect(allowed).toContain('autonomy');
    expect(allowed).not.toContain('subject');
    expect(areEvidenceAreasValid(['autonomy', 'behavior'], allowed)).toBe(true);
    expect(areEvidenceAreasValid(['subject'], allowed)).toBe(false); // 담임이 세특 분류 불가
  });

  it('교과 맥락은 담임 영역(autonomy/behavior)을 근거 유형으로 허용하지 않는다', () => {
    const allowed = areasForContext('high', 'teaching');
    expect(allowed).toContain('subject');
    expect(allowed).not.toContain('autonomy');
    expect(areEvidenceAreasValid(['subject', 'individualSubject'], allowed)).toBe(true);
    expect(areEvidenceAreasValid(['autonomy'], allowed)).toBe(false);
  });
});
