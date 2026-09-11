/**
 * @vitest-environment jsdom
 *
 * 뼈대 고르개(ADR-103) — 옛 작성 방식 고르개를 대신한다.
 *
 * 여기서 지키는 것:
 *  - 고를 축은 **하나**다(장면을 놓는 차례). 초점·시작·묶기·요소 축이 되살아나면 여기서 걸린다.
 *  - [이 뼈대 깔기]는 되묻는다 — 놓아 둔 근거의 자리가 바뀌는 일이다.
 *  - 내장 뼈대는 못 지우고 못 고친다.
 *  - 틀이 다른 뼈대는 아예 보이지 않는다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ScaffoldPicker } from '../ScaffoldPicker';
import type { RecordScaffold } from '@domain/rules/narrativeFrames';

afterEach(cleanup);

const mine: RecordScaffold = {
  id: 'my-1',
  name: '우리 반 흐름',
  frame: 'inquiry',
  scenes: [
    { role: 'evaluation', moduleId: 'teacherJudgement' },
    { role: 'motive', moduleId: 'legacyMotive' },
  ],
};

function picker(over: Partial<Parameters<typeof ScaffoldPicker>[0]> = {}) {
  return render(
    <ScaffoldPicker
      frame="inquiry"
      scaffolds={[mine]}
      onScaffoldsChange={vi.fn()}
      onApply={vi.fn()}
      {...over}
    />,
  );
}

describe('목록', () => {
  it('내장 뼈대가 먼저 오고 내가 저장한 것이 뒤에 온다', () => {
    picker();
    expect(screen.getByText('질문에서 출발한 탐구 흐름 (기본)')).toBeTruthy();
    expect(screen.getByText('우리 반 흐름')).toBeTruthy();
  });

  it('★틀이 다른 뼈대는 보이지 않는다 — 행특 자리에 탐구 카테고리가 들어오면 자리와 어긋난다', () => {
    picker({ frame: 'life' });
    expect(screen.queryByText('우리 반 흐름')).toBeNull();
    expect(screen.getByText('한 해 생활과 관계 종합 (행동특성)')).toBeTruthy();
    expect(screen.queryByText('질문에서 출발한 탐구 흐름 (기본)')).toBeNull();
  });

  it('★고를 축은 하나다 — 시작 방식·묶는 방식·요소 고르개가 없다', () => {
    picker();
    const all = screen.getByTestId('scaffold-picker').textContent ?? '';
    expect(all).not.toContain('시작 방식');
    expect(all).not.toContain('묶는 방식');
    expect(all).not.toContain('세부 조정');
  });

  it('지금 이 영역에 깔린 뼈대를 표시한다', () => {
    picker({ selectedId: 'my-1' });
    expect(screen.getByText('지금 이 영역에 깔린 뼈대')).toBeTruthy();
  });
});

describe('깔기', () => {
  it('★한 번에 지나가지 않는다 — 되묻고 나서야 깐다', () => {
    const onApply = vi.fn();
    picker({ onApply });
    fireEvent.click(screen.getAllByRole('button', { name: '이 뼈대 깔기' })[0]!);
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('놓아 둔 근거의 자리가 바뀝니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '깔기' }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('그만두면 아무 일도 안 한다', () => {
    const onApply = vi.fn();
    picker({ onApply });
    fireEvent.click(screen.getAllByRole('button', { name: '이 뼈대 깔기' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }));
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('내 뼈대 다루기', () => {
  it('★내장 뼈대에는 이름 바꾸기·지우기 단추가 없다', () => {
    picker();
    expect(screen.queryByLabelText('질문에서 출발한 탐구 흐름 (기본) 지우기')).toBeNull();
    expect(screen.getByLabelText('우리 반 흐름 지우기')).toBeTruthy();
  });

  it('이름을 바꾸면 바뀐 목록이 올라온다', () => {
    const onScaffoldsChange = vi.fn();
    picker({ onScaffoldsChange });
    fireEvent.click(screen.getByLabelText('우리 반 흐름 이름 바꾸기'));
    fireEvent.change(screen.getByLabelText('뼈대 이름'), { target: { value: '새 이름' } });
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    expect(onScaffoldsChange).toHaveBeenCalledTimes(1);
    expect(onScaffoldsChange.mock.calls[0]?.[0]?.[0]?.name).toBe('새 이름');
  });

  it('빈 이름이면 이유를 말하고 바꾸지 않는다', () => {
    const onScaffoldsChange = vi.fn();
    picker({ onScaffoldsChange });
    fireEvent.click(screen.getByLabelText('우리 반 흐름 이름 바꾸기'));
    fireEvent.change(screen.getByLabelText('뼈대 이름'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    expect(onScaffoldsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('이름을 적어');
  });

  it('지우기도 되묻는다', () => {
    const onScaffoldsChange = vi.fn();
    picker({ onScaffoldsChange });
    fireEvent.click(screen.getByLabelText('우리 반 흐름 지우기'));
    expect(onScaffoldsChange).not.toHaveBeenCalled();
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(onScaffoldsChange).toHaveBeenCalledTimes(1);
    expect(onScaffoldsChange.mock.calls[0]?.[0]).toHaveLength(0);
  });

  it('지금 배열이 있을 때만 「내 뼈대로 저장」이 열린다', () => {
    picker();
    expect(screen.queryByText('+ 지금 배열을 내 뼈대로 저장')).toBeNull();
    cleanup();
    picker({ currentScenes: [{ role: 'motive', moduleId: 'legacyMotive' }] });
    expect(screen.getByText('+ 지금 배열을 내 뼈대로 저장')).toBeTruthy();
  });

  it('저장하면 평가 장면이 하나로 맞춰진 배열이 올라온다', () => {
    const onScaffoldsChange = vi.fn();
    picker({
      scaffolds: [],
      onScaffoldsChange,
      currentScenes: [{ role: 'motive', moduleId: 'legacyMotive' }],
    });
    fireEvent.click(screen.getByText('+ 지금 배열을 내 뼈대로 저장'));
    fireEvent.change(screen.getByLabelText('새 뼈대 이름'), { target: { value: '내 것' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    const saved = onScaffoldsChange.mock.calls[0]?.[0]?.[0];
    expect(saved?.name).toBe('내 것');
    expect(saved?.scenes.filter((x: { role: string }) => x.role === 'evaluation')).toHaveLength(1);
  });
});

describe('예시 초안', () => {
  it('★내장 뼈대는 결과물을 보고 고를 수 있다 — 이름만으로는 못 고른다', () => {
    picker();
    fireEvent.click(screen.getAllByRole('button', { name: '예시 보기' })[0]!);
    expect(screen.getByTestId('style-sample-preview')).toBeTruthy();
  });

  it('내가 저장한 뼈대에는 예시가 없다', () => {
    picker({ scaffolds: [mine], frame: 'inquiry' });
    const rows = screen.getAllByRole('button', { name: '예시 보기' });
    // 내장 7종에만 붙는다.
    expect(rows).toHaveLength(6);
  });
});
