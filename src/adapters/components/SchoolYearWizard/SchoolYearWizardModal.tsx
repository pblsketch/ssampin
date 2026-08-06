/**
 * SchoolYearWizardModal — 학년도 마무리 마법사 컨테이너 (S2.3, 4단계).
 *
 * 핵심 계약:
 *  - **실행 전까지 어떤 데이터 파일도 쓰지 않는다**(AC-2). 단계 이동·프로필 편집은
 *    localStorage 진행 상태(wizardProgress)에만 남는다 — 3단계에서 닫고 재진입하면 3단계 복귀(AC-1).
 *  - 실행은 기존 유즈케이스 executeYearTransition만 경유한다(신규 저장 경로 0).
 *    localStorage 3키 스냅샷(SnapshotLocalStorage)·진행 표시는 전부 deps 주입 경계에서
 *    데코레이터로 처리한다 — ExecuteYearTransition 본문 무수정.
 *  - 실패 시 사용자 언어 사유 + 안전 백업 경로 + "데이터는 그대로 있어요"를 함께 보여준다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { reloadStores } from '@adapters/hooks/useDriveSync';
import { storage } from '@adapters/di/container';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { Settings } from '@domain/entities/Settings';
import {
  deriveNextTerm,
  executeYearTransition,
  YEAR_TRANSITION_STATE_KEY,
} from '@usecases/schoolYear/ExecuteYearTransition';
import type {
  YearTransitionDeps,
  YearTransitionGateway,
  YearTransitionResult,
} from '@usecases/schoolYear/ExecuteYearTransition';
import {
  LOCAL_SNAPSHOT_KEY,
  buildLocalStorageSnapshot,
  withLocalSnapshotInArchive,
  writeLocalStorageSnapshot,
} from '@usecases/schoolYear/SnapshotLocalStorage';
import { formatTermKo } from '@domain/rules/academicCalendar';
import type { ArchiveScopeCount } from './archiveScope';
import { readArchiveScopeCounts } from './archiveScope';
import { Step1Intro } from './Step1Intro';
import { Step2Scope } from './Step2Scope';
import { Step3Profile } from './Step3Profile';
import { Step4Confirm } from './Step4Confirm';
import {
  buildExecuteLabel,
  clearWizardProgress,
  loadWizardProgress,
  saveWizardProgress,
  type WizardProfileDraft,
  type WizardStep,
} from './wizardProgress';
import { invalidateArchivedTermNoticeCache } from './ArchivedTermNotice';

/** 실행 5단계 라벨 — 유즈케이스 로그(1/5~5/5)와 같은 순서. */
const RUN_STEP_LABELS: readonly string[] = [
  '안전 백업 만들기',
  '보관함에 복사하기',
  '보관 사본 검증하기',
  '새 학기 준비(라이브 정리)',
  '마무리',
];

type WizardPhase = 'form' | 'running' | 'done' | 'failed';

interface FailureInfo {
  readonly error: string;
  readonly safetyBackupPath?: string;
}

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** 마감할 학기('2026-1' 형식). */
  readonly closingTerm: string;
  /** 렌더러 IPC 게이트웨이 — null이면 열 수 없다(호출자가 진입을 막는다). */
  readonly gateway: YearTransitionGateway;
  /** 중단된 전환 이어하기로 진입하면 true — ④단계에서 시작. */
  readonly resumePending?: boolean;
  /** 전환/이어하기 성공 후 호출(보관함 목록 갱신 등). */
  readonly onCompleted?: (result: Extract<YearTransitionResult, { ok: true }>) => void;
}

function profileFromSettings(settings: Settings): WizardProfileDraft {
  return {
    schoolName: settings.schoolName,
    teacherRoles: settings.teacherRoles ?? [],
    className: settings.className,
    schoolLevel: settings.schoolLevel,
    ...(settings.customPeriodDuration !== undefined
      ? { customPeriodDuration: settings.customPeriodDuration }
      : {}),
    maxPeriods: settings.maxPeriods,
    periodTimes: settings.periodTimes,
  };
}

/** 실행 성공 후 Settings에 반영할 프로필 patch(§ 실행 성공 시에만 호출). */
export function profileToSettingsPatch(profile: WizardProfileDraft): Partial<Settings> {
  return {
    schoolName: profile.schoolName,
    teacherRoles: profile.teacherRoles.length > 0 ? profile.teacherRoles : undefined,
    className: profile.teacherRoles.includes('homeroom') ? profile.className : '',
    schoolLevel: profile.schoolLevel,
    ...(profile.customPeriodDuration !== undefined
      ? { customPeriodDuration: profile.customPeriodDuration }
      : {}),
    maxPeriods: profile.maxPeriods,
    periodTimes: profile.periodTimes,
  };
}

export function SchoolYearWizardModal({
  isOpen,
  onClose,
  closingTerm,
  gateway,
  resumePending = false,
  onCompleted,
}: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const nextTerm = deriveNextTerm(closingTerm) ?? closingTerm;

  const [step, setStep] = useState<WizardStep>(1);
  const [profile, setProfile] = useState<WizardProfileDraft>(() => profileFromSettings(settings));
  const [counts, setCounts] = useState<ReadonlyMap<string, ArchiveScopeCount> | null>(null);
  const [phase, setPhase] = useState<WizardPhase>('form');
  const [runStep, setRunStep] = useState(0);
  const [failure, setFailure] = useState<FailureInfo | null>(null);
  const [doneResult, setDoneResult] = useState<Extract<YearTransitionResult, { ok: true }> | null>(
    null,
  );
  const [devicesConfirmed, setDevicesConfirmed] = useState(false);
  const initializedRef = useRef(false);

  // 열릴 때 1회: 저장된 진행 복원(이어하기 진입이면 ④ 고정) — AC-1.
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    setPhase('form');
    setFailure(null);
    setDoneResult(null);
    setRunStep(0);
    setDevicesConfirmed(false);
    const saved = loadWizardProgress(window.localStorage, closingTerm);
    if (resumePending) {
      setStep(4);
      setProfile(saved?.profile ?? profileFromSettings(settings));
      return;
    }
    if (saved) {
      setStep(saved.step);
      setProfile(saved.profile);
    } else {
      setStep(1);
      setProfile(profileFromSettings(settings));
    }
    // settings는 초기값 시드로만 쓴다 — 열려 있는 동안의 외부 변경이 편집을 덮지 않게 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, closingTerm, resumePending]);

  // 단계·프로필이 바뀔 때마다 localStorage에만 저장(데이터 파일 쓰기 0) — AC-1·AC-2.
  useEffect(() => {
    if (!isOpen || phase !== 'form') return;
    saveWizardProgress(window.localStorage, {
      version: 1,
      closingTerm,
      step,
      profile,
      savedAt: new Date().toISOString(),
    });
  }, [isOpen, phase, step, profile, closingTerm]);

  // ②·④단계 건수는 읽기 전용 조회 — 쓰기 없음.
  useEffect(() => {
    if (!isOpen || counts !== null || (step !== 2 && step !== 4)) return;
    let alive = true;
    void readArchiveScopeCounts(storage).then((result) => {
      if (alive) setCounts(result);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, step, counts]);

  const syncEnabled = Boolean(settings.sync?.enabled);
  const canExecute = phase === 'form' && (!syncEnabled || devicesConfirmed);

  const bumpRunStep = useCallback((n: number) => {
    setRunStep((prev) => Math.max(prev, n));
  }, []);

  /** 진행 표시용 deps 데코레이터 — 유즈케이스 무수정으로 1/5~5/5를 관측한다. */
  const buildDeps = useCallback((): YearTransitionDeps => {
    const trackedStorage: IStoragePort = {
      read: (k) => storage.read(k),
      write: (k, d) => {
        // 상태 파일·스냅샷 외의 데이터 파일 쓰기 = 라이브 리셋 국면(4/5).
        if (k !== YEAR_TRANSITION_STATE_KEY && k !== LOCAL_SNAPSHOT_KEY) bumpRunStep(4);
        return storage.write(k, d);
      },
      remove: (k) => {
        if (k !== YEAR_TRANSITION_STATE_KEY) bumpRunStep(4);
        return storage.remove(k);
      },
      readBinary: (p) => storage.readBinary(p),
      writeBinary: (p, b) => storage.writeBinary(p, b),
      removeBinary: (p) => storage.removeBinary(p),
      listBinary: (d) => storage.listBinary(d),
    };
    const inner = withLocalSnapshotInArchive(gateway);
    const trackedGateway: YearTransitionGateway = {
      createSafetyBackup: () => {
        bumpRunStep(1);
        return inner.createSafetyBackup();
      },
      archiveCreate: (term, fileKeys, opts) => {
        bumpRunStep(2);
        return inner.archiveCreate(term, fileKeys, opts);
      },
      archiveRead: (term, fileKey) => {
        bumpRunStep(3);
        return inner.archiveRead(term, fileKey);
      },
    };
    return {
      storage: trackedStorage,
      gateway: trackedGateway,
      getCurrentTerm: async () => useSettingsStore.getState().settings.currentTerm,
      setCurrentTerm: async (term) => {
        bumpRunStep(5);
        await useSettingsStore.getState().update({ currentTerm: term });
      },
      // useDriveSync.reloadStores는 mutable string[]을 받는다 — readonly 계약에 맞춰 복사.
      reloadStores: (filenames) => reloadStores([...filenames]),
    };
  }, [gateway, bumpRunStep]);

  const runTransition = useCallback(async () => {
    setPhase('running');
    setFailure(null);
    setRunStep(0);
    try {
      // 실행 직전: localStorage 전용 데이터(성적 기준 등) 스냅샷 → 아카이브 대상에 포함.
      const snapshot = buildLocalStorageSnapshot(closingTerm, (k) =>
        window.localStorage.getItem(k),
      );
      await writeLocalStorageSnapshot(storage, snapshot);
    } catch (err) {
      setPhase('failed');
      setFailure({ error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const result = await executeYearTransition(buildDeps(), {
      closingTerm,
      label: `${formatTermKo(closingTerm)} 마무리`,
    });

    if (result.ok) {
      // 새 학년도 프로필은 전환이 성공한 뒤에만 실제 설정으로 반영한다.
      await useSettingsStore.getState().update(profileToSettingsPatch(profile));
      clearWizardProgress(window.localStorage);
      invalidateArchivedTermNoticeCache();
      setDoneResult(result);
      setPhase('done');
      onCompleted?.(result);
    } else {
      setPhase('failed');
      setFailure({
        error: result.error,
        ...(result.safetyBackupPath ? { safetyBackupPath: result.safetyBackupPath } : {}),
      });
    }
  }, [closingTerm, profile, buildDeps, onCompleted]);

  const executeLabel = useMemo(
    () => buildExecuteLabel(closingTerm, nextTerm),
    [closingTerm, nextTerm],
  );

  const stepTitles: Record<WizardStep, string> = {
    1: '안내',
    2: '범위 확인',
    3: '새 학년도 프로필',
    4: '요약·실행',
  };

  const handleClose = () => {
    if (phase === 'running') return; // 실행 중에는 닫지 않는다(중단 상태 방지 — 재개는 별도 경로)
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="학년도 마무리 마법사"
      srOnlyTitle
      size="lg"
      closeOnBackdrop={false}
      closeOnEsc={phase !== 'running'}
    >
      <div className="flex max-h-[min(720px,calc(100vh-96px))] flex-col">
        {/* 헤더 + 단계 표시 */}
        <div className="border-b border-sp-border px-6 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-sp-text">학년도 마무리</h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={phase === 'running'}
              aria-label="닫기"
              className="rounded-lg p-1 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
            >
              <span aria-hidden className="material-symbols-outlined text-icon-md">
                close
              </span>
            </button>
          </div>
          {phase === 'form' && (
            <ol className="mt-3 flex items-center gap-1.5">
              {([1, 2, 3, 4] as const).map((s) => (
                <li key={s} className="flex flex-1 items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-caption font-bold ${
                      s === step
                        ? 'bg-sp-accent text-sp-accent-fg'
                        : s < step
                          ? 'bg-sp-surface text-sp-accent'
                          : 'bg-sp-surface text-sp-muted'
                    }`}
                  >
                    {s < step ? (
                      <span aria-hidden className="material-symbols-outlined text-sm">
                        check
                      </span>
                    ) : (
                      s
                    )}
                  </span>
                  <span
                    className={`truncate text-caption ${s === step ? 'font-bold text-sp-text' : 'text-sp-muted'}`}
                  >
                    {stepTitles[s]}
                  </span>
                  {s < 4 && <span className="h-px flex-1 bg-sp-border" />}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-5" data-modal-fallback tabIndex={-1}>
          {phase === 'form' && step === 1 && <Step1Intro closingTerm={closingTerm} />}
          {phase === 'form' && step === 2 && <Step2Scope counts={counts} />}
          {phase === 'form' && step === 3 && (
            <Step3Profile profile={profile} onChange={setProfile} />
          )}
          {phase === 'form' && step === 4 && (
            <Step4Confirm
              closingTerm={closingTerm}
              nextTerm={nextTerm}
              profile={profile}
              counts={counts}
              syncEnabled={syncEnabled}
              devicesConfirmed={devicesConfirmed}
              onDevicesConfirmedChange={setDevicesConfirmed}
              resuming={resumePending}
            />
          )}

          {phase === 'running' && (
            <div className="space-y-4 py-4">
              <h3 className="text-lg font-bold text-sp-text">전환을 진행하고 있어요…</h3>
              <ol className="space-y-2">
                {RUN_STEP_LABELS.map((label, i) => {
                  const n = i + 1;
                  const state = runStep > n ? 'done' : runStep === n ? 'active' : 'waiting';
                  return (
                    <li key={label} className="flex items-center gap-3">
                      {state === 'done' ? (
                        <span
                          aria-hidden
                          className="material-symbols-outlined text-icon-md text-emerald-400"
                        >
                          check_circle
                        </span>
                      ) : state === 'active' ? (
                        <span
                          aria-hidden
                          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sp-accent border-t-transparent"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="material-symbols-outlined text-icon-md text-sp-muted"
                        >
                          circle
                        </span>
                      )}
                      <span
                        className={`text-sm ${state === 'waiting' ? 'text-sp-muted' : 'text-sp-text'}`}
                      >
                        {n}/5 {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-sp-muted">
                창을 닫지 말고 잠시만 기다려 주세요. 문제가 생기면 어떤 단계에서 멈췄는지와 함께
                안내해 드려요.
              </p>
            </div>
          )}

          {phase === 'failed' && failure && (
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3">
                <span aria-hidden className="material-symbols-outlined text-3xl text-red-400">
                  error
                </span>
                <div>
                  <h3 className="text-lg font-bold text-sp-text">전환을 진행하지 못했어요</h3>
                  <p className="mt-1 text-sm leading-relaxed text-sp-muted">{failure.error}</p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-bold text-sp-text">데이터는 그대로 있어요</p>
                <p className="mt-1 text-xs leading-relaxed text-sp-muted">
                  전환은 보관 사본이 완성된 뒤에만 라이브 데이터를 정리하도록 설계돼 있어요. 실패한
                  지점까지의 기록은 모두 그대로 남아 있어요.
                </p>
                {failure.safetyBackupPath && (
                  <p className="mt-2 break-all text-xs text-sp-muted">
                    안전 백업 위치: <span className="text-sp-text">{failure.safetyBackupPath}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === 'done' && doneResult && (
            <div className="space-y-4 py-6 text-center">
              <span
                aria-hidden
                className="material-symbols-outlined mx-auto text-5xl text-emerald-400"
              >
                task_alt
              </span>
              <div>
                <h3 className="text-xl font-bold text-sp-text">
                  {formatTermKo(doneResult.closingTerm)}를 보관했어요
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                  {formatTermKo(doneResult.nextTerm)}를 깨끗한 상태로 시작해요. 보관된 기록{' '}
                  {doneResult.archivedEntryCount}개 항목은 이 설정 탭의 보관함에서 확인할 수 있고,
                  마음이 바뀌면 <strong className="text-sp-text">전환 취소</strong>로 언제든 되돌릴
                  수 있어요.
                </p>
              </div>
              <p className="break-all text-xs text-sp-muted">
                안전 백업 위치: <span className="text-sp-text">{doneResult.safetyBackupPath}</span>
              </p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 border-t border-sp-border px-6 py-4">
          {phase === 'form' ? (
            <>
              <button
                type="button"
                onClick={() => (step > 1 ? setStep((step - 1) as WizardStep) : handleClose())}
                className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:text-sp-text"
              >
                {step > 1 ? '이전' : '닫기'}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep((step + 1) as WizardStep)}
                  className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-5 py-2 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 active:scale-95"
                >
                  다음
                  <span aria-hidden className="material-symbols-outlined text-icon-md">
                    arrow_forward
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runTransition()}
                  disabled={!canExecute}
                  className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-5 py-2 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
                >
                  <span aria-hidden className="material-symbols-outlined text-icon-md">
                    inventory_2
                  </span>
                  {executeLabel}
                </button>
              )}
            </>
          ) : phase === 'running' ? (
            <p className="w-full text-center text-xs text-sp-muted">전환 중…</p>
          ) : (
            <>
              <span />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-sp-accent px-5 py-2 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 active:scale-95"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
