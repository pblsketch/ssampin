// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 증빙서류 기본값 확대 1회 안내 배너 — 표시 조건·닫기 영속·딥링크 검증.
 *
 * 이 배너의 존재 이유는 "정책 기본값이 넓어져 과거 질병 출결이 한꺼번에 미제출로 잡히는 것"을
 * 예고하는 데 있다. 그래서 **정책을 직접 설정한 사용자에게는 뜨면 안 되고**(영향이 없으므로),
 * **한 번 닫으면 다시 뜨면 안 된다**. 두 조건이 이 테스트의 핵심이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AttendanceDocumentNoticeBanner } from '../AttendanceDocumentNoticeBanner';

const updateMock = vi.fn();
const settingsState: { settings: Record<string, unknown>; update: typeof updateMock } = {
  settings: {},
  update: updateMock,
};

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

beforeEach(() => {
  updateMock.mockClear();
  settingsState.settings = {};
});
afterEach(cleanup);

const BODY = /질병 출결도 증빙서류 대상/;

describe('AttendanceDocumentNoticeBanner — 표시 조건', () => {
  it('정책 미설정 + 아직 안 닫음 → 배너가 뜬다', () => {
    render(<AttendanceDocumentNoticeBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
  });

  it('정책을 직접 설정한 사용자에게는 뜨지 않는다 (기본값 변경의 영향을 안 받음)', () => {
    settingsState.settings = { attendanceDocumentPolicy: { requiredBy: { 인정: ['absent'] } } };
    const { container } = render(<AttendanceDocumentNoticeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('빈 정책({})을 저장해 둔 경우도 "직접 설정"으로 보고 뜨지 않는다', () => {
    // 전부 꺼 둔 학교 — undefined 와 구분해야 한다(기본값 적용 대상이 아니다).
    settingsState.settings = { attendanceDocumentPolicy: { requiredBy: {} } };
    const { container } = render(<AttendanceDocumentNoticeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('이미 닫았으면 다시 뜨지 않는다 (1회성)', () => {
    settingsState.settings = { attendanceDocumentNoticeDismissedAt: '2026-08-27T00:00:00.000Z' };
    const { container } = render(<AttendanceDocumentNoticeBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AttendanceDocumentNoticeBanner — 동작', () => {
  it('닫기를 누르면 닫은 시각을 설정에 저장한다 (재표시 판정 근거)', () => {
    render(<AttendanceDocumentNoticeBanner />);
    fireEvent.click(screen.getByRole('button', { name: '증빙서류 기본값 안내 배너 닫기' }));
    expect(updateMock).toHaveBeenCalledTimes(1);
    const arg = updateMock.mock.calls[0]![0] as { attendanceDocumentNoticeDismissedAt?: string };
    expect(typeof arg.attendanceDocumentNoticeDismissedAt).toBe('string');
    expect(Number.isNaN(Date.parse(arg.attendanceDocumentNoticeDismissedAt!))).toBe(false);
  });

  it('[설정 열기]는 기록 알림 탭으로 가는 딥링크 이벤트를 쏜다', () => {
    const seen: string[] = [];
    const onNavigate = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener('ssampin:navigate', onNavigate);
    try {
      render(<AttendanceDocumentNoticeBanner />);
      fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
      expect(seen).toEqual(['settings#record-reminder']);
    } finally {
      window.removeEventListener('ssampin:navigate', onNavigate);
    }
  });
});
