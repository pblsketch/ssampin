/**
 * 루브릭 다른 반에 복사 모달 (FR-4, D2).
 *
 * - 다른 수업반 다중 선택 → 독립 복사본 생성 (구조만 복제, 채점 기록 미포함)
 * - 대상 반이 이미 한도(10개)면 체크 비활성 + 안내, 복사 중 한도 도달 반은 건너뛰고 보고
 */
import { useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { useToastStore } from '@adapters/components/common/Toast';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { Rubric } from '@domain/entities/Rubric';
import { MAX_RUBRICS_PER_CLASS, countClassRubrics } from '@domain/rules/rubricRules';

interface RubricCopyModalProps {
  rubric: Rubric;
  currentClassId: string;
  onClose: () => void;
}

export function RubricCopyModal({ rubric, currentClassId, onClose }: RubricCopyModalProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const rubrics = useRubricStore((s) => s.rubrics);
  const copyRubricToClasses = useRubricStore((s) => s.copyRubricToClasses);
  const showToast = useToastStore((s) => s.show);

  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [copying, setCopying] = useState(false);

  const targets = useMemo(
    () =>
      classes
        .filter((c) => c.id !== currentClassId)
        .map((c) => ({
          id: c.id,
          name: c.name,
          subject: c.subject,
          studentCount: c.students.filter(isStudentActive).length,
          rubricCount: countClassRubrics(rubrics, c.id),
        })),
    [classes, currentClassId, rubrics],
  );

  function toggleTarget(classId: string) {
    setSelectedIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId],
    );
  }

  async function handleCopy() {
    if (selectedIds.length === 0 || copying) return;
    setCopying(true);
    try {
      const result = await copyRubricToClasses(rubric.id, selectedIds);
      const nameOf = (id: string) => targets.find((t) => t.id === id)?.name ?? id;
      if (result.copiedCount > 0) {
        showToast(`${result.copiedCount}개 반에 복사했습니다`, 'success');
      }
      if (result.skippedClassIds.length > 0) {
        showToast(
          `${result.skippedClassIds.map(nameOf).join(', ')}은(는) 루브릭이 이미 ${MAX_RUBRICS_PER_CLASS}개라 건너뛰었습니다`,
          'info',
        );
      }
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '복사에 실패했습니다', 'error');
      setCopying(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="다른 반에 복사" srOnlyTitle size="sm">
      <div className="flex flex-col flex-1 min-h-0 max-h-[70vh]">
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-sp-text">다른 반에 복사</h3>
            <p className="text-xs text-sp-muted mt-0.5 truncate">{rubric.title}</p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {targets.length === 0 ? (
            <div className="py-8 text-center text-sp-muted text-xs">
              복사할 수 있는 다른 수업반이 없습니다
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {targets.map((target) => {
                const isFull = target.rubricCount >= MAX_RUBRICS_PER_CLASS;
                const isChecked = selectedIds.includes(target.id);
                return (
                  <label
                    key={target.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sp-surface border transition-colors ${
                      isFull
                        ? 'border-sp-border opacity-50 cursor-not-allowed'
                        : isChecked
                          ? 'border-sp-accent cursor-pointer'
                          : 'border-sp-border hover:border-sp-accent cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isFull || copying}
                      onChange={() => toggleTarget(target.id)}
                      className="accent-sp-accent w-4 h-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-sp-text font-medium truncate">{target.name}</p>
                      <p className="text-xs text-sp-muted mt-0.5 truncate">
                        {target.subject} · {target.studentCount}명 · 루브릭 {target.rubricCount}/
                        {MAX_RUBRICS_PER_CLASS}
                        {isFull && ' — 한도 초과'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-sp-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-caption text-sp-muted flex-1">
            평가 요소·수준·배점만 복사되며 채점 기록은 복사되지 않습니다. 복사 후 수정해도 서로
            영향이 없습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={selectedIds.length === 0 || copying}
            className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
          >
            {copying ? '복사 중...' : `${selectedIds.length}개 반에 복사`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
