import { useState, useCallback } from 'react';
import { ProgressEntryFields } from '@adapters/components/ClassManagement/ProgressEntryFields';
import type { ProgressEntryFieldValues } from '@adapters/components/ClassManagement/ProgressEntryFields';
import type { ProgressStatus } from '@domain/entities/CurriculumProgress';

/**
 * 진도 빠른 입력/편집 모달 — A안(시간표 오버레이)·B안(캘린더)이 공유하는 chrome.
 * 입력 필드 본문은 공용 ProgressEntryFields를 재사용하고, 여기서는 컨테이너·상태 선택·버튼만 소유한다.
 */

const STATUS_OPTIONS: readonly { value: ProgressStatus; label: string; active: string }[] = [
  { value: 'planned', label: '예정', active: 'bg-blue-500/20 text-blue-400 border-blue-400' },
  { value: 'completed', label: '완료', active: 'bg-green-500/20 text-green-400 border-green-400' },
  { value: 'skipped', label: '미실시', active: 'bg-amber-500/20 text-amber-400 border-amber-400' },
];

interface ProgressQuickEntryModalProps {
  mode: 'add' | 'edit';
  /** 헤더에 표시할 반 이름 (예: "1-3 · 수학") */
  className: string;
  initialValues: ProgressEntryFieldValues;
  initialStatus?: ProgressStatus;
  matchingPeriods: readonly number[];
  lessonDays?: readonly number[];
  accentColor?: { text: string; bg: string; bgSolid: string };
  maxPeriods: number;
  onSubmit: (values: ProgressEntryFieldValues, status: ProgressStatus) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
}

export function ProgressQuickEntryModal({
  mode,
  className,
  initialValues,
  initialStatus = 'planned',
  matchingPeriods,
  lessonDays,
  accentColor,
  maxPeriods,
  onSubmit,
  onDelete,
  onClose,
}: ProgressQuickEntryModalProps) {
  const [values, setValues] = useState<ProgressEntryFieldValues>(initialValues);
  const [status, setStatus] = useState<ProgressStatus>(initialStatus);
  const [saving, setSaving] = useState(false);

  const canSave = values.unit.trim().length > 0 && values.lesson.trim().length > 0;

  const handleChange = useCallback((patch: Partial<ProgressEntryFieldValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSubmit(
        {
          ...values,
          unit: values.unit.trim(),
          lesson: values.lesson.trim(),
          note: values.note.trim(),
        },
        status,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }, [canSave, saving, onSubmit, values, status, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-sp-border bg-sp-card shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-sp-border px-5 py-4">
          <div className="flex items-center gap-2 font-medium text-sp-text">
            <span className="material-symbols-outlined text-xl text-sp-accent">edit_calendar</span>
            {mode === 'add' ? '진도 추가' : '진도 편집'}
            <span className="text-sm text-sp-muted">· {className}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-sp-muted transition-colors hover:text-sp-text"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="space-y-3 px-5 py-4">
          <ProgressEntryFields
            values={values}
            onChange={handleChange}
            matchingPeriods={matchingPeriods}
            lessonDays={lessonDays}
            accentColor={accentColor}
            maxPeriods={maxPeriods}
          />

          {/* 상태 선택 */}
          <div>
            <label className="mb-1 block text-xs text-sp-muted">상태</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? opt.active : 'border-sp-border text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-2 border-t border-sp-border px-5 py-4">
          {mode === 'edit' && onDelete ? (
            <button
              onClick={() => void onDelete()}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
            >
              <span className="material-symbols-outlined text-base">delete</span>
              삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-sp-muted transition-colors hover:text-sp-text"
            >
              취소
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className="rounded-lg bg-sp-accent px-4 py-1.5 text-sm text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
