/**
 * ConflictResolveModal.tsx
 *
 * 명렬 일괄 가져오기 시 (이름·학번) 부분 매칭이 발생한 학생들에 대해
 * 사용자가 각 충돌의 해결 방식(replace / addNew / merge / skip)을
 * 결정하는 모달. planImport 결과의 conflicts 배열이 비어있지 않을 때만 노출.
 *
 * 디자인: `docs/02-design/features/roster-data-consistency.design.md` §5.3
 * (frontend-architect 통합 spec)
 *
 * 외부 참조 보호 원칙:
 *   - 모든 액션은 기존 학생 id를 보존하거나 (replace/merge/skip) 새 id를 추가 (addNew)
 *   - 학생기록·좌석·과제 제출 등 외부 참조가 끊기지 않음
 *   - 적용은 토스트 "실행 취소"로 5초간 복원 가능
 */

import { useCallback, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import type {
  ConflictRow,
  ConflictType,
  ImportAction,
} from '@domain/rules/rosterImportPlan';
import { STUDENT_STATUS_LABELS } from '@domain/entities/Student';
import { isStudentInactive } from '@domain/rules/studentActivity';

/* ──────────────── 타입 ──────────────── */

interface ConflictResolveModalProps {
  isOpen: boolean;
  onCancel: () => void;
  /** 정보 표시용 — 자동 적용된 매칭 건수 */
  matchedCount: number;
  /** 정보 표시용 — 신규 추가 건수 */
  newCount: number;
  conflicts: readonly ConflictRow[];
  /** 모든 충돌 결정 후 호출. resolutions = key → ImportAction Map */
  onApply: (resolutions: Map<string, ImportAction>) => void;
}

/* ──────────────── 상수 ──────────────── */

/** 충돌 타입 → 사용자 친화 라벨 (사용자 시점: "어느 쪽이 같은지") */
const TYPE_META: Record<
  ConflictType,
  { label: string; badge: string; description: string }
> = {
  name_changed: {
    label: '이름 변경 가능성',
    badge: 'bg-amber-500/15 text-amber-400',
    description: '같은 학번에 다른 이름이 들어왔습니다.',
  },
  number_changed: {
    label: '학번 변경 가능성',
    badge: 'bg-blue-500/15 text-sp-accent',
    description: '같은 이름이 다른 학번으로 들어왔습니다.',
  },
  returning_inactive: {
    label: '재등록 가능성',
    badge: 'bg-purple-500/15 text-purple-400',
    description: '비활성 학생과 이름이 같습니다.',
  },
};

const ACTION_META: Record<
  ImportAction,
  { label: string; description: string }
> = {
  replace: { label: '교체', description: '기존 학생 정보를 가져온 데이터로 덮어씁니다 (id 보존)' },
  addNew: { label: '신규 추가', description: '기존 학생은 그대로 두고 별도 학생으로 추가합니다' },
  merge: { label: '병합', description: '기존 빈 필드만 가져온 데이터로 채웁니다' },
  skip: { label: '건너뛰기', description: '이 행을 가져오지 않습니다 (기존 유지)' },
};

const ACTIONS: readonly ImportAction[] = ['replace', 'addNew', 'merge', 'skip'];

/** 충돌 타입별 기본 액션 */
const DEFAULT_ACTION: Record<ConflictType, ImportAction> = {
  name_changed: 'replace',
  number_changed: 'replace',
  returning_inactive: 'merge',
};

/* ──────────────── 컴포넌트 ──────────────── */

export function ConflictResolveModal({
  isOpen,
  onCancel,
  matchedCount,
  newCount,
  conflicts,
  onApply,
}: ConflictResolveModalProps) {
  const [resolutions, setResolutions] = useState<Map<string, ImportAction>>(
    () => new Map(),
  );

  const setOne = useCallback((key: string, action: ImportAction) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, action);
      return next;
    });
  }, []);

  const setAll = useCallback(
    (action: ImportAction) => {
      setResolutions(new Map(conflicts.map((c) => [c.key, action])));
    },
    [conflicts],
  );

  const unresolvedCount = useMemo(
    () => conflicts.filter((c) => !resolutions.has(c.key)).length,
    [conflicts, resolutions],
  );

  const handleApply = useCallback(() => {
    if (unresolvedCount > 0) return;
    onApply(resolutions);
  }, [unresolvedCount, resolutions, onApply]);

  const totalConflicts = conflicts.length;
  const onlyOneType =
    conflicts.length > 0 && conflicts.every((c) => c.type === conflicts[0]!.type);
  const singleType = onlyOneType ? conflicts[0]!.type : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="명렬 가져오기 — 충돌 해결"
      srOnlyTitle
      size="xl"
      closeOnBackdrop={false}
      closeOnEsc={false}
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* 헤더 */}
        <header className="px-6 py-4 border-b border-sp-border flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-sp-text">명렬 가져오기 — 충돌 해결</h3>
            <p className="text-xs text-sp-muted mt-0.5">
              총{' '}
              <span className="text-sp-text font-semibold">{totalConflicts}개 충돌</span>{' '}
              · 매칭 자동 적용{' '}
              <span className="text-sp-text font-semibold">{matchedCount}건</span>{' '}
              · 신규 추가{' '}
              <span className="text-sp-text font-semibold">{newCount}건</span>
            </p>
          </div>
          <IconButton
            icon="close"
            label="닫기"
            variant="ghost"
            size="sm"
            onClick={onCancel}
          />
        </header>

        {/* 일괄 액션 */}
        {totalConflicts > 1 && (
          <div className="px-6 py-2 flex items-center gap-2 border-b border-sp-border bg-sp-surface/60">
            <span className="text-xs text-sp-muted mr-1">일괄 적용:</span>
            {ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => setAll(a)}
                className="px-2.5 py-1 rounded-lg text-xs border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-colors"
                title={ACTION_META[a].description}
              >
                모두 {ACTION_META[a].label}
              </button>
            ))}
          </div>
        )}

        {/* 단일 TYPE 안내 */}
        {singleType && (
          <div className="px-6 py-2 text-xs text-sp-muted border-b border-sp-border">
            <span
              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mr-2 ${TYPE_META[singleType].badge}`}
            >
              {TYPE_META[singleType].label}
            </span>
            {TYPE_META[singleType].description}
          </div>
        )}

        {/* 충돌 목록 — 스크롤 영역 */}
        <div
          role="list"
          className="flex-1 overflow-y-auto px-6 divide-y divide-sp-border/40 max-h-[min(60vh,480px)]"
        >
          {conflicts.map((c, idx) => (
            <ConflictRowItem
              key={c.key}
              conflict={c}
              index={idx + 1}
              total={totalConflicts}
              selected={resolutions.get(c.key)}
              defaultSelected={DEFAULT_ACTION[c.type]}
              onSelect={(a) => setOne(c.key, a)}
            />
          ))}
        </div>

        {/* 경고 */}
        <div
          role="alert"
          className="px-6 py-3 text-xs text-amber-400 bg-amber-500/10 border-t border-amber-500/20"
        >
          ⚠ 이 작업은 되돌릴 수 없습니다. 완료 후 화면 하단 토스트의 "실행 취소"로만 복원됩니다.
        </div>

        {/* 푸터 */}
        <footer className="px-6 py-4 flex items-center justify-between border-t border-sp-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <div className="flex items-center gap-3">
            {unresolvedCount > 0 && (
              <span
                aria-live="polite"
                className="text-xs text-amber-400"
              >
                {unresolvedCount}건 미결
              </span>
            )}
            <button
              onClick={handleApply}
              disabled={unresolvedCount > 0}
              className="px-5 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              선택대로 적용 ({totalConflicts}건)
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

/* ──────────────── ConflictRow ──────────────── */

interface ConflictRowItemProps {
  conflict: ConflictRow;
  index: number;
  total: number;
  selected: ImportAction | undefined;
  defaultSelected: ImportAction;
  onSelect: (action: ImportAction) => void;
}

function ConflictRowItem({
  conflict,
  index,
  total,
  selected,
  defaultSelected,
  onSelect,
}: ConflictRowItemProps) {
  const meta = TYPE_META[conflict.type];
  const effective = selected ?? null;
  const showRecommended = effective === null;

  const existingStatusLabel = conflict.existing.status
    ? STUDENT_STATUS_LABELS[conflict.existing.status]
    : conflict.existing.isVacant
      ? '결번'
      : '재학';

  const existingInactive = isStudentInactive(conflict.existing);

  return (
    <div
      role="listitem"
      aria-label={`충돌 ${index}/${total}: 기존 ${conflict.existing.name} vs 가져오기 ${conflict.imported.name}`}
      className="py-4"
    >
      {/* TYPE 배지 + 인덱스 */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}
        >
          {meta.label}
        </span>
        <span className="text-xs text-sp-muted/60">
          {index} / {total}
        </span>
      </div>

      {/* 비교 그리드 */}
      <div className="grid grid-cols-2 gap-3 mt-2">
        <StudentDataCell
          label="기존 학생"
          number={conflict.existing.studentNumber}
          name={conflict.existing.name}
          subInfo={existingStatusLabel}
          subTone={existingInactive ? 'muted' : 'normal'}
        />
        <StudentDataCell
          label="가져오는 데이터"
          number={conflict.imported.studentNumber}
          name={conflict.imported.name}
          subInfo="(신규 가져오기)"
          highlight
        />
      </div>

      {/* 액션 버튼 그룹 */}
      <div role="group" className="mt-3 flex gap-2 flex-wrap">
        {ACTIONS.map((a) => {
          const isSelected = effective === a;
          const isRecommended = showRecommended && a === defaultSelected;
          return (
            <button
              key={a}
              onClick={() => onSelect(a)}
              aria-pressed={isSelected}
              title={ACTION_META[a].description}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                isSelected
                  ? 'border-sp-accent bg-sp-accent/15 text-sp-accent font-medium'
                  : isRecommended
                    ? 'border-sp-accent/30 text-sp-text hover:bg-sp-surface'
                    : 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
              }`}
            >
              {ACTION_META[a].label}
              {isRecommended && (
                <span className="ml-1 text-[10px] text-sp-accent/70">·추천</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────── StudentDataCell ──────────────── */

interface StudentDataCellProps {
  label: string;
  number: number | undefined;
  name: string;
  subInfo?: string;
  subTone?: 'normal' | 'muted';
  highlight?: boolean;
}

function StudentDataCell({
  label,
  number,
  name,
  subInfo,
  subTone = 'normal',
  highlight = false,
}: StudentDataCellProps) {
  return (
    <div
      className={`rounded-lg p-3 border bg-sp-surface text-sm ${
        highlight ? 'border-sp-accent/50' : 'border-sp-border'
      }`}
    >
      <div className="text-xs text-sp-muted mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-sp-muted">[{number ?? '?'}번]</span>
        <span className="text-sp-text font-medium">{name}</span>
      </div>
      {subInfo && (
        <div
          className={`text-xs mt-1 ${
            subTone === 'muted' ? 'text-sp-muted/60' : 'text-sp-muted'
          }`}
        >
          {subInfo}
        </div>
      )}
    </div>
  );
}
