/**
 * 화면 왕복 요청 판정 (계획 §4.3, AC-10·12).
 *
 * 잠그는 것:
 *   - 명단이 안 왔으면 **버리지 않고 기다린다.** 저장 직후 누른 이동을 놓치면 안 된다.
 *   - 같은 요청을 **두 번 소비하지 않는다.** 리렌더마다 다시 이동시키면 사용자의 조작을 되돌린다.
 *   - 지워진 학생이면 **첫 학생에게 묵시적으로 붙이지 않는다.** 남의 기록에 붙는 사고다.
 */
import { describe, it, expect } from 'vitest';
import {
  createRecordFlowIntent,
  needsFilterReset,
  resolveRecordFlowIntent,
  type RecordFlowIntent,
} from '../recordFlowIntent';

const intent = (over: Partial<RecordFlowIntent> = {}): RecordFlowIntent => ({
  requestId: 'req-1',
  context: 'teaching',
  studentRef: 'tc:c1:1-2-3',
  mode: 'board',
  ...over,
});

const resolve = (over: Partial<Parameters<typeof resolveRecordFlowIntent>[0]> = {}) =>
  resolveRecordFlowIntent({
    intent: intent(),
    rosterLoaded: true,
    knownStudentRefs: new Set(['tc:c1:1-2-3']),
    consumedRequestIds: new Set(),
    ...over,
  });

describe('createRecordFlowIntent', () => {
  it('요청마다 다른 requestId 를 붙인다', () => {
    const a = createRecordFlowIntent({ context: 'teaching', studentRef: 's', mode: 'board' });
    const b = createRecordFlowIntent({ context: 'teaching', studentRef: 's', mode: 'board' });
    expect(a.requestId).not.toBe(b.requestId);
  });

  it('넘긴 값은 그대로 보존한다', () => {
    const i = createRecordFlowIntent({
      context: 'homeroom',
      studentRef: 'stu-1',
      mode: 'compose',
      threadId: 'thr-1',
    });
    expect(i.mode).toBe('compose');
    expect(i.threadId).toBe('thr-1');
  });
});

describe('resolveRecordFlowIntent', () => {
  it('요청이 없으면 할 일이 없다', () => {
    expect(resolve({ intent: null })).toEqual({ status: 'consumed' });
  });

  it('★명단이 아직 안 왔으면 버리지 않고 기다린다', () => {
    // 저장 직후 누른 이동이 "명단 로딩 중"이라는 이유로 사라지면 안 된다.
    expect(resolve({ rosterLoaded: false })).toEqual({ status: 'pending' });
  });

  it('★명단 로딩 중에는 학생이 안 보여도 "없는 학생"으로 단정하지 않는다', () => {
    const r = resolve({ rosterLoaded: false, knownStudentRefs: new Set() });
    expect(r.status).toBe('pending');
  });

  it('대상 학생이 있으면 처리 가능하다', () => {
    const r = resolve();
    expect(r.status).toBe('ready');
  });

  it('★이미 소비한 요청은 다시 처리하지 않는다', () => {
    const r = resolve({ consumedRequestIds: new Set(['req-1']) });
    expect(r).toEqual({ status: 'consumed' });
  });

  it('★소비 검사가 명단 검사보다 먼저다 — 소비된 요청은 명단이 없어도 조용하다', () => {
    const r = resolve({ rosterLoaded: false, consumedRequestIds: new Set(['req-1']) });
    expect(r).toEqual({ status: 'consumed' });
  });

  it('★지워진 학생이면 첫 학생에게 붙이지 않고 없다고 말한다', () => {
    const r = resolve({ knownStudentRefs: new Set(['tc:c1:9-9-9']) });
    expect(r).toEqual({ status: 'student-missing', studentRef: 'tc:c1:1-2-3' });
  });
});

describe('needsFilterReset', () => {
  it('대상이 지금 안 보이면 필터를 풀어야 한다', () => {
    expect(needsFilterReset(intent({ evidenceId: 'ev-1' }), new Set())).toBe(true);
  });

  it('대상이 이미 보이면 필터를 건드리지 않는다', () => {
    expect(needsFilterReset(intent({ evidenceId: 'ev-1' }), new Set(['ev-1']))).toBe(false);
  });

  it('대상 id 가 없는 단순 학생 이동은 필터와 무관하다', () => {
    expect(needsFilterReset(intent(), new Set())).toBe(false);
  });

  it('evidenceId 가 없으면 sourceId 로 판정한다', () => {
    expect(needsFilterReset(intent({ sourceId: 'src-1' }), new Set(['src-1']))).toBe(false);
    expect(needsFilterReset(intent({ sourceId: 'src-1' }), new Set())).toBe(true);
  });
});
