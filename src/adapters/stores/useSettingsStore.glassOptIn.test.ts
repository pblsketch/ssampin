/*
  투명도 적용 범위 이전 처리 가드.

  배경(2026-08-14): `widget.opacity`·`cardOpacity` 는 원래 **위젯 창에만** 적용되던 값인데,
  대시보드·옆핀도 같은 값을 쓰도록 합쳤다. 그대로 두면 위젯을 반투명하게 맞춰 둔 선생님이
  업데이트했을 때 **아무것도 건드리지 않았는데 대시보드까지 반투명해진다.**
  (실제로 준일님 설정이 cardOpacity 0.45 였다.)

  그래서 이 항목이 없는 예전 설정 파일에는 false 를 넣어 대시보드를 지금 모습 그대로 둔다.

  이 테스트가 지키는 것:
  1. 예전 파일(항목 없음) → false. 이게 뒤집히면 기존 사용자가 놀란다.
  2. 새 설치(저장된 설정 없음) → true. 여기서 false 가 되면 새 사용자는 조절해도
     대시보드가 안 바뀌어, 고치려던 원래 문제가 그대로 재발한다.
  3. 저장된 값이 있으면 존중.

  로직을 복제하지 않고 실제 함수를 부른다 — 복제하면 실제 코드가 바뀌어도 테스트가 통과한다.
*/

import { describe, expect, it } from 'vitest';
import { resolveGlassDashboardOptIn } from './useSettingsStore';

describe('resolveGlassDashboardOptIn — 투명도 적용 범위 이전 처리', () => {
  it('항목이 없는 예전 설정 파일은 false (대시보드를 건드리지 않는다)', () => {
    // 위젯만 반투명하게 맞춰 둔 기존 사용자
    expect(resolveGlassDashboardOptIn({ opacity: 0.05, cardOpacity: 0.45 })).toBe(false);
    // 값이 기본값이어도 마찬가지 — 파일이 있으면 "예전 사용자"다
    expect(resolveGlassDashboardOptIn({ opacity: 1, cardOpacity: 1 })).toBe(false);
    expect(resolveGlassDashboardOptIn({})).toBe(false);
  });

  it('저장된 설정이 없으면 true (새 설치는 그대로 동작해야 한다)', () => {
    expect(resolveGlassDashboardOptIn(undefined)).toBe(true);
    expect(resolveGlassDashboardOptIn(null)).toBe(true);
  });

  it('이미 정해진 값은 그대로 존중한다', () => {
    expect(resolveGlassDashboardOptIn({ glassDashboardOptIn: true })).toBe(true);
    expect(resolveGlassDashboardOptIn({ glassDashboardOptIn: false })).toBe(false);
  });

  it('이상한 값이 들어와도 false 로 안전하게 떨어진다', () => {
    // 판단이 안 서면 "건드리지 않는" 쪽이 안전하다. 놀라게 하는 것보다 낫다.
    expect(resolveGlassDashboardOptIn({ glassDashboardOptIn: 'yes' })).toBe(false);
    expect(resolveGlassDashboardOptIn({ glassDashboardOptIn: 1 })).toBe(false);
    expect(resolveGlassDashboardOptIn({ glassDashboardOptIn: null })).toBe(false);
  });
});
