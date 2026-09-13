/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomScaffoldEditor } from '../CustomScaffoldEditor';
import { ScaffoldPicker } from '../ScaffoldPicker';
afterEach(cleanup);

describe('선생님이 새 뼈대를 직접 만들기', () => {
  it('역할과 이름을 정하고 평가를 뒤로 옮겨 저장해도 기존 근거를 적용하지 않는다', async () => {
    const save = vi.fn();
    const apply = vi.fn();
    render(
      <ScaffoldPicker frame="inquiry" scaffolds={[]} onScaffoldsChange={save} onApply={apply} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ 새 뼈대 만들기' }));
    fireEvent.change(screen.getByLabelText('직접 만든 뼈대 이름'), {
      target: { value: '질문과 비교' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ 장면 추가' }));
    fireEvent.change(screen.getByLabelText('2번째 장면 역할'), { target: { value: 'motive' } });
    fireEvent.change(screen.getByLabelText('2번째 장면 이름'), {
      target: { value: '기사에서 찾은 물음' },
    });
    fireEvent.click(screen.getByLabelText('2번째 장면 위로'));
    fireEvent.click(screen.getByRole('button', { name: '뼈대 저장' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0][0]).toMatchObject({
      name: '질문과 비교',
      scenes: [{ role: 'motive', label: '기사에서 찾은 물음' }, { role: 'evaluation' }],
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('취소는 저장하지 않고, 저장 실패는 입력을 지우지 않아 재시도할 수 있다', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
    const done = vi.fn();
    const cancel = vi.fn();
    render(
      <CustomScaffoldEditor
        frame="inquiry"
        scaffolds={[]}
        onSave={save}
        onDone={done}
        onCancel={cancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('직접 만든 뼈대 이름'), {
      target: { value: '남길 입력' },
    });
    fireEvent.click(screen.getByRole('button', { name: '뼈대 저장' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('직접 만든 뼈대 이름')).toHaveProperty('value', '남길 입력');
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '뼈대 저장' }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  });
});
