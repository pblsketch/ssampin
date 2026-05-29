// @vitest-environment jsdom
/**
 * β-Step8 — RealtimeWallTabBar 단위 테스트.
 *
 * Plan §2.2 Step 8 (학생 variant) — read-only tab strip.
 *
 * 검증:
 *   - 탭 1개 + student variant → null 반환 (UI 잡음 제거)
 *   - 탭 1개 + teacher variant → 렌더 (+ 버튼 진입점)
 *   - 탭 2개+ → 모두 렌더 + activeTabId 시각 강조
 *   - 클릭 시 onTabChange 호출
 *   - teacher variant + maxTabs → cap 표시 (예: 3/8)
 *   - permission='teacher-only' 배지 표시 (teacher variant)
 *   - role=tablist + aria-selected 접근성
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RealtimeWallTabBar } from './RealtimeWallTabBar';
import type { RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';

afterEach(() => {
  cleanup();
});

const tabA: RealtimeWallTabConfig = {
  id: 'tab-a',
  title: '탭 A',
  permission: 'all',
  order: 0,
};
const tabB: RealtimeWallTabConfig = {
  id: 'tab-b',
  title: '탭 B',
  permission: 'all',
  order: 1,
};
const teacherTab: RealtimeWallTabConfig = {
  id: 'tab-secret',
  title: '교사용',
  permission: 'teacher-only',
  order: 2,
};

describe('RealtimeWallTabBar', () => {
  describe('student variant (기본)', () => {
    it('탭 1개 → null (잡음 제거)', () => {
      const { container } = render(
        <RealtimeWallTabBar tabs={[tabA]} activeTabId="tab-a" onTabChange={() => {}} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('탭 2개+ → 렌더 + role=tablist', () => {
      render(<RealtimeWallTabBar tabs={[tabA, tabB]} activeTabId="tab-a" onTabChange={() => {}} />);
      expect(screen.getByRole('tablist')).not.toBeNull();
    });

    it('activeTabId 의 탭만 aria-selected=true', () => {
      render(<RealtimeWallTabBar tabs={[tabA, tabB]} activeTabId="tab-b" onTabChange={() => {}} />);
      const tabBBtn = screen.getByText('탭 B').closest('button');
      const tabABtn = screen.getByText('탭 A').closest('button');
      expect(tabBBtn?.getAttribute('aria-selected')).toBe('true');
      expect(tabABtn?.getAttribute('aria-selected')).toBe('false');
    });

    it('클릭 시 onTabChange(tabId) 호출', () => {
      const onChange = vi.fn();
      render(<RealtimeWallTabBar tabs={[tabA, tabB]} activeTabId="tab-a" onTabChange={onChange} />);
      fireEvent.click(screen.getByText('탭 B'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('tab-b');
    });

    it('teacher-only 배지 미노출 (student variant 정합)', () => {
      render(
        <RealtimeWallTabBar tabs={[tabA, teacherTab]} activeTabId="tab-a" onTabChange={() => {}} />,
      );
      // student variant 에서는 permission label 미노출 (teacher-only 탭은 broadcast 단에서
      // 제외되는 것이 정상이지만, 본 컴포넌트는 props 그대로 렌더하므로 정합 검증만)
      expect(screen.queryByText('교사만')).toBeNull();
    });
  });

  describe('teacher variant', () => {
    it('탭 1개여도 렌더 (+ 버튼 진입점)', () => {
      render(
        <RealtimeWallTabBar
          tabs={[tabA]}
          activeTabId="tab-a"
          onTabChange={() => {}}
          variant="teacher"
        />,
      );
      expect(screen.getByRole('tablist')).not.toBeNull();
    });

    it('teacher-only / role-gated 배지 노출', () => {
      render(
        <RealtimeWallTabBar
          tabs={[tabA, teacherTab]}
          activeTabId="tab-a"
          onTabChange={() => {}}
          variant="teacher"
        />,
      );
      expect(screen.getByText('교사만')).not.toBeNull();
    });

    it('maxTabs 표시 (cap 8)', () => {
      render(
        <RealtimeWallTabBar
          tabs={[tabA, tabB, teacherTab]}
          activeTabId="tab-a"
          onTabChange={() => {}}
          variant="teacher"
          maxTabs={8}
        />,
      );
      expect(screen.getByText('3/8')).not.toBeNull();
    });

    it('data-tab-bar 속성으로 variant 식별 가능', () => {
      const { container } = render(
        <RealtimeWallTabBar
          tabs={[tabA, tabB]}
          activeTabId="tab-a"
          onTabChange={() => {}}
          variant="teacher"
        />,
      );
      const tablist = container.querySelector('[data-tab-bar]');
      expect(tablist?.getAttribute('data-tab-bar')).toBe('teacher');
    });
  });
});
