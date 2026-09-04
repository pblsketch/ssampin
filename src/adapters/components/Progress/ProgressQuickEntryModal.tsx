import { useState, useCallback, useMemo } from 'react';
import { ProgressEntryFields } from '@adapters/components/ClassManagement/ProgressEntryFields';
import { ProgressFanoutPicker } from './ProgressFanoutPicker';
import type { ProgressEntryFieldValues } from '@adapters/components/ClassManagement/ProgressEntryFields';
import type { FanoutCandidate, FanoutPreviewRow } from '@domain/rules/progressFanout';
import type { ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { StandardScope } from '@domain/rules/curriculumStandardRules';

/** "다른 반에도 함께 기록" 선택 상태 — useProgressQuickEntry가 그대로 넘겨준다 */
export interface ProgressQuickEntryFanout {
  readonly candidates: readonly FanoutCandidate[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggle: (classId: string) => void;
  readonly onClear: () => void;
  readonly buildPreview: (date: string, period: number) => readonly FanoutPreviewRow[];
}

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
  /** 교시 이름 표시용 — 이름을 붙인 교시는 번호 대신 이름이 보인다. */
  periodTimes?: readonly PeriodTime[];
  /** 추가 모드에서만 노출되는 "다른 반에도 함께 기록" 선택 */
  fanout?: ProgressQuickEntryFanout;
  /** 성취기준 고르기 범위(학교급·과목·학년). 없으면 성취기준 칸이 나오지 않는다. */
  standardScope?: StandardScope;
  onSubmit: (values: ProgressEntryFieldValues, status: ProgressStatus) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  /**
   * "여기부터 밀기" — 편집 모드에서만 보인다. 넘기지 않으면 단추가 나오지 않는다
   * (밀 자리를 계산하려면 학기 수업일이 필요한데, 그것을 아는 것은 호출부다).
   */
  onShiftFromHere?: () => void;
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
  periodTimes,
  fanout,
  standardScope,
  onSubmit,
  onDelete,
  onShiftFromHere,
  onClose,
}: ProgressQuickEntryModalProps) {
  const [values, setValues] = useState<ProgressEntryFieldValues>(initialValues);
  const [status, setStatus] = useState<ProgressStatus>(initialStatus);
  const [saving, setSaving] = useState(false);

  const canSave = values.unit.trim().length > 0 && values.lesson.trim().length > 0;

  // 단원/차시를 입력하는 동안 매번 다시 계산하지 않도록 날짜·교시·선택이 바뀔 때만 갱신
  const fanoutPreview = useMemo(
    () => (fanout ? fanout.buildPreview(values.date, values.period) : []),
    [fanout, values.date, values.period],
  );

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
            periodTimes={periodTimes}
            standardScope={standardScope}
            standardContextLabel={className}
            compact
          />

          {/* 다른 반에도 함께 기록 (추가 모드 전용) */}
          {mode === 'add' && fanout && (
            <ProgressFanoutPicker
              candidates={fanout.candidates}
              selectedIds={fanout.selectedIds}
              onToggle={fanout.onToggle}
              onClear={fanout.onClear}
              preview={fanoutPreview}
              periodTimes={periodTimes}
              compact
            />
          )}

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
            {/*
              계획대로 못 나간 차시에서 그 뒤를 통째로 미는 길. 편집 창에 두는 이유는,
              "못 나간 그 차시"를 눌러 여기까지 온 상태가 곧 미는 기준점이기 때문이다.
              한 건만 옮기려면 캘린더에서 끌어다 놓으면 된다.
            */}
            {mode === 'edit' && onShiftFromHere && (
              <button
                onClick={onShiftFromHere}
                title="이 차시부터 뒤의 '예정'을 각각 다음 수업일로 옮겨요"
                className="flex items-center gap-1 rounded-lg border border-sp-border px-3 py-1.5 text-sm text-sp-muted transition-colors hover:border-sp-accent hover:text-sp-accent"
              >
                <span className="material-symbols-outlined text-base">last_page</span>
                여기부터 밀기
              </button>
            )}
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
