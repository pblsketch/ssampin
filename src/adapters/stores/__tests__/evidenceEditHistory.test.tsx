/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { RecordEvidenceData, RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThreadData } from '@domain/entities/InquiryThread';
const db = vi.hoisted(() => ({
  evidence: { records: [] } as RecordEvidenceData,
  threads: { records: [] } as InquiryThreadData,
  failEvidence: false,
  failThread: false,
}));
vi.mock('@adapters/di/container', () => ({
  recordEvidenceRepository: {
    getRecordEvidence: async () => db.evidence,
    saveRecordEvidence: async (data: RecordEvidenceData) => {
      if (db.failEvidence) {
        db.failEvidence = false;
        throw new Error('근거 저장 실패');
      }
      db.evidence = data;
    },
  },
  inquiryThreadRepository: {
    getInquiryThreads: async () => db.threads,
    saveInquiryThreads: async (data: InquiryThreadData) => {
      if (db.failThread) {
        db.failThread = false;
        throw new Error('장면 저장 실패');
      }
      db.threads = data;
    },
  },
}));
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));
import { useRecordEvidenceStore as evidenceStore } from '../useRecordEvidenceStore';
import { useInquiryThreadStore as threadStore } from '../useInquiryThreadStore';
import { useEvidenceEditHistory } from '@adapters/hooks/useEvidenceEditHistory';
import { useEvidenceMapPositions } from '@adapters/hooks/useEvidenceMapPositions';
import { placeEvidenceInScene } from '../placeEvidenceInScenes';
const record = (id: string, studentRef = 'A'): RecordEvidence => ({
  id,
  studentRef,
  content: '원래 내용',
  areas: [],
  createdAt: 1,
  updatedAt: 1,
});
function setup() {
  return renderHook(
    ({ student }) => {
      const positions = useEvidenceMapPositions(student);
      return { ...useEvidenceEditHistory(student, student, positions), positions };
    },
    { initialProps: { student: 'A' } },
  );
}
beforeEach(() => {
  localStorage.clear();
  db.failEvidence = false;
  db.failThread = false;
  db.evidence = { records: [record('a'), record('b', 'B')] };
  db.threads = {
    records: [
      {
        id: 't1',
        studentRef: 'A',
        title: '자료 비교',
        keywords: [],
        status: 'open',
        createdAt: 1,
        updatedAt: 1,
        scenes: [{ id: 'sc1', role: 'process', evidenceIds: [] }],
      },
    ],
  };
  evidenceStore.setState({ records: db.evidence.records, loaded: true });
  threadStore.setState({ records: db.threads.records, loaded: true });
});
afterEach(cleanup);
describe('실제 저장 관문의 실행 취소/다시 실행', () => {
  it('최신 파일을 읽으면서 들어온 다른 학생 변경을 취소하지 않는다', async () => {
    const { result } = setup();
    db.evidence = {
      records: [
        { ...record('a'), content: '최신 원문' },
        { ...record('b', 'B'), content: '다른 곳에서 바꿈' },
      ],
    };
    await act(async () => {
      await result.current.history.run('본문 수정', () =>
        evidenceStore.getState().update('a', { content: '내 수정' }),
      );
    });
    await act(async () => {
      await result.current.history.travel('undo');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.content).toBe('최신 원문');
    expect(db.evidence.records.find((r) => r.id === 'b')?.content).toBe('다른 곳에서 바꿈');
    await act(async () => {
      await result.current.history.travel('redo');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.content).toBe('내 수정');
  });
  it('원본 가져오기와 장면 배치를 한 번에 취소하고 동일 ID로 다시 실행한다', async () => {
    const { result } = setup();
    let id = '';
    await act(async () => {
      await result.current.history.run('가져와 배치', async () => {
        id = await evidenceStore.getState().add({
          studentRef: 'A',
          content: '원본 자료',
          areas: [],
          sourceType: 'observation',
          sourceId: 'original',
        });
        await placeEvidenceInScene({
          studentRef: 'A',
          threadId: 't1',
          sceneId: 'sc1',
          evidenceIds: [id],
        });
      });
    });
    expect(db.threads.records[0]?.scenes?.[0]?.evidenceIds).toContain(id);
    await act(async () => {
      await result.current.history.travel('undo');
    });
    expect(db.evidence.records.some((r) => r.id === id)).toBe(false);
    expect(db.threads.records[0]?.scenes?.[0]?.evidenceIds).toEqual([]);
    expect(result.current.history.canUndo).toBe(false);
    await act(async () => {
      await result.current.history.travel('redo');
    });
    expect(db.evidence.records.find((r) => r.id === id)?.sourceId).toBe('original');
    expect(db.threads.records[0]?.scenes?.[0]?.evidenceIds).toEqual([id]);
  });
  it('다학생 엑셀 가져오기는 승인한 학생 전체를 한 번에 취소한다', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.importRun(['A', 'B'], () =>
        evidenceStore.getState().addMany([
          { studentRef: 'A', content: 'A 추가', areas: [] },
          { studentRef: 'B', content: 'B 추가', areas: [] },
        ]),
      );
    });
    expect(db.evidence.records).toHaveLength(4);
    await act(async () => {
      await result.current.history.travel('undo');
    });
    expect(db.evidence.records.map((r) => r.id).sort()).toEqual(['a', 'b']);
    await act(async () => {
      await result.current.history.travel('redo');
    });
    expect(db.evidence.records).toHaveLength(4);
  });
  it('복원 두 번째 파일 저장 실패 시 첫 파일도 복구하고 재시도를 허용한다', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.history.run('장면 배치', () =>
        placeEvidenceInScene({
          studentRef: 'A',
          threadId: 't1',
          sceneId: 'sc1',
          evidenceIds: ['a'],
        }),
      );
    });
    db.failThread = true;
    await act(async () => {
      await expect(result.current.history.travel('undo')).rejects.toThrow('장면 저장 실패');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.threadId).toBe('t1');
    expect(db.threads.records[0]?.scenes?.[0]?.evidenceIds).toEqual(['a']);
    expect(result.current.history.canUndo).toBe(true);
    await act(async () => {
      await result.current.history.travel('undo');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.threadId).toBeUndefined();
  });
  it('외부에서 새로 연결한 장면을 고아로 만드는 소유 복원은 거부한다', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.history.run('주제로', () =>
        evidenceStore
          .getState()
          .moveToThread({ studentRef: 'A', threadId: 't1', evidenceIds: ['a'] }),
      );
    });
    await act(async () => {
      await threadStore.getState().attachEvidenceToScene('t1', 'sc1', ['a']);
    });
    await act(async () => {
      await expect(result.current.history.travel('undo')).rejects.toThrow('연결');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.threadId).toBe('t1');
  });
  it('실패한 편집은 이력을 만들지 않고 변경된 기록은 덮어쓰지 않는다', async () => {
    const { result } = setup();
    db.failEvidence = true;
    await act(async () => {
      await expect(
        result.current.history.run('수정', () =>
          evidenceStore.getState().update('a', { content: '실패' }),
        ),
      ).rejects.toThrow();
    });
    expect(result.current.history.canUndo).toBe(false);
    await act(async () => {
      await result.current.history.run('수정', () =>
        evidenceStore.getState().update('a', { content: '내 수정' }),
      );
    });
    db.evidence = {
      records: db.evidence.records.map((r) =>
        r.id === 'a' ? { ...r, note: '다른 곳의 메모' } : r,
      ),
    };
    await act(async () => {
      await expect(result.current.history.travel('undo')).rejects.toThrow('다른 곳');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.note).toBe('다른 곳의 메모');
  });
  it('학생을 바꾼 뒤 이전 위치 포트는 원래 학생 위치만 저장한다', async () => {
    const { result, rerender } = setup();
    const old = result.current.positions;
    await act(async () => {
      await result.current.history.run('위치', async () => old.move('node', 20, 30));
    });
    rerender({ student: 'B' });
    expect(result.current.history.canUndo).toBe(false);
    act(() => {
      result.current.positions.move('node', 90, 100);
      old.restore(new Map());
    });
    expect(result.current.positions.getOffsets().get('node')).toEqual({ dx: 90, dy: 100 });
    expect(localStorage.getItem('ssampin.evidence-map.v1:A')).toBeNull();
  });
});

describe('복원 대상의 외부 변경', () => {
  it('이동 전 주제가 외부에서 삭제됐으면 없는 주제로 복원하지 않는다', async () => {
    db.threads = { records: [...db.threads.records, { ...db.threads.records[0]!, id: 't2' }] };
    db.evidence = { records: [{ ...record('a'), threadId: 't1' }] };
    evidenceStore.setState({ records: db.evidence.records });
    threadStore.setState({ records: db.threads.records });
    const { result } = setup();
    await act(async () => {
      await result.current.history.run('주제 이동', () =>
        evidenceStore
          .getState()
          .moveToThread({ studentRef: 'A', threadId: 't2', evidenceIds: ['a'] }),
      );
    });
    db.threads = { records: db.threads.records.filter((t) => t.id !== 't1') };
    await act(async () => {
      await expect(result.current.history.travel('undo')).rejects.toThrow('주제가 없');
    });
    expect(db.evidence.records[0]?.threadId).toBe('t2');
  });
  it('주제 연결을 되살리면 순환하게 되는 경우 거부한다', async () => {
    db.threads = {
      records: [
        { ...db.threads.records[0]!, link: { fromThreadId: 't2' } },
        { ...db.threads.records[0]!, id: 't2' },
      ],
    };
    threadStore.setState({ records: db.threads.records });
    const { result } = setup();
    await act(async () => {
      await result.current.history.run('연결 해제', () =>
        threadStore.getState().setLink('t1', null),
      );
    });
    db.threads = {
      records: db.threads.records.map((t) =>
        t.id === 't2' ? { ...t, link: { fromThreadId: 't1' } } : t,
      ),
    };
    await act(async () => {
      await expect(result.current.history.travel('undo')).rejects.toThrow('순환');
    });
    expect(db.threads.records.find((t) => t.id === 't1')?.link).toBeUndefined();
  });
  it('한 작업의 두 저장 사이에 외부 메모가 들어오면 취소로 덮어쓰지 않는다', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.history.run('여러 단계', async () => {
        await evidenceStore.getState().update('a', { content: '첫 저장' });
        db.evidence = {
          records: db.evidence.records.map((r) => (r.id === 'a' ? { ...r, note: '외부 메모' } : r)),
        };
        await evidenceStore.getState().update('a', { content: '둘째 저장' });
      });
    });
    await act(async () => {
      await expect(result.current.history.travel('undo')).rejects.toThrow('저장 중 다른 곳');
    });
    expect(db.evidence.records.find((r) => r.id === 'a')?.note).toBe('외부 메모');
  });
});

it('원본 근거를 다시 가져온 뒤 redo로 중복 생성하지 않는다', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.history.run('원본 가져오기', () =>
      evidenceStore.getState().add({
        studentRef: 'A',
        content: '원본',
        areas: [],
        sourceType: 'observation',
        sourceId: 'same-original',
      }),
    );
  });
  await act(async () => {
    await result.current.history.travel('undo');
  });
  await act(async () => {
    await evidenceStore.getState().add({
      studentRef: 'A',
      content: '다시 가져온 원본',
      areas: [],
      sourceType: 'observation',
      sourceId: 'same-original',
    });
  });
  await act(async () => {
    await expect(result.current.history.travel('redo')).rejects.toThrow('같은 원본');
  });
  expect(db.evidence.records.filter((r) => r.sourceId === 'same-original')).toHaveLength(1);
});

it('장면 메모 복원 때문에 같은 시각에 만든 주제의 표시 차례가 바뀌지 않는다', async () => {
  db.threads = { records: [...db.threads.records, { ...db.threads.records[0]!, id: 't2' }] };
  threadStore.setState({ records: db.threads.records });
  const { result } = setup();
  await act(async () => {
    await result.current.history.run('메모', () =>
      threadStore.getState().setSceneNote('t1', 'sc1', '비교 기준'),
    );
  });
  await act(async () => {
    await result.current.history.travel('undo');
  });
  expect(db.threads.records.map((t) => t.id)).toEqual(['t1', 't2']);
  await act(async () => {
    await result.current.history.travel('redo');
  });
  expect(db.threads.records.map((t) => t.id)).toEqual(['t1', 't2']);
});
