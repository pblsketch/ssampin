/**
 * @vitest-environment jsdom
 *
 * 옆핀 위젯 칸 PIN 잠금.
 *
 * 여기서 지키는 것은 **"잠기면 본문을 만들지 않는다"** 하나다. 가리기만 하면
 * 값이 화면 쪽 메모리에 남고 위젯이 데이터까지 불러온다.
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SidePinPinGuard, SIDE_PIN_UNLOCK_MAX_AGE_MS } from './SidePinPinGuard';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { hashPin } from '@domain/rules/pinRules';

const BODY = '3학년 2반 급식';
/** 테스트에서 실제로 칠 PIN — 진짜 해시를 써야 검증이 통과한다 */
const TEST_PIN = '1234';

function setPin(options: {
  loaded?: boolean;
  enabled?: boolean;
  hash?: string | null;
  meal?: boolean;
}): void {
  const current = useSettingsStore.getState();
  useSettingsStore.setState({
    loaded: options.loaded ?? true,
    settings: {
      ...current.settings,
      pin: {
        ...current.settings.pin,
        enabled: options.enabled ?? true,
        pinHash: options.hash === undefined ? hashPin(TEST_PIN) : options.hash,
        protectedFeatures: {
          ...current.settings.pin.protectedFeatures,
          meal: options.meal ?? true,
        },
      },
    },
  });
}

beforeEach(() => {
  useSettingsStore.setState({ loaded: false });
});

afterEach(() => {
  cleanup();
});

describe('옆핀 위젯 잠금', () => {
  test('잠금 대상이 아니면 본문을 그대로 그린다', () => {
    setPin({ meal: false });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.getByText(BODY)).toBeTruthy();
  });

  test('★ 잠기면 본문이 DOM 에 아예 없다 — 가리는 게 아니라 안 만든다', () => {
    setPin({ meal: true });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.queryByText(BODY)).toBeNull();
    expect(screen.getByRole('button', { name: '잠금 해제' })).toBeTruthy();
  });

  test('★ 설정이 아직 안 실렸으면 본문을 그리지 않는다', () => {
    // 이게 없으면 설정이 실리기 전 몇 프레임 동안 잠근 위젯이 그대로 보이고
    // 데이터까지 불러온다. 게이트 4종으로는 절대 안 잡히는 자리다.
    useSettingsStore.setState({ loaded: false });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.queryByText(BODY)).toBeNull();
  });

  test('PIN 을 켜지 않았으면 잠그지 않는다', () => {
    setPin({ enabled: false });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.getByText(BODY)).toBeTruthy();
  });

  test('PIN 을 켰지만 아직 정하지 않았으면(해시 없음) 잠그지 않는다', () => {
    setPin({ hash: null });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.getByText(BODY)).toBeTruthy();
  });

  test('창이 "풀려 있다"고 하면 본문을 보여준다', () => {
    setPin({ meal: true });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={Date.now()}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.getByText(BODY)).toBeTruthy();
  });

  test('★ 12시간이 지난 해제는 만료된다 — 그릴 때마다 잰다', () => {
    setPin({ meal: true });
    const stale = Date.now() - SIDE_PIN_UNLOCK_MAX_AGE_MS - 1_000;

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={stale}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.queryByText(BODY)).toBeNull();
  });

  test('★ 창이 "잠겼다"고 하면 열려 있던 것도 즉시 닫힌다', () => {
    // 본 앱에서 "지금 잠그기"를 눌렀을 때다. 지역 플래그를 안 내리면
    // 패널이 떠 있는 동안 계속 열려 있다.
    setPin({ meal: true });
    const { rerender } = render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={Date.now()}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );
    expect(screen.getByText(BODY)).toBeTruthy();

    rerender(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.queryByText(BODY)).toBeNull();
  });

  test('자물쇠를 누르면 PIN 판이 뜨고, 그동안 "쓰는 중"을 건다', () => {
    // 안 걸면 숫자를 누르는 사이 마우스가 벗어나 패널이 접히고 입력이 날아간다.
    setPin({ meal: true });
    const busyLog: boolean[] = [];

    render(
      <SidePinPinGuard
        feature="meal"
        pinUnlockedAt={null}
        onEditorActivityChange={(busy) => busyLog.push(busy)}
      >
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));

    expect(screen.getByText('PIN을 입력하세요')).toBeTruthy();
    expect(busyLog).toContain(true);
  });

  test('★ PIN 을 맞추면 창의 답을 기다리지 않고 바로 열린다', async () => {
    // 2026-09-01 실기기 신고: "잠기긴 하는데 비밀번호를 입력해도 안 열려".
    // 원인은 "통로가 있으면 창이 정본"이라며 즉시 열기를 조건부로 만든 것이었다.
    // `onUnlocked` 는 항상 있는 함수라 그 조건이 절대 참이 되지 않았고,
    // 안쪽 IPC 가 없으면 조용히 아무 일도 안 일어났다.
    setPin({ meal: true });

    render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null} onUnlocked={() => {}}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
    for (const digit of TEST_PIN.split('')) {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    }

    // PinOverlay 는 성공 연출 뒤에 알려 준다.
    await screen.findByText(BODY, undefined, { timeout: 3_000 });
  });

  test('바로 연 뒤 창이 시각을 확인해 주고, 나중에 잠그면 닫힌다', async () => {
    // 실제 흐름: 화면이 먼저 열고 → 창이 그 사실을 상태로 확인해 주고 →
    // 나중에 잠금이 걸리면(본 앱 "지금 잠그기" 또는 보호 해제 재잠금) 함께 닫힌다.
    setPin({ meal: true });

    const { rerender } = render(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null} onUnlocked={() => {}}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
    for (const digit of TEST_PIN.split('')) {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    }
    await screen.findByText(BODY, undefined, { timeout: 3_000 });

    // 창이 "풀렸다"를 상태로 확인해 준다(패널이 파괴돼도 살아남는 값)
    rerender(
      <SidePinPinGuard feature="meal" pinUnlockedAt={Date.now()} onUnlocked={() => {}}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );
    expect(screen.getByText(BODY)).toBeTruthy();

    // 그 뒤 잠금이 걸린다
    rerender(
      <SidePinPinGuard feature="meal" pinUnlockedAt={null} onUnlocked={() => {}}>
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    expect(screen.queryByText(BODY)).toBeNull();
  });

  test('화면을 떠나면 "쓰는 중"을 반드시 놓는다 — 안 놓으면 영영 안 접힌다', () => {
    setPin({ meal: true });
    const busyLog: boolean[] = [];

    const { unmount } = render(
      <SidePinPinGuard
        feature="meal"
        pinUnlockedAt={null}
        onEditorActivityChange={(busy) => busyLog.push(busy)}
      >
        <p>{BODY}</p>
      </SidePinPinGuard>,
    );

    unmount();

    expect(busyLog[busyLog.length - 1]).toBe(false);
  });
});
