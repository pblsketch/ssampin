/**
 * 두 칸 배치 규칙 — 우선순위를 여기서 못박는다.
 *
 * 이 규칙이 뒤집히면 **메모가 띠로 접힌 상태에서 메모를 쓸 방법이 사라진다.**
 * 그래서 "편집이 이긴다"를 전수 조합으로 확인한다.
 */
import { describe, expect, test } from 'vitest';
import type { SidePinZone } from '@domain/entities/SidePinRuntimeState';
import { resolveSidePinZoneLayout } from './sidePinZoneLayout';

describe('들어온 칸이 화면을 거의 다 쓴다', () => {
  test('위젯으로 들어오면 위젯이 전체, 메모는 띠', () => {
    const layout = resolveSidePinZoneLayout({
      activeZone: 'widget',
      memoEditing: false,
      widgetEditing: false,
    });

    expect(layout.widget.kind).toBe('full');
    expect(layout.memo.kind).toBe('band');
  });

  test('메모로 들어오면 거울이다', () => {
    const layout = resolveSidePinZoneLayout({
      activeZone: 'memo',
      memoEditing: false,
      widgetEditing: false,
    });

    expect(layout.memo.kind).toBe('full');
    expect(layout.widget.kind).toBe('band');
  });

  test('띠는 누를 수 있다 — 접힌 칸으로 돌아갈 유일한 길이다', () => {
    const layout = resolveSidePinZoneLayout({
      activeZone: 'widget',
      memoEditing: false,
      widgetEditing: false,
    });

    expect(layout.memo.expandable).toBe(true);
  });

  test.each([['both'], [null]] as const)(
    '가리킨 곳이 없으면(%s) 둘 다 보여 준다 — 앱이 대신 고르지 않는다',
    (activeZone) => {
      const layout = resolveSidePinZoneLayout({
        activeZone: activeZone as SidePinZone | null,
        memoEditing: false,
        widgetEditing: false,
      });

      expect(layout.widget.kind).toBe('shared');
      expect(layout.memo.kind).toBe('shared');
    },
  );
});

describe('편집이 이긴다', () => {
  test('메모를 쓰는 중이면 위젯으로 들어왔어도 메모가 펼쳐진다', () => {
    // 이 순서가 뒤집히면 메모가 띠로 접힌 채라 쓰던 글을 볼 수 없다.
    const layout = resolveSidePinZoneLayout({
      activeZone: 'widget',
      memoEditing: true,
      widgetEditing: false,
    });

    expect(layout.memo.kind).toBe('full');
    expect(layout.widget.kind).toBe('band');
  });

  test('위젯을 고치는 중이면 메모로 들어왔어도 위젯이 펼쳐진다', () => {
    const layout = resolveSidePinZoneLayout({
      activeZone: 'memo',
      memoEditing: false,
      widgetEditing: true,
    });

    expect(layout.widget.kind).toBe('full');
    expect(layout.memo.kind).toBe('band');
  });

  test('편집 때문에 접힌 띠는 누를 수 없다 — 눌러도 편집이 이겨 그대로다', () => {
    const layout = resolveSidePinZoneLayout({
      activeZone: null,
      memoEditing: true,
      widgetEditing: false,
    });

    expect(layout.widget.kind).toBe('band');
    expect(layout.widget.expandable).toBe(false);
  });
});

describe('전수 조합 — 두 칸이 동시에 접히지 않는다', () => {
  const zones: readonly (SidePinZone | null)[] = ['widget', 'memo', 'both', null];

  test('어떤 입력에서도 빈 패널이 되지 않는다', () => {
    for (const activeZone of zones) {
      for (const memoEditing of [false, true]) {
        for (const widgetEditing of [false, true]) {
          const layout = resolveSidePinZoneLayout({ activeZone, memoEditing, widgetEditing });
          const bothCollapsed = layout.widget.kind === 'band' && layout.memo.kind === 'band';
          expect(
            bothCollapsed,
            `activeZone=${String(activeZone)} memo=${memoEditing} widget=${widgetEditing}`,
          ).toBe(false);
        }
      }
    }
  });

  test('둘 다 편집 중으로 들어와도 한쪽만 접힌다', () => {
    // 실제로는 한 칸이 띠면 그 안에서 편집을 시작할 수 없어 동시에 참일 수 없다.
    // 그래도 방어한다 — 둘 다 접히면 사용자가 되돌릴 방법이 없다.
    const layout = resolveSidePinZoneLayout({
      activeZone: null,
      memoEditing: true,
      widgetEditing: true,
    });

    expect(layout.memo.kind).toBe('full');
    expect(layout.widget.kind).toBe('band');
  });
});
