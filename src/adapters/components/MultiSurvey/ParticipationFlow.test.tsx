// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ParticipationEditor } from './ParticipationEditor';
import { QuestionTypePicker } from './QuestionTypePicker';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';

beforeEach(() => {
  localStorage.clear();
  useMultiSurveyV2Store.setState({ sessions: [], liveSession: null, participationResults: [] });
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(cleanup);

function session() {
  const store = useMultiSurveyV2Store.getState();
  const created = store.createSession({ title: '원래 제목', purpose: 'activity' });
  store.updateSession(created.id, {
    questions: [
      {
        id: 'q',
        type: 'short',
        text: '빈칸을 채우세요.',
        timerSeconds: 60,
        score: 10,
        acceptedAnswers: ['정답'],
        caseSensitive: false,
      },
    ],
  });
  return useMultiSurveyV2Store.getState().sessions[0]!;
}

describe('참여교실 작성·유형 선택', () => {
  it('유형을 탐색하거나 취소할 때 문항을 만들지 않는다', () => {
    const add = vi.fn(),
      close = vi.fn();
    render(<QuestionTypePicker onAdd={add} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: '숫자 입력·추정' }));
    expect(screen.getByTitle('문항 유형 체험').getAttribute('sandbox')).toBe('allow-scripts');
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(close).toHaveBeenCalledOnce();
    expect(useMultiSurveyV2Store.getState().sessions).toHaveLength(0);
  });
  it('이 유형 추가를 눌렀을 때만 고른 문항 유형을 전달한다', () => {
    const add = vi.fn();
    render(<QuestionTypePicker onAdd={add} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '점수 배분' }));
    fireEvent.click(screen.getByRole('button', { name: '이 유형 추가' }));
    expect(add).toHaveBeenCalledExactlyOnceWith('allocation');
  });
  it('편집 취소 시 저장된 제목을 보존한다', () => {
    const original = session();
    const back = vi.fn();
    render(<ParticipationEditor session={original} onBack={back} />);
    fireEvent.change(screen.getByLabelText('활동 제목'), {
      target: { value: '저장하지 않은 제목' },
    });
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    expect(back).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '변경 취소하고 나가기' }));
    expect(back).toHaveBeenCalledOnce();
    expect(useMultiSurveyV2Store.getState().sessions[0]?.title).toBe('원래 제목');
  });
  it('저장 시 작성 내용을 반영하고 공백 정답은 초대를 막는다', () => {
    const original = session();
    render(<ParticipationEditor session={original} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('활동 제목'), { target: { value: '새 제목' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(useMultiSurveyV2Store.getState().sessions[0]?.title).toBe('새 제목');
    fireEvent.change(screen.getByLabelText(/인정할 정답/), { target: { value: ' ' } });
    expect(
      (screen.getByRole('button', { name: '학생 초대하기' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

function ordered() {
  const store = useMultiSurveyV2Store.getState();
  const created = store.createSession({ title: '순서 바꾸기', purpose: 'activity' });
  store.updateSession(created.id, {
    questions: ['첫 질문', '둘째 질문', '셋째 질문'].map((text, i) => ({
      id: `q${i + 1}`,
      type: 'text' as const,
      text,
      timerSeconds: 60,
      score: 0,
      maxLength: 100,
    })),
  });
  return useMultiSurveyV2Store.getState().sessions[0]!;
}

/** 실제 브라우저의 끌어놓기가 주고받는 자료 상자를 흉내 낸다. */
function dropBox() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (key: string, value: string) => {
      store[key] = value;
    },
    getData: (key: string) => store[key] ?? '',
  };
}

const listText = () => screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

describe('참여교실 문항 순서 바꾸기', () => {
  it('끌어서 놓으면 그 자리로 옮기고 보던 문항을 따라간다', () => {
    render(<ParticipationEditor session={ordered()} onBack={vi.fn()} />);
    const dataTransfer = dropBox();
    const items = screen.getAllByRole('listitem');
    fireEvent.dragStart(items[2]!, { dataTransfer });
    fireEvent.dragOver(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    expect(listText().map((t) => t.replace(/\D*(\d)\./, '$1.'))).toEqual([
      '1. 셋째 질문',
      '2. 첫 질문',
      '3. 둘째 질문',
    ]);
    // 옮긴 문항을 그대로 보고 있어야 한다 — 자리만 바뀌고 편집 대상이 튀지 않는다.
    expect(screen.getByText('1번 문항')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(useMultiSurveyV2Store.getState().sessions[0]?.questions.map((q) => q.id)).toEqual([
      'q3',
      'q1',
      'q2',
    ]);
  });
  it('키보드로도 위로·아래로 옮길 수 있고 끝에서는 막힌다', () => {
    render(<ParticipationEditor session={ordered()} onBack={vi.fn()} />);
    expect((screen.getByRole('button', { name: '위로' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '아래로' }));
    expect(listText().some((t) => t.includes('2. 첫 질문'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '위로' }));
    expect(listText().some((t) => t.includes('1. 첫 질문'))).toBe(true);
  });
});

describe('도구 이름 표시', () => {
  it('이름과 단계를 따로 그린다 — 이름에 가운뎃점이 있어 한 줄로 이으면 엉킨다', () => {
    render(<ParticipationEditor session={session()} onBack={vi.fn()} />);
    // 한 요소에 '퀴즈·설문·토론 · 활동 편집' 처럼 붙어 있으면 이 두 조회가 동시에 성립하지 않는다.
    expect(screen.getByText(PARTICIPATION_TOOL_NAME)).toBeTruthy();
    expect(screen.getByText('활동 편집')).toBeTruthy();
  });
});
