/**
 * SchoolYearArchiveTab — 설정 > 연동·백업 > "학년도 마무리" 탭 (S2.3).
 *
 * 이 탭이 하는 일:
 *  1. 학년도 마무리 마법사 진입점(상설 — 시즌 배너 없음, ADR-037).
 *  2. 중단된 전환 감지(detectPendingTransition) → 이어하기/되돌리기 안내.
 *  3. 보관함 목록 + 전환 취소(revert) 상주 진입로 — 보관 사본이 있는 한 언제든 되돌릴 수 있다.
 *     (보관함 열람 뷰어는 P3에서 이 탭에 얹는다 — 자리만 마련.)
 *
 * 브라우저 모드(electronAPI 부재)에서는 createIpcYearTransitionGateway()가 null —
 * 기능을 비활성하고 이유를 명시한다(조용한 무시 금지).
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useToastStore } from '@adapters/components/common/Toast';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { reloadStores } from '@adapters/hooks/useDriveSync';
import { storage } from '@adapters/di/container';
import {
  createIpcYearTransitionGateway,
  detectPendingTransition,
  revertYearTransition,
  type YearTransitionDeps,
  type YearTransitionState,
} from '@usecases/schoolYear/ExecuteYearTransition';
import { academicTerm, formatTermKo } from '@domain/rules/academicCalendar';
import { formatArchiveRoundKo } from '@domain/rules/archiveRules';
import { isMidYearClosing } from './wizardProgress';
import { SchoolYearWizardModal } from './SchoolYearWizardModal';
import { invalidateArchivedTermNoticeCache } from './ArchivedTermNotice';
import { ArchiveViewer } from '@adapters/components/Archive/ArchiveViewer';
import { ArchiveDeleteGate } from '@adapters/components/Archive/ArchiveDeleteGate';
import { invalidateArchiveFileCache } from '@adapters/components/Archive/useArchiveFile';

interface ArchiveSummary {
  /** 논리 학기('2026-1') — 표시용. */
  readonly term: string;
  /** F10a — 디렉토리 이름(회차 포함). 열람·삭제·복원 IPC의 키. */
  readonly archiveId: string;
  readonly round: number;
  readonly label: string;
  readonly archivedAt: string;
  readonly appVersion: string;
  readonly entryCount: number;
  readonly totalBytes: number;
  readonly manifestOk: boolean;
  readonly error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDateTimeKo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function SchoolYearArchiveTab() {
  const settings = useSettingsStore((s) => s.settings);
  const showToast = useToastStore((s) => s.show);

  const gateway = createIpcYearTransitionGateway();
  // 마감 대상 학기: 전환 이력이 있으면 정본(currentTerm), 없으면 오늘 날짜로 파생.
  const closingTerm = settings.currentTerm ?? academicTerm();

  const [archives, setArchives] = useState<readonly ArchiveSummary[]>([]);
  const [pending, setPending] = useState<YearTransitionState | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardResume, setWizardResume] = useState(false);
  const [revertTarget, setRevertTarget] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);
  const [viewTerm, setViewTerm] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  /** F10b — 복원 대상의 표시 라벨(학기 + 회차). */
  const revertTargetLabel = (() => {
    if (revertTarget === null) return '';
    const a = archives.find((x) => x.archiveId === revertTarget);
    return a === undefined
      ? formatTermKo(revertTarget)
      : `${formatTermKo(a.term)}${formatArchiveRoundKo(a.round)}`;
  })();
  /** F10b — 복원이 덮어쓸 라이브 내용이 있는지(명렬·수업반 기준 — 읽기 전용 판정). */
  const [liveHasContent, setLiveHasContent] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await detectPendingTransition(storage));
    const api = window.electronAPI?.archive;
    if (!api) {
      setArchives([]);
      return;
    }
    try {
      const res = await api.list();
      setArchives(res.ok ? res.archives : []);
    } catch {
      setArchives([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // F10b — 복원 확인 모달을 열 때만 라이브 내용 유무를 조회한다(쓰기 없음).
  useEffect(() => {
    if (revertTarget === null) {
      setLiveHasContent(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [students, classes] = await Promise.all([
          storage.read<unknown[]>('students'),
          storage.read<{ classes?: unknown[] }>('teaching-classes'),
        ]);
        const has =
          (Array.isArray(students) && students.length > 0) || (classes?.classes?.length ?? 0) > 0;
        if (alive) setLiveHasContent(has);
      } catch {
        if (alive) setLiveHasContent(false); // 조회 실패 = 경고 생략(오탐보다 낫다)
      }
    })();
    return () => {
      alive = false;
    };
  }, [revertTarget]);

  const openWizard = (resume: boolean) => {
    setWizardResume(resume);
    setWizardOpen(true);
  };

  const buildDeps = useCallback((): YearTransitionDeps | null => {
    if (!gateway) return null;
    return {
      storage,
      gateway,
      getCurrentTerm: async () => useSettingsStore.getState().settings.currentTerm,
      getLastClosedTerm: async () => useSettingsStore.getState().settings.lastClosedTerm,
      // F9a: 두 값은 반드시 같은 저장에서 함께 갱신한다(갈리면 스킵 필터 기준이 어긋난다).
      setCurrentTerm: async (term, lastClosedTerm) => {
        await useSettingsStore.getState().update({ currentTerm: term, lastClosedTerm });
      },
      // useDriveSync.reloadStores는 mutable string[]을 받는다 — readonly 계약에 맞춰 복사.
      reloadStores: (filenames) => reloadStores([...filenames]),
    };
  }, [gateway]);

  const handleRevert = useCallback(
    async (term: string) => {
      const deps = buildDeps();
      if (!deps) return;
      setReverting(true);
      try {
        const result = await revertYearTransition(deps, term);
        if (result.ok) {
          invalidateArchivedTermNoticeCache();
          showToast(
            `보관 시점으로 되돌렸어요 (${result.restoredKeys.length}개 항목, 보관 사본은 유지) — 다시 마무리하면 새 회차로 보관돼요`,
          );
        } else {
          showToast(result.error, 'error');
        }
      } finally {
        setReverting(false);
        setRevertTarget(null);
        void refresh();
      }
    },
    [buildDeps, refresh, showToast],
  );

  return (
    <div className="space-y-6">
      {/* 소개 + 마법사 진입 */}
      <section className="rounded-xl border border-sp-border bg-sp-card p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-sp-surface p-3">
            <span aria-hidden className="material-symbols-outlined text-3xl text-sp-accent">
              inventory_2
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-sp-text">학년도 마무리</h3>
            <p className="mt-1 text-sm leading-relaxed text-sp-muted">
              한 학년도를 마치면 지금까지의 기록을 보관함에 안전하게 넣고, 새 학년도를 깨끗한 상태로
              시작해요. 보관은 삭제가 아니에요 — 언제든 다시 보고, 전환을 되돌릴 수도 있어요.
            </p>
            <p className="mt-2 text-xs text-sp-muted">
              현재 학기:{' '}
              <span className="font-semibold text-sp-text">{formatTermKo(closingTerm)}</span>
              {settings.currentTerm === undefined && ' (오늘 날짜 기준)'}
            </p>
            {gateway ? (
              <>
                <button
                  type="button"
                  onClick={() => openWizard(false)}
                  disabled={pending !== null}
                  className="mt-4 flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2.5 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
                >
                  <span aria-hidden className="material-symbols-outlined text-icon-md">
                    auto_awesome
                  </span>
                  학년도 마무리 시작하기
                </button>
                {/* F9c: 상시 실행 가능. 학년도 중간이면 마법사 실행 직전에 한 번 더 확인한다. */}
                {isMidYearClosing(closingTerm) && (
                  <p className="mt-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5 text-xs leading-relaxed text-sp-muted">
                    지금은 학년도 중간이에요. 실행 전에 한 번 더 확인해 드려요. 1학기 수업반만
                    정리하려면 수업 관리의 &lsquo;수업반 보관&rsquo;이 더 알맞아요.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5 text-xs text-sp-muted">
                이 기능은 데스크톱 앱에서만 사용할 수 있어요. 브라우저 모드에서는 보관함을 만들 수
                없어요.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 중단된 전환 — 이어하기/되돌리기 */}
      {pending !== null && gateway && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden className="material-symbols-outlined text-icon-md text-amber-400">
              pause_circle
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-sp-text">
                중간에 멈춘 전환이 있어요 — {formatTermKo(pending.closingTerm)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-sp-muted">
                지난번 전환이 끝까지 진행되지 못했어요. 이어서 마무리하거나, 전환 전 상태로 되돌릴
                수 있어요. 어느 쪽이든 보관 사본과 안전 백업이 함께 있어요.
              </p>
              {/* F6(M1): 이어하기 = 전 파일 재정리 — 중단 이후 입력분 소거를 사전 고지 */}
              <p className="mt-1 text-xs leading-relaxed text-amber-400/90">
                중단된 뒤에 새로 입력한 내용이 있다면 이어하기 때 함께 정리돼요. 필요하면 안전
                백업에서 복구할 수 있어요.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openWizard(true)}
                  className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg transition-all hover:brightness-110"
                >
                  이어하기
                </button>
                <button
                  type="button"
                  onClick={() => setRevertTarget(pending.closingTerm)}
                  className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-medium text-sp-muted transition-colors hover:text-sp-text"
                >
                  전환 전으로 되돌리기
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 보관함 목록 + 전환 취소 상주 진입로 */}
      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-bold text-sp-text">보관함</h4>
          <p className="mt-0.5 text-xs text-sp-muted">
            보관함은 이 PC에만 저장돼요. 백업 파일(설정 &gt; 백업/복원)로 내보내면 보관함까지 함께
            담겨 다른 PC로 옮길 수 있어요. 학기를 눌러 명렬·기록·출결·진도를 그대로 열람할 수
            있어요(읽기 전용).
          </p>
        </div>

        {archives.length === 0 ? (
          <div className="rounded-xl border border-sp-border bg-sp-surface p-6 text-center">
            <span aria-hidden className="material-symbols-outlined text-3xl text-sp-muted">
              inventory_2
            </span>
            <p className="mt-2 text-sm text-sp-muted">아직 보관된 학년도가 없어요</p>
            <p className="mt-1 text-xs text-sp-muted">
              학년도 마무리를 실행하면 여기에 학기별로 차곡차곡 쌓여요.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {archives.map((a) => (
              <li key={a.archiveId} className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-sp-border bg-sp-card px-4 py-3">
                  <span aria-hidden className="material-symbols-outlined text-sp-accent">
                    folder_zip
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-sp-text">
                      {formatTermKo(a.term)}
                      {formatArchiveRoundKo(a.round)}
                      {!a.manifestOk && (
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-caption font-medium text-red-400">
                          검증 필요
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-sp-muted">
                      {formatDateTimeKo(a.archivedAt)} 보관 · {a.entryCount}개 항목 ·{' '}
                      {formatBytes(a.totalBytes)} · v{a.appVersion}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewTerm((cur) => (cur === a.archiveId ? null : a.archiveId))}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      viewTerm === a.archiveId
                        ? 'bg-sp-accent text-sp-accent-fg'
                        : 'border border-sp-border text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {viewTerm === a.archiveId ? '열람 닫기' : '열람'}
                  </button>
                  {gateway && (
                    <button
                      type="button"
                      onClick={() => setRevertTarget(a.archiveId)}
                      disabled={reverting || pending !== null}
                      className="shrink-0 rounded-lg border border-sp-border px-3 py-1.5 text-xs font-medium text-sp-muted transition-colors hover:text-sp-text disabled:opacity-40"
                    >
                      전환 취소(이 시점으로 복원)
                    </button>
                  )}
                  {/* 삭제는 되돌릴 수 없는 유일한 조작 — 다른 버튼과 거리·색을 분리(2단계 게이트로 진입) */}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(a.archiveId)}
                    disabled={reverting || pending !== null}
                    aria-label={`${formatTermKo(a.term)}${formatArchiveRoundKo(a.round)} 보관함 삭제`}
                    className="ml-2 shrink-0 rounded-lg border-l border-sp-border p-1.5 text-sp-muted/60 transition-colors hover:text-red-400 disabled:opacity-40"
                  >
                    <span aria-hidden className="material-symbols-outlined text-icon-sm">
                      delete
                    </span>
                  </button>
                </div>
                {/* ArchiveViewer의 term prop은 IPC 키 — 회차 디렉토리 이름을 그대로 넘긴다. */}
                {viewTerm === a.archiveId && <ArchiveViewer term={a.archiveId} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 보관함 영구 삭제 — 2단계 게이트 (S3.3) */}
      <ArchiveDeleteGate
        term={deleteTarget}
        displayLabel={
          deleteTarget === null
            ? undefined
            : (() => {
                const a = archives.find((x) => x.archiveId === deleteTarget);
                return a === undefined
                  ? undefined
                  : `${formatTermKo(a.term)}${formatArchiveRoundKo(a.round)}`;
              })()
        }
        onClose={() => setDeleteTarget(null)}
        onDeleted={(term) => {
          setDeleteTarget(null);
          if (viewTerm === term) setViewTerm(null);
          invalidateArchiveFileCache();
          invalidateArchivedTermNoticeCache();
          showToast(`${formatTermKo(term)} 보관함을 삭제했어요`);
          void refresh();
        }}
        onOpenBackup={() =>
          window.dispatchEvent(new CustomEvent('ssampin:navigate', { detail: 'settings#backup' }))
        }
      />

      {/* 전환 취소 확인 */}
      <Modal
        isOpen={revertTarget !== null}
        onClose={() => !reverting && setRevertTarget(null)}
        title="전환 취소"
        srOnlyTitle
        size="sm"
        closeOnBackdrop={false}
      >
        <div className="p-6" data-modal-fallback tabIndex={-1}>
          <h3 className="text-lg font-bold text-sp-text">
            {revertTargetLabel} 시점으로 되돌릴까요?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-sp-muted">
            보관 사본의 내용이 현재 화면(라이브 데이터)으로 복원돼요. 보관 사본 자체는 그대로
            유지돼요.
          </p>
          {/* F10b — 복원 후 재마무리가 막다른 길이 아님을 알린다(F10a 회차 보관). */}
          <p className="mt-1.5 text-xs leading-relaxed text-sp-muted">
            복원 후 다시 마무리하면 새 회차로 보관돼요.
          </p>
          {/* F10b — 라이브에 새 입력이 있으면 덮어쓰기 경고 + 먼저 보관 안내 */}
          {liveHasContent && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-400/90">
              지금 입력한 내용은 이 복원으로 덮어써져요. 필요하면 먼저 지금 상태를 보관하세요 —
              &lsquo;학년도 마무리 시작하기&rsquo;로 새 회차를 만든 뒤 복원하면 양쪽 다 남아요.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRevertTarget(null)}
              disabled={reverting}
              className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:text-sp-text disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => revertTarget !== null && void handleRevert(revertTarget)}
              disabled={reverting}
              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all hover:brightness-110 disabled:opacity-40"
            >
              {reverting ? '되돌리는 중…' : '이 시점으로 되돌리기'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 마법사 */}
      {gateway && (
        <SchoolYearWizardModal
          isOpen={wizardOpen}
          onClose={() => {
            setWizardOpen(false);
            void refresh();
          }}
          closingTerm={wizardResume && pending !== null ? pending.closingTerm : closingTerm}
          gateway={gateway}
          resumePending={wizardResume}
          onCompleted={() => {
            void refresh();
            // F8d(RM-c): 전환 직후 정화 업로드는 디바운스 예약이 아니라 **즉시 1회 직접 실행** —
            // "전환~첫 업로드" 창(리모트 옛 데이터 잔존)을 최소화한다. 동기화 비활성·첫 동기화
            // 대기 상태면 syncToCloud 내부 가드(sync.enabled·firstSyncRequired)가 조용히
            // 스킵한다(오류 아님 — 비활성 시 정화 불가는 §13.5 RM-c 등재, 마법사 체크박스가 고지).
            void import('@adapters/stores/useDriveSyncStore').then(({ useDriveSyncStore }) =>
              useDriveSyncStore.getState().syncToCloud(),
            );
          }}
        />
      )}
    </div>
  );
}
