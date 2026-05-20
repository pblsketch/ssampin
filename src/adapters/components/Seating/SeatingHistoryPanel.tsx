import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from '@adapters/components/common/Drawer';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import type { AvoidHistoryStrength } from '@adapters/stores/useSeatingStore';
import type { SeatingSnapshot, SnapshotSource } from '@domain/entities/SeatingSnapshot';
import { SnapshotPreviewGrid } from './SnapshotPreviewGrid';
import { SnapshotDiffView } from './SnapshotDiffView';

interface SeatingHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 절대 시각 → 짧은 한국어 라벨 ("오늘 14:32" / "어제 09:10" / "5/12 14:00") */
function formatRelative(timestamp: number, now: number): string {
  const diffDays = Math.floor((now - timestamp) / (1000 * 60 * 60 * 24));
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  if (diffDays === 0) return `오늘 ${hh}:${mm}`;
  if (diffDays === 1) return `어제 ${hh}:${mm}`;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d} ${hh}:${mm}`;
}

const SOURCE_META: Record<SnapshotSource, { icon: string; label: string; className: string }> = {
  shuffle: { icon: 'shuffle', label: '셔플', className: 'text-sp-accent' },
  manual: { icon: 'save', label: '수동 저장', className: 'text-sp-highlight' },
  auto: { icon: 'sync', label: '자동 백업', className: 'text-sp-muted' },
};

/**
 * 자리배치 히스토리 사이드 패널.
 *
 * - 현재 배치 수동 저장 버튼
 * - 스냅샷 목록 (최신순) — 각 항목: 라벨, 시간, 소스 아이콘, 미니 프리뷰, 복원/비교/삭제
 * - 비교 모드: 현재 배치 vs 선택된 스냅샷 좌우 비교
 *
 * 교사 뷰(isTeacherView=true)에서만 진입 가능 — 부모(Seating.tsx)에서 가드.
 */
export function SeatingHistoryPanel({ isOpen, onClose }: SeatingHistoryPanelProps) {
  const seating = useSeatingStore((s) => s.seating);
  const snapshots = useSeatingStore((s) => s.snapshots);
  const snapshotsLoaded = useSeatingStore((s) => s.snapshotsLoaded);
  const loadSnapshots = useSeatingStore((s) => s.loadSnapshots);
  const saveCurrentAsSnapshot = useSeatingStore((s) => s.saveCurrentAsSnapshot);
  const restoreSnapshot = useSeatingStore((s) => s.restoreSnapshot);
  const deleteSnapshot = useSeatingStore((s) => s.deleteSnapshot);
  const avoidStrength = useSeatingStore((s) => s.avoidHistoryStrength);
  const setAvoidStrength = useSeatingStore((s) => s.setAvoidHistoryStrength);

  const [compareId, setCompareId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && !snapshotsLoaded) {
      void loadSnapshots();
    }
  }, [isOpen, snapshotsLoaded, loadSnapshots]);

  // 패널이 닫히면 비교 모드 초기화
  useEffect(() => {
    if (!isOpen) {
      setCompareId(null);
      setDeleteConfirmId(null);
    }
  }, [isOpen]);

  const now = Date.now();
  const compareSnapshot = useMemo(
    () => snapshots.find((s) => s.id === compareId) ?? null,
    [snapshots, compareId],
  );

  const handleSave = async () => {
    await saveCurrentAsSnapshot();
  };

  const handleRestore = async (snap: SeatingSnapshot) => {
    if (
      !window.confirm(`"${snap.label}" 배치로 되돌릴까요?\n(현재 배치는 실행 취소로 복구 가능)`)
    ) {
      return;
    }
    await restoreSnapshot(snap.id);
    onClose();
  };

  const handleDelete = async (id: string) => {
    await deleteSnapshot(id);
    setDeleteConfirmId(null);
    if (compareId === id) setCompareId(null);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="자리배치 기록"
      side="right"
      size="lg"
      initialFocusRef={initialFocusRef}
    >
      {/* 헤더 영역 */}
      <div className="px-6 pb-3 flex items-center justify-between">
        <p className="text-xs text-sp-muted">
          최근 배치를 저장하고, 언제든 되돌릴 수 있어요. (최대 50개)
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-sp-muted hover:text-sp-text p-1 rounded-md hover:bg-sp-text/5"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* 수동 저장 버튼 */}
      <div className="px-6 pb-3">
        <button
          ref={initialFocusRef}
          type="button"
          onClick={() => void handleSave()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">bookmark_add</span>
          <span>현재 배치 저장</span>
        </button>
      </div>

      {/* 이전 자리 피하기 강도 (Phase 2) */}
      <div className="px-6 pb-3">
        <div className="bg-sp-surface/40 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-sm text-sp-muted">tune</span>
            <span className="text-sm font-medium text-sp-text">이전 자리 피하기</span>
          </div>
          <p className="text-xs text-sp-muted mb-2">
            셔플할 때 최근 3번 배치와 같은 자리에 학생을 두지 않도록 시도합니다.
          </p>
          <div role="radiogroup" aria-label="이전 자리 피하기 강도" className="flex gap-1.5">
            {(
              [
                { value: 'off', label: 'OFF', desc: '제약 없음' },
                { value: 'prefer', label: '가능하면', desc: '가급적 피하기' },
                { value: 'strict', label: '반드시', desc: '엄격하게 적용' },
              ] as ReadonlyArray<{ value: AvoidHistoryStrength; label: string; desc: string }>
            ).map((opt) => {
              const active = avoidStrength === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAvoidStrength(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-card text-sp-text hover:bg-sp-text/5 ring-1 ring-sp-border'
                  }`}
                  title={opt.desc}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 비교 모드 */}
      {compareSnapshot && (
        <div className="px-6 pb-3 border-t border-sp-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-sp-text">비교: {compareSnapshot.label}</h3>
            <button
              type="button"
              onClick={() => setCompareId(null)}
              className="text-xs text-sp-muted hover:text-sp-text"
            >
              비교 닫기
            </button>
          </div>
          <SnapshotDiffView current={seating} snapshot={compareSnapshot.seating} />
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
        {!snapshotsLoaded ? (
          <div className="text-center py-8 text-sp-muted text-sm">불러오는 중…</div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-12 text-sp-muted text-sm">
            <span className="material-symbols-outlined text-3xl block mb-2 opacity-60">
              inventory_2
            </span>
            <p>아직 저장된 배치가 없어요.</p>
            <p className="text-xs mt-1 opacity-70">셔플 시 자동으로 저장돼요.</p>
          </div>
        ) : (
          snapshots.map((snap) => {
            const meta = SOURCE_META[snap.source];
            const isCompare = compareId === snap.id;
            const isDeleteConfirm = deleteConfirmId === snap.id;
            return (
              <div
                key={snap.id}
                className={`bg-sp-card border rounded-xl p-3 transition-colors ${
                  isCompare ? 'border-sp-accent ring-1 ring-sp-accent/40' : 'border-sp-border'
                }`}
              >
                <div className="flex gap-3">
                  <SnapshotPreviewGrid seating={snap.seating} size={72} />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`material-symbols-outlined text-base ${meta.className}`}
                        title={meta.label}
                        aria-label={meta.label}
                      >
                        {meta.icon}
                      </span>
                      <span
                        className="text-sm font-medium text-sp-text truncate"
                        title={snap.label}
                      >
                        {snap.label}
                      </span>
                    </div>
                    <p className="text-xs text-sp-muted mb-2">
                      {formatRelative(snap.timestamp, now)}
                    </p>
                    {isDeleteConfirm ? (
                      <div className="mt-auto flex items-center gap-1.5">
                        <span className="text-xs text-red-400 mr-auto">정말 삭제할까요?</span>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs px-2 py-1 rounded hover:bg-sp-text/5 text-sp-muted"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(snap.id)}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          삭제
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleRestore(snap)}
                          className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded bg-sp-accent/15 text-sp-accent hover:bg-sp-accent/25 transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">restart_alt</span>
                          되돌리기
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompareId(isCompare ? null : snap.id)}
                          className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded transition-colors ${
                            isCompare
                              ? 'bg-sp-accent/25 text-sp-accent'
                              : 'bg-sp-text/5 text-sp-text hover:bg-sp-text/10'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">compare</span>
                          {isCompare ? '비교 중' : '비교'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(snap.id)}
                          aria-label="삭제"
                          className="p-1.5 rounded text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Drawer>
  );
}
