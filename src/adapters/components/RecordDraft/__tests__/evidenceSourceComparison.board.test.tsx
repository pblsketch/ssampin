/**
 * @vitest-environment jsdom
 *
 * 원본 비교 화면 (계획 §5.3, AC-13·14·15·16).
 *
 * 잠그는 것:
 *  - **AC-13** 원본만 고쳐도 근거만 고쳐도 똑같이 '원본과 내용이 달라요'. 그 사이 **자동 내용 변경 0회**.
 *  - **AC-14** 반영은 2단계다. 미리보기까지는 쓰기 0회이고, 확정해야 `applySourceFields` 가 불린다.
 *    보내는 것은 세 필드뿐이고 빈 날짜·빈 장면은 `null`(키 제거)이다.
 *    재검증에 걸리면 창이 닫히지 않고 다시 확인받는다.
 *  - **AC-15** 로딩 실패와 '원본 없음'을 구별한다. 평가·과제 출처에 비교가 오표시되지 않는다.
 *  - **AC-16** 삭제 안내 4갈래. **확인한 것만 약속한다.**
 *
 * ★스토어는 이웃 테스트(`RecordEvidenceBoard.test.tsx`)와 같은 가짜 훅으로 흉내 낸다. 다만 원본은
 *   스토어가 아니라 **저장소**에서 읽으므로(읽기 실패와 빈 목록을 구별하려고) `di/container` 를 가짜로 만든다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ObservationRecord } from '@domain/entities/Observation';

const { obsRepo, fakeStore, evidenceState, applySpy, removeSpy, updateSpy, addSpy, OBS } =
  vi.hoisted(() => {
    const observations: ObservationRecord[] = [
      // 근거와 세 필드가 모두 다른 원본.
      {
        id: 'obs-diff',
        studentId: '1',
        classId: 'c1',
        authorId: 't',
        date: '2026-06-20',
        content: '원본 글',
        tags: [],
        visibility: 'private',
        createdAt: 1,
        updatedAt: 1,
        slots: ['탐구'],
      },
      // 근거와 완전히 같은 원본.
      {
        id: 'obs-same',
        studentId: '1',
        classId: 'c1',
        authorId: 't',
        date: '2026-06-18',
        content: '똑같은 글',
        tags: [],
        visibility: 'private',
        createdAt: 1,
        updatedAt: 1,
      },
      // 날짜·장면이 없는 원본 - 반영하면 근거의 그 키를 지워야 한다.
      {
        id: 'obs-null',
        studentId: '1',
        classId: 'c1',
        authorId: 't',
        date: '',
        content: '날짜도 장면도 없는 원본',
        tags: [],
        visibility: 'private',
        createdAt: 1,
        updatedAt: 1,
      },
      // 본문이 빈 원본 - 존재하므로 '없음'이 아니다.
      {
        id: 'obs-blank',
        studentId: '1',
        classId: 'c1',
        authorId: 't',
        date: '2026-06-18',
        content: '   ',
        tags: [],
        visibility: 'private',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const repo = {
      records: observations,
      failRead: null as string | null,
      async getObservations(): Promise<{ records: ObservationRecord[] } | null> {
        if (this.failRead) throw new Error(this.failRead);
        return { records: [...this.records] };
      },
    };
    const store = <T extends object>(state: T) => {
      const hook = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
      hook.getState = () => state;
      hook.setState = () => {};
      return hook;
    };
    const base = {
      studentRef: 'sA',
      areas: ['subject'] as const,
      sourceType: 'observation' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    const evidence = [
      {
        ...base,
        id: 'e-diff',
        content: '근거로 다듬은 글',
        sourceId: 'obs-diff',
        date: '2026-06-18',
      },
      { ...base, id: 'e-same', content: '똑같은 글', sourceId: 'obs-same', date: '2026-06-18' },
      {
        ...base,
        id: 'e-null',
        content: '근거 쪽만 날짜와 장면이 있다',
        sourceId: 'obs-null',
        date: '2026-06-18',
        slots: ['탐구'],
      },
      { ...base, id: 'e-blank', content: '원본이 비어 버린 근거', sourceId: 'obs-blank' },
      { ...base, id: 'e-gone', content: '원본이 사라진 근거', sourceId: 'obs-지워짐' },
      { ...base, id: 'e-manual', content: '직접 입력한 근거', sourceType: 'manual' as const },
      {
        ...base,
        id: 'e-eval',
        content: '평가에서 온 근거',
        sourceType: 'evaluation' as const,
        sourceId: 'perf-1',
      },
    ];
    const apply = vi.fn(
      async (_params: {
        evidenceId: string;
        capture: { source: { content: string } };
        fields: unknown;
      }) => ({ ok: true as const }),
    );
    const remove = vi.fn(async () => {});
    const update = vi.fn(async () => {});
    const add = vi.fn(async () => 'x');
    return {
      obsRepo: repo,
      fakeStore: store,
      applySpy: apply,
      removeSpy: remove,
      updateSpy: update,
      addSpy: add,
      OBS: observations,
      evidenceState: {
        records: evidence,
        loaded: true,
        load: async () => {},
        add,
        addMany: async () => 0,
        update,
        remove,
        restoreRemoved: async (ev: { id: string }) => ({ id: ev.id, restored: true }),
        applySourceFields: apply,
        setExcludedFromAi: async () => {},
        setExcludedFromAiMany: async () => {},
        setThread: async () => {},
        moveToThread: async () => ({ movedIds: [], skippedIds: [] }),
        moveToNewThread: async () => ({ movedIds: [], skippedIds: [], threadId: 'x' }),
        unclassify: async () => ({ movedIds: [], skippedIds: [] }),
      },
    };
  });

vi.mock('@adapters/di/container', () => ({
  observationRepository: obsRepo,
  studentRecordsRepository: { getRecords: async () => ({ records: [] }) },
}));
vi.mock('@adapters/analytics/trackEventSafely', () => ({ trackEventSafely: () => {} }));
vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: fakeStore(evidenceState),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: fakeStore({
    records: [],
    loaded: true,
    load: async () => {},
    add: async () => 'new',
    update: async () => {},
    remove: async () => {},
  }),
}));
vi.mock('@adapters/stores/useRubricStore', () => ({
  useRubricStore: fakeStore({ rubrics: [], gradings: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useGradeAnalysisStore', () => ({
  useGradeAnalysisStore: fakeStore({
    plans: [],
    performanceResults: [],
    semesterResults: [],
    load: async () => {},
  }),
}));
vi.mock('@adapters/stores/useAssignmentStore', () => ({
  useAssignmentStore: fakeStore({ submissions: [], assignments: [] }),
}));
vi.mock('@adapters/stores/useObservationStore', () => ({
  useObservationStore: fakeStore({ records: OBS, load: async () => {} }),
}));
vi.mock('@adapters/stores/useStudentRecordsStore', () => ({
  useStudentRecordsStore: fakeStore({ records: [], load: async () => {} }),
}));
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: fakeStore({ attachments: [], load: async () => {} }),
}));
vi.mock('@adapters/components/RecordDraft/RecordEvidenceImportDrawer', () => ({
  RecordEvidenceImportDrawer: () => <div data-testid="import-drawer" />,
}));

import { RecordEvidenceBoard } from '../RecordEvidenceBoard';

const STUDENTS = [{ studentRef: 'sA', number: 1, name: '김지훈', studentKey: '1' }];

async function board(): Promise<void> {
  render(
    <RecordEvidenceBoard
      context="teaching"
      level="high"
      students={STUDENTS}
      classId="c1"
      selectedStudentRef="sA"
      onSelectStudent={() => {}}
      initialArea={null}
    />,
  );
  // 원본 읽기는 비동기다. 다 읽기 전에는 아무 카드도 '다르다'고 말하지 않는다.
  await waitFor(() =>
    expect(within(cardOf('근거로 다듬은 글')).getByText('원본과 내용이 달라요')).toBeTruthy(),
  );
}

/** ★카드 이름으로만 고른다. 본문만으로 찾으면 새 [비교하기] 단추(같은 본문이 이름에 들어간다)까지 잡힌다. */
const cardOf = (content: string): HTMLElement =>
  screen.getByRole('button', { name: `${content} 근거 카드` });
const dialog = (): HTMLElement => screen.getByRole('dialog');

/** 카드의 [수정]을 눌러 상세(근거 수정 폼)를 연다. 상세만 '같음'까지 말한다. */
async function openDetail(content: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(cardOf(content)).getByRole('button', { name: '수정' }));
  });
}

async function openCompare(content: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(cardOf(content)).getByRole('button', { name: /원본과 비교/ }));
  });
}

beforeEach(() => {
  obsRepo.records = [...OBS];
  obsRepo.failRead = null;
  applySpy.mockClear();
  applySpy.mockResolvedValue({ ok: true as const });
  removeSpy.mockClear();
  updateSpy.mockClear();
  addSpy.mockClear();
});

afterEach(cleanup);

describe('AC-13 원본과 다르면 카드가 말한다. 자동으로 내용을 바꾸지 않는다', () => {
  it('내용이 다른 근거에만 배지와 [비교하기]가 붙는다', async () => {
    await board();
    expect(within(cardOf('근거로 다듬은 글')).getByText('원본과 내용이 달라요')).toBeTruthy();
    // 같은 근거·직접 입력·평가 출처에는 붙지 않는다.
    expect(within(cardOf('똑같은 글')).queryByText('원본과 내용이 달라요')).toBeNull();
    expect(within(cardOf('직접 입력한 근거')).queryByText('원본과 내용이 달라요')).toBeNull();
    expect(within(cardOf('평가에서 온 근거')).queryByText('원본과 내용이 달라요')).toBeNull();
  });

  it('★차이를 보여 주는 동안 저장은 0회다(자동 내용 변경 없음)', async () => {
    await board();
    await openCompare('근거로 다듬은 글');
    expect(applySpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("'원본과 내용 같음'은 카드가 아니라 상세에서만 말한다", async () => {
    await board();
    expect(screen.queryByText('원본과 내용 같음')).toBeNull();
    await openDetail('똑같은 글');
    expect(screen.getByText('원본과 내용 같음')).toBeTruthy();
  });
});

describe('AC-14 반영은 2단계이고, 보내는 것은 세 필드뿐이다', () => {
  it('★[원본 내용으로 바꾸기]는 미리보기만 펼친다 - 여기까지 쓰기 0회', async () => {
    await board();
    await openCompare('근거로 다듬은 글');
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /원본 내용으로 바꾸기/ }));
    });
    expect(within(dialog()).getByText('이 내용으로 바뀝니다')).toBeTruthy();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('확정해야 반영된다. content·date·slots 만 보낸다', async () => {
    await board();
    await openCompare('근거로 다듬은 글');
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /원본 내용으로 바꾸기/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: '이 내용으로 바꾸기' }));
    });
    expect(applySpy).toHaveBeenCalledTimes(1);
    const arg = applySpy.mock.calls[0]?.[0];
    expect(arg?.evidenceId).toBe('e-diff');
    expect(arg?.fields).toEqual({ content: '원본 글', date: '2026-06-20', slots: ['탐구'] });
    // 성공하면 창이 닫힌다.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('★원본에 날짜·장면이 없으면 null 을 보낸다(빈 값을 저장하지 않고 키를 지운다)', async () => {
    await board();
    await openCompare('근거 쪽만 날짜와 장면이 있다');
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /원본 내용으로 바꾸기/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: '이 내용으로 바꾸기' }));
    });
    expect(applySpy.mock.calls[0]?.[0]).toMatchObject({
      fields: { content: '날짜도 장면도 없는 원본', date: null, slots: null },
    });
  });

  it('★재검증에 걸린 뒤 다시 확인하면 실제로 통한다(재확인이 무한 반복되지 않는다)', async () => {
    await board();
    await openCompare('근거로 다듬은 글');
    // 대화상자를 열어 둔 사이 디스크의 원본이 바뀌었다.
    obsRepo.records = obsRepo.records.map((o) =>
      o.id === 'obs-diff' ? { ...o, content: '원본 글 최신' } : o,
    );
    applySpy.mockResolvedValueOnce({ ok: false, reason: 'changed' } as never);
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /원본 내용으로 바꾸기/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: '이 내용으로 바꾸기' }));
    });
    // 다시 읽기가 끝나 화면이 최신 원본을 보여 준다.
    await waitFor(() => expect(within(dialog()).getByText('원본 글 최신')).toBeTruthy());
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /원본 내용으로 바꾸기/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: '이 내용으로 바꾸기' }));
    });
    const second = applySpy.mock.calls[1]?.[0];
    // ★캡처가 옛 원본에 고정되면 재검증이 영원히 같은 이유로 실패한다. 실제로 그 결함이 있었다.
    expect(second?.capture.source.content).toBe('원본 글 최신');
    // ★반영하는 값도 화면 값이 아니라 **확인받은 스냅샷**이어야 한다.
    expect(second?.fields).toMatchObject({ content: '원본 글 최신' });
  });

  it('★재검증에 걸리면 창을 닫지 않고 다시 확인받는다', async () => {
    applySpy.mockResolvedValueOnce({ ok: false, reason: 'changed' } as never);
    await board();
    await openCompare('근거로 다듬은 글');
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: /원본 내용으로 바꾸기/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: '이 내용으로 바꾸기' }));
    });
    expect(within(dialog()).getByText(/확인 중 내용이 바뀌었습니다/)).toBeTruthy();
    // 미리보기는 걷히고 처음 상태로 돌아간다 - 다시 눌러야 반영된다.
    expect(within(dialog()).queryByText('이 내용으로 바뀝니다')).toBeNull();
    expect(applySpy).toHaveBeenCalledTimes(1);
  });

  it('★원본 본문이 비었으면 덮는 단추가 잠기고 이유를 적는다', async () => {
    await board();
    // 배지가 붙는 근거는 하나뿐이므로 상세를 통해 상태를 확인한다.
    await openDetail('원본이 비어 버린 근거');
    expect(screen.getByText('원본 본문이 비어 있습니다')).toBeTruthy();
  });
});

describe('AC-15 로딩 실패와 원본 없음을 구별한다', () => {
  it('원본이 정말 없으면 상세가 그렇게 말한다', async () => {
    await board();
    await openDetail('원본이 사라진 근거');
    expect(screen.getByText('원본을 찾을 수 없습니다')).toBeTruthy();
  });

  it('★읽기가 실패하면 없다고 하지 않고 [다시 시도]를 준다', async () => {
    obsRepo.failRead = '디스크 오류';
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea={null}
      />,
    );
    await act(async () => {
      fireEvent.click(within(cardOf('근거로 다듬은 글')).getByRole('button', { name: '수정' }));
    });
    await waitFor(() => expect(screen.getByText('원본을 불러오지 못했습니다')).toBeTruthy());
    expect(screen.queryByText('원본을 찾을 수 없습니다')).toBeNull();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    // 읽지 못한 동안에는 '다르다'고 말하지 않는다 - 모르는 것을 단정하지 않는다.
    expect(screen.queryByText('원본과 내용이 달라요')).toBeNull();
  });

  it('평가 출처에는 비교 상태 줄 자체가 없다(오표시 금지)', async () => {
    await board();
    await openDetail('평가에서 온 근거');
    expect(screen.queryByText('원본과 내용 같음')).toBeNull();
    expect(screen.queryByText('원본을 찾을 수 없습니다')).toBeNull();
  });
});

describe('AC-16 삭제 안내 4갈래 - 확인한 것만 약속한다', () => {
  const del = async (content: string, label: string): Promise<string> => {
    await act(async () => {
      fireEvent.click(within(cardOf(content)).getByRole('button', { name: label }));
    });
    return screen.getByRole('status', { name: '알림' }).textContent ?? '';
  };

  it('(a) 확인된 적격 원본이면 미분류 재노출을 약속한다', async () => {
    await board();
    expect(await del('근거로 다듬은 글', '정리한 근거 삭제')).toContain(
      '원본은 미분류에 다시 표시됩니다',
    );
  });

  it('(b) 원본이 없으면 근거만 지웠다고 말한다', async () => {
    await board();
    expect(await del('원본이 사라진 근거', '정리한 근거 삭제')).toContain(
      '정리한 근거만 지웠습니다',
    );
  });

  it('★(b) 원본이 비어 거울 적격이 아니면 재노출을 약속하지 않는다', async () => {
    await board();
    expect(await del('원본이 비어 버린 근거', '정리한 근거 삭제')).toContain(
      '원본은 이 동작으로 지우지 않았습니다',
    );
  });

  it('★(b) 평가 출처도 재노출을 약속하지 않는다', async () => {
    await board();
    expect(await del('평가에서 온 근거', '정리한 근거 삭제')).toContain(
      '원본은 이 동작으로 지우지 않았습니다',
    );
  });

  it('(d) 직접 입력 근거는 라벨도 문구도 원본 이야기를 꺼내지 않는다', async () => {
    await board();
    expect(within(cardOf('직접 입력한 근거')).getByRole('button', { name: '삭제' })).toBeTruthy();
    const text = await del('직접 입력한 근거', '삭제');
    expect(text).toContain('근거 1건을 지웠습니다');
    expect(text).not.toContain('원본');
  });
});

describe('AC-10 저장 직후 이동 - 보드가 대상까지 찾아 준다', () => {
  const intent = (over: Record<string, unknown> = {}) => ({
    requestId: 'rfi-test-1',
    context: 'teaching' as const,
    classId: 'c1',
    studentRef: 'sA',
    mode: 'board' as const,
    ...over,
  });

  it('★대상 카드를 찾아 포커스한다(보드만 열고 마는 것이 아니다)', async () => {
    const handled = vi.fn();
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea={null}
        focusRequest={intent({ evidenceId: 'e-diff' }) as never}
        onFocusRequestHandled={handled}
      />,
    );
    await waitFor(() => expect(handled).toHaveBeenCalled());
    // 대상 카드가 실제로 포커스를 받는다 - 교사가 어디를 봐야 하는지 알 수 있다.
    expect(document.activeElement).toBe(cardOf('근거로 다듬은 글'));
  });

  it('sourceId 만 있어도(근거 id 를 모르는 담임 저장) 같은 원본의 근거를 찾아낸다', async () => {
    const handled = vi.fn();
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea={null}
        focusRequest={intent({ sourceId: 'obs-diff' }) as never}
        onFocusRequestHandled={handled}
      />,
    );
    await waitFor(() => expect(handled).toHaveBeenCalled());
    expect(document.activeElement).toBe(cardOf('근거로 다듬은 글'));
  });

  it('★대상을 못 찾으면 조용히 넘어가지 않는다(저장이 안 된 줄 알게 두지 않는다)', async () => {
    const handled = vi.fn();
    render(
      <RecordEvidenceBoard
        context="teaching"
        level="high"
        students={STUDENTS}
        classId="c1"
        selectedStudentRef="sA"
        onSelectStudent={() => {}}
        initialArea={null}
        focusRequest={intent({ evidenceId: 'e-없는것', sourceId: 'obs-없는것' }) as never}
        onFocusRequestHandled={handled}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '알림' }).textContent).toContain(
        '보드에서 찾지 못했습니다',
      ),
    );
    expect(handled).toHaveBeenCalled();
  });
});
