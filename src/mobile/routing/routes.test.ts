import { describe, it, expect } from 'vitest';
import {
  parsePath,
  toPath,
  tabOf,
  parentOf,
  toolIdToLegacyKey,
  legacyKeyToToolId,
  type MobileRoute,
} from '@mobile/routing/routes';

/** 왕복 검증에 쓸 대표 주소들 */
const ROUTES: readonly MobileRoute[] = [
  { kind: 'home' },
  { kind: 'students', seg: 'homeroom' },
  { kind: 'students', seg: 'teaching' },
  { kind: 'schedule', seg: 'schedule' },
  { kind: 'schedule', seg: 'todo' },
  { kind: 'more' },
  { kind: 'moreSection', section: 'settings' },
  { kind: 'moreSection', section: 'memo' },
  { kind: 'moreSection', section: 'bookmarks' },
  { kind: 'moreSection', section: 'tools' },
  { kind: 'tool', toolId: 'traffic-light' },
  { kind: 'tool', toolId: 'rubric' },
  { kind: 'attendance', classId: 'c1', className: '3학년 2반', period: 3, type: 'class' },
  { kind: 'attendance', classId: 'hr', className: '3-2', period: 0, type: 'homeroom' },
];

describe('routes — 주소 ↔ 화면 상태', () => {
  it('모든 대표 주소가 왕복(toPath → parsePath)해도 같다', () => {
    for (const route of ROUTES) {
      expect(parsePath(toPath(route)), `왕복 실패: ${toPath(route)}`).toEqual(route);
    }
  });

  it('알 수 없는 주소는 던지지 않고 홈으로 폴백한다', () => {
    expect(parsePath('/없는페이지')).toEqual({ kind: 'home' });
    expect(parsePath('/more/알수없음')).toEqual({ kind: 'more' });
    expect(parsePath('')).toEqual({ kind: 'home' });
    expect(parsePath('/')).toEqual({ kind: 'home' });
  });

  it('학생·일정 하위가 빠지면 기본 세그먼트로 간다', () => {
    expect(parsePath('/students')).toEqual({ kind: 'students', seg: 'homeroom' });
    expect(parsePath('/schedule')).toEqual({ kind: 'schedule', seg: 'schedule' });
  });

  it('도구 주소에 tool- 접두사를 넣지 않는다', () => {
    expect(toPath({ kind: 'tool', toolId: 'dice' })).toBe('/more/tools/dice');
    expect(parsePath('/more/tools')).toEqual({ kind: 'moreSection', section: 'tools' });
  });

  it('기존 moreSub 키와 toolId 를 서로 변환한다', () => {
    expect(toolIdToLegacyKey('traffic-light')).toBe('tool-traffic-light');
    expect(legacyKeyToToolId('tool-traffic-light')).toBe('traffic-light');
    // 접두사가 없는 값은 그대로 둔다(이중 변환 방지)
    expect(legacyKeyToToolId('settings')).toBe('settings');
  });

  it('출결 주소에 classId 가 없으면 홈으로 보낸다 (잘못된 반 기록 방지)', () => {
    expect(parsePath('/attendance')).toEqual({ kind: 'home' });
    expect(parsePath('/attendance?period=3&type=class')).toEqual({ kind: 'home' });
  });

  it('출결 주소의 반 이름에 공백·한글이 있어도 왕복한다', () => {
    const route: MobileRoute = {
      kind: 'attendance',
      classId: 'abc-123',
      className: '2학년 5반 (국어)',
      period: 3,
      type: 'class',
    };
    expect(parsePath(toPath(route))).toEqual(route);
  });

  it('period 가 숫자가 아니면 0 으로 떨어진다', () => {
    const r = parsePath('/attendance?classId=c1&className=x&period=abc&type=class');
    expect(r).toEqual({
      kind: 'attendance',
      classId: 'c1',
      className: 'x',
      period: 0,
      type: 'class',
    });
  });

  it('탭 매핑 — 출결 전체화면은 홈 탭에 속한다', () => {
    expect(tabOf({ kind: 'home' })).toBe('home');
    expect(
      tabOf({ kind: 'attendance', classId: 'c', className: '', period: 0, type: 'class' }),
    ).toBe('home');
    expect(tabOf({ kind: 'students', seg: 'teaching' })).toBe('students');
    expect(tabOf({ kind: 'tool', toolId: 'dice' })).toBe('more');
  });

  it('부모 경로 — 도구는 도구 목록으로, 홈은 더 올라갈 데가 없다', () => {
    expect(parentOf({ kind: 'tool', toolId: 'dice' })).toEqual({
      kind: 'moreSection',
      section: 'tools',
    });
    expect(parentOf({ kind: 'moreSection', section: 'settings' })).toEqual({ kind: 'more' });
    expect(parentOf({ kind: 'more' })).toEqual({ kind: 'home' });
    expect(parentOf({ kind: 'home' })).toBeNull();
  });

  it('부모를 따라 올라가면 반드시 홈에서 끝난다 (무한 루프 없음)', () => {
    for (const route of ROUTES) {
      let cur: MobileRoute | null = route;
      let hops = 0;
      while (cur !== null && hops < 10) {
        cur = parentOf(cur);
        hops += 1;
      }
      expect(cur, `${toPath(route)} 에서 부모 추적이 끝나지 않음`).toBeNull();
    }
  });
});
