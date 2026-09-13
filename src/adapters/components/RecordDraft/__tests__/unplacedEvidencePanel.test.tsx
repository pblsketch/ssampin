/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UnplacedEvidencePanel } from '../UnplacedEvidencePanel';
afterEach(cleanup);
const items = [
  {
    evidence: {
      id: 'e1',
      studentRef: 's1',
      content: '비교 기준을 수정한 원본',
      areas: [],
      createdAt: 1,
      updatedAt: 1,
    },
    group: '미분류',
  },
];
const targets = [{ id: 't1', title: '자료 비교', scenes: [{ id: 'sc1', label: '과정' }] }];
describe('미분류 근거 배치 목록', () => {
  it('주제와 장면을 골라 해당 근거를 한 번에 넣는다', async () => {
    const place = vi.fn(async () => true);
    render(
      <UnplacedEvidencePanel
        items={items}
        targets={targets}
        onPlace={place}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('미분류 근거를 넣을 장면'), {
      target: { value: 'sc1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    await waitFor(() => expect(place).toHaveBeenCalledWith('e1', 't1', 'sc1'));
  });
  it('저장 실패 후 내용과 선택을 유지해 다시 넣을 수 있다', async () => {
    const place = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(
      <UnplacedEvidencePanel
        items={items}
        targets={targets}
        onPlace={place}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('미분류 근거를 넣을 장면'), {
      target: { value: 'sc1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('비교 기준을 수정한 원본')).toBeTruthy();
    expect(screen.getByLabelText('미분류 근거를 넣을 장면')).toHaveProperty('value', 'sc1');
    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    await waitFor(() => expect(place).toHaveBeenCalledTimes(2));
  });
});
