/**
 * @vitest-environment jsdom
 *
 * 작성 방식 고르개 — 화면(ADR-099 §10). 도메인 규칙은 `recordStyleCompose.test.ts` 가 지킨다.
 * 여기서 지키는 것: 접었을 때 한 줄 · 규정 판본 경고는 접어도 보임 · 프리셋 CRUD 가 화면에서 왕복 ·
 * 실행 중 잠금.
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
      disabled={props.disabled ?? false}
    />
  );
}

const openDetail = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /자세히/ }));
};

describe('접었을 때는 한 줄이다', () => {
  it('기본값에서는 자세한 설정도 경고도 안 보인다', () => {
    render(<Harness />);
    expect(screen.queryByTestId('style-applied-plan')).toBeNull();
    expect(screen.queryByTestId('style-version-warning')).toBeNull();
    expect(screen.queryByTestId('style-advice-dot')).toBeNull();
  });

  it('초점 10종과 저장한 방식이 같은 드롭다운에 묶여 있다', () => {
    render(
      <Harness
        initialPresets={[
          {
            id: 'p1',
            name: '국어 고쳐쓰기',
            style: DEFAULT_RECORD_WRITING_STYLE,
            catalogVersion: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.querySelectorAll('optgroup')).toHaveLength(2);
    expect(within(select).getAllByRole('option')).toHaveLength(8);
  });

  it('확인할 안내가 있으면 [자세히] 옆에 점이 뜬다(내용은 안 보여 준다)', () => {
    render(<Harness initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'lifeRelation' }} />);
    expect(screen.getByTestId('style-advice-dot')).toBeTruthy();
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

describe('고르면 「적용될 설정」이 그대로 따라온다', () => {
  it('초점을 바꾸면 요소 목록이 바뀐다', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'feedbackRevise' } });
    openDetail();
    const plan = screen.getByTestId('style-applied-plan');
    expect(plan.textContent).toContain('첫 수행의 특징');
    expect(plan.textContent).toContain('달라진 수행');
  });

  it('시작 방식을 바꾸면 교사 판단이 맨 뒤로 간다', () => {
    render(<Harness initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }} />);
    openDetail();
    fireEvent.click(screen.getByRole('radio', { name: '수행·장면 먼저' }));
    const items = within(screen.getByTestId('style-applied-plan')).getAllByRole('listitem');
    expect(items[items.length - 1]?.textContent).toContain('교사 판단');
  });

  it('요소를 끄면 「적용될 설정」에서 사라진다', () => {
    const seen: RecordWritingStyle[] = [];
    render(
      <Harness
        initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'compareJudge' }}
        onStyle={(s) => seen.push(s)}
      />,
    );
    openDetail();
    fireEvent.click(
      within(screen.getByTestId('style-body-modules')).getByRole('button', { name: /자신의 결론/ }),
    );
    expect(seen[seen.length - 1]?.disabledModules).toContain('ownConclusion');
    expect(screen.getByTestId('style-applied-plan').textContent).not.toContain('자신의 결론');
  });

  it('추가 지시는 상한이 걸려 있고 규정을 끌 수 없다고 적혀 있다', () => {
    render(<Harness />);
    openDetail();
    const box = screen.getByRole('textbox', { name: '추가 지시' }) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(500);
    expect(screen.getByText(/이 칸으로 끌 수 없어요/)).toBeTruthy();
  });
});

describe('내 작성 방식 — 저장·불러오기·복제·이름 바꾸기·삭제', () => {
  const openManage = (): void => {
    openDetail();
    fireEvent.click(screen.getByRole('button', { name: /내 작성 방식/ }));
  };

  it('저장하면 드롭다운에 뜨고, 불러오면 그 구성이 적용된다', () => {
    render(<Harness initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }} />);
    openManage();
    fireEvent.change(screen.getByRole('textbox', { name: '저장할 작성 방식 이름' }), {
      target: { value: '모둠 수업용' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    // 초점을 되돌린 뒤 저장한 방식을 고르면 다시 협업으로 돌아온다.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'feedbackRevise' } });
    expect(screen.getByTestId('style-applied-plan').textContent).toContain('달라진 수행');
    const preset = within(screen.getByRole('combobox')).getByRole('option', {
      name: '모둠 수업용',
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: (preset as HTMLOptionElement).value },
    });
    expect(screen.getByTestId('style-applied-plan').textContent).toContain('공동 과제');
  });

  it('같은 이름이면 저장 단추가 잠기고 이유가 뜬다', () => {
    render(
      <Harness
        initialPresets={[
          {
            id: 'p1',
            name: '내 방식',
            style: DEFAULT_RECORD_WRITING_STYLE,
            catalogVersion: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    );
    openManage();
    fireEvent.change(screen.getByRole('textbox', { name: '저장할 작성 방식 이름' }), {
      target: { value: '내 방식' },
    });
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('이미 있는 이름이에요.')).toBeTruthy();
  });

  it('복제하면 (사본)이 붙고, 이름 바꾸기는 그 줄 안에서 끝난다', () => {
    render(
      <Harness
        initialPresets={[
          {
            id: 'p1',
            name: 'A',
            style: DEFAULT_RECORD_WRITING_STYLE,
            catalogVersion: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    );
    openManage();
    fireEvent.click(screen.getByRole('button', { name: '복제' }));
    // 이름은 드롭다운 항목과 관리 목록 두 곳에 뜬다.
    expect(screen.getAllByText('A (사본)').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: '이름 바꾸기' })[0] as HTMLElement);
    const nameBox = screen.getByRole('textbox', { name: '새 이름' });
    fireEvent.change(nameBox, { target: { value: 'B' } });
    // ★그 줄 안의 [저장]을 눌러야 한다 : 위쪽 "지금 설정을 저장"과 이름이 같다.
    const row = nameBox.closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '저장' }));
    expect(screen.getAllByText('B').length).toBeGreaterThan(0);
  });

  it('삭제는 그 줄 안에서 한 번 더 묻고, 만든 초안은 남는다고 말한다', () => {
    render(
      <Harness
        initialPresets={[
          {
            id: 'p1',
            name: 'A',
            style: DEFAULT_RECORD_WRITING_STYLE,
            catalogVersion: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    );
    openManage();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByText(/이미 만든 초안은 그대로 남아요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }));
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(screen.queryAllByText('A')).toHaveLength(0);
  });
});

describe('실행 중에는 못 바꾼다', () => {
  it('drop-down 과 자세한 설정이 모두 잠긴다', () => {
    render(
      <Harness disabled initial={{ ...DEFAULT_RECORD_WRITING_STYLE, focus: 'collaborate' }} />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    openDetail();
    // 자세한 설정은 통째로 fieldset 으로 잠근다 : 새 컨트롤을 더해도 잠그는 것을 잊지 않는다.
    const detail = document.getElementById('record-style-detail') as HTMLFieldSetElement;
    expect(detail.tagName).toBe('FIELDSET');
    expect(detail.disabled).toBe(true);
  });
});
