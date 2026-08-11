// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimetableTermRefreshBanner } from '../TimetableTermRefreshBanner';

// globals 미사용 설정이라 자동 정리가 걸리지 않는다 — 테스트마다 직접 언마운트한다.
afterEach(cleanup);

function setup() {
  const onImport = vi.fn();
  const onConfirmUpToDate = vi.fn();
  const onDismiss = vi.fn();
  render(
    <TimetableTermRefreshBanner
      fromTerm="2026-1"
      toTerm="2026-2"
      onImport={onImport}
      onConfirmUpToDate={onConfirmUpToDate}
      onDismiss={onDismiss}
    />,
  );
  return { onImport, onConfirmUpToDate, onDismiss };
}

describe('TimetableTermRefreshBanner', () => {
  it('무엇이 바뀌었는지(지난 학기 → 이번 학기) 보여준다', () => {
    setup();
    const chip = screen.getByLabelText('2026학년도 1학기에서 2026학년도 2학기로 바뀌었어요');
    expect(chip.textContent).toContain('1학기');
    expect(chip.textContent).toContain('2학기');
  });

  it('단정하지 않고 묻는 문구를 쓴다 — 학교마다 실제 학기 시작이 다르다', () => {
    setup();
    // "낡았다/갱신하세요"가 아니라 확인을 요청하는 문장이어야 한다
    expect(screen.getByText(/시간표는 그대로 둘까요/)).toBeTruthy();
    expect(screen.queryByText(/낡았|오래된/)).toBeNull();
  });

  it('불러오기·이미 최신·닫기 세 갈래를 모두 제공한다', async () => {
    const user = userEvent.setup();
    const { onImport, onConfirmUpToDate, onDismiss } = setup();

    await user.click(screen.getByRole('button', { name: '불러오기' }));
    expect(onImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '이미 최신이에요' }));
    expect(onConfirmUpToDate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '이번에는 넘기기' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('하드코딩 색상 없이 sp-* 토큰 기반으로 그린다', () => {
    setup();
    const region = screen.getByRole('region', { name: '새 학기 시간표 확인' });
    expect(region.className).toContain('border-sp-border');
    expect(region.className).toContain('bg-sp-card');
    // sp-* 토큰은 Tailwind 투명도 수식이 무효라 조용히 투명해진다 — 쓰지 않아야 한다
    expect(region.outerHTML).not.toMatch(/sp-(accent|card|surface|text|border|muted)\/\d/);
    expect(region.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
