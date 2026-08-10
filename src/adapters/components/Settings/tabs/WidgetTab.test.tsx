// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * WidgetTab — "바탕화면 아이콘 아래" 재적용 경로 회귀 테스트.
 *
 * 배경(2026-08-11 사용자 신고): 저장된 값은 'native-desktop'인데 실제로는 붙이기에 실패해
 * 일반 모드로 동작 중인 불일치 상태에서, 라디오가 이미 선택돼 있어 변경 이벤트가 발생하지
 * 않아 사용자가 재시도할 수단이 전혀 없었다. "지금 다시 적용" 버튼이 그 탈출구다.
 *
 * 전략: window.electronAPI를 최소 stub으로 주입하고 클릭 후 호출 인자를 단언.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WidgetTab } from './WidgetTab';
import type { Settings, WidgetDesktopMode } from '@domain/entities/Settings';

type PatchFn = (p: Partial<Settings>) => void;

function makeSettings(desktopMode: WidgetDesktopMode): Settings {
  return {
    schoolName: '테스트중',
    className: '1-1',
    widget: {
      opacity: 0.8,
      cardOpacity: 1,
      transparent: false,
      desktopMode,
      closeAction: 'widget',
      memorySaverMode: true,
    },
  } as unknown as Settings;
}

describe('WidgetTab — 바탕화면 아이콘 아래 재적용', () => {
  let patch: PatchFn;
  let applyWidgetSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    patch = vi.fn() as unknown as PatchFn;
    applyWidgetSettings = vi.fn(() => Promise.resolve());
    (window as unknown as { electronAPI?: unknown }).electronAPI = { applyWidgetSettings };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('이미 native-desktop이 선택된 상태에서도 "지금 다시 적용"으로 재적용 요청을 보낸다', () => {
    render(<WidgetTab draft={makeSettings('native-desktop')} patch={patch} />);

    fireEvent.click(screen.getByTestId('settings-native-desktop-reapply'));

    expect(applyWidgetSettings).toHaveBeenCalledTimes(1);
    expect(applyWidgetSettings).toHaveBeenCalledWith({
      opacity: 0.8,
      desktopMode: 'native-desktop',
    });
    // 값 변경이 아니라 재적용이므로 draft는 건드리지 않는다.
    expect(patch).not.toHaveBeenCalled();
  });

  it('다른 모드에서는 재적용 버튼을 노출하지 않는다', () => {
    render(<WidgetTab draft={makeSettings('normal')} patch={patch} />);

    expect(screen.queryByTestId('settings-native-desktop-reapply')).not.toBeInTheDocument();
  });
});
