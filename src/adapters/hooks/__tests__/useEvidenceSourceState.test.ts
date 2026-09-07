// @vitest-environment jsdom
/**
 * 원본 상태 읽기 (계획 §5.3, AC-15 "로딩 실패와 source 없음 구분").
 *
 * 잠그는 것:
 *  - **읽기 실패와 '원본 없음'을 절대 뭉개지 않는다.** 뭉개면 파일을 못 읽은 것뿐인데
 *    화면이 멀쩡한 원본을 '찾을 수 없습니다'라고 말한다. 계획 §5.3 이 금지한 오진이다.
 *  - 스토어(`useObservationStore`)는 읽기 실패를 삼키고 `loaded: true` 로 끝나므로,
 *    이 훅은 **저장소를 직접 읽는다.** 그 사실 자체를 테스트로 고정한다.
 *  - 평가·과제물·첨부는 비교 범위 밖(`out-of-scope`)이다. 차이 표시가 오지 않아야 한다.
 *  - `readLatestSource` 는 부를 때마다 **다시 읽고**, 실패는 던지고, 남의 학생이면 `null` 이다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { StudentRecord } from '@domain/entities/StudentRecord';

const { obsRepo, srRepo, fakeStore } = vi.hoisted(() => ({
  /** 스토어는 "누가 저장했다"는 신호로만 쓴다. 값은 정본이 아니다(정본은 파일). */
  fakeStore: <T extends object>(state: T) => {
    const hook = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
    hook.getState = () => state;
    hook.setState = () => {};
    return hook;
  },
  obsRepo: {
    records: [] as ObservationRecord[],
    failRead: null as string | null,
    readCalls: 0,
    async getObservations(): Promise<{ records: ObservationRecord[] } | null> {
      this.readCalls += 1;
      if (this.failRead) throw new Error(this.failRead);
      return { records: [...this.records] };
    },
  },
  srRepo: {
    records: [] as StudentRecord[],
    failRead: null as string | null,
    readCalls: 0,
    async getRecords(): Promise<{ records: StudentRecord[] } | null> {
      this.readCalls += 1;
      if (this.failRead) throw new Error(this.failRead);
      return { records: [...this.records] };
    },
  },
}));

vi.mock('@adapters/di/container', () => ({
  observationRepository: obsRepo,
  studentRecordsRepository: srRepo,
}));
vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: fakeStore({ records: [] as ObservationRecord[] }),
}));
vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: fakeStore({ records: [] as StudentRecord[] }),
}));

import { useEvidenceSourceState } from '../useEvidenceSourceState';

const OBS: ObservationRecord = {
  id: 'obs-1',
  studentId: '1',
  classId: 'c1',
  authorId: 't',
  date: '2026-06-18',
  content: '실험 설계를 스스로 고쳤다',
  tags: [],
  visibility: 'private',
  createdAt: 1,
  updatedAt: 1,
  slots: ['탐구'],
};

const TEACHING = {
  student: { studentRef: 'tc:c1:1', studentKey: '1' },
  context: 'teaching' as const,
  classId: 'c1',
};

function sr(over: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id: 'sr-1',
    studentId: 'stu-1',
    category: 'observation',
    subcategory: '수업태도',
    content: '토론에서 근거를 들어 말했다',
    date: '2026-06-18',
    createdAt: '2026-06-18T00:00:00.000Z',
    ...over,
  };
}

const HOMEROOM = {
  student: { studentRef: 'stu-1', studentId: 'stu-1' },
  context: 'homeroom' as const,
};

async function ready(hook: { current: { status: string } }): Promise<void> {
  await waitFor(() => expect(hook.current.status).not.toBe('loading'));
}

beforeEach(() => {
  obsRepo.records = [OBS];
  obsRepo.failRead = null;
  obsRepo.readCalls = 0;
  srRepo.records = [sr()];
  srRepo.failRead = null;
  srRepo.readCalls = 0;
});

describe('AC-15 읽기 실패와 원본 없음을 구별한다', () => {
  it('원본이 있으면 found 이고 본문·날짜·장면을 그대로 넘긴다', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    const got = result.current.lookup('obs-1', 'observation');
    expect(got.state).toBe('found');
    if (got.state !== 'found') throw new Error('found 여야 한다');
    expect(got.source.content).toBe('실험 설계를 스스로 고쳤다');
    expect(got.source.date).toBe('2026-06-18');
    expect(got.source.slots).toEqual(['탐구']);
    expect(got.source.mirrorEligible).toBe(true);
  });

  it('★읽기가 실패하면 error 다. 없다고 말하지 않는다', async () => {
    obsRepo.failRead = '디스크 오류';
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    expect(result.current.status).toBe('error');
    expect(result.current.lookup('obs-1', 'observation').state).toBe('error');
    // 있는 id 든 없는 id 든 마찬가지다. 실패 상태에서는 존재를 판정하지 않는다.
    expect(result.current.lookup('obs-없는것', 'observation').state).toBe('error');
  });

  it('읽기는 됐는데 그 id 가 없으면 missing 이다', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    expect(result.current.lookup('obs-지워짐', 'observation').state).toBe('missing');
  });

  it('retry 는 저장소를 다시 읽고, 그사이 복구됐으면 error 에서 빠져나온다', async () => {
    obsRepo.failRead = '디스크 오류';
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    expect(result.current.status).toBe('error');
    obsRepo.failRead = null;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lookup('obs-1', 'observation').state).toBe('found');
  });

  it('★평가·과제물·첨부·직접 입력은 비교 범위 밖이다(오표시 금지)', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    expect(result.current.lookup('x', 'evaluation').state).toBe('out-of-scope');
    expect(result.current.lookup('x', 'assignment').state).toBe('out-of-scope');
    expect(result.current.lookup('x', 'attachment').state).toBe('out-of-scope');
    expect(result.current.lookup('x', 'manual').state).toBe('out-of-scope');
    expect(result.current.lookup(undefined, 'observation').state).toBe('out-of-scope');
  });

  it('남의 학생·다른 수업반 원본은 애초에 담지 않는다', async () => {
    obsRepo.records = [
      { ...OBS, id: 'obs-남', studentId: '2' },
      { ...OBS, id: 'obs-다른반', classId: 'c2' },
    ];
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    expect(result.current.lookup('obs-남', 'observation').state).toBe('missing');
    expect(result.current.lookup('obs-다른반', 'observation').state).toBe('missing');
  });
});

describe('빈 본문·출결로 바뀐 원본 — 존재하므로 없음이 아니다', () => {
  it('본문이 비면 found 이면서 blank 이고 거울 적격이 아니다', async () => {
    srRepo.records = [sr({ content: '   ' })];
    const { result } = renderHook(() => useEvidenceSourceState(HOMEROOM));
    await ready(result);
    const got = result.current.lookup('sr-1', 'studentRecord');
    expect(got.state).toBe('found');
    if (got.state !== 'found') throw new Error('found 여야 한다');
    expect(got.source.blank).toBe(true);
    expect(got.source.mirrorEligible).toBe(false);
  });

  it('출결로 바뀌어도 found 이고, 거울 적격만 내려간다', async () => {
    srRepo.records = [sr({ category: 'attendance' })];
    const { result } = renderHook(() => useEvidenceSourceState(HOMEROOM));
    await ready(result);
    const got = result.current.lookup('sr-1', 'studentRecord');
    expect(got.state).toBe('found');
    if (got.state !== 'found') throw new Error('found 여야 한다');
    expect(got.source.attendance).toBe(true);
    expect(got.source.blank).toBe(false);
    expect(got.source.mirrorEligible).toBe(false);
  });
});

describe('readLatestSource — 반영 직전 재검증에 쓰는 함수', () => {
  it('★부를 때마다 저장소를 다시 읽는다(화면이 든 값으로 대조하지 않는다)', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    const before = obsRepo.readCalls;
    // 화면이 그린 뒤에 원본이 바뀌었다 - 다시 읽어야만 이 변경을 본다.
    obsRepo.records = [{ ...OBS, content: '나중에 고친 본문' }];
    const latest = await result.current.readLatestSource('obs-1', 'observation')();
    expect(obsRepo.readCalls).toBeGreaterThan(before);
    expect(latest?.content).toBe('나중에 고친 본문');
    expect(latest?.studentRef).toBe('tc:c1:1');
  });

  it('★읽기 실패는 던진다. null 로 뭉개면 삭제됨으로 둔갑한다', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    obsRepo.failRead = '디스크 오류';
    await expect(result.current.readLatestSource('obs-1', 'observation')()).rejects.toThrow(
      '디스크 오류',
    );
  });

  it('정말 없으면 null 이다(던지지 않는다)', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    obsRepo.records = [];
    await expect(result.current.readLatestSource('obs-1', 'observation')()).resolves.toBeNull();
  });

  it('★그사이 다른 학생 것이 되었으면 null 이다 - 남의 기록으로 근거를 덮지 않는다', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    obsRepo.records = [{ ...OBS, studentId: '2' }];
    await expect(result.current.readLatestSource('obs-1', 'observation')()).resolves.toBeNull();
  });

  it('출처 종류가 어긋나면 null 이다 - 같은 id 라도 그 원본이 아니다', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(TEACHING));
    await ready(result);
    await expect(result.current.readLatestSource('obs-1', 'studentRecord')()).resolves.toBeNull();
  });

  it('담임 맥락은 누가기록을 읽는다', async () => {
    const { result } = renderHook(() => useEvidenceSourceState(HOMEROOM));
    await ready(result);
    const latest = await result.current.readLatestSource('sr-1', 'studentRecord')();
    expect(latest?.content).toBe('토론에서 근거를 들어 말했다');
    expect(latest?.studentRef).toBe('stu-1');
    expect(obsRepo.readCalls).toBe(0);
  });
});
