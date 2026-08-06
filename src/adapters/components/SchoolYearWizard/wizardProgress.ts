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
import { formatSchoolYearKo, parseTerm } from '@domain/rules/academicCalendar';

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
  /**
   * 구조 승계(S4.3) opt-in — 전환 성공 후 아카이브의 수업반 틀(이름·과목·그룹 구조만,
   * 학생·좌석 제외)을 새 수업반으로 만들지. 기본 OFF(undefined=false).
   * Settings에는 반영되지 않는다(profileToSettingsPatch 미포함 — 마법사 초안 전용).
   */
  readonly carryClassStructure?: boolean;
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
 * F2(B2) — 마법사는 **학년도 전환 전용**이다: closingTerm이 2학기(학년도 말)일 때만 실행한다.
 * 같은 학년도 안의 학기 전환(1학기 마감 → 2학기)은
 *  ① 옛 학년도 부활 필터(S2.2b)가 학년도 기준이라 원리적으로 못 막고(qa3-A),
 *  ② 담임 축(출결·누가기록)은 학년도를 관통해야 해서 학기에 끊으면 안 된다(계획 §3 개념 모델).
 * 학기 정리는 수업 관리의 "수업반 보관"(P1)이 담당한다.
 * (임의 시점 담임 교체 케이스는 후속 트랙 — plan §13.5 등재.)
 */
export function canRunYearEndWizard(closingTerm: string): boolean {
  return parseTerm(closingTerm)?.semester === 2;
}

/** F2 차단 안내 — 진입점(설정 탭)에서 시작 버튼 비활성과 함께 표시한다. */
export const WIZARD_SEMESTER_BLOCK_MESSAGE =
  "학년도 마무리는 2학기(학년도 말)에 실행할 수 있어요. 학기 정리는 수업 관리의 '수업반 보관'을 사용해 주세요.";

/**
 * 실행 버튼 라벨 — "2026학년도를 보관하고 2027학년도 시작하기"(formatSchoolYearKo 동적).
 * F2(B2): 마법사가 학년도 전환 전용이 되면서 같은 학년도 학기 변형은 제거됐다 —
 * 1학기 마감은 canRunYearEndWizard가 진입 자체를 막는다.
 */
export function buildExecuteLabel(closingTerm: string, nextTerm: string): string {
  const closing = parseTerm(closingTerm);
  const next = parseTerm(nextTerm);
  if (!closing || !next) return '보관하고 새 학년도 시작하기';
  return `${formatSchoolYearKo(closing.year)}를 보관하고 ${formatSchoolYearKo(next.year)} 시작하기`;
}
