/**
 * useUpdatePreferencesStore 영속화 구성 메타 테스트 (PDCA: update-notification-controls).
 *
 * Zustand persist middleware 의 동작 자체는 라이브러리 검증 영역이라
 * 본 메타 테스트는 **구성 정합성**만 grep 기반으로 강제한다:
 *   - persist middleware 사용
 *   - localStorage 키 (ssampin-update-prefs-v1)
 *   - 모든 상태 필드 partialize (lastNotifiedVersion / snoozeUntil / skippedVersions)
 *   - version 슬롯 (마이그레이션 대비)
 *
 * 회귀 차단: 누군가 영속화를 휘발성으로 되돌리거나 키를 바꿔서 기존 사용자 설정이
 * 통째로 날아가는 시나리오를 컴파일 타임 가까이서 잡는다.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(__dirname, 'useUpdatePreferencesStore.ts');
const source = readFileSync(SOURCE_PATH, 'utf-8');

describe('useUpdatePreferencesStore persistence config', () => {
  test('uses persist middleware from zustand/middleware', () => {
    expect(source).toMatch(/from 'zustand\/middleware'/);
    expect(source).toMatch(/persist\(/);
  });

  test('uses createJSONStorage with localStorage', () => {
    expect(source).toMatch(/createJSONStorage\(\(\)\s*=>\s*localStorage\)/);
  });

  test('localStorage key is ssampin-update-prefs-v1 (stable schema)', () => {
    expect(source).toMatch(/name:\s*['"]ssampin-update-prefs-v1['"]/);
  });

  test('partialize persists all three state fields', () => {
    expect(source).toMatch(/lastNotifiedVersion:\s*state\.lastNotifiedVersion/);
    expect(source).toMatch(/snoozeUntil:\s*state\.snoozeUntil/);
    expect(source).toMatch(/skippedVersions:\s*state\.skippedVersions/);
  });

  test('declares version slot for future migration', () => {
    expect(source).toMatch(/version:\s*1/);
  });

  test('snooze action multiplies days by 86_400_000 ms (1 day = 24h)', () => {
    expect(source).toMatch(/days\s*\*\s*86_?400_?000/);
  });

  test('shouldShowUpdateModal bypasses all gates when isSecurity=true', () => {
    expect(source).toMatch(/if\s*\(\s*isSecurity\s*\)\s*return\s+true/);
  });
});
