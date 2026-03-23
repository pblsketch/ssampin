import { useState, useEffect } from 'react';
import type { SchoolEvent, CategoryItem, AlertTiming, AlertTimingPreset, Recurrence } from '@domain/entities/SchoolEvent';
import { isCustomAlert, alertTimingToLabel } from '@domain/entities/SchoolEvent';
import { getGradeBadgeText } from '@domain/entities/NeisSchedule';

interface EventFormModalProps {
  categories: readonly CategoryItem[];
  editEvent?: SchoolEvent | null;
  initialDate?: string; // "YYYY-MM-DD" pre-fill
  onSubmit: (event: SchoolEvent) => void;
  onClose: () => void;
}

const ALERT_PRESETS: { key: AlertTimingPreset; label: string }[] = [
  { key: 'onTime', label: '정시' },
  { key: '5min', label: '5분 전' },
  { key: '30min', label: '30분 전' },
  { key: '1hour', label: '1시간 전' },
  { key: '1day', label: '1일 전' },
  { key: '3day', label: '3일 전' },
];

type CustomUnit = 'min' | 'hour' | 'day';
const CUSTOM_UNITS: { key: CustomUnit; label: string; minutes: number }[] = [
  { key: 'min', label: '분', minutes: 1 },
  { key: 'hour', label: '시간', minutes: 60 },
  { key: 'day', label: '일', minutes: 1440 },
];

const PERIOD_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: '선택 안 함' },
  { key: '1', label: '1교시' },
  { key: '2', label: '2교시' },
  { key: '3', label: '3교시' },
  { key: '4', label: '4교시' },
  { key: '5', label: '5교시' },
  { key: '6', label: '6교시' },
  { key: '7', label: '7교시' },
  { key: 'afterSchool', label: '방과후' },
  { key: 'allDay', label: '종일' },
];

const RECURRENCE_OPTIONS: { key: Recurrence | ''; label: string }[] = [
  { key: '', label: '반복 없음' },
  { key: 'weekly', label: '매주' },
  { key: 'monthly', label: '매월' },
  { key: 'yearly', label: '매년' },
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EventFormModal({
  categories,
  editEvent,
  initialDate,
  onSubmit,
  onClose,
}: EventFormModalProps) {
  const isEdit = editEvent != null;

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate ?? getTodayStr());
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState(categories[0]?.id ?? 'school');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [isDDay, setIsDDay] = useState(false);
  const [alerts, setAlerts] = useState<AlertTiming[]>([]);
  const [period, setPeriod] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence | ''>('');
  const [description, setDescription] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState<CustomUnit>('min');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [excludeDates, setExcludeDates] = useState<string[]>([]);

  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.date);
      setEndDate(editEvent.endDate ?? '');
      setCategory(editEvent.category);
      setTime(editEvent.time ?? '');
      setLocation(editEvent.location ?? '');
      setIsDDay(editEvent.isDDay ?? false);
      setPeriod(editEvent.period ?? '');
      setAlerts([...(editEvent.alerts ?? [])]);
      setRecurrence(editEvent.recurrence ?? '');
      setDescription(editEvent.description ?? '');
      setExcludeDates([...(editEvent.excludeDates ?? [])]);
    }
  }, [editEvent]);

  function togglePreset(key: AlertTimingPreset) {
    setAlerts((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );
  }

  function addCustomAlert() {
    const num = parseInt(customValue, 10);
    if (!num || num <= 0) return;

    const unitInfo = CUSTOM_UNITS.find((u) => u.key === customUnit);
    if (!unitInfo) return;

    const totalMinutes = num * unitInfo.minutes;
    const timing: AlertTiming = `custom:${totalMinutes}`;

    // 중복 체크 (프리셋과도 비교)
    const presetEquivalent = getPresetForMinutes(totalMinutes);
    if (presetEquivalent && alerts.includes(presetEquivalent)) return;
    if (alerts.includes(timing)) return;

    setAlerts((prev) => [...prev, timing]);
    setCustomValue('');
    setShowCustomInput(false);
  }

  function removeAlert(timing: AlertTiming) {
    setAlerts((prev) => prev.filter((a) => a !== timing));
  }

  function getPresetForMinutes(minutes: number): AlertTimingPreset | null {
    const map: Record<number, AlertTimingPreset> = {
      0: 'onTime', 5: '5min', 30: '30min', 60: '1hour', 1440: '1day', 4320: '3day',
    };
    return map[minutes] ?? null;
  }

  function handleRestoreDate(dateStr: string) {
    setExcludeDates((prev) => prev.filter((d) => d !== dateStr));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;

    const event: SchoolEvent = {
      id: editEvent?.id ?? crypto.randomUUID(),
      title: title.trim(),
      date,
      category,
      ...(endDate && { endDate }),
      ...(time && { time }),
      ...(location.trim() && { location: location.trim() }),
      ...(isDDay && { isDDay: true }),
      ...(alerts.length > 0 && { alerts }),
      ...(period && { period }),
      ...(recurrence && { recurrence }),
      ...(recurrence && excludeDates.length > 0 && { excludeDates }),
      ...(description.trim() && { description: description.trim() }),
      // NEIS 일정 편집 시 기존 필드 보존 + isModified 플래그
      ...(editEvent?.source === 'neis' && {
        source: 'neis' as const,
        neis: editEvent.neis,
        isModified: true,
      }),
      // 구글 캘린더 일정 편집 시 동기화 필드 보존
      ...(editEvent?.source === 'google' && {
        source: 'google' as const,
        googleEventId: editEvent.googleEventId,
        googleCalendarId: editEvent.googleCalendarId,
        syncStatus: editEvent.syncStatus,
        lastSyncedAt: editEvent.lastSyncedAt,
        googleUpdatedAt: editEvent.googleUpdatedAt,
        etag: editEvent.etag,
      }),
    };

    onSubmit(event);
  }

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* 모달 */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="w-full max-w-[520px] bg-sp-card rounded-2xl border border-sp-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-event-form"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border">
            <h2 id="modal-title-event-form" className="text-lg font-bold text-sp-text">
              {isEdit ? '일정 수정' : '일정 추가'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="p-1 hover:bg-sp-surface rounded-lg transition-colors text-sp-muted hover:text-sp-text"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* 구글 캘린더 일정 안내 */}
            {isEdit && editEvent?.source === 'google' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="material-symbols-outlined text-blue-400 text-icon-md mt-0.5">sync</span>
                <div className="text-xs text-blue-200/80">
                  <p className="font-medium mb-0.5">구글 캘린더에서 가져온 일정입니다</p>
                  <p>수정하면 구글 캘린더에도 반영됩니다.</p>
                </div>
              </div>
            )}

            {/* NEIS 일정 안내 */}
            {isEdit && editEvent?.source === 'neis' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <span className="material-symbols-outlined text-purple-400 text-icon-md mt-0.5">info</span>
                <div className="text-xs text-purple-200/80">
                  <p className="font-medium mb-0.5">NEIS에서 가져온 일정입니다</p>
                  <p>수정하면 다음 동기화 시 덮어씌워지지 않습니다.</p>
                  {editEvent.neis?.gradeYn && (
                    <p className="mt-1 text-purple-300/60">
                      해당 학년: {getGradeBadgeText(editEvent.neis.gradeYn) || '없음'}
                      {editEvent.neis.subtractDayType && ` · ${editEvent.neis.subtractDayType}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 제목 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">
                제목 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="일정 제목을 입력하세요"
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                required
              />
            </div>

            {/* 날짜 (시작 / 종료) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">
                  시작일 <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent [color-scheme:dark]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">
                  종료일
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={date}
                  className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent [color-scheme:dark]"
                />
              </div>
            </div>

            {/* 카테고리 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 교시 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">교시</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
              >
                {PERIOD_OPTIONS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* 시간 / 장소 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">시간</label>
                <input
                  type="text"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="예: 09:00 또는 09:00 - 18:00"
                  className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">장소</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="예: 강당"
                  className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                />
              </div>
            </div>

            {/* D-Day 표시 */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isDDay}
                onChange={(e) => setIsDDay(e.target.checked)}
                className="w-4 h-4 rounded border-sp-border bg-sp-bg text-sp-accent focus:ring-sp-accent"
              />
              <span className="text-sm text-sp-text">D-Day 카운트다운 표시</span>
            </label>

            {/* 알림 설정 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-2">알림 설정</label>
              {/* 프리셋 버튼 */}
              <div className="flex flex-wrap gap-2">
                {ALERT_PRESETS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${alerts.includes(key)
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-bg border border-sp-border text-sp-muted hover:bg-sp-surface'
                      }`}
                  >
                    {label}
                  </button>
                ))}
                {/* 직접 입력 토글 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowCustomInput((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showCustomInput
                      ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                      : 'bg-sp-bg border border-dashed border-sp-border text-sp-muted hover:bg-sp-surface hover:text-sp-text'
                    }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">add</span>
                    직접 입력
                  </span>
                </button>
              </div>

              {/* 커스텀 알림 입력 영역 */}
              {showCustomInput && (
                <div className="mt-3 flex items-center gap-2 bg-sp-bg/50 border border-sp-border rounded-xl p-3">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomAlert(); } }}
                    placeholder="숫자"
                    className="w-20 bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text text-center placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    autoFocus
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as CustomUnit)}
                    className="bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                  >
                    {CUSTOM_UNITS.map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <span className="text-sm text-sp-muted">전</span>
                  <button
                    type="button"
                    onClick={addCustomAlert}
                    disabled={!customValue || parseInt(customValue, 10) <= 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sp-accent text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    추가
                  </button>
                </div>
              )}

              {/* 커스텀 알림 칩 목록 */}
              {alerts.filter(isCustomAlert).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {alerts.filter(isCustomAlert).map((timing) => (
                    <span
                      key={timing}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-sp-accent/15 text-sp-accent border border-sp-accent/30"
                    >
                      {alertTimingToLabel(timing)}
                      <button
                        type="button"
                        onClick={() => removeAlert(timing)}
                        className="hover:text-sp-text transition-colors ml-0.5"
                      >
                        <span className="material-symbols-outlined text-sm leading-none" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 반복 설정 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">반복</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as Recurrence | '')}
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
              >
                {RECURRENCE_OPTIONS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* 건너뛴 날짜 목록 (반복 일정 수정 시) */}
            {recurrence && excludeDates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">
                  건너뛴 날짜 ({excludeDates.length}개)
                </label>
                <div className="flex flex-wrap gap-1.5 bg-sp-bg/50 border border-sp-border rounded-xl p-3">
                  {[...excludeDates].sort().map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    >
                      {d}
                      <button
                        type="button"
                        onClick={() => handleRestoreDate(d)}
                        className="hover:text-sp-text transition-colors ml-0.5"
                        title="복원"
                      >
                        <span className="material-symbols-outlined text-sm leading-none" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-detail text-sp-muted mt-1">
                  × 버튼으로 날짜를 복원하면 해당 날짜에 다시 일정이 표시됩니다
                </p>
              </div>
            )}

            {/* 메모 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">메모</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="추가 메모를 입력하세요"
                rows={2}
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent resize-none"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-sp-border px-4 py-2.5 text-sm font-semibold text-sp-muted hover:bg-sp-surface transition-all"
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-sp-accent hover:bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
              >
                {isEdit ? '수정' : '추가'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
