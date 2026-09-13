/**
 * @vitest-environment jsdom
 *
 * 근거 지도 보기(ADR-106 · 107 · 108) — 화면 조각.
 *
 * 여기서 지키는 것:
 *  - 주제 묶음마다 카드가 절대 좌표로 놓인다. **근거 사이 화살표·손잡이는 없다**(ADR-108).
 *  - 장면 열이 있으면 장면 사이에만 화살표가 있고, 그 라벨(이음말)을 누르면 부모에게 뒤 장면 id 를 넘긴다.
 *  - 카드를 누르거나 Enter 로 고른다.
 *  - 지도 조작(맞추기·확대·축소)에 한국어 이름이 있다. [카드 위치 정돈]은 손으로 민 것이 있을 때만 **나타난다**.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import {
  EvidenceMapView,
  type EvidenceMapGroupModel,
  type MapColumnModel,
} from '../EvidenceMapView';

afterEach(cleanup);

const ev = (id: string, content: string, over: Partial<RecordEvidence> = {}): RecordEvidence => ({
  id,
  studentRef: 's1',
  content,
  areas: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const ITEMS = [
  ev('a', '쿠폰이 있으면 왜 사게 되냐고 물음', { date: '2026-03-01' }),
  ev('b', '할인 문구를 모아 표로 정리함', { date: '2026-03-02' }),
  ev('c', '친구 설문을 돌림', { date: '2026-03-03' }),
  ev('d', '보고서에 결론을 씀', { date: '2026-03-04' }),
];
const THREAD = {
  id: 'thr-1',
  studentRef: 's1',
  title: '할인 문구와 선택',
  keywords: [],
  status: 'open' as const,
  createdAt: 1,
  updatedAt: 1,
};

function view(over: Partial<Parameters<typeof EvidenceMapView>[0]> = {}) {
  const groups: EvidenceMapGroupModel[] = [
    {
      key: 'thr-1',
      thread: THREAD,
      title: '할인 문구와 선택',
      items: ITEMS,
      dropId: 'drop:thread:thr-1',
    },
    {
      key: 'unclassified',
      title: '주제 미정 근거',
      items: [ev('m', '아직 안 엮인 것')],
      dropId: 'drop:unclassified',
    },
  ];
  const props = {
    groups,
    selectedIds: [] as readonly string[],
    focusedId: null,
    offsets: new Map(),
    zoom: 1,
    hasCustomPositions: false,
    isMirror: () => false,
    differsFromSource: () => false,
    onSelectNode: vi.fn(),
    onOpenThread: vi.fn(),
    onZoom: vi.fn(),
    onResetPositions: vi.fn(),
    ...over,
  };
  render(
    <DndContext>
      <EvidenceMapView {...props} />
    </DndContext>,
  );
  return props;
}

/** 장면 열 셋(평가·동기·과정) + 자리 미정. 과정에 이음말이 있다. */
function columns(): MapColumnModel[] {
  const scene = (
    id: string,
    role: 'evaluation' | 'motive' | 'process',
    slot: string,
    extra: Partial<MapColumnModel> = {},
  ): MapColumnModel => ({
    key: `thr-1:${id}`,
    kind: 'scene',
    scene: { id, role, evidenceIds: [] },
    role,
    slot,
    detail: null,
    dropId: `drop:scene:thr-1:${id}`,
    items: [],
    ...extra,
  });
  return [
    scene('s-eval', 'evaluation', '평가'),
    scene('s-motive', 'motive', '동기', { items: [ITEMS[0]!] }),
    scene('s-proc', 'process', '과정', {
      items: [ITEMS[1]!, ITEMS[2]!],
      leadIn: '질문이 실험으로',
    }),
    {
      key: 'thr-1:unplaced',
      kind: 'unplaced',
      slot: '자리 미정',
      detail: null,
      dropId: 'drop:unplaced:thr-1',
      items: [ITEMS[3]!],
    },
  ];
}

describe('근거 지도 보기', () => {
  it('묶음마다 카드가 놓이고, 근거 사이 화살표·손잡이는 없다(ADR-108)', () => {
    view();
    const group = screen.getByRole('region', { name: '할인 문구와 선택 · 근거 4건' });
    expect(group.querySelectorAll('[data-map-node]')).toHaveLength(4);
    expect(document.querySelector('[data-map-handle]')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /로 이어짐/ })).toHaveLength(0);
  });

  it('카드를 누르거나 Enter 로 고른다', () => {
    const p = view();
    const card = screen.getByRole('button', { name: '쿠폰이 있으면 왜 사게 되냐고 물음 근거' });
    fireEvent.click(card);
    expect(p.onSelectNode).toHaveBeenCalledWith('a');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(p.onSelectNode).toHaveBeenCalledTimes(2);
  });

  it('고른 카드는 aria-pressed 로 보인다', () => {
    view({ selectedIds: ['a'] });
    expect(
      screen
        .getByRole('button', { name: '쿠폰이 있으면 왜 사게 되냐고 물음 근거' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('장면 열이 있으면 장면 사이 화살표 라벨이 있고(첫 장면·자리 미정에는 없음), 누르면 뒤 장면 id 를 넘긴다', () => {
    const onSelectSceneLink = vi.fn();
    const p = view({ onSelectSceneLink });
    cleanup();
    view({ onSelectSceneLink, groups: [{ ...p.groups[0]!, columns: columns() }, p.groups[1]!] });
    // 평가→동기(이음말 없음), 동기→과정(이음말 있음). 자리 미정으로 가는 화살표는 없다.
    const labels = screen.getAllByRole('button', { name: /에서 .*로 이어짐/ });
    expect(labels).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: '평가에서 동기로 이어짐, 이음말 없음' }),
    ).toBeTruthy();
    const proc = screen.getByRole('button', {
      name: '동기에서 과정로 이어짐, 이음말 질문이 실험으로',
    });
    fireEvent.click(proc);
    expect(onSelectSceneLink).toHaveBeenCalledWith('thr-1', 's-proc');
    cleanup();
    view({
      onSelectSceneLink,
      groups: [{ ...p.groups[0]!, columns: columns() }, p.groups[1]!],
      selectedSceneLinkKey: 'thr-1:s-proc',
    });
    expect(
      screen.getByRole('button', { name: /동기에서 과정로 이어짐/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('지도 조작에 한국어 이름이 있고, [카드 위치 정돈]은 손으로 민 것이 있을 때만 나타난다', () => {
    const p = view();
    const bar = screen.getByRole('toolbar', { name: '지도 조작' });
    expect(within(bar).getByRole('button', { name: '전체 구조' })).toBeTruthy();
    expect(within(bar).queryByRole('button', { name: '카드 위치 정돈' })).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: '확대' }));
    expect(p.onZoom).toHaveBeenCalledWith(1.1);
    fireEvent.click(within(bar).getByRole('button', { name: '축소' }));
    expect(p.onZoom).toHaveBeenCalledWith(0.9);
  });

  it('손으로 민 것이 있으면 [카드 위치 정돈]이 나타나고 누르면 부모에게 알린다', () => {
    const p = view({ hasCustomPositions: true });
    fireEvent.click(screen.getByRole('button', { name: '카드 위치 정돈' }));
    expect(p.onResetPositions).toHaveBeenCalled();
  });

  it('거울 카드(아직 근거 아님)는 그 사실이 읽힌다', () => {
    view({ isMirror: (id) => id === 'm' });
    expect(
      screen.getByRole('button', { name: /아직 안 엮인 것 근거, 아직 근거로 저장되지 않은 원본/ }),
    ).toBeTruthy();
  });

  it('주제 머리의 설정 단추는 부모에게 주제 id 를 넘긴다', () => {
    const p = view();
    fireEvent.click(screen.getByRole('button', { name: '할인 문구와 선택 주제 설정' }));
    expect(p.onOpenThread).toHaveBeenCalledWith('thr-1');
  });

  it('묶음 머리의 ↑↓ 와 접기는 부모에게 주제 id 와 방향을 넘긴다. 접힌 묶음은 카드를 그리지 않는다', () => {
    const onMoveGroup = vi.fn();
    const onToggleGroupCollapsed = vi.fn();
    const p = view({ onMoveGroup, onToggleGroupCollapsed });
    expect(screen.queryByRole('button', { name: /위로 옮기기/ })).toBeNull();
    cleanup();
    view({
      onMoveGroup,
      onToggleGroupCollapsed,
      groups: [
        { ...p.groups[0]!, move: { up: false, down: true, groupSize: 2 } },
        { ...p.groups[1]! },
      ],
    });
    const up = screen.getByRole('button', {
      name: '이어진 주제 2개를 함께 위로 옮기기',
    }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '이어진 주제 2개를 함께 아래로 옮기기' }));
    expect(onMoveGroup).toHaveBeenCalledWith('thr-1', 1);
    fireEvent.click(screen.getByRole('button', { name: '할인 문구와 선택 접기' }));
    expect(onToggleGroupCollapsed).toHaveBeenCalledWith('thr-1');
    cleanup();
    view({
      groups: [{ ...p.groups[0]!, collapsed: true, columns: columns() }, { ...p.groups[1]! }],
      onToggleGroupCollapsed,
    });
    expect(
      screen
        .getByRole('region', { name: '할인 문구와 선택 · 근거 4건' })
        .querySelectorAll('[data-map-node]'),
    ).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /로 이어짐/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: '할인 문구와 선택 펼치기' })).toBeTruthy();
  });

  it('근거가 하나도 없으면 [+ 근거] 로 안내한다', () => {
    view({
      groups: [
        { key: 'unclassified', title: '주제 미정 근거', items: [], dropId: 'drop:unclassified' },
      ],
    });
    expect(screen.getByText(/아직 근거가 없습니다. 위쪽 \[\+ 근거\]/)).toBeTruthy();
  });
});
