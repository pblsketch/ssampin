/**
 * 학년도 마무리 마법사 — 진행 상태(이어하기) + 라벨 규칙 (S2.3).
 *
 * ⚠️ 진행 상태는 **localStorage에만** 저장한다(데이터 파일 아님).
 * "실행 전까지 어떤 파일도 쓰지 않는다"(AC-2 — 단계 이동만으로 data/ mtime 무변경)를
 * 지키기 위해 Settings.wizardProgress 같은 설정 파일 필드를 쓰지 않는다.
 * localStorage는 앱 재시작에도 남으므로 3단계에서 닫고 재진입하면 3단계로 복귀한다(AC-1).
 */

import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { SchoolLevel } from '@domain/entities/Settings';
import { formatSchoolYearKo, formatTermKo, parseTerm } from '@domain/rules/academicCalendar';

export const WIZARD_PROGRESS_STORAGE_KEY = 'ssampin:year-wizard-progress-v1';

export type WizardStep = 1 | 2 | 3 | 4;
export type WizardRole = 'homeroom' | 'subject' | 'admin';

/** 3단계에서 편집하는 새 학년도 프로필 초안 — 실행 성공 후에만 Settings로 반영된다. */
export interface WizardProfileDraft {
  readonly schoolName: string;
  readonly teacherRoles: readonly WizardRole[];
  readonly className: string;
  readonly schoolLevel: SchoolLevel;
  readonly customPeriodDuration?: number;
  readonly maxPeriods: number;
  readonly periodTimes: readonly PeriodTime[];
}

export interface WizardProgress {
  readonly version: 1;
  /** 이 진행이 어느 학기 마감용인지 — 다르면 지난 학기의 잔재로 보고 무시한다. */
  readonly closingTerm: string;
  readonly step: WizardStep;
  readonly profile: WizardProfileDraft;
  readonly savedAt: string; // ISO 8601
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isWizardStep(value: unknown): value is WizardStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/**
 * 저장된 진행 상태 복원. 형식이 깨졌거나, 버전이 다르거나, 마감 학기가 지금과 다르면
 * null(처음부터) — 잘못된 잔재로 마법사를 오염시키지 않는다.
 */
export function loadWizardProgress(
  store: StorageLike,
  expectedClosingTerm: string,
): WizardProgress | null {
  try {
    const raw = store.getItem(WIZARD_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardProgress> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== 1) return null;
    if (typeof parsed.closingTerm !== 'string' || parseTerm(parsed.closingTerm) === null)
      return null;
    if (parsed.closingTerm !== expectedClosingTerm) return null;
    if (!isWizardStep(parsed.step)) return null;
    if (!parsed.profile || typeof parsed.profile !== 'object') return null;
    return parsed as WizardProgress;
  } catch {
    return null;
  }
}

/** 진행 상태 저장 — localStorage 실패(용량 등)는 조용히 무시(이어하기만 포기, 기능 무영향). */
export function saveWizardProgress(store: StorageLike, progress: WizardProgress): void {
  try {
    store.setItem(WIZARD_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // 이어하기 실패는 치명적이지 않다 — 다음 진입 시 1단계부터.
  }
}

export function clearWizardProgress(store: StorageLike): void {
  try {
    store.removeItem(WIZARD_PROGRESS_STORAGE_KEY);
  } catch {
    // no-op
  }
}

/**
 * 실행 버튼 라벨 — "2026학년도를 보관하고 2027학년도 시작하기"(formatSchoolYearKo 동적).
 * 같은 학년도 안의 학기 전환(1학기 → 2학기)이면 학기 단위로 말한다
 * (연도가 같은데 "2026학년도를 보관하고 2026학년도 시작하기"라고 말하지 않는다).
 */
export function buildExecuteLabel(closingTerm: string, nextTerm: string): string {
  const closing = parseTerm(closingTerm);
  const next = parseTerm(nextTerm);
  if (!closing || !next) return '보관하고 새 학기 시작하기';
  if (next.year > closing.year) {
    return `${formatSchoolYearKo(closing.year)}를 보관하고 ${formatSchoolYearKo(next.year)} 시작하기`;
  }
  return `${formatTermKo(closingTerm)}를 보관하고 ${next.semester}학기 시작하기`;
}
