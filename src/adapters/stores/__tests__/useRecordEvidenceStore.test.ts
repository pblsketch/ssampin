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

describe('AI 전송 제외 — 기재 금지 항목은 모델까지 가지 않는다 (ADR-072 결정 5)', () => {
  it('금지 항목이 섞인 근거는 저장 시 자동으로 제외 표시된다', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's1',
      areas: ['subject'],
      content: '교내 대회에서 최우수상을 받음',
    });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id);
    expect(rec?.excludedFromAi).toBe(true);
  });

  it('평범한 근거는 표시하지 않는다 — 없으면 보낸다(기존 데이터 호환)', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's1',
      areas: ['subject'],
      content: '자료의 출처를 스스로 확인하고 근거를 다시 정리함',
    });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id);
    expect(rec?.excludedFromAi).toBeUndefined();
  });

  it('addMany 도 같은 판정을 한다', async () => {
    await useRecordEvidenceStore.getState().addMany([
      { studentRef: 's1', areas: ['subject'], content: '토익 점수를 밝힘' },
      { studentRef: 's1', areas: ['subject'], content: '실험 순서를 스스로 바꿔 다시 측정함' },
    ]);
    const recs = useRecordEvidenceStore.getState().records;
    expect(recs.find((r) => r.content.includes('토익'))?.excludedFromAi).toBe(true);
    expect(recs.find((r) => r.content.includes('실험'))?.excludedFromAi).toBeUndefined();
  });

  it('교사가 제외를 풀 수 있다 — 자동 판정의 오탐을 되돌리는 길', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's1',
      areas: ['subject'],
      content: '교내 대회에서 최우수상을 받음',
    });
    await useRecordEvidenceStore.getState().setExcludedFromAi(id, false);
    expect(useRecordEvidenceStore.getState().records.find((r) => r.id === id)?.excludedFromAi).toBe(
      false,
    );
  });

  it('내용을 고쳐 금지 항목이 생기면 다시 제외된다 — 붙이기만 하고 자동으로 풀지 않는다', async () => {
    const id = await useRecordEvidenceStore
      .getState()
      .add({ studentRef: 's1', areas: ['subject'], content: '평범한 관찰' });
    await useRecordEvidenceStore.getState().update(id, { content: '특허를 출원함' });
    expect(useRecordEvidenceStore.getState().records.find((r) => r.id === id)?.excludedFromAi).toBe(
      true,
    );

    // 교사가 푼 뒤 내용을 깨끗하게 고쳐도 자동으로 true 가 되지는 않는다.
    await useRecordEvidenceStore.getState().setExcludedFromAi(id, false);
    await useRecordEvidenceStore.getState().update(id, { content: '자료를 다시 정리함' });
    expect(useRecordEvidenceStore.getState().records.find((r) => r.id === id)?.excludedFromAi).toBe(
      false,
    );
  });
});

describe('관찰 슬롯 보존 — 창고로 끌어와도 갈래가 남는다', () => {
  it('원본 슬롯을 그대로 저장한다', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's1',
      areas: ['subject'],
      content: '쿠폰 질문을 던짐',
      sourceType: 'observation',
      slots: ['질문'],
    });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id);
    expect(rec?.slots).toEqual(['질문']);
  });

  it('★슬롯 없는 원본에서는 칸 자체를 만들지 않는다(부재 != 빈 배열)', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's2',
      areas: ['subject'],
      content: '슬롯 없는 기록',
    });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id);
    expect(rec && 'slots' in rec).toBe(false);
  });

  it('빈 배열을 넘겨도 칸을 만들지 않는다', async () => {
    const id = await useRecordEvidenceStore.getState().add({
      studentRef: 's3',
      areas: ['subject'],
      content: '빈 슬롯',
      slots: [],
    });
    const rec = useRecordEvidenceStore.getState().records.find((r) => r.id === id);
    expect(rec && 'slots' in rec).toBe(false);
  });

  it('일괄 끌어오기(addMany)에서도 슬롯이 실린다', async () => {
    await useRecordEvidenceStore.getState().addMany([
      { studentRef: 'm1', areas: ['subject'], content: 'a', slots: ['시도'] },
      { studentRef: 'm2', areas: ['subject'], content: 'b' },
    ]);
    const recs = useRecordEvidenceStore.getState().records;
    expect(recs.find((r) => r.studentRef === 'm1')?.slots).toEqual(['시도']);
    const m2 = recs.find((r) => r.studentRef === 'm2');
    expect(m2 && 'slots' in m2).toBe(false);
  });
});
