'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SchedulePublic, SlotPublic } from './bookingApi';
import { getSchedulePublic, getSlots, checkAlreadyBooked, bookSlot, encrypt } from './bookingApi';

interface BookingPageContentProps {
  scheduleId: string;
}

type ViewState =
  | 'loading'
  | 'notFound'
  | 'closed'
  | 'info'
  | 'alreadyBooked'
  | 'method'
  | 'time'
  | 'confirm'
  | 'success';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`;
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

const METHOD_LABELS: Record<'face' | 'phone' | 'video', { icon: string; label: string }> = {
  face: { icon: '🤝', label: '대면 상담' },
  phone: { icon: '📞', label: '전화 상담' },
  video: { icon: '💻', label: '화상 상담' },
};

export function BookingPageContent({ scheduleId }: BookingPageContentProps) {
  const [schedule, setSchedule] = useState<SchedulePublic | null>(null);
  const [view, setView] = useState<ViewState>('loading');
  const [slots, setSlots] = useState<SlotPublic[]>([]);
  const [studentNumber, setStudentNumber] = useState<number | null>(null);
  const [parentName, setParentName] = useState('');
  const [parentContact, setParentContact] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'face' | 'phone' | 'video' | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── URL 해시에서 adminKey 추출 ── */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const match = /[#&]key=([^&]+)/.exec(hash);
      if (match?.[1]) {
        setAdminKey(decodeURIComponent(match[1]));
      }
    }
  }, []);

  /* ── 일정 로드 ── */
  useEffect(() => {
    async function load() {
      const data = await getSchedulePublic(scheduleId);
      if (!data) {
        setView('notFound');
        return;
      }
      if (data.isArchived) {
        setSchedule(data);
        setView('closed');
        return;
      }
      setSchedule(data);
      setView('info');
    }
    void load();
  }, [scheduleId]);

  /* ── 슬롯 로드 ── */
  useEffect(() => {
    if (!schedule) return;
    async function loadSlots() {
      const data = await getSlots(scheduleId);
      setSlots(data);
    }
    void loadSlots();
  }, [schedule, scheduleId]);

  const reloadSlots = useCallback(async () => {
    const data = await getSlots(scheduleId);
    setSlots(data);
  }, [scheduleId]);

  /* ── 번호 선택 후 중복 예약 확인 ── */
  const handleInfoNext = useCallback(async (num: number) => {
    if (!schedule) return;
    const already = await checkAlreadyBooked(scheduleId, num);
    if (already) {
      setStudentNumber(num);
      setView('alreadyBooked');
    } else {
      setStudentNumber(num);
      setView('method');
    }
  }, [scheduleId, schedule]);

  /* ── 예약 제출 ── */
  const handleBooking = useCallback(async () => {
    if (!schedule || studentNumber === null || !selectedSlotId || !selectedMethod) return;
    setIsSubmitting(true);
    setError(null);

    let bookerInfoEncrypted: string | undefined;
    if (schedule.type === 'parent' && adminKey) {
      bookerInfoEncrypted = await encrypt(`${parentName}|${parentContact}`, adminKey);
    }

    const result = await bookSlot({
      scheduleId,
      slotId: selectedSlotId,
      studentNumber,
      bookerInfoEncrypted,
      method: selectedMethod,
    });

    setIsSubmitting(false);

    if (result.success) {
      setView('success');
    } else {
      setError(result.message);
      void reloadSlots();
    }
  }, [
    schedule,
    studentNumber,
    selectedSlotId,
    selectedMethod,
    adminKey,
    parentName,
    parentContact,
    scheduleId,
    reloadSlots,
  ]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) ?? null,
    [slots, selectedSlotId],
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-lg px-4 py-3 text-center">
          <h1 className="text-lg font-bold text-gray-900">📅 쌤핀 상담 예약</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        {view === 'loading' && <LoadingView />}
        {view === 'notFound' && <NotFoundView />}
        {view === 'closed' && <ClosedView title={schedule?.title} />}
        {view === 'alreadyBooked' && <AlreadyBookedView />}
        {view === 'info' && schedule && (
          <InfoView
            schedule={schedule}
            parentName={parentName}
            parentContact={parentContact}
            onParentNameChange={setParentName}
            onParentContactChange={setParentContact}
            onNext={handleInfoNext}
          />
        )}
        {view === 'method' && schedule && (
          <MethodView
            schedule={schedule}
            selectedMethod={selectedMethod}
            onSelectMethod={setSelectedMethod}
            onBack={() => setView('info')}
            onNext={() => setView('time')}
          />
        )}
        {view === 'time' && schedule && (
          <TimeView
            slots={slots}
            selectedSlotId={selectedSlotId}
            onSelectSlot={setSelectedSlotId}
            onBack={() => setView('method')}
            onNext={() => setView('confirm')}
          />
        )}
        {view === 'confirm' && schedule && studentNumber !== null && selectedMethod && selectedSlot && (
          <ConfirmView
            schedule={schedule}
            studentNumber={studentNumber}
            parentName={parentName}
            parentContact={parentContact}
            selectedMethod={selectedMethod}
            selectedSlot={selectedSlot}
            onBack={() => setView('method')}
            onSubmit={handleBooking}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}
        {view === 'success' && <SuccessView />}
      </main>

      <footer className="border-t border-gray-200 py-4 text-center">
        <p className="text-xs text-gray-400">Powered by 쌤핀</p>
      </footer>
    </div>
  );
}

/* ──────────────── 상태 뷰들 ──────────────── */

function LoadingView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">📅</div>
        <p className="text-gray-500">일정 정보를 불러오는 중...</p>
      </div>
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">❓</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">상담 일정을 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm">링크가 올바른지 확인해주세요.</p>
      </div>
    </div>
  );
}

function ClosedView({ title }: { title?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">마감되었습니다</h2>
        {title && <p className="text-gray-500 text-sm mb-1">{title}</p>}
        <p className="text-gray-400 text-sm">이 상담 일정은 마감되어 더 이상 예약할 수 없습니다.</p>
      </div>
    </div>
  );
}

function AlreadyBookedView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">이미 예약하셨습니다</h2>
        <p className="text-gray-500 text-sm">해당 번호는 이미 예약이 완료되었습니다.</p>
      </div>
    </div>
  );
}

function SuccessView() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">예약 완료!</h2>
        <p className="text-gray-500 text-sm">상담 예약이 성공적으로 완료되었습니다.</p>
        <p className="text-gray-400 text-xs mt-2">이 창을 닫아도 됩니다.</p>
      </div>
    </div>
  );
}

/* ──────────────── Step 1: 정보 입력 ──────────────── */

function InfoView({
  schedule,
  parentName,
  parentContact,
  onParentNameChange,
  onParentContactChange,
  onNext,
}: {
  schedule: SchedulePublic;
  parentName: string;
  parentContact: string;
  onParentNameChange: (v: string) => void;
  onParentContactChange: (v: string) => void;
  onNext: (num: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const isParent = schedule.type === 'parent';
  const canContinue =
    selected !== null &&
    (!isParent || (parentName.trim().length > 0 && parentContact.trim().length > 0));

  const handleContinue = async () => {
    if (selected === null || !canContinue) return;
    setChecking(true);
    await onNext(selected);
    setChecking(false);
  };

  return (
    <div>
      {/* 일정 정보 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{schedule.title}</h2>
        <p className="text-xs text-gray-400 mb-3">{schedule.targetClassName}</p>
        {schedule.message && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">{schedule.message}</p>
        )}
      </div>

      {/* 번호 선택 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-bold text-gray-900 mb-4">
          {isParent ? '자녀의 번호를 선택하세요' : '본인의 번호를 선택하세요'}
        </h3>
        <div className="grid grid-cols-5 gap-2 mb-2">
          {schedule.targetStudents.map(({ number }) => (
            <button
              key={number}
              onClick={() => setSelected(number)}
              className={`min-h-12 rounded-xl text-sm font-medium transition-all ${
                selected === number
                  ? 'bg-blue-500 text-white shadow-md scale-105'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {number}번
            </button>
          ))}
        </div>
      </div>

      {/* 학부모 추가 정보 */}
      {isParent && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-bold text-gray-900 mb-4">예약자 정보 입력</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">이름 *</label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => onParentNameChange(e.target.value)}
                placeholder="예약자 이름"
                className="w-full min-h-12 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">연락처 *</label>
              <input
                type="tel"
                value={parentContact}
                onChange={(e) => onParentContactChange(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full min-h-12 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => { void handleContinue(); }}
        disabled={!canContinue || checking}
        className="w-full min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
      >
        {checking ? '확인 중...' : '다음'}
      </button>
    </div>
  );
}

/* ──────────────── Step 2: 상담 방식 선택 ──────────────── */

function MethodView({
  schedule,
  selectedMethod,
  onSelectMethod,
  onBack,
  onNext,
}: {
  schedule: SchedulePublic;
  selectedMethod: 'face' | 'phone' | 'video' | null;
  onSelectMethod: (m: 'face' | 'phone' | 'video') => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-500">2/4 상담 방식 선택</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">상담 방식을 선택하세요</h3>
        <div className="flex flex-col gap-3">
          {schedule.methods.map((method) => {
            const { icon, label } = METHOD_LABELS[method];
            const isSelected = selectedMethod === method;
            return (
              <button
                key={method}
                onClick={() => onSelectMethod(method)}
                className={`min-h-16 rounded-xl px-5 flex items-center gap-4 text-left transition-all ${
                  isSelected
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={selectedMethod === null}
        className="w-full min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
      >
        다음
      </button>
    </div>
  );
}

/* ──────────────── Step 3: 시간 선택 ──────────────── */

function TimeView({
  slots,
  selectedSlotId,
  onSelectSlot,
  onBack,
  onNext,
}: {
  slots: SlotPublic[];
  selectedSlotId: string | null;
  onSelectSlot: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const uniqueDates = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of slots) {
      if (!seen.has(s.date)) {
        seen.add(s.date);
        result.push(s.date);
      }
    }
    return result;
  }, [slots]);

  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    if (uniqueDates.length > 0 && !selectedDate) {
      setSelectedDate(uniqueDates[0]!);
    }
  }, [uniqueDates, selectedDate]);

  const slotsForDate = useMemo(
    () => slots.filter((s) => s.date === selectedDate),
    [slots, selectedDate],
  );

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-500">3/4 시간 선택</span>
      </div>

      {/* 날짜 탭 */}
      <div className="overflow-x-auto pb-1 mb-4">
        <div className="flex gap-2 min-w-max">
          {uniqueDates.map((date) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                selectedDate === date
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {formatDate(date)}
            </button>
          ))}
        </div>
      </div>

      {/* 슬롯 그리드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-4">
        {slotsForDate.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">선택 가능한 시간이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slotsForDate.map((slot) => {
              const isAvailable = slot.status === 'available';
              const isSelected = selectedSlotId === slot.id;
              return (
                <button
                  key={slot.id}
                  onClick={() => { if (isAvailable) onSelectSlot(slot.id); }}
                  disabled={!isAvailable}
                  className={`min-h-12 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    !isAvailable
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isSelected
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white border border-blue-200 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  {isAvailable ? (
                    `${slot.startTime} ~ ${slot.endTime}`
                  ) : (
                    <span>
                      <span className="block text-xs">{slot.startTime} ~ {slot.endTime}</span>
                      <span className="text-xs">마감</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center mb-4">슬롯은 실시간으로 업데이트됩니다</p>

      <button
        onClick={onNext}
        disabled={selectedSlotId === null}
        className="w-full min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
      >
        다음
      </button>
    </div>
  );
}

/* ──────────────── Step 4: 예약 확인 ──────────────── */

function ConfirmView({
  schedule,
  studentNumber,
  parentName,
  parentContact,
  selectedMethod,
  selectedSlot,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: {
  schedule: SchedulePublic;
  studentNumber: number;
  parentName: string;
  parentContact: string;
  selectedMethod: 'face' | 'phone' | 'video';
  selectedSlot: SlotPublic;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const { label: methodLabel, icon: methodIcon } = METHOD_LABELS[selectedMethod];

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-500">4/4 예약 확인</span>
      </div>

      {/* 예약 요약 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-bold text-gray-900 mb-4">예약 내용을 확인해주세요</h3>
        <div className="flex flex-col gap-3">
          <SummaryRow label="학생 번호" value={`${studentNumber}번`} />
          <SummaryRow label="상담 방식" value={`${methodIcon} ${methodLabel}`} />
          <SummaryRow label="날짜" value={formatDateLong(selectedSlot.date)} />
          <SummaryRow label="시간" value={`${selectedSlot.startTime} ~ ${selectedSlot.endTime}`} />
          {schedule.type === 'parent' && parentName && (
            <SummaryRow label="예약자 이름" value={parentName} />
          )}
          {schedule.type === 'parent' && parentContact && (
            <SummaryRow label="연락처" value={parentContact} />
          )}
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 min-h-12 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors"
        >
          수정하기
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 min-h-12 rounded-xl bg-blue-500 text-white font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
        >
          {isSubmitting ? '예약 중...' : '예약하기'}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}
