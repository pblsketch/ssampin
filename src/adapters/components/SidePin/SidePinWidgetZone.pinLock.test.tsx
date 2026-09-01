/**
 * @vitest-environment jsdom
 *
 * REGRESSION #65 — 옆핀 위젯 칸에 PIN 잠금이 실제로 걸린다.
 *
 * ## 왜 grep 이 아니라 렌더 테스트인가
 *
 * 이 저장소의 회귀 검사는 대부분 소스를 grep 한다. 이 항목만은 그러면 안 된다 —
 * `import { SidePinPinGuard }` 한 줄만 남고 JSX 에서 가드가 빠져도 **grep 은 초록**이다.
 * 실제로 같은 폴더의 `SidePinWidgetZone.privacy.test.tsx` 가 자기 한계를 그렇게 적어 두었다.
 * 그래서 여기서는 **정말로 그려 보고 본문이 없는지** 확인한다.
 *
 * ## 무엇을 지키는가
 *
 * 대시보드에서 PIN 으로 잠근 위젯 4종이 옆핀에서는 그대로 보이던 것이 이 작업의 출발점이다.
 * 그 4종(`today-class`·`events`·`meal`·`todo`)이 옆핀에서도 가려지는지 못박는다.
 * 목록과 자세히 보기 **양쪽 다** 본다 — 한쪽만 막으면 목록에서 자물쇠를 보고
 * [열기]를 눌러 그대로 읽을 수 있다.
 */
import { describe, expect, test, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WidgetDefinition } from '@widgets/types';
import { SidePinWidgetZone } from './SidePinWidgetZone';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { PIN_FEATURE_MAP } from '@widgets/utils/pinFeatureMap';

const SECRET = '가려져야 하는 내용';

/**
 * 이 작업의 대상 — 옆핀에 올릴 수 있으면서(`sidePin.eligible`) 동시에
 * 대시보드에서 잠기는(`PIN_FEATURE_MAP`) 위젯들.
 */
const LEAKING_WIDGET_IDS = ['today-class', 'events', 'meal', 'todo'] as const;

function Body({ isCompactMode = true }: { isCompactMode?: boolean } = {}) {
  return <div>{isCompactMode ? SECRET : `${SECRET} (자세히)`}</div>;
}

function widget(id: string): WidgetDefinition {
  return {
    id,
    name: `${id} 이름`,
    icon: '📌',
    description: '',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: { schoolLevel: [], role: [] },
    component: Body,
    sidePin: { eligible: true, navigationTarget: 'schedule' },
    modalMode: 'view+edit',
  };
}

/** 모든 기능을 잠근 상태로 설정을 세운다 */
function lockEverything(): void {
  const current = useSettingsStore.getState();
  // 키를 손으로 나열하지 않는다 — 나중에 기능이 늘어도 자동으로 잠긴다.
  // (캐스팅 대신 기존 객체를 펼쳐서 만들어 타입을 그대로 지킨다.)
  const allLocked = { ...current.settings.pin.protectedFeatures };
  for (const key of Object.keys(allLocked) as Array<keyof typeof allLocked>) {
    allLocked[key] = true;
  }

  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...current.settings,
      pin: {
        ...current.settings.pin,
        enabled: true,
        pinHash: 'hashed',
        protectedFeatures: allLocked,
      },
    },
  });
}

beforeEach(lockEverything);
afterEach(cleanup);

describe('REGRESSION #65 — 옆핀 위젯 PIN 잠금', () => {
  test('대상 4종이 모두 PIN_FEATURE_MAP 에 있다 — 매핑이 빠지면 조용히 안 잠긴다', () => {
    for (const id of LEAKING_WIDGET_IDS) {
      expect(PIN_FEATURE_MAP[id], `${id} 의 자물쇠 매핑이 없다`).toBeDefined();
    }
  });

  test.each(LEAKING_WIDGET_IDS)('%s — 목록에서 본문이 DOM 에 없다', (id) => {
    render(
      <SidePinWidgetZone
        definitions={[widget(id)]}
        selectedIds={[id]}
        onOpenInApp={() => {}}
        pinUnlockedAt={null}
      />,
    );

    expect(screen.queryByText(SECRET)).toBeNull();
    expect(screen.getByRole('button', { name: '잠금 해제' })).toBeTruthy();
  });

  test.each(LEAKING_WIDGET_IDS)('%s — 열어서 봐도 본문이 DOM 에 없다', (id) => {
    render(
      <SidePinWidgetZone
        definitions={[widget(id)]}
        selectedIds={[id]}
        onOpenInApp={() => {}}
        pinUnlockedAt={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: `${id} 이름 열기` }));

    expect(screen.queryByText(`${SECRET} (자세히)`)).toBeNull();
  });

  test('잠금을 풀어 둔 상태에서는 본문이 보인다 — 잠그기만 하고 못 여는 것도 결함이다', () => {
    render(
      <SidePinWidgetZone
        definitions={[widget('meal')]}
        selectedIds={['meal']}
        onOpenInApp={() => {}}
        pinUnlockedAt={Date.now()}
      />,
    );

    expect(screen.getByText(SECRET)).toBeTruthy();
  });

  test('잠금 대상이 아닌 위젯은 그대로 보인다', () => {
    // `mini-calendar` 는 옆핀에 올라가지만 PIN_FEATURE_MAP 에 없다.
    expect(PIN_FEATURE_MAP['mini-calendar']).toBeUndefined();

    render(
      <SidePinWidgetZone
        definitions={[widget('mini-calendar')]}
        selectedIds={['mini-calendar']}
        onOpenInApp={() => {}}
        pinUnlockedAt={null}
      />,
    );

    expect(screen.getByText(SECRET)).toBeTruthy();
  });
});
