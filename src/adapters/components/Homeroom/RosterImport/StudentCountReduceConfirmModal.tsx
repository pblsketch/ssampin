/**
 * StudentCountReduceConfirmModal.tsx
 *
 * 명렬관리 [-] 버튼으로 학생 수를 줄일 때, 비활성 학생만으로 부족하여
 * 활성 학생까지 영구 삭제해야 하는 경우 사용자 명시적 확인을 받는 모달.
 *
 * 확인 패턴: "삭제" 텍스트 직접 입력 (frontend-architect 결정 §6.2.7).
 *   - 교사 ICT 비전문 사용자 + 실수 방지를 위한 물리적 마찰
 *   - GitHub·Supabase 등 검증된 패턴
 *   - 2글자라 IME 환경 오타 위험 적음
 *
 * 디자인: `docs/02-design/features/roster-data-consistency.design.md` §6.2
 */

import { useRef, useState, useCallback, useMemo } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import type { Student } from '@domain/entities/Student';
import { STUDENT_STATUS_LABELS, type StudentStatus } from '@domain/entities/Student';
import { isStudentInactive } from '@domain/rules/studentActivity';

const REQUIRED_INPUT = '삭제';

interface StudentCountReduceConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 활성 학생 중 영구 삭제 대상 (이미 비활성 학생 우선 제거된 후 남은 활성 학생) */
  studentsToDelete: readonly Student[];
  /** 자동 정리될 비활성 학생 (참고 표시용) — 선택. 없으면 미표시 */
  inactiveAutoRemoved?: readonly Student[];
  /** 학생기록 보유 학생 id 집합 — 위험성 시각화용 (옵션) */
  hasRecordsIdSet?: ReadonlySet<string>;
}

export function StudentCountReduceConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
  studentsToDelete,
  inactiveAutoRemoved,
  hasRecordsIdSet,
}: StudentCountReduceConfirmModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const handleConfirm = useCallback(() => {
    if (confirmInput.trim() !== REQUIRED_INPUT) return;
    setConfirmInput('');
    onConfirm();
  }, [confirmInput, onConfirm]);

  const handleCancel = useCallback(() => {
    setConfirmInput('');
    onCancel();
  }, [onCancel]);

  const isReady = confirmInput.trim() === REQUIRED_INPUT;
  const count = studentsToDelete.length;

  const sortedToDelete = useMemo(
    () => [...studentsToDelete].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0)),
    [studentsToDelete],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="학생 데이터가 영구 삭제됩니다"
      srOnlyTitle
      size="md"
      closeOnBackdrop={false}
      closeOnEsc={false}
      initialFocusRef={cancelButtonRef as React.RefObject<HTMLElement>}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* 경고 헤더 */}
        <header className="px-6 pt-6 pb-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-red-400 text-lg">warning</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-sp-text">
              <span className="text-red-400">{count}명</span>의 학생 데이터가 영구 삭제됩니다
            </h3>
            <p className="text-sm text-sp-muted leading-relaxed mt-1">
              [-] 버튼으로 학생 수를 줄이려면 아래 학생의 모든 정보(이름·연락처·보호자·학생기록
              등)가 완전히 사라집니다.
            </p>
          </div>
        </header>

        <div className="px-6 pb-4 flex flex-col gap-4">
          {/* 자동 정리될 비활성 학생 (참고) */}
          {inactiveAutoRemoved && inactiveAutoRemoved.length > 0 && (
            <div className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-muted">
              비활성 학생 {inactiveAutoRemoved.length}명은 먼저 자동 정리되며, 그 후에도 부족한{' '}
              <span className="text-red-400 font-semibold">{count}명의 활성 학생</span>이 영구
              삭제됩니다.
            </div>
          )}

          {/* 삭제 목록 */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold text-sp-muted border-b border-red-500/20">
              삭제될 학생 목록
            </div>
            <div role="list" className="max-h-[240px] overflow-y-auto">
              {sortedToDelete.map((s) => {
                const hasRecords = hasRecordsIdSet?.has(s.id) ?? false;
                const statusLabel = s.status
                  ? STUDENT_STATUS_LABELS[s.status as StudentStatus]
                  : isStudentInactive(s)
                    ? '결번'
                    : '재학';
                return (
                  <div
                    key={s.id}
                    role="listitem"
                    className="px-3 py-2 flex items-center gap-2 text-sm border-b border-sp-border/30 last:border-0"
                  >
                    <span className="text-sp-text font-mono text-xs w-10 shrink-0">
                      {s.studentNumber ?? '?'}번
                    </span>
                    <span className="text-sp-text flex-1 truncate">{s.name || '(이름 없음)'}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-sp-accent/15 text-sp-accent shrink-0">
                      {statusLabel}
                    </span>
                    {hasRecords && (
                      <span className="text-xs text-amber-400 flex items-center gap-1 shrink-0">
                        <span className="material-symbols-outlined text-icon-sm">warning</span>
                        학생기록 있음
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 안내 */}
          <div className="rounded-lg bg-sp-surface border border-sp-border px-3 py-2 text-xs text-sp-muted">
            유지하려면 아래 버튼을 닫고 [명렬 관리]에서 해당 학생을 결번/전출/휴학으로 처리하세요.
            결번 처리된 학생은 [-] 버튼으로 줄일 때 자동으로 우선 제거됩니다.
          </div>

          {/* 텍스트 확인 입력 */}
          <div>
            <label className="text-sm text-sp-text block mb-1.5">
              이 작업을 실행하려면 아래 입력란에{' '}
              <span className="text-red-400 font-semibold font-mono">"{REQUIRED_INPUT}"</span>를
              입력하세요.
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="삭제 확인 입력"
              placeholder="여기에 입력…"
              className="w-full rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:ring-1 focus:ring-red-500/60 transition-colors"
            />
          </div>
        </div>

        {/* 푸터 */}
        <footer className="px-6 py-4 flex items-center justify-between border-t border-sp-border">
          <button
            ref={cancelButtonRef}
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            취소 (데이터 보존)
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isReady}
            aria-disabled={!isReady}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              isReady
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-red-600/30 text-red-400/50 cursor-not-allowed'
            }`}
          >
            영구 삭제
          </button>
        </footer>
      </div>
    </Modal>
  );
}
