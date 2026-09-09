/**
 * @vitest-environment jsdom
 *
 * 작성 방식 고르개 — 화면(ADR-099 보강 5, 3층 구조). 도메인 규칙은 `recordStyleCompose.test.ts` 가 지킨다.
 * 여기서 지키는 것: 접혀 있을 때 카드 한 장 · [바꾸기] 목록은 영역에 맞는 것이 먼저이고 예시가 펼쳐진다 ·
 * 고르는 것은 [이 방식 쓰기]로만 확정 · 한마디/세부 조정은 눌러야 열린다 · "바꿈" 표시와 되돌리기 ·
 * 내 작성 방식 저장·불러오기·이름 바꾸기·삭제가 그 자리에서 · 실행 중 잠금 · 규정 판본 경고는 늘 보임.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

import { RecordStylePicker } from '../RecordStylePicker';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';

afterEach(cleanup);

/** 상태를 들고 있는 껍데기 — 화면에서 고른 값이 실제로 돌아오는지 보려면 붙잡아 둬야 한다. */
function Harness(props: {
  readonly initial?: RecordWritingStyle;
  readonly initialPresets?: readonly RecordStylePreset[];
  readonly area?: string;
  readonly evidenceCount?: number;
  readonly distinctDateCount?: number;
  readonly promptVersion?: number;
  readonly disabled?: boolean;
  readonly openSignal?: number;
  readonly onStyle?: (s: RecordWritingStyle) => void;
}) {
  const [style, setStyle] = useState<RecordWritingStyle>(
    props.initial ?? DEFAULT_RECORD_WRITING_STYLE,
  );
  const [presets, setPresets] = useState<readonly RecordStylePreset[]>(props.initialPresets ?? []);
  return (
    <RecordStylePicker
      style={style}
      onChange={(s) => {
        setStyle(s);
        props.onStyle?.(s);
      }}
      presets={presets}
      onPresetsChange={setPresets}
      area={props.area ?? 'subject'}
      evidenceCount={props.evidenceCount ?? 3}
      distinctDateCount={props.distinctDateCount ?? 3}
      {...(props.promptVersion === undefined ? {} : { promptVersion: props.promptVersion })}
      {...(props.openSignal === undefined ? {} : { openSignal: props.openSignal })}
      disabled={props.disabled ?? false}
    />
  );
}

const openList = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '방식 바꾸기' }));
};
const openDetail = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /세부 조정/ }));
};
const card = (): HTMLElement => screen.getByTestId('style-selected-card');
const choiceByFocus = (id: string): HTMLElement =>
  screen.getAllByTestId('style-choice').find((el) => el.dataset.focus === id) as HTMLElement;

const PRESET: RecordStylePreset = {
  id: 'p1',
  name: '국어 고쳐쓰기',
  style: { ...DEFAULT_RECORD_WRITING_STYLE, focus: 'feedbackRevise', opening: 'performance' },
  catalogVersion: 2,
  createdAt: 1,
  updatedAt: 1,
};

describe('접혀 있을 때는 카드 한 장이다', () => {
  it('이름·언제·구성 순서만 보이고, 세부 조정·한마디·예시는 안 보인다', () => {
    render(<Harness />);
    expect(card().textContent).toContain('질문에서 출발한 탐구 흐름 (기본)');
    expect(within(card()).getByTestId('style-order-line').textContent).toContain('교사 판단');
    expect(screen.queryByTestId('style-detail')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('style-sample-preview')).toBeNull();
    expect(screen.queryByTestId('style-modified-badge')).toBeNull();
  });

  it('확인할 안내가 있으면 [세부 조정] 옆에 점이 뜬다(내용은 안 보여 준다)', () => {
    render(
      <Harness
        initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'compareJudge' }}
        evidenceCount={1}
      />,
    );
    expect(screen.getByTestId('style-advice-dot')).toBeTruthy();
    expect(screen.queryByTestId('style-applied-plan')).toBeNull();
  });
});

describe('규정 판본 경고는 접어도 보인다', () => {
  it('판본 2 에서 기본형이 아니면 "기존 방식으로 만들어집니다" 가 뜬다', () => {
    render(
      <Harness
        initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }}
        promptVersion={2}
      />,
    );
    expect(screen.getByTestId('style-version-warning').textContent).toContain('기존 방식');
  });

  it('판본 3 이면 안 뜬다', () => {
    render(
      <Harness
        initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }}
        promptVersion={3}
      />,
    );
    expect(screen.queryByTestId('style-version-warning')).toBeNull();
  });
});

describe('[바꾸기] 목록 — 결과물을 보고 고른다', () => {
  it('영역에 맞는 방식이 먼저 오고, 안 맞는 것은 「다른 방식 더 보기」 뒤에 있다', () => {
    render(<Harness area="behavior" />);
    openList();
    const ids = screen.getAllByTestId('style-choice').map((el) => el.dataset.focus);
    // 행동특성: 기본형 · 한 해 생활 → 그 뒤(details 안) 나머지 5개
    expect(ids.slice(0, 2)).toEqual(['legacyInquiry', 'lifeRelation']);
    expect(screen.getByText(/다른 방식 더 보기 \(5\)/)).toBeTruthy();
    expect(choiceByFocus('lifeRelation').textContent).toContain('이 영역에 맞음');
    // 기본형은 어디에나 맞으니 표시를 달지 않는다.
    expect(choiceByFocus('legacyInquiry').textContent).not.toContain('이 영역에 맞음');
  });

  it('카드를 누르면 그 카드 아래에만 예시 초안이 펼쳐지고, 값은 아직 안 바뀐다', () => {
    const seen: RecordWritingStyle[] = [];
    render(<Harness onStyle={(s) => seen.push(s)} />);
    openList();
    fireEvent.click(
      within(choiceByFocus('feedbackRevise')).getByRole('button', { name: /피드백을 받아/ }),
    );
    const previews = screen.getAllByTestId('style-sample-preview');
    expect(previews).toHaveLength(1);
    expect(previews[0]?.dataset.focus).toBe('feedbackRevise');
    expect(previews[0]?.textContent).toContain('가상의 학생');
    expect(previews[0]?.textContent).toContain('화법과 작문');
    expect(seen).toHaveLength(0);
  });

  it('[이 방식 쓰기]를 눌러야 바뀌고, 목록이 닫히며 카드가 그 방식이 된다', () => {
    const seen: RecordWritingStyle[] = [];
    render(<Harness onStyle={(s) => seen.push(s)} />);
    openList();
    fireEvent.click(
      within(choiceByFocus('collaborate')).getByRole('button', { name: /함께한 일/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: '이 방식 쓰기' }));
    expect(seen[seen.length - 1]?.focus).toBe('collaborate');
    expect(screen.queryByTestId('style-choice-list')).toBeNull();
    expect(card().textContent).toContain('함께한 일에서 맡은 몫');
    expect(within(card()).getByTestId('style-order-line').textContent).toContain('공동 과제');
  });

  it('[닫기]는 아무것도 바꾸지 않는다', () => {
    const seen: RecordWritingStyle[] = [];
    render(<Harness onStyle={(s) => seen.push(s)} />);
    openList();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(seen).toHaveLength(0);
    expect(card()).toBeTruthy();
  });

  it('방향키로 카드 사이를 오간다(값은 안 바뀐다)', () => {
    render(<Harness />);
    openList();
    const rows = screen
      .getAllByTestId('style-choice')
      .map((el) => el.querySelector('button[data-style-row]') as HTMLButtonElement);
    rows[0]?.focus();
    fireEvent.keyDown(rows[0] as HTMLButtonElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLButtonElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);
  });
});

describe('한마디 · 세부 조정은 눌러야 열린다', () => {
  it('[+ 한마디 덧붙이기]를 누르면 칸이 열리고, 적으면 단추 라벨이 요약을 겸한다', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /한마디 덧붙이기/ }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.maxLength).toBe(500);
    fireEvent.change(box, { target: { value: '발표 장면을 살려 주세요.' } });
    expect(screen.getByRole('button', { name: /한마디: 발표 장면을/ })).toBeTruthy();
    expect(screen.getByText(/규정.*끌 수 없어요/)).toBeTruthy();
  });

  it('[세부 조정]을 열면 시작 방식·묶기·요소·「적용될 설정」이 보이고, 고른 대로 따라온다', () => {
    render(<Harness initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }} />);
    openDetail();
    expect(screen.getByTestId('style-applied-plan').textContent).toContain('공동 과제');
    fireEvent.click(screen.getByRole('radio', { name: '수행·장면 먼저' }));
    const plan = screen.getByTestId('style-applied-plan').textContent ?? '';
    expect(plan.indexOf('교사 판단')).toBeGreaterThan(plan.indexOf('공동 작업에 대한 기여'));
    fireEvent.click(
      within(screen.getByTestId('style-body-modules')).getByRole('button', { name: /공동 과제/ }),
    );
    expect(screen.getByTestId('style-applied-plan').textContent).not.toContain('공동 과제');
  });
});

describe('"바꿈" 표시와 되돌리기', () => {
  it('세부 조정을 손대면 카드에 "바꿈"이 뜨고, 되돌리면 사라진다', () => {
    render(<Harness />);
    expect(screen.queryByTestId('style-modified-badge')).toBeNull();
    openDetail();
    fireEvent.click(screen.getByRole('radio', { name: '대표 장면 하나' }));
    expect(screen.getByTestId('style-modified-badge')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '기본값으로 되돌리기' }));
    expect(screen.queryByTestId('style-modified-badge')).toBeNull();
    expect(
      (screen.getByRole('button', { name: '기본값으로 되돌리기' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('내 작성 방식 — 저장은 카드에서, 관리는 목록의 카드 안에서', () => {
  it('손댄 뒤 [이 설정 저장] → 이름 → 목록의 「내 작성 방식」에 뜨고, 불러오면 그 구성이 적용된다', () => {
    const seen: RecordWritingStyle[] = [];
    render(<Harness onStyle={(s) => seen.push(s)} />);
    openDetail();
    fireEvent.click(screen.getByRole('radio', { name: '수행·장면 먼저' }));
    fireEvent.click(screen.getByRole('button', { name: '이 설정 저장' }));
    fireEvent.change(screen.getByRole('textbox', { name: '저장할 작성 방식 이름' }), {
      target: { value: '수행 먼저' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    // 저장하면 그 방식을 불러온 상태가 되어 "바꿈"이 사라진다.
    expect(screen.queryByTestId('style-modified-badge')).toBeNull();
    expect(card().textContent).toContain('수행 먼저');

    // 기본으로 돌아갔다가 다시 불러온다.
    openList();
    fireEvent.click(
      within(choiceByFocus('legacyInquiry')).getByRole('button', { name: /질문에서 출발/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: '이 방식 쓰기' }));
    expect(seen[seen.length - 1]?.opening).toBe('evaluation');
    openList();
    const preset = screen.getByTestId('style-preset-choice');
    // 이름 단추와 「⋯ 더보기」가 같은 이름을 품으므로 줄 단추를 직접 집는다.
    fireEvent.click(preset.querySelector('button[data-style-row]') as HTMLButtonElement);
    fireEvent.click(within(preset).getByRole('button', { name: '이 방식 쓰기' }));
    expect(seen[seen.length - 1]?.opening).toBe('performance');
    expect(card().textContent).toContain('수행 먼저');
  });

  it('같은 이름이면 저장 단추가 잠기고 이유가 뜬다', () => {
    render(<Harness initialPresets={[PRESET]} />);
    openDetail();
    fireEvent.click(screen.getByRole('radio', { name: '대표 장면 하나' }));
    fireEvent.click(screen.getByRole('button', { name: '이 설정 저장' }));
    fireEvent.change(screen.getByRole('textbox', { name: '저장할 작성 방식 이름' }), {
      target: { value: '국어 고쳐쓰기' },
    });
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('이미 있는 이름이에요.')).toBeTruthy();
  });

  it('⋯ 를 누르면 그 줄 안에 이름 바꾸기·삭제만 있고(복제 없음), 이름 바꾸기는 그 자리에서 끝난다', () => {
    render(<Harness initialPresets={[PRESET]} />);
    openList();
    const preset = screen.getByTestId('style-preset-choice');
    fireEvent.click(within(preset).getByRole('button', { name: '국어 고쳐쓰기 더보기' }));
    expect(within(preset).queryByRole('button', { name: '복제' })).toBeNull();
    fireEvent.click(within(preset).getByRole('button', { name: '이름 바꾸기' }));
    fireEvent.change(within(preset).getByRole('textbox', { name: '새 이름' }), {
      target: { value: '국어 수정본' },
    });
    fireEvent.click(within(preset).getByRole('button', { name: '저장' }));
    expect(preset.textContent).toContain('국어 수정본');
    expect(preset.textContent).not.toContain('국어 고쳐쓰기');
  });

  it('삭제는 그 자리에서 한 번 더 묻고, 만든 초안은 남는다고 말한다', () => {
    render(<Harness initialPresets={[PRESET]} />);
    openList();
    const preset = screen.getByTestId('style-preset-choice');
    fireEvent.click(within(preset).getByRole('button', { name: '국어 고쳐쓰기 더보기' }));
    fireEvent.click(within(preset).getByRole('button', { name: '삭제' }));
    expect(preset.textContent).toContain('이미 만든 초안은 그대로 남아요');
    fireEvent.click(within(preset).getByRole('button', { name: '지우기' }));
    expect(screen.queryByTestId('style-preset-choice')).toBeNull();
  });
});

describe('실행 중에는 못 바꾼다', () => {
  it('고르개 전체가 통째로 잠긴다: 새 컨트롤을 더해도 잠그는 것을 잊지 않는다', () => {
    render(
      <Harness disabled initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }} />,
    );
    const root = screen.getByTestId('record-style-picker') as HTMLFieldSetElement;
    expect(root.tagName).toBe('FIELDSET');
    expect(root.disabled).toBe(true);
    // fieldset 이 잠그면 단추의 disabled 속성은 그대로지만 :disabled 로는 잡힌다.
    expect(screen.getByRole('button', { name: '방식 바꾸기' }).matches(':disabled')).toBe(true);
  });
});

describe('상단 바의 작성 방식 배지에서 열어 달라는 신호', () => {
  it('신호가 0 이면 저절로 열리지 않는다: 패널을 열 때마다 열리면 방해가 된다', () => {
    render(<Harness openSignal={0} />);
    expect(screen.queryByTestId('style-choice-list')).toBeNull();
  });

  it('신호가 오르면 [바꾸기] 목록이 열리고 첫 카드에 초점이 간다', () => {
    const { rerender } = render(<Harness openSignal={0} />);
    rerender(<Harness openSignal={1} />);
    expect(screen.getByTestId('style-choice-list')).toBeTruthy();
    const first = screen.getAllByTestId('style-choice')[0]?.querySelector('button[data-style-row]');
    expect(document.activeElement).toBe(first);
  });

  it('닫은 뒤 다시 눌러도 반응한다: 불리언이 아니라 세는 값이라서', () => {
    const { rerender } = render(<Harness openSignal={0} />);
    rerender(<Harness openSignal={1} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByTestId('style-choice-list')).toBeNull();
    rerender(<Harness openSignal={2} />);
    expect(screen.getByTestId('style-choice-list')).toBeTruthy();
  });
});
