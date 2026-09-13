import { beforeEach, describe, expect, it } from 'vitest';
import { useRecordMapRunStore } from '../useRecordMapRunStore';

describe('useRecordMapRunStore', () => {
  beforeEach(() => {
    useRecordMapRunStore.setState({
      open: false,
      contextKey: null,
      targetMode: 'current',
      selectedStudentRefs: [],
      reviewPaceKind: 'one',
      batchSize: '3',
      scaffoldMode: 'existing',
      scaffoldId: null,
      area: null,
      activeRunId: null,
      focusedStudentRef: null,
    });
  });

  it('같은 맥락에서는 패널을 닫았다 다시 열어도 선택과 실행을 보존한다', () => {
    const store = useRecordMapRunStore.getState();
    store.openFor('teaching:class-1:subject', 'student-1', 'subject');
    useRecordMapRunStore.getState().setTargetMode('selected');
    useRecordMapRunStore.getState().setSelectedStudentRefs(['student-1', 'student-3']);
    useRecordMapRunStore.getState().setActiveRunId('run-1');
    useRecordMapRunStore.getState().close();
    useRecordMapRunStore.getState().openFor('teaching:class-1:subject', 'student-2', 'subject');

    expect(useRecordMapRunStore.getState()).toMatchObject({
      open: true,
      targetMode: 'selected',
      selectedStudentRefs: ['student-1', 'student-3'],
      activeRunId: 'run-1',
    });
  });

  it('다른 학급 맥락으로 열면 안전한 기본값으로 새로 시작한다', () => {
    useRecordMapRunStore.getState().openFor('homeroom:class-1:behavior', 'student-1', 'behavior');
    useRecordMapRunStore.getState().setReviewPaceKind('continuous');
    useRecordMapRunStore.getState().setScaffoldMode('ai');

    useRecordMapRunStore.getState().openFor('homeroom:class-2:career', 'student-2', 'career');

    expect(useRecordMapRunStore.getState()).toMatchObject({
      targetMode: 'current',
      selectedStudentRefs: ['student-2'],
      reviewPaceKind: 'one',
      scaffoldMode: 'existing',
      area: 'career',
      activeRunId: null,
    });
  });
});
