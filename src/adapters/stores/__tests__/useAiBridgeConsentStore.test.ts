import { describe, expect, it, beforeEach } from 'vitest';
import {
  useAiBridgeConsentStore,
  academicTerm,
  ackKey,
  needsConsent,
  AI_BRIDGE_NOTICE_VERSION,
} from '../useAiBridgeConsentStore';

describe('academicTerm — 한국 학사 학기 키', () => {
  it('3~8월은 해당 연도 1학기', () => {
    expect(academicTerm(new Date('2026-03-01T00:00:00'))).toBe('2026-1');
    expect(academicTerm(new Date('2026-08-31T00:00:00'))).toBe('2026-1');
  });

  it('9~12월은 해당 연도 2학기', () => {
    expect(academicTerm(new Date('2026-09-01T00:00:00'))).toBe('2026-2');
    expect(academicTerm(new Date('2026-12-31T00:00:00'))).toBe('2026-2');
  });

  it('1~2월은 직전 학년도의 2학기(겨울방학)', () => {
    expect(academicTerm(new Date('2026-01-15T00:00:00'))).toBe('2025-2');
    expect(academicTerm(new Date('2026-02-28T00:00:00'))).toBe('2025-2');
  });
});

describe('needsConsent — 고위험 게이트 켜기 전 고지 확인 필요 여부', () => {
  const MAR_2026 = new Date('2026-03-10T00:00:00'); // 2026-1
  const SEP_2026 = new Date('2026-09-10T00:00:00'); // 2026-2

  it('확인 기록이 없으면 true(인라인 확인을 띄워야 함)', () => {
    expect(needsConsent('allowGradeWrite', {}, MAR_2026)).toBe(true);
    expect(needsConsent('allowRecordWrite', {}, MAR_2026)).toBe(true);
  });

  it('같은 학기·버전 확인 기록이 있으면 false(무마찰)', () => {
    const acks = { [ackKey('allowGradeWrite', '2026-1', AI_BRIDGE_NOTICE_VERSION)]: 123 };
    expect(needsConsent('allowGradeWrite', acks, MAR_2026)).toBe(false);
  });

  it('학기가 바뀌면 다시 true(이전 학기 확인은 신규 학기에 적용 안 됨)', () => {
    const acks = { [ackKey('allowGradeWrite', '2026-1', AI_BRIDGE_NOTICE_VERSION)]: 123 };
    expect(needsConsent('allowGradeWrite', acks, SEP_2026)).toBe(true);
  });

  it('고지문 버전이 오르면 다시 true', () => {
    const acks = { [ackKey('allowGradeWrite', '2026-1', AI_BRIDGE_NOTICE_VERSION)]: 123 };
    expect(needsConsent('allowGradeWrite', acks, MAR_2026, AI_BRIDGE_NOTICE_VERSION + 1)).toBe(
      true,
    );
  });

  it('게이트별로 독립 — 채점 쓰기 확인이 생기부 쓰기에 적용되지 않음', () => {
    const acks = { [ackKey('allowGradeWrite', '2026-1', AI_BRIDGE_NOTICE_VERSION)]: 123 };
    expect(needsConsent('allowGradeWrite', acks, MAR_2026)).toBe(false);
    expect(needsConsent('allowRecordWrite', acks, MAR_2026)).toBe(true);
  });
});

describe('useAiBridgeConsentStore — 확인 기록 영속', () => {
  beforeEach(() => useAiBridgeConsentStore.getState().reset());

  it('acknowledge 후 needsConsent가 false가 된다', () => {
    const now = new Date('2026-03-10T00:00:00');
    expect(needsConsent('allowRecordWrite', useAiBridgeConsentStore.getState().acks, now)).toBe(
      true,
    );

    useAiBridgeConsentStore.getState().acknowledge('allowRecordWrite', academicTerm(now));

    expect(needsConsent('allowRecordWrite', useAiBridgeConsentStore.getState().acks, now)).toBe(
      false,
    );
  });

  it('reset은 모든 확인 기록을 비운다', () => {
    useAiBridgeConsentStore.getState().acknowledge('allowGradeWrite', '2026-1');
    expect(Object.keys(useAiBridgeConsentStore.getState().acks)).toHaveLength(1);
    useAiBridgeConsentStore.getState().reset();
    expect(useAiBridgeConsentStore.getState().acks).toEqual({});
  });
});
