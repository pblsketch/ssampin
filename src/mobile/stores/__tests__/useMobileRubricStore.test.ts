/**
 * useMobileRubricStore — 모바일 루브릭 채점 스토어 단위 테스트.
 *
 * 방어 포인트:
 *   - load 는 rubrics 저장 데이터를 매핑하고, null(미저장) 이어도 안전하게 loaded 처리.
 *   - toggleMark 는 채점 기록을 upsert 하고 저장 후 triggerSaveSync 로 Drive 역동기화를 예약.
 *   - 결시(absent) 학생은 채점 입력이 무시된다(PC useRubricStore 가드 미러).
 *
 * @mobile/di/container 의 rubricRepository 를 인메모리 가짜로,
 * useMobileDriveSyncStore 의 triggerSaveSync 를 스파이로 모킹한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Rubric, RubricsData } from '@domain/entities/Rubric';

const { rubricRepoFake, triggerSaveSyncSpy } = vi.hoisted(() => {
  const repo: {
    stored: RubricsData | null;
    load(): Promise<RubricsData | null>;
    save(data: RubricsData): Promise<void>;
  } = {
    stored: null,
    async load() {
      return this.stored;
    },
    async save(data) {
      this.stored = data;
    },
  };
  return { rubricRepoFake: repo, triggerSaveSyncSpy: vi.fn() };
});

vi.mock('@mobile/di/container', () => ({
  rubricRepository: rubricRepoFake,
}));

vi.mock('@mobile/stores/useMobileDriveSyncStore', () => ({
  useMobileDriveSyncStore: {
    getState: () => ({ triggerSaveSync: triggerSaveSyncSpy }),
  },
}));

import { useMobileRubricStore } from '../useMobileRubricStore';

const RUBRIC: Rubric = {
  id: 'r1',
  classId: 'c1',
  title: '토론 수행평가',
  criteria: [
    {
      id: 'crit1',
      name: '주장의 명확성',
      order: 0,
      levels: [
        { id: 'lv1', name: '잘함', score: 10 },
        { id: 'lv2', name: '보통', score: 5 },
      ],
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  rubricRepoFake.stored = null;
  triggerSaveSyncSpy.mockClear();
  useMobileRubricStore.setState({ rubrics: [], gradings: [], loaded: false });
});

describe('useMobileRubricStore — load', () => {
  it('저장된 rubrics 데이터를 rubrics/gradings 로 매핑한다', async () => {
    rubricRepoFake.stored = { rubrics: [RUBRIC], gradings: [] };
    await useMobileRubricStore.getState().load();
    const state = useMobileRubricStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.rubrics).toHaveLength(1);
    expect(state.rubricsForClass('c1')).toHaveLength(1);
    expect(state.rubricsForClass('c2')).toHaveLength(0);
  });

  it('저장 데이터가 null 이어도 안전하게 loaded 처리(빈 목록)', async () => {
    rubricRepoFake.stored = null;
    await useMobileRubricStore.getState().load();
    const state = useMobileRubricStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.rubrics).toHaveLength(0);
  });
});

describe('useMobileRubricStore — 채점 쓰기', () => {
  it('toggleMark 가 채점 기록을 upsert 하고 저장 + triggerSaveSync 를 호출한다', async () => {
    useMobileRubricStore.setState({ rubrics: [RUBRIC], gradings: [], loaded: true });
    await useMobileRubricStore.getState().toggleMark('r1', 'c1', '3-1-5', 'crit1', 'lv1');

    const grading = useMobileRubricStore.getState().gradingFor('r1', '3-1-5');
    expect(grading).toBeDefined();
    expect(grading!.marks['crit1']).toBe('lv1');
    // 저장소에 반영
    expect(rubricRepoFake.stored?.gradings).toHaveLength(1);
    // Drive 역동기화 예약
    expect(triggerSaveSyncSpy).toHaveBeenCalledTimes(1);
  });

  it('setAbsent 가 결시 상태를 저장한다', async () => {
    useMobileRubricStore.setState({ rubrics: [RUBRIC], gradings: [], loaded: true });
    await useMobileRubricStore.getState().setAbsent('r1', 'c1', '3-1-6', true);

    const grading = useMobileRubricStore.getState().gradingFor('r1', '3-1-6');
    expect(grading?.status).toBe('absent');
    expect(triggerSaveSyncSpy).toHaveBeenCalledTimes(1);
  });

  it('결시 학생은 toggleMark 가 무시된다(PC 가드 미러) — 기록·동기화 변화 없음', async () => {
    useMobileRubricStore.setState({ rubrics: [RUBRIC], gradings: [], loaded: true });
    // 먼저 결시 처리
    await useMobileRubricStore.getState().setAbsent('r1', 'c1', '3-1-7', true);
    triggerSaveSyncSpy.mockClear();

    // 결시 상태에서 채점 시도 → 무시
    await useMobileRubricStore.getState().toggleMark('r1', 'c1', '3-1-7', 'crit1', 'lv1');

    const grading = useMobileRubricStore.getState().gradingFor('r1', '3-1-7');
    expect(grading?.status).toBe('absent');
    expect(grading?.marks['crit1']).toBeUndefined();
    expect(triggerSaveSyncSpy).not.toHaveBeenCalled();
  });

  it('존재하지 않는 루브릭이면 toggleMark 가 무시된다', async () => {
    useMobileRubricStore.setState({ rubrics: [RUBRIC], gradings: [], loaded: true });
    await useMobileRubricStore.getState().toggleMark('missing', 'c1', '3-1-8', 'crit1', 'lv1');
    expect(useMobileRubricStore.getState().gradingFor('missing', '3-1-8')).toBeUndefined();
    expect(triggerSaveSyncSpy).not.toHaveBeenCalled();
  });
});
