/**
 * F8c(RT1) — 모바일 학년도 전환 감지(단일 신호: settings.currentTerm 전진) 단위 테스트.
 * 스토어의 syncFromCloud가 다운로드 전/후 raw settings를 비교해 이 판정으로 1회 안내를 띄운다.
 */
import { describe, expect, it, vi } from 'vitest';

// useMobileDriveSyncStore 모듈은 top-level에서 @mobile/di/container를 import한다 —
// node 테스트 환경에서 어댑터 생성 부작용이 없도록 스텁으로 대체(순수 함수만 검증).
vi.mock('@mobile/di/container', () => ({
  getDriveSyncAdapter: () => ({}),
  driveSyncRepository: {},
  storage: {},
}));

import { isYearTransitionAdvance } from '../useMobileDriveSyncStore';

describe('isYearTransitionAdvance — currentTerm 전진 감지', () => {
  it('학년도·학기가 전진하면 true', () => {
    expect(isYearTransitionAdvance('2026-2', '2027-1')).toBe(true);
    expect(isYearTransitionAdvance('2026-1', '2026-2')).toBe(true);
  });

  it('없던 currentTerm이 생기면(다른 기기의 첫 전환) true', () => {
    expect(isYearTransitionAdvance(undefined, '2027-1')).toBe(true);
  });

  it('동일·후퇴·after 부재는 false (안내 없음)', () => {
    expect(isYearTransitionAdvance('2027-1', '2027-1')).toBe(false);
    expect(isYearTransitionAdvance('2027-1', '2026-2')).toBe(false);
    expect(isYearTransitionAdvance('2027-1', undefined)).toBe(false);
    expect(isYearTransitionAdvance(undefined, undefined)).toBe(false);
  });

  it('파싱 불가 값 방어 — after 불량=false, before 불량=전진 취급', () => {
    expect(isYearTransitionAdvance('2026-2', '이상한값')).toBe(false);
    expect(isYearTransitionAdvance('이상한값', '2027-1')).toBe(true);
  });
});
