// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * PeriodTab 컴포넌트 테스트 — D1~D9
 *
 * 전략: patch를 vi.fn()으로 모킹, 사용자 인터랙션 후 patch 호출 인자 단언.
 * useToastStore는 Zustand store라 jsdom에서 그대로 작동하므로 별도 모킹 불필요.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PeriodTab } from './PeriodTab';
import type { Settings } from '@domain/entities/Settings';

type PatchFn = (p: Partial<Settings>) => void;

// Settings 인터페이스의 필수 필드를 최소한으로 채운 팩토리 함수.
// PeriodTab이 실제로 읽는 필드만 정확히 채우고, 나머지는 as 캐스팅으로 우회.
function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    schoolName: '테스트중',
    className: '1-1',
    teacherName: '테스트',
    subject: '수학',
    schoolLevel: 'middle',
    maxPeriods: 5,
    periodTimes: [
      { period: 1, start: '09:00', end: '09:50' },
      { period: 2, start: '10:00', end: '10:50' },
      { period: 3, start: '11:00', end: '11:50' },
      { period: 4, start: '12:00', end: '12:50' },
      { period: 5, start: '14:00', end: '14:50' }, // 점심 4교시 후 (70분 갭)
    ],
    lunchAfterPeriod: 4,
    seatingRows: 6,
    seatingCols: 6,
    ...overrides,
  } as unknown as Settings;
}

describe('PeriodTab 컴포넌트', () => {
  let patch: PatchFn;

  beforeEach(() => {
    patch = vi.fn() as unknown as PatchFn;
  });

  afterEach(() => {
    cleanup();
  });

  it('D1: [↑] 버튼 클릭 → lunchAfterPeriod 1 감소, patch에 새 위치 포함', () => {
    const settings = makeSettings({ lunchAfterPeriod: 4 });
    render(<PeriodTab draft={settings} patch={patch} />);

    const upBtn = screen.getByRole('button', { name: '점심을 한 교시 위로 옮기기' });
    fireEvent.click(upBtn);

    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        lunchAfterPeriod: 3,
      }),
    );
    // 이전 1·2·3교시 시간은 patch.periodTimes에서 보존되어야 함
    const mockFn = patch as ReturnType<typeof vi.fn>;
    const call = mockFn.mock.calls[0]?.[0] as Partial<Settings>;
    expect(call).toBeDefined();
    expect(call.periodTimes?.[0]).toEqual(settings.periodTimes[0]);
    expect(call.periodTimes?.[1]).toEqual(settings.periodTimes[1]);
    expect(call.periodTimes?.[2]).toEqual(settings.periodTimes[2]);
  });

  it('D2: [↓] 버튼 클릭 → lunchAfterPeriod 1 증가', () => {
    const settings = makeSettings({
      lunchAfterPeriod: 2,
      periodTimes: [
        { period: 1, start: '09:00', end: '09:50' },
        { period: 2, start: '10:00', end: '10:50' },
        // 점심 2교시 후 = 10:50 ~ 12:00 (70분)
        { period: 3, start: '12:00', end: '12:50' },
        { period: 4, start: '13:00', end: '13:50' },
        { period: 5, start: '14:00', end: '14:50' },
      ],
    });
    render(<PeriodTab draft={settings} patch={patch} />);

    const downBtn = screen.getByRole('button', { name: '점심을 한 교시 아래로 옮기기' });
    fireEvent.click(downBtn);

    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ lunchAfterPeriod: 3 }));
  });

  it('D3: lunchAfterPeriod=1일 때 [↑] 버튼 disabled', () => {
    const settings = makeSettings({
      lunchAfterPeriod: 1,
      periodTimes: [
        { period: 1, start: '09:00', end: '09:50' },
        // 점심 1교시 후
        { period: 2, start: '11:00', end: '11:50' },
        { period: 3, start: '12:00', end: '12:50' },
        { period: 4, start: '13:00', end: '13:50' },
        { period: 5, start: '14:00', end: '14:50' },
      ],
    });
    render(<PeriodTab draft={settings} patch={patch} />);

    const upBtn = screen.getByRole('button', { name: '점심을 한 교시 위로 옮기기' });
    expect(upBtn).toBeDisabled();
  });

  it('D4: lunchAfterPeriod가 마지막 가능 위치일 때 [↓] 버튼 disabled', () => {
    // 5교시 배열, 점심 4교시 후 = 마지막 가능 (canMoveDown = 4 < 5-1=4 → false)
    const settings = makeSettings({ lunchAfterPeriod: 4 });
    render(<PeriodTab draft={settings} patch={patch} />);

    const downBtn = screen.getByRole('button', { name: '점심을 한 교시 아래로 옮기기' });
    expect(downBtn).toBeDisabled();
  });

  it('D5: 점심 행에서 키보드 ↑ 화살표 = [↑] 버튼 동작', () => {
    const settings = makeSettings({ lunchAfterPeriod: 4 });
    render(<PeriodTab draft={settings} patch={patch} />);

    // 점심 <tr>는 tabIndex=0 + onKeyDown. text "점심"이 들어있는 tr 찾기
    const lunchCell = screen.getByText('점심');
    const lunchRow = lunchCell.closest('tr');
    expect(lunchRow).not.toBeNull();
    fireEvent.keyDown(lunchRow!, { key: 'ArrowUp' });

    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ lunchAfterPeriod: 3 }));
  });

  it('D6: lunchAfterPeriod 미설정이어도 30분 갭 폴백으로 점심 행 렌더링', () => {
    const settings = makeSettings({
      lunchAfterPeriod: undefined,
      lunchStart: undefined,
      lunchEnd: undefined,
    });
    render(<PeriodTab draft={settings} patch={patch} />);

    // 점심 행이 렌더링되어야 함 (70분 갭이 있으므로 inferLunchAfterPeriod가 4 반환)
    expect(screen.getByText('점심')).toBeInTheDocument();
  });

  it('D7: lunchAfterPeriod 미설정 사용자가 첫 [↑] 클릭 시 lunchAfterPeriod가 patch에 포함됨 (lazy 박힘)', () => {
    const settings = makeSettings({
      lunchAfterPeriod: undefined, // 미설정
      lunchStart: undefined,
      lunchEnd: undefined,
      // 자동 추정으로 4교시 후가 도출되어야 함 (12:50 ~ 14:00 = 70분 갭)
    });
    render(<PeriodTab draft={settings} patch={patch} />);

    const upBtn = screen.getByRole('button', { name: '점심을 한 교시 위로 옮기기' });
    fireEvent.click(upBtn);

    // patch에 lunchAfterPeriod=3이 박힘 (4→3 이동)
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        lunchAfterPeriod: 3,
      }),
    );
  });

  it('D8: 동일 settings로 getLunchBreakIndex 호출 시 학급·교사 호출자가 같은 lunchIndex 얻음', async () => {
    const { getLunchBreakIndex } = await import('@adapters/presenters/timetablePresenter');
    const settings = makeSettings({ lunchAfterPeriod: 3 });
    const classTabResult = getLunchBreakIndex(
      settings.periodTimes,
      settings.lunchStart,
      settings.lunchEnd,
      settings.lunchAfterPeriod,
    );
    const teacherTabResult = getLunchBreakIndex(
      settings.periodTimes,
      settings.lunchStart,
      settings.lunchEnd,
      settings.lunchAfterPeriod,
    );
    expect(classTabResult).toBe(teacherTabResult);
    expect(classTabResult).toBe(3);
  });

  it('D9: 위치 변경 시 lunchStart/lunchEnd도 새 위치 기준으로 갱신', () => {
    const settings = makeSettings({ lunchAfterPeriod: 4, lunchStart: '12:50', lunchEnd: '14:00' });
    render(<PeriodTab draft={settings} patch={patch} />);

    const upBtn = screen.getByRole('button', { name: '점심을 한 교시 위로 옮기기' });
    fireEvent.click(upBtn);

    const mockFn = patch as ReturnType<typeof vi.fn>;
    const call = mockFn.mock.calls[0]?.[0] as Partial<Settings>;
    expect(call).toBeDefined();
    // 3교시 후로 옮기면: lunchStart = 3교시 종료(11:50), lunchEnd = 11:50 + 70분 = 13:00
    expect(call.lunchStart).toBe('11:50');
    expect(call.lunchEnd).toBe('13:00');
  });
});
