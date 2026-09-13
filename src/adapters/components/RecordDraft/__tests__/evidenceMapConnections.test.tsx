/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EvidenceMapConnections } from '../EvidenceMapConnections';
import type { EvidenceMapGroupModel } from '../EvidenceMapView';
import { layoutEvidenceMap } from '../evidenceMapLayout';

afterEach(cleanup);
const evidence = {
  id: 'e1',
  threadId: 't1',
  studentRef: 's1',
  content: '비교 과정과 최종 결론을 담은 보고서',
  areas: [],
  createdAt: 1,
  updatedAt: 1,
};
function setup(closed = false, reject = false) {
  const scenes = [
    { id: 'a', role: 'process' as const, evidenceIds: ['e1'] },
    { id: 'b', role: 'result' as const, evidenceIds: ['e1'] },
  ];
  const groups: EvidenceMapGroupModel[] = [
    {
      key: 't1',
      title: '탐구',
      dropId: 't1',
      closed,
      thread: {
        id: 't1',
        studentRef: 's1',
        title: '탐구',
        keywords: [],
        status: closed ? 'closed' : 'open',
        createdAt: 1,
        updatedAt: 1,
        scenes,
      },
      items: [evidence],
      columns: scenes.map((scene, index) => ({
        key: scene.id,
        scene,
        kind: 'scene',
        slot: index ? '결과' : '과정',
        detail: null,
        dropId: scene.id,
        items: index ? [] : [evidence],
      })),
    },
  ];
  const onChange = vi
    .fn()
    .mockImplementation(() =>
      reject ? Promise.reject(new Error('저장 실패')) : Promise.resolve(),
    );
  const layout = layoutEvidenceMap(groups, new Map(), 1100);
  const result = render(
    <EvidenceMapConnections groups={groups} layout={layout} onChange={onChange} />,
  );
  return { ...result, onChange };
}
describe('지도 연결 편집', () => {
  it('하나의 카드 좌표를 두 장면이 참조하고 연결 추가는 attach만 호출한다', async () => {
    const { container, onChange } = setup();
    expect(container.querySelectorAll('[data-map-evidence-edge]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /보고서 연결 추가/ }));
    expect(screen.getByText('기존 연결은 유지하고 새 연결을 추가합니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '결과 근거 받는 연결점' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        kind: 'attach',
        threadId: 't1',
        sceneId: 'b',
        evidenceId: 'e1',
      }),
    );
  });
  it('클릭 연결점은 키보드로도 도달하며 Esc가 저장 없이 취소한다', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: '결과 다음 연결점' }));
    fireEvent.focus(screen.getByRole('button', { name: '과정 시작 연결점' }));
    expect(screen.getByRole('status').textContent).toContain('과정');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('다음에 올 장면의 시작점을 선택하세요.')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('선 끝을 옮기면 해당 연결만 move로 전달한다', async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: '과정 근거 연결 편집' }));
    expect(screen.getByRole('button', { name: '이 연결의 장면 쪽 끝점 옮기기' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '연결 옮기기' }));
    fireEvent.click(screen.getByRole('button', { name: '결과 근거 받는 연결점' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        kind: 'move',
        threadId: 't1',
        fromSceneId: 'a',
        sceneId: 'b',
        evidenceId: 'e1',
      }),
    );
  });
  it('연결 메모 저장 실패 시 작성한 글과 편집창을 유지한다', async () => {
    setup(false, true);
    fireEvent.click(screen.getByRole('button', { name: '과정 근거 연결 편집' }));
    fireEvent.change(screen.getByRole('textbox', { name: '이 장면에서 쓸 부분' }), {
      target: { value: '비교 기준을 수정한 부분' },
    });
    fireEvent.click(screen.getByRole('button', { name: '메모 저장' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('저장 실패'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '비교 기준을 수정한 부분',
    );
  });
  it('마친 주제는 선 읽기만 가능하고 수정 연결점은 없다', () => {
    setup(true);
    expect(screen.queryByRole('button', { name: /연결 추가/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '과정 근거 연결 편집' }));
    expect(screen.queryByRole('button', { name: '연결 해제' })).toBeNull();
  });
});
