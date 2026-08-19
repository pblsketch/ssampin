import { describe, expect, it } from 'vitest';
import type { WidgetDefinition } from '@widgets/types';
import { selectSidePinWidgets } from './SelectSidePinWidgets';

function widget(id: string, sidePin?: WidgetDefinition['sidePin']): WidgetDefinition {
  return {
    id,
    name: `${id} 이름`,
    icon: '📌',
    description: '',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: { schoolLevel: [], role: [] },
    component: () => null,
    ...(sidePin === undefined ? {} : { sidePin }),
  };
}

const ok = (id: string) => widget(id, { eligible: true, navigationTarget: 'schedule' as const });

describe('무엇을 올릴 수 있는가', () => {
  it('적격 표시를 빠뜨린 위젯은 올리지 않는다 — 조용히 빠지는 편이 안전하다', () => {
    // 새 위젯을 만들며 이 항목을 잊었을 때 옆핀에 저절로 나타나면, 개인정보가 담긴
    // 위젯이 늘 떠 있는 화면에 실수로 올라갈 수 있다.
    const result = selectSidePinWidgets({
      definitions: [widget('표시없음')],
      selectedIds: ['표시없음'],
    });

    expect(result.items).toEqual([]);
    expect(result.corrections[0]?.reason).toBe('옆핀에서 지원하지 않습니다');
  });

  it('올릴 수 없다고 적힌 위젯은 그 이유를 그대로 돌려준다', () => {
    const result = selectSidePinWidgets({
      definitions: [
        widget('메모', { eligible: false, unavailableReason: '메모 칸이 따로 있습니다' }),
      ],
      selectedIds: ['메모'],
    });

    expect(result.corrections).toEqual([{ id: '메모', reason: '메모 칸이 따로 있습니다' }]);
  });

  it('없어진 위젯도 이유를 남긴다 — 말없이 빠지면 고장 난 줄 안다', () => {
    const result = selectSidePinWidgets({ definitions: [ok('a')], selectedIds: ['사라진것'] });

    expect(result.corrections[0]?.reason).toBe('이 위젯이 더 이상 없습니다');
  });
});

describe('고른 것을 자르지 않는다', () => {
  it('여섯 개를 골랐으면 여섯 개 다 보여준다 — 화면에서 스크롤로 본다', () => {
    // 개수로 잘라내면 설정에서 고른 위젯이 옆핀에서 말없이 사라져,
    // 사용자는 설정이 먹히지 않는다고 여긴다.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const result = selectSidePinWidgets({ definitions: ids.map(ok), selectedIds: ids });

    expect(result.items).toHaveLength(6);
    expect(result.corrections).toEqual([]);
  });

  it('고른 순서를 지킨다', () => {
    const result = selectSidePinWidgets({
      definitions: [ok('a'), ok('b'), ok('c')],
      selectedIds: ['c', 'a'],
    });

    expect(result.items.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('같은 위젯이 두 번 들어 있어도 한 번만 보여준다', () => {
    const result = selectSidePinWidgets({
      definitions: [ok('a'), ok('b')],
      selectedIds: ['a', 'a'],
    });

    expect(result.items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('빠진 자리를 다른 위젯으로 채우지 않는다', () => {
  it('고르지도 않은 위젯을 끼워 넣지 않는다', () => {
    // 목록은 선생님이 대시보드에서 고른 것이다. 하나가 옆핀에 못 올라간다고 해서
    // 다른 것을 대신 넣으면, 왜 그게 거기 있는지 설명할 길이 없다.
    const result = selectSidePinWidgets({
      definitions: [
        widget('빠짐', { eligible: false, unavailableReason: '안 됩니다' }),
        ok('남은것'),
      ],
      selectedIds: ['빠짐'],
    });

    expect(result.items).toEqual([]);
    // 대신 무엇이 왜 빠졌는지는 반드시 알린다 — 말없이 사라지면 고장으로 여긴다.
    expect(result.corrections).toEqual([{ id: '빠짐', reason: '안 됩니다' }]);
  });

  it('고른 것 중 올릴 수 있는 것만 순서대로 남긴다', () => {
    const result = selectSidePinWidgets({
      definitions: [
        ok('a'),
        widget('개인정보', { eligible: false, unavailableReason: '학생 개인정보입니다' }),
        ok('c'),
      ],
      selectedIds: ['a', '개인정보', 'c'],
    });

    expect(result.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(result.corrections.map((c) => c.reason)).toEqual(['학생 개인정보입니다']);
  });
});

describe('아무것도 고르지 않았을 때', () => {
  it('올릴 수 있는 위젯을 전부 등록부 순서대로 채운다', () => {
    // 임의로 앞 몇 개만 채우면, 고르는 설정이 없는 동안 그 개수가 사실상 상한이 된다.
    const result = selectSidePinWidgets({
      definitions: [ok('a'), ok('b'), ok('c'), ok('d'), ok('e')],
      selectedIds: [],
    });

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('기본값을 채울 때 올릴 수 없는 위젯은 아예 건너뛴다', () => {
    // 고른 적도 없는 위젯 때문에 "왜 빠졌는지" 안내가 뜨면, 사용자는 자기가
    // 하지 않은 일에 대한 경고를 보게 된다.
    const result = selectSidePinWidgets({
      definitions: [widget('표시없음'), ok('a'), ok('b'), ok('c')],
      selectedIds: [],
    });

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(result.corrections).toEqual([]);
  });

  it('올릴 수 있는 것이 하나뿐이면 하나만 채운다', () => {
    const result = selectSidePinWidgets({ definitions: [ok('a')], selectedIds: [] });

    expect(result.items).toHaveLength(1);
  });
});

describe('옆핀 안에서 고칠 수 있는가', () => {
  /** 적격 + modalMode 를 함께 지정한 위젯 */
  function editableWidget(id: string, modalMode?: WidgetDefinition['modalMode']): WidgetDefinition {
    return {
      ...widget(id, { eligible: true, navigationTarget: 'schedule' as const }),
      ...(modalMode === undefined ? {} : { modalMode }),
    };
  }

  it("'view+edit' 위젯은 열어 고칠 수 있다", () => {
    const result = selectSidePinWidgets({
      definitions: [editableWidget('할일', 'view+edit')],
      selectedIds: ['할일'],
    });

    expect(result.items[0]?.editable).toBe(true);
  });

  it("'expanded' 위젯은 크게 보기만 한다 — 열어 놓고 못 고치면 고장으로 보인다", () => {
    const result = selectSidePinWidgets({
      definitions: [editableWidget('급식', 'expanded')],
      selectedIds: ['급식'],
    });

    expect(result.items[0]?.editable).toBe(false);
  });

  it('modalMode 를 안 적은 위젯은 못 고치는 쪽으로 둔다 — 늘 떠 있는 창에서는 그 편이 안전하다', () => {
    const result = selectSidePinWidgets({
      definitions: [editableWidget('무설정')],
      selectedIds: ['무설정'],
    });

    expect(result.items[0]?.editable).toBe(false);
  });
});
