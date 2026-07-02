/**
 * ConsultationEditModal — 기존 상담 일정의 핵심 필드 즉시 수정.
 *
 * 편집 가능: 제목 / 유형(parent·student) / 방식(face·phone·video) / 슬롯 길이 /
 *           메시지 / 날짜·시간대 (행 단위 추가·삭제·시간 조정).
 *
 * 학생 대상(targetStudents)·targetClassName 등 구조적 메타는 이 모달에서 변경하지 않는다.
 * (이 항목들은 일정을 새로 만들도록 안내한다.)
 *
 * 2-step commit 흐름:
 *   1) "저장" 클릭 → updateSchedule(id, patch) (옵션 없음) 호출
 *   2) impact.affected.length === 0 → 즉시 완료 토스트
 *   3) impact.affected.length > 0 → ScheduleUpdateImpactWarning 표시
 *   4) 사용자가 "그대로 진행" → updateSchedule(id, patch, { onAffectedBookings: 'cancel' }) 재호출
 */

import { useCallback, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  expiryIsoToKstDateString,
  kstDateStringToExpiryIso,
} from '@domain/rules/consultationRules';
import type {
  ConsultationDate,
  ConsultationMethod,
  ConsultationSchedule,
  ConsultationType,
  ScheduleUpdateImpact,
  ScheduleUpdatePatch,
} from '@domain/entities/Consultation';
import { ScheduleUpdateImpactWarning } from './ScheduleUpdateImpactWarning';

interface ConsultationEditModalProps {
  schedule: ConsultationSchedule;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_OPTIONS: { value: ConsultationType; label: string; icon: string }[] = [
  { value: 'parent', label: '학부모 상담', icon: '👨‍👩‍👧' },
  { value: 'student', label: '학생 상담', icon: '🙋' },
];

const METHOD_OPTIONS: { value: ConsultationMethod; label: string; icon: string }[] = [
  { value: 'face', label: '대면', icon: 'groups' },
  { value: 'phone', label: '전화', icon: 'call' },
  { value: 'video', label: '화상', icon: 'videocam' },
];

const PARENT_SLOT_PRESETS = [15, 20, 30, 45, 55];
const STUDENT_SLOT_PRESETS = [10, 15, 20, 25, 30];

interface DateEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toEntries(dates: readonly ConsultationDate[]): DateEntry[] {
  return dates.map((d) => ({
    id: makeId(),
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime,
  }));
}

function toDates(entries: readonly DateEntry[]): ConsultationDate[] {
  return entries
    .filter((e) => e.date && e.startTime && e.endTime)
    .map((e) => ({ date: e.date, startTime: e.startTime, endTime: e.endTime }));
}

export function ConsultationEditModal({
  schedule,
  onClose,
  onSuccess,
}: ConsultationEditModalProps) {
  const [title, setTitle] = useState(schedule.title);
  const [type, setType] = useState<ConsultationType>(schedule.type);
  const [methods, setMethods] = useState<ConsultationMethod[]>([...schedule.methods]);
  const [slotMinutes, setSlotMinutes] = useState<number>(schedule.slotMinutes);
  const [message, setMessage] = useState<string>(schedule.message ?? '');
  const [entries, setEntries] = useState<DateEntry[]>(toEntries(schedule.dates));
  const initialExpiryDate = useMemo(
    () => (schedule.expiresAt ? expiryIsoToKstDateString(schedule.expiresAt) : ''),
    [schedule.expiresAt],
  );
  const [expiryDate, setExpiryDate] = useState<string>(initialExpiryDate);
  const [pendingImpact, setPendingImpact] = useState<ScheduleUpdateImpact | null>(null);
  const [pendingPatch, setPendingPatch] = useState<ScheduleUpdatePatch | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = useToastStore((s) => s.show);

  const slotPresets = type === 'parent' ? PARENT_SLOT_PRESETS : STUDENT_SLOT_PRESETS;

  const computedPatch: ScheduleUpdatePatch = useMemo(() => {
    const patch: {
      title?: string;
      type?: typeof schedule.type;
      methods?: ConsultationMethod[];
      slotMinutes?: number;
      message?: string;
      dates?: ConsultationDate[];
    } = {};
    if (title.trim() !== schedule.title) patch.title = title.trim();
    if (type !== schedule.type) patch.type = type;
    if (
      methods.length !== schedule.methods.length ||
      methods.some((m, i) => schedule.methods[i] !== m)
    ) {
      patch.methods = methods;
    }
    if (slotMinutes !== schedule.slotMinutes) patch.slotMinutes = slotMinutes;
    if ((message ?? '') !== (schedule.message ?? '')) patch.message = message;
    const nextDates = toDates(entries);
    const datesChanged =
      nextDates.length !== schedule.dates.length ||
      nextDates.some((d, i) => {
        const orig = schedule.dates[i];
        if (!orig) return true;
        return d.date !== orig.date || d.startTime !== orig.startTime || d.endTime !== orig.endTime;
      });
    if (datesChanged) patch.dates = nextDates;
    return patch;
  }, [title, type, methods, slotMinutes, message, entries, schedule]);

  const expiryChanged = expiryDate !== initialExpiryDate;
  const hasChanges = Object.keys(computedPatch).length > 0 || expiryChanged;

  const toggleMethod = useCallback((m: ConsultationMethod) => {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<DateEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addEntry = useCallback(() => {
    const last = entries[entries.length - 1];
    setEntries((prev) => [
      ...prev,
      {
        id: makeId(),
        date: last?.date ?? new Date().toISOString().slice(0, 10),
        startTime: last?.startTime ?? '14:00',
        endTime: last?.endTime ?? '15:00',
      },
    ]);
  }, [entries]);

  const validate = useCallback((): string | null => {
    if (!title.trim()) return '제목을 입력해주세요';
    if (methods.length === 0) return '최소 하나 이상의 상담 방식을 선택해주세요';
    if (entries.length === 0) return '최소 하나 이상의 상담 가능 시간대를 등록해주세요';
    for (const e of entries) {
      if (!e.date || !e.startTime || !e.endTime) {
        return '날짜·시간 입력이 비어있는 항목이 있습니다';
      }
      if (e.startTime >= e.endTime) {
        return `종료 시간은 시작 시간보다 늦어야 합니다 (${e.date})`;
      }
    }
    return null;
  }, [title, methods, entries]);

  const runUpdate = useCallback(
    async (patch: ScheduleUpdatePatch, options?: { onAffectedBookings?: 'cancel' | 'abort' }) => {
      setSubmitting(true);
      const result = await useConsultationStore
        .getState()
        .updateSchedule(schedule.id, patch, options);
      setSubmitting(false);

      if (!result.ok) {
        showToast(result.reason, 'error');
        return;
      }

      if (result.impact.affected.length > 0 && !options?.onAffectedBookings) {
        // 2-step commit: 사용자 확인 필요
        setPendingImpact(result.impact);
        setPendingPatch(patch);
        return;
      }

      const cancelledCount =
        options?.onAffectedBookings === 'cancel' ? result.impact.affected.length : 0;
      const msg =
        cancelledCount > 0
          ? `일정이 수정되었습니다 (영향 예약 ${cancelledCount}건 자동 취소)`
          : '일정이 수정되었습니다';
      showToast(msg, 'success');
      onSuccess();
    },
    [schedule.id, onSuccess, showToast],
  );

  const handleSave = useCallback(async () => {
    const err = validate();
    if (err) {
      showToast(err, 'info');
      return;
    }
    if (!hasChanges) {
      showToast('변경된 내용이 없습니다', 'info');
      return;
    }

    // 만료일 변경분을 먼저 반영 (updateSchedule 과 독립적인 별도 액션)
    if (expiryChanged) {
      const iso = expiryDate ? kstDateStringToExpiryIso(expiryDate) : null;
      const r = await useConsultationStore.getState().setScheduleExpiry(schedule.id, iso);
      if (!r.ok) {
        showToast(r.reason, 'error');
        return;
      }
    }

    // 나머지 필드 변경이 있으면 updateSchedule(2-step commit), 없으면 바로 완료 처리
    if (Object.keys(computedPatch).length > 0) {
      void runUpdate(computedPatch);
    } else {
      showToast('일정이 수정되었습니다', 'success');
      onSuccess();
    }
  }, [
    validate,
    hasChanges,
    expiryChanged,
    expiryDate,
    schedule.id,
    computedPatch,
    runUpdate,
    showToast,
    onSuccess,
  ]);

  const handleProceedWithImpact = useCallback(() => {
    if (!pendingPatch) return;
    void runUpdate(pendingPatch, { onAffectedBookings: 'cancel' });
  }, [pendingPatch, runUpdate]);

  const handleCancelImpact = useCallback(() => {
    setPendingImpact(null);
    setPendingPatch(null);
  }, []);

  return (
    <Modal isOpen onClose={onClose} title="상담 일정 수정" size="lg">
      <div className="flex flex-col flex-1 min-h-0 px-6 pb-6 pt-2 gap-4 overflow-y-auto">
        {/* 영향 경고 (있을 때만) */}
        {pendingImpact && (
          <ScheduleUpdateImpactWarning
            impact={pendingImpact}
            onProceed={handleProceedWithImpact}
            onCancel={handleCancelImpact}
            submitting={submitting}
          />
        )}

        {/* 제목 */}
        <div>
          <label className="block text-xs font-medium text-sp-muted mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 1학기 학부모 상담"
            className="w-full px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent outline-none"
          />
        </div>

        {/* 유형 */}
        <div>
          <label className="block text-xs font-medium text-sp-muted mb-1">유형</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm transition-colors flex items-center gap-2',
                    active
                      ? 'border-sp-accent bg-sp-accent/15 text-sp-text'
                      : 'border-sp-border bg-sp-surface hover:border-sp-accent/50 text-sp-muted',
                  ].join(' ')}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 방식 */}
        <div>
          <label className="block text-xs font-medium text-sp-muted mb-1">
            상담 방식 (복수 선택)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {METHOD_OPTIONS.map((opt) => {
              const active = methods.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleMethod(opt.value)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm transition-colors flex items-center justify-center gap-1.5',
                    active
                      ? 'border-sp-accent bg-sp-accent/15 text-sp-text'
                      : 'border-sp-border bg-sp-surface hover:border-sp-accent/50 text-sp-muted',
                  ].join(' ')}
                >
                  <span className="material-symbols-outlined text-base">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 슬롯 길이 */}
        <div>
          <label className="block text-xs font-medium text-sp-muted mb-1">슬롯 길이 (분)</label>
          <div className="flex flex-wrap gap-2">
            {slotPresets.map((m) => {
              const active = slotMinutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSlotMinutes(m)}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-sp-accent bg-sp-accent/15 text-sp-text'
                      : 'border-sp-border bg-sp-surface hover:border-sp-accent/50 text-sp-muted',
                  ].join(' ')}
                >
                  {m}분
                </button>
              );
            })}
          </div>
        </div>

        {/* 메시지 */}
        <div>
          <label className="block text-xs font-medium text-sp-muted mb-1">안내 메시지 (선택)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="학부모님께 안내할 추가 메시지"
            className="w-full px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent outline-none resize-none"
          />
        </div>

        {/* 예약 자동 마감일 */}
        <div>
          <label className="block text-xs font-medium text-sp-muted mb-1">
            예약 자동 마감일 (선택)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent outline-none"
            />
            {expiryDate && (
              <button
                type="button"
                onClick={() => setExpiryDate('')}
                className="text-xs text-sp-muted hover:text-sp-text transition-colors"
              >
                자동 마감 해제
              </button>
            )}
          </div>
          <p className="text-detail text-sp-muted mt-1 leading-relaxed">
            {expiryDate
              ? '이 날짜 0시부터 학부모 예약이 자동으로 마감됩니다.'
              : '자동 마감이 설정되지 않았습니다. 날짜를 선택하면 그날부터 예약이 자동 마감됩니다.'}
          </p>
        </div>

        {/* 날짜·시간대 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-sp-muted">
              상담 가능 시간대 ({entries.length})
            </label>
            <button
              type="button"
              onClick={addEntry}
              className="text-xs text-sp-accent hover:text-sp-accent/80 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              날짜 추가
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-2 py-1.5"
              >
                <input
                  type="date"
                  value={e.date}
                  onChange={(ev) => updateEntry(e.id, { date: ev.target.value })}
                  className="bg-transparent text-xs text-sp-text border border-sp-border/60 rounded px-1.5 py-1 focus:border-sp-accent outline-none"
                />
                <input
                  type="time"
                  value={e.startTime}
                  onChange={(ev) => updateEntry(e.id, { startTime: ev.target.value })}
                  className="bg-transparent text-xs text-sp-text border border-sp-border/60 rounded px-1.5 py-1 focus:border-sp-accent outline-none"
                />
                <span className="text-xs text-sp-muted">~</span>
                <input
                  type="time"
                  value={e.endTime}
                  onChange={(ev) => updateEntry(e.id, { endTime: ev.target.value })}
                  className="bg-transparent text-xs text-sp-text border border-sp-border/60 rounded px-1.5 py-1 focus:border-sp-accent outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeEntry(e.id)}
                  className="ml-auto text-sp-muted hover:text-red-400 transition-colors"
                  title="삭제"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="text-xs text-sp-muted text-center py-3">
                위의 &quot;날짜 추가&quot; 버튼으로 시간대를 등록하세요
              </p>
            )}
          </div>
          <p className="text-detail text-sp-muted mt-2 leading-relaxed">
            시간대를 줄이거나 슬롯 길이를 바꾸면 기존 예약이 영향을 받을 수 있어요. 저장 시 영향
            예약이 안내됩니다.
          </p>
        </div>

        {/* 학생 대상 변경 안내 */}
        <div className="rounded-lg border border-sp-border/60 bg-sp-surface/40 px-3 py-2">
          <p className="text-detail text-sp-muted leading-relaxed">
            <span className="material-symbols-outlined text-xs align-middle mr-0.5">info</span>
            대상 학생/학급은 이 모달에서 변경할 수 없습니다. 변경이 필요하면 새 상담 일정을
            만들어주세요.
          </p>
        </div>
      </div>

      {/* 풋터 */}
      <div className="px-6 py-3 border-t border-sp-border/40 flex items-center justify-between gap-2 shrink-0">
        <span className="text-detail text-sp-muted">
          {hasChanges ? '변경된 항목이 있습니다' : '변경된 내용이 없습니다'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || !hasChanges || pendingImpact !== null}
            className="px-3 py-2 rounded-lg bg-sp-accent hover:bg-sp-accent/90 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
