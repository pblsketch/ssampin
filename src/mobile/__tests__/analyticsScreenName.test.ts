import { describe, it, expect } from 'vitest';
import { screenNameOf } from '@mobile/analytics';
import type { MobileRoute } from '@mobile/routing/routes';

/**
 * 이 시험이 지키는 것: **반 이름이 통계로 새지 않는다.**
 *
 * 모바일 주소에는 `classId` 와 `className`(예: "3학년 5반")이 들어간다. 화면 이름을
 * 주소에서 그대로 만들면 학교 반 이름이 통계 표에 그대로 쌓인다.
 */
describe('screenNameOf — 화면 이름에 학교 자료를 담지 않는다', () => {
  it('출결은 담임/수업반 구분만 남기고 반 정보는 버린다', () => {
    const route: MobileRoute = {
      kind: 'attendance',
      classId: 'cls-abc-123',
      className: '3학년 5반',
      period: 4,
      type: 'homeroom',
    };
    const name = screenNameOf(route);
    expect(name).toBe('attendance:homeroom');
    expect(name).not.toContain('cls-abc-123');
    expect(name).not.toContain('3학년');
  });

  it('수업반 상세는 반 id 를 담지 않는다', () => {
    expect(screenNameOf({ kind: 'teachingClass', classId: 'cls-xyz' })).toBe('teachingClass');
  });

  it('탭·구역·도구는 어디를 봤는지 알 수 있게 남긴다', () => {
    expect(screenNameOf({ kind: 'home' })).toBe('home');
    expect(screenNameOf({ kind: 'schedule', seg: 'todo' })).toBe('schedule:todo');
    expect(screenNameOf({ kind: 'moreSection', section: 'settings' })).toBe('more:settings');
    expect(screenNameOf({ kind: 'tool', toolId: 'dice' })).toBe('tool:dice');
  });
});
