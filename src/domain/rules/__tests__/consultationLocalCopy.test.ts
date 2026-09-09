import { describe, it, expect } from 'vitest';
import {
  LOCAL_COPY_MIN_INTERVAL_MS,
  canShowLocalCopy,
  shouldRefreshLocalCopy,
} from '../consultationLocalCopy';

const NOW = new Date('2026-09-09T03:00:00Z');
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

describe('사본을 언제 다시 쓰는가', () => {
  it('사본이 없으면 쓴다', () => {
    expect(shouldRefreshLocalCopy(undefined, NOW)).toBe(true);
  });

  it('하루가 안 지났으면 안 쓴다 — 상세를 여러 번 열어도 쓰기가 몰리지 않는다', () => {
    expect(shouldRefreshLocalCopy(iso(60 * 60 * 1000), NOW)).toBe(false);
  });

  it('하루가 지났으면 쓴다', () => {
    expect(shouldRefreshLocalCopy(iso(LOCAL_COPY_MIN_INTERVAL_MS + 1000), NOW)).toBe(true);
  });

  it('저장 시각이 깨져 있으면 쓴다', () => {
    expect(shouldRefreshLocalCopy('언젠가', NOW)).toBe(true);
  });

  it('기기 시계가 거꾸로 가도 영영 안 쓰는 상태가 되지 않는다', () => {
    expect(shouldRefreshLocalCopy(new Date(NOW.getTime() + 86_400_000).toISOString(), NOW)).toBe(
      true,
    );
  });
});

describe('사본을 언제 보여 주는가', () => {
  it('기한이 지나 닫힌 경우에만 보여 준다', () => {
    expect(canShowLocalCopy('legacy_closed')).toBe(true);
  });

  it('구글 미연결·다른 계정에는 보여 주지 않는다 — 볼 자격을 확인하지 못한 상태다', () => {
    expect(canShowLocalCopy('not_connected')).toBe(false);
    expect(canShowLocalCopy('different_account')).toBe(false);
    expect(canShowLocalCopy('key_mismatch')).toBe(false);
    expect(canShowLocalCopy('owner_bound')).toBe(false);
  });

  it('사유를 모르는 실패(네트워크 등)에도 보여 주지 않는다', () => {
    expect(canShowLocalCopy(null)).toBe(false);
  });
});
