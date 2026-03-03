import { useState, useEffect } from 'react';
import type { SchoolEvent, CategoryItem, AlertTiming, Recurrence } from '@domain/entities/SchoolEvent';

interface EventFormModalProps {
  categories: readonly CategoryItem[];
  editEvent?: SchoolEvent | null;
  initialDate?: string; // "YYYY-MM-DD" pre-fill
  onSubmit: (event: SchoolEvent) => void;
  onClose: () => void;
}

const ALERT_OPTIONS: { key: AlertTiming; label: string }[] = [
  { key: 'onTime', label: '정시' },
  { key: '5min', label: '5분 전' },
  { key: '30min', label: '30분 전' },
  { key: '1hour', label: '1시간 전' },
  { key: '1day', label: '1일 전' },
  { key: '3day', label: '3일 전' },
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
  const [recurrence, setRecurrence] = useState<Recurrence | ''>('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.date);
      setEndDate(editEvent.endDate ?? '');
      setCategory(editEvent.category);
      setTime(editEvent.time ?? '');
      setLocation(editEvent.location ?? '');
      setIsDDay(editEvent.isDDay ?? false);
      setAlerts([...(editEvent.alerts ?? [])]);
      setRecurrence(editEvent.recurrence ?? '');
      setDescription(editEvent.description ?? '');
    }
  }, [editEvent]);

  function toggleAlert(key: AlertTiming) {
    setAlerts((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );
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
      ...(recurrence && { recurrence }),
      ...(description.trim() && { description: description.trim() }),
    };

    onSubmit(event);
  }

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="w-full max-w-[520px] bg-sp-card rounded-2xl border border-sp-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border">
            <h2 className="text-lg font-bold text-white">
              {isEdit ? '일정 수정' : '일정 추가'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-sp-muted hover:text-white"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
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
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
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

            {/* 시간 / 장소 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">시간</label>
                <input
                  type="text"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="예: 09:00 또는 09:00 - 18:00"
                  className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sp-muted mb-1.5">장소</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="예: 강당"
                  className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent"
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
              <div className="flex flex-wrap gap-2">
                {ALERT_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAlert(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${alerts.includes(key)
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-bg border border-sp-border text-sp-muted hover:bg-slate-700'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

            {/* 메모 */}
            <div>
              <label className="block text-sm font-medium text-sp-muted mb-1.5">메모</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="추가 메모를 입력하세요"
                rows={2}
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent resize-none"
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
