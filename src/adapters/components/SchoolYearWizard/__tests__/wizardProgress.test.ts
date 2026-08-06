/**
 * wizardProgress — 마법사 이어하기 상태 + 실행 라벨 규칙 (S2.3 AC-1).
 * 진행 상태는 localStorage에만 저장된다(데이터 파일 0) — 저장 매체 계약은
 * SchoolYearWizardModal.test가 "실행 전 storage.write 0회"로 함께 고정한다.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import type { WizardProgress } from '../wizardProgress';
import {
  WIZARD_PROGRESS_STORAGE_KEY,
  buildExecuteLabel,
  canRunYearEndWizard,
  clearWizardProgress,
  loadWizardProgress,
  saveWizardProgress,
} from '../wizardProgress';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const PROFILE: WizardProgress['profile'] = {
  schoolName: '서울미래중학교',
  teacherRoles: ['homeroom'],
  className: '2학년 3반',
  schoolLevel: 'middle',
  maxPeriods: 7,
  periodTimes: [{ period: 1, start: '08:50', end: '09:35' }],
};

function progress(step: 1 | 2 | 3 | 4, closingTerm = '2026-1'): WizardProgress {
  return { version: 1, closingTerm, step, profile: PROFILE, savedAt: '2026-08-06T00:00:00.000Z' };
}

describe('wizardProgress — 이어하기(AC-1)', () => {
  let store: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    store = memoryStorage();
  });

  test('3단계에서 저장 → 같은 학기로 다시 열면 3단계 복귀', () => {
    saveWizardProgress(store, progress(3));
    const loaded = loadWizardProgress(store, '2026-1');
    expect(loaded?.step).toBe(3);
    expect(loaded?.profile).toEqual(PROFILE);
  });

  test('저장이 없으면 null(1단계부터)', () => {
    expect(loadWizardProgress(store, '2026-1')).toBeNull();
  });

  test('마감 학기가 다르면 지난 잔재로 보고 무시한다', () => {
    saveWizardProgress(store, progress(3, '2025-2'));
    expect(loadWizardProgress(store, '2026-1')).toBeNull();
  });

  test('깨진 JSON·버전 불일치·이상한 step은 전부 null(오염 방지)', () => {
    store.setItem(WIZARD_PROGRESS_STORAGE_KEY, '{broken');
    expect(loadWizardProgress(store, '2026-1')).toBeNull();

    store.setItem(WIZARD_PROGRESS_STORAGE_KEY, JSON.stringify({ ...progress(2), version: 2 }));
    expect(loadWizardProgress(store, '2026-1')).toBeNull();

    store.setItem(WIZARD_PROGRESS_STORAGE_KEY, JSON.stringify({ ...progress(2), step: 9 }));
    expect(loadWizardProgress(store, '2026-1')).toBeNull();

    store.setItem(
      WIZARD_PROGRESS_STORAGE_KEY,
      JSON.stringify({ ...progress(2), closingTerm: '이상한값' }),
    );
    expect(loadWizardProgress(store, '이상한값')).toBeNull();
  });

  test('clear 후에는 null', () => {
    saveWizardProgress(store, progress(4));
    clearWizardProgress(store);
    expect(loadWizardProgress(store, '2026-1')).toBeNull();
  });

  test('localStorage 실패는 조용히 무시된다(이어하기만 포기)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('불가');
      },
      setItem: () => {
        throw new Error('불가');
      },
      removeItem: () => {
        throw new Error('불가');
      },
    };
    expect(() => saveWizardProgress(throwing, progress(1))).not.toThrow();
    expect(loadWizardProgress(throwing, '2026-1')).toBeNull();
    expect(() => clearWizardProgress(throwing)).not.toThrow();
  });
});

describe('buildExecuteLabel — 실행 버튼 라벨(formatSchoolYearKo 동적)', () => {
  test('학년도 전환은 학년도 단위로 말한다 (F2: 마법사는 학년도 전환 전용)', () => {
    expect(buildExecuteLabel('2026-2', '2027-1')).toBe('2026학년도를 보관하고 2027학년도 시작하기');
    expect(buildExecuteLabel('2030-2', '2031-1')).toBe('2030학년도를 보관하고 2031학년도 시작하기');
  });

  test('형식이 아니면 일반 라벨로 폴백한다', () => {
    expect(buildExecuteLabel('없는형식', '2027-1')).toBe('보관하고 새 학년도 시작하기');
  });
});

describe('canRunYearEndWizard — F2(B2): 학년도 전환 전용 게이트', () => {
  test('2학기(학년도 말) 마감만 허용한다', () => {
    expect(canRunYearEndWizard('2026-2')).toBe(true);
    expect(canRunYearEndWizard('2030-2')).toBe(true);
  });

  test('1학기 마감(같은 학년도 학기 전환)은 차단한다 — 부활 필터가 학년도 기준(qa3-A)', () => {
    expect(canRunYearEndWizard('2026-1')).toBe(false);
  });

  test('형식이 아니면 차단한다', () => {
    expect(canRunYearEndWizard('없는형식')).toBe(false);
    expect(canRunYearEndWizard('')).toBe(false);
  });
});
