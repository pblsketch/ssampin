'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getMyBooking,
  getSchedulePublic,
  getSlots,
  rescheduleMyBooking,
  cancelMyBooking,
  readBookingToken,
  clearBookingToken,
  type MyBookingPublic,
  type SchedulePublic,
  type SlotPublic,
} from './bookingApi';

interface MyBookingViewProps {
  scheduleId: string;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`;
}

const METHOD_LABELS: Record<'face' | 'phone' | 'video', { icon: string; label: string }> = {
  face: { icon: '🤝', label: '대면 상담' },
  phone: { icon: '📞', label: '전화 상담' },
  video: { icon: '💻', label: '화상 상담' },
};

type Stage =
  | 'loading'
  | 'noToken'
  | 'notFound'
  | 'cancelled' // 취소 완료 후
  | 'view'
  | 'pickTime'
  | 'confirmCancel';

export function MyBookingView({ scheduleId }: MyBookingViewProps) {
  const [stage, setStage] = useState<Stage>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<SchedulePublic | null>(null);
  const [booking, setBooking] = useState<MyBookingPublic | null>(null);
  const [slots, setSlots] = useState<SlotPublic[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /* ── 초기 로딩: URL 해시(?t=)/쿼리(t=)/localStorage 순으로 token 확인 ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let t: string | null = null;
    const url = new URL(window.location.href);
    t = url.searchParams.get('t');
    if (!t && window.location.hash) {
      const match = /[#&]t=([^&]+)/.exec(window.location.hash);
      if (match?.[1]) t = decodeURIComponent(match[1]);
    }
    if (!t) t = readBookingToken(scheduleId);

    if (!t) {
      setStage('noToken');
      return;
    }
    setToken(t);
  }, [scheduleId]);

  /* ── token 있으면 데이터 로드 ── */
  const reload = useCallback(async () => {
    if (!token) return;
    setStage('loading');
    const [schedulePublic, myBooking] = await Promise.all([
      getSchedulePublic(scheduleId),
      getMyBooking(token),
    ]);
    if (!schedulePublic || !myBooking) {
      setStage('notFound');
      return;
    }
    setSchedule(schedulePublic);
    setBooking(myBooking);
    setStage('view');
  }, [scheduleId, token]);

  useEffect(() => {
    if (token) void reload();
  }, [token, reload]);

  /* ── 시간 변경 모드 진입 시 슬롯 로드 ── */
  useEffect(() => {
    if (stage !== 'pickTime') return;
    async function loadSlots() {
      const data = await getSlots(scheduleId);
      setSlots(data);
    }
    void loadSlots();
  }, [stage, scheduleId]);

  const groupedSlots = useMemo(() => {
    const byDate = new Map<string, SlotPublic[]>();
    for (const s of slots) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        slots: list.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }));
  }, [slots]);

  const handleConfirmReschedule = useCallback(async () => {
    if (!token || !selectedSlotId || !booking) return;
    if (selectedSlotId === booking.slotId) {
      setError('현재 예약과 같은 시간대입니다.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await rescheduleMyBooking(token, selectedSlotId);
    setSubmitting(false);
    if (result.success) {
      setToast(result.message);
      setSelectedSlotId(null);
      setStage('view');
      void reload();
      setTimeout(() => setToast(null), 3000);
    } else {
      setError(result.message);
    }
  }, [token, selectedSlotId, booking, reload]);

  const handleConfirmCancel = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const result = await cancelMyBooking(token);
    setSubmitting(false);
    if (result.success) {
      clearBookingToken(scheduleId);
      setStage('cancelled');
    } else {
      setError(result.message);
      setStage('view');
    }
  }, [token, scheduleId]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-lg px-4 py-3 text-center">
          <h1 className="text-lg font-bold text-gray-900">📋 내 상담 예약</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        {stage === 'loading' && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-pulse">📅</div>
              <p className="text-gray-500">예약 정보를 불러오는 중...</p>
            </div>
          </div>
        )}

        {stage === 'noToken' && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center px-6">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">예약 인증이 필요합니다</h2>
              <p className="text-gray-500 text-sm mb-1">
                예약 완료 시 받으신 &quot;내 예약 보기&quot; 링크로 들어와 주세요.
              </p>
              <p className="text-gray-400 text-xs mt-3">
                링크를 잃어버리셨다면 담임 선생님께 변경/취소를 요청해 주세요.
              </p>
            </div>
          </div>
        )}

        {stage === 'notFound' && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center px-6">
              <div className="text-5xl mb-4">❓</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">예약을 찾을 수 없습니다</h2>
              <p className="text-gray-500 text-sm">이미 취소되었거나 만료되었을 수 있습니다.</p>
            </div>
          </div>
        )}

        {stage === 'cancelled' && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center px-6">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">예약이 취소되었습니다</h2>
              <p className="text-gray-500 text-sm">담임 선생님께 별도로 안내해 주세요.</p>
            </div>
          </div>
        )}

        {(stage === 'view' || stage === 'confirmCancel') && schedule && booking && booking.slot && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <p className="text-xs font-medium text-gray-500 mb-1">{schedule.title}</p>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {booking.studentNumber}번 학생 예약
              </h2>
              <div className="space-y-3 text-sm">
                <Row label="날짜" value={formatDateLong(booking.slot.date)} />
                <Row label="시간" value={`${booking.slot.startTime}~${booking.slot.endTime}`} />
                <Row
                  label="상담 방식"
                  value={`${METHOD_LABELS[booking.method].icon} ${METHOD_LABELS[booking.method].label}`}
                />
              </div>
            </div>

            {stage === 'view' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStage('pickTime')}
                  className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
                >
                  시간 변경하기
                </button>
                <button
                  type="button"
                  onClick={() => setStage('confirmCancel')}
                  className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                >
                  예약 취소하기
                </button>
              </div>
            )}

            {stage === 'confirmCancel' && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="text-sm font-semibold text-red-700">정말 예약을 취소하시겠어요?</p>
                <p className="text-xs text-red-600 mt-1.5 leading-relaxed">
                  취소 후에는 같은 학생 번호로 다시 예약하실 수 없을 수 있습니다. 변경을 원하시면
                  &quot;시간 변경하기&quot;를 사용해 주세요.
                </p>
                {error && <p className="mt-3 text-xs text-red-600 font-medium">{error}</p>}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStage('view');
                      setError(null);
                    }}
                    disabled={submitting}
                    className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmCancel()}
                    disabled={submitting}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {submitting ? '취소 중…' : '예약 취소하기'}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center px-2 leading-relaxed">
              이 페이지의 링크는 본인만 가지고 계셔야 합니다. SNS 등에 공유하지 마세요.
            </p>
          </div>
        )}

        {stage === 'pickTime' && schedule && booking && booking.slot && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs text-gray-500 mb-1">{schedule.title}</p>
              <p className="text-sm text-gray-900">
                현재 예약:{' '}
                <span className="font-medium">
                  {formatDateShort(booking.slot.date)} {booking.slot.startTime}~
                  {booking.slot.endTime}
                </span>
              </p>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed px-1">
              변경할 시간대를 선택해 주세요. 다른 분이 예약한 시간대는 선택할 수 없습니다.
            </p>

            <div className="space-y-4">
              {groupedSlots.map((group) => (
                <div key={group.date} className="bg-white rounded-2xl shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {formatDateLong(group.date)}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.slots.map((slot) => {
                      const isCurrent = slot.id === booking.slotId;
                      const isAvailable = slot.status === 'available' || isCurrent;
                      const isSelected = selectedSlotId === slot.id;
                      const subLabel = isCurrent
                        ? '현재 예약'
                        : slot.status === 'booked'
                          ? '다른 예약'
                          : slot.status === 'blocked'
                            ? '차단됨'
                            : null;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!isAvailable || submitting}
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={[
                            'rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                              : isAvailable
                                ? 'border-gray-200 bg-white text-gray-900 hover:border-indigo-300'
                                : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed',
                          ].join(' ')}
                        >
                          <div className="font-medium">
                            {slot.startTime}~{slot.endTime}
                          </div>
                          {subLabel && <div className="text-[11px] mt-0.5">{subLabel}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groupedSlots.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">
                  선택 가능한 시간대가 없습니다.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-red-600 text-center font-medium">{error}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStage('view');
                  setSelectedSlotId(null);
                  setError(null);
                }}
                disabled={submitting}
                className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReschedule()}
                disabled={!selectedSlotId || selectedSlotId === booking.slotId || submitting}
                className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? '변경 중…' : '시간 변경하기'}
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
            {toast}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-4 text-center">
        <p className="text-xs text-gray-400">Powered by 쌤핀</p>
        {/* 보호자가 예약 내용을 조회·변경하는 화면이므로 방침 고지 필수 (필수기준 ①·③) */}
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-gray-600"
          >
            개인정보처리방침
          </a>
          <span className="text-gray-300">·</span>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-gray-600"
          >
            이용약관
          </a>
        </p>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
