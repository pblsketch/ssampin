// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 일정 탭 좌우 화살표 — **보이는 것이 실제로 움직이는지** 검증한다.
 *
 * 왜 필요한가 — 달력은 기본이 "이번 주 한 줄"인데, 화살표가 달만 바꾸면 제목은 다음 달로
 * 가는데 날짜줄은 이번 주 그대로다. 사용자에겐 "버튼이 제목만 바꾸는" 고장으로 보인다.
 *
 * 이 테스트는 날짜줄에 실제로 그려진 날짜를 읽어 비교한다. 되돌리면(화살표를 다시
 * setCurrentMonth 전용으로 바꾸면) 빨간불이 나는 것을 확인했다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@mobile/stores/useMobileEventsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileEventsStore: create(() => ({
      events: [],
      categories: [],
      loaded: true,
      load: async () => {},
      addEvent: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileSettingsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileSettingsStore: create(() => ({
      settings: { className: '', periodTimes: [], neis: { atptCode: '', schoolCode: '' } },
      loaded: true,
      load: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileUiTriggerStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileUiTriggerStore: create(() => ({
      pendingAction: null,
      consumeAction: () => {},
    })),
  };
});

import { SchedulePage } from './SchedulePage';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

/** 달력에 실제로 그려진 날짜들(yyyy-MM-dd). 접힌 상태면 7칸이다. */
function visibleWeekDays(): string[] {
  return [...document.querySelectorAll('[data-day]')].map(
    (el) => el.getAttribute('data-day') ?? '',
  );
}

beforeEach(() => {
  // 기준 시각 고정 — 실행 날짜에 따라 결과가 흔들리지 않게 한다.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-12T09:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('일정 탭 좌우 화살표 (접힌 주 보기)', () => {
  it('다음을 누르면 날짜줄이 실제로 다음 주로 넘어간다', async () => {
    render(<SchedulePage />);
    await flush();

    const before = visibleWeekDays();
    expect(before.length).toBe(7);

    const next = screen.getByRole('button', { name: '다음 주' });
    await act(async () => {
      fireEvent.click(next);
    });

    const after = visibleWeekDays();
    expect(after.length).toBe(7);
    // 핵심: 날짜줄이 그대로면 "제목만 바뀌는" 고장이다.
    expect(after).not.toEqual(before);
  });

  it('이전을 누르면 날짜줄이 실제로 이전 주로 넘어간다', async () => {
    render(<SchedulePage />);
    await flush();

    const before = visibleWeekDays();
    const prev = screen.getByRole('button', { name: '이전 주' });
    await act(async () => {
      fireEvent.click(prev);
    });

    expect(visibleWeekDays()).not.toEqual(before);
  });
});
