/**
 * useUpdatePreferencesStore 단위 테스트 (PDCA: update-notification-controls D-02/D-06).
 *
 * 본 테스트는 영속화 스토어의 **순수 함수 게이트**를 검증한다:
 * - shouldShowUpdateModal — 4단계 게이트 + 보안 우회
 * - shouldShowSidebarBadge — 4단계 표시 조건
 *
 * Zustand persist middleware 자체 동작(localStorage read/write)은 라이브러리 검증 영역이라
 * 본 PDCA 스코프에서 제외한다. 대신 다음을 통해 회귀를 차단한다:
 *   - 메타 테스트 (useUpdatePreferencesStore.persistence.test.ts) — persist 구성 정합성
 *   - UpdateNotification.persistence.test.ts — 영속화 패턴 강제
 *   - 수동 RG-01~07 시나리오 — 사용자 흐름 검증
 */
import { describe, expect, test } from 'vitest';
import {
  shouldShowUpdateModal,
  shouldShowSidebarBadge,
  type UpdatePreferencesState,
} from './useUpdatePreferencesStore';

const empty: UpdatePreferencesState = {
  lastNotifiedVersion: null,
  snoozeUntil: null,
  skippedVersions: [],
};
const NOW = 1_700_000_000_000;

describe('shouldShowUpdateModal gate', () => {
  test('shows modal for new version with empty state', () => {
    expect(shouldShowUpdateModal('2.0.5', false, empty, NOW)).toBe(true);
  });

  test('hides modal when version is in skippedVersions', () => {
    expect(
      shouldShowUpdateModal('2.0.5', false, { ...empty, skippedVersions: ['2.0.5'] }, NOW)
    ).toBe(false);
  });

  test('hides modal when now < snoozeUntil', () => {
    expect(
      shouldShowUpdateModal('2.0.5', false, { ...empty, snoozeUntil: NOW + 1000 }, NOW)
    ).toBe(false);
  });

  test('hides modal after snooze expired but lastNotifiedVersion blocks re-show', () => {
    // 스누즈 만료됐어도 lastNotifiedVersion 게이트가 자동 재노출 막음 → 사이드바 배지로 폴백.
    // 이 동작이 "알림 폭격 방지" 핵심 (Plan v0.2 RG-03).
    expect(
      shouldShowUpdateModal(
        '2.0.5',
        false,
        { ...empty, snoozeUntil: NOW - 1000, lastNotifiedVersion: '2.0.5' },
        NOW
      )
    ).toBe(false);
  });

  test('hides modal when same version already notified', () => {
    expect(
      shouldShowUpdateModal('2.0.5', false, { ...empty, lastNotifiedVersion: '2.0.5' }, NOW)
    ).toBe(false);
  });

  test('shows modal for NEW version even if older one was notified', () => {
    expect(
      shouldShowUpdateModal('2.0.6', false, { ...empty, lastNotifiedVersion: '2.0.5' }, NOW)
    ).toBe(true);
  });

  test('FORCE shows modal when isSecurity=true (overrides all gates)', () => {
    expect(
      shouldShowUpdateModal(
        '2.0.5',
        true,
        {
          skippedVersions: ['2.0.5'],
          snoozeUntil: NOW + 86_400_000,
          lastNotifiedVersion: '2.0.5',
        },
        NOW
      )
    ).toBe(true);
  });
});

describe('shouldShowSidebarBadge', () => {
  test('shows badge when modal already shown and snooze expired', () => {
    expect(
      shouldShowSidebarBadge(
        '2.0.6',
        '2.0.5',
        { ...empty, lastNotifiedVersion: '2.0.6' },
        NOW
      )
    ).toBe(true);
  });

  test('hides badge when version is not newer than current', () => {
    expect(
      shouldShowSidebarBadge(
        '2.0.5',
        '2.0.5',
        { ...empty, lastNotifiedVersion: '2.0.5' },
        NOW
      )
    ).toBe(false);
  });

  test('hides badge when version was skipped', () => {
    expect(
      shouldShowSidebarBadge(
        '2.0.6',
        '2.0.5',
        { skippedVersions: ['2.0.6'], snoozeUntil: null, lastNotifiedVersion: '2.0.6' },
        NOW
      )
    ).toBe(false);
  });

  test('hides badge when snoozing', () => {
    expect(
      shouldShowSidebarBadge(
        '2.0.6',
        '2.0.5',
        { ...empty, lastNotifiedVersion: '2.0.6', snoozeUntil: NOW + 1000 },
        NOW
      )
    ).toBe(false);
  });

  test('hides badge when modal not yet shown', () => {
    expect(shouldShowSidebarBadge('2.0.6', '2.0.5', empty, NOW)).toBe(false);
  });

  test('compareVersion handles minor/patch correctly', () => {
    // v2.0.10 > v2.0.9 (lexical 비교가 아닌 numeric 비교 보장)
    expect(
      shouldShowSidebarBadge(
        '2.0.10',
        '2.0.9',
        { ...empty, lastNotifiedVersion: '2.0.10' },
        NOW
      )
    ).toBe(true);

    expect(
      shouldShowSidebarBadge(
        '2.0.9',
        '2.0.10',
        { ...empty, lastNotifiedVersion: '2.0.9' },
        NOW
      )
    ).toBe(false);
  });
});
