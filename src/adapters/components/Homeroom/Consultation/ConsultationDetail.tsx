import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { ExportModal } from '@adapters/components/Homeroom/shared/ExportModal';
import { consultationSupabaseClient } from '@adapters/di/container';
import { decrypt } from '@domain/rules/cryptoUtils';
import type { ConsultationSchedule } from '@domain/entities/Consultation';
import type { SlotPublic, BookingPublic } from '@infrastructure/supabase/ConsultationSupabaseClient';
import type { RecordPrefill } from '../HomeroomPage';

/* ──────────────── Props ──────────────── */

interface ConsultationDetailProps {
  schedule: ConsultationSchedule;
  onBack: () => void;
  onWriteRecord?: (prefill: RecordPrefill) => void;
}

/* ──────────────── 헬퍼 ──────────────── */

function getMethodIcon(m: string): string {
  switch (m) {
    case 'face': return 'groups';
    case 'phone': return 'call';
    case 'video': return 'videocam';
    default: return 'help';
  }
}

function getMethodLabel(m: string): string {
  switch (m) {
    case 'face': return '대면';
    case 'phone': return '전화';
    case 'video': return '화상';
    default: return m;
  }
}

/* ──────────────── 컴포넌트 ──────────────── */

export function ConsultationDetail({ schedule, onBack, onWriteRecord }: ConsultationDetailProps) {
  const { archiveSchedule, deleteSchedule } = useConsultationStore();
  const { students } = useStudentStore();
  const showToast = useToastStore((s) => s.show);

  const [slots, setSlots] = useState<SlotPublic[]>([]);
  const [bookings, setBookings] = useState<BookingPublic[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [decryptedInfoMap, setDecryptedInfoMap] = useState<Map<string, string>>(new Map());
  const [showExport, setShowExport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareLink, setShowShareLink] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const stopPollingRef = useRef<(() => void) | null>(null);

  const nonVacant = useMemo(() => students.filter((s) => !s.isVacant), [students]);

  /* ── 온라인 상태 감시 ── */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /* ── 폴링 (30초) ── */
  useEffect(() => {
    if (!isOnline) return;
    const stop = consultationSupabaseClient.startPolling(
      schedule.id,
      (newSlots, newBookings) => {
        setSlots(newSlots);
        setBookings(newBookings);
      },
      30_000,
    );
    stopPollingRef.current = stop;
    return () => {
      stop();
      stopPollingRef.current = null;
    };
  }, [schedule.id, isOnline]);

  /* ── 첫 날짜 자동 선택 ── */
  useEffect(() => {
    if (!selectedDate && schedule.dates.length > 0) {
      setSelectedDate(schedule.dates[0]!.date);
    }
  }, [selectedDate, schedule.dates]);

  /* ── 예약자 정보 복호화 ── */
  useEffect(() => {
    const decryptAll = async () => {
      const map = new Map<string, string>();
      for (const b of bookings) {
        if (b.bookerInfoEncrypted) {
          try {
            const info = await decrypt(b.bookerInfoEncrypted, schedule.adminKey);
            map.set(b.id, info);
          } catch {
            map.set(b.id, '(정보 없음)');
          }
        }
      }
      setDecryptedInfoMap(map);
    };
    void decryptAll();
  }, [bookings, schedule.adminKey]);

  /* ── 날짜 목록 (중복 제거, 정렬) ── */
  const uniqueDates = useMemo(() => {
    const dates = [...new Set(slots.map((s) => s.date))];
    dates.sort();
    return dates;
  }, [slots]);

  /* ── 선택 날짜의 슬롯 ── */
  const filteredSlots = useMemo(() => {
    if (!selectedDate) return [];
    return slots.filter((s) => s.date === selectedDate);
  }, [slots, selectedDate]);

  /* ── 학생 번호 → 이름 ── */
  function getStudentName(studentNumber: number): string {
    const s = nonVacant[studentNumber - 1];
    return s ? s.name : `${studentNumber}번`;
  }

  /* ── 진행률 ── */
  const totalSlots = slots.length;
  const bookedSlots = slots.filter((s) => s.status === 'booked').length;
  const percentage = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

  /* ── 미신청 학생 ── */
  const unbookedStudents = useMemo(() => {
    const bookedNumbers = new Set(bookings.map((b) => b.studentNumber));
    return nonVacant
      .map((s, i) => ({ number: i + 1, name: s.name }))
      .filter((s) => !bookedNumbers.has(s.number));
  }, [nonVacant, bookings]);

  /* ── 내보내기 데이터 ── */
  const exportData = useMemo(() => {
    const columns = [
      { key: 'date', label: '날짜' },
      { key: 'time', label: '시간' },
      { key: 'status', label: '상태' },
      { key: 'number', label: '번호' },
      { key: 'studentName', label: '학생명' },
      { key: 'bookerInfo', label: '예약자 정보' },
      { key: 'method', label: '상담 방식' },
    ];
    const rows = slots.map((slot) => {
      const booking = bookings.find((b) => b.slotId === slot.id);
      return {
        date: slot.date,
        time: `${slot.startTime}~${slot.endTime}`,
        status: slot.status === 'booked' ? '예약' : slot.status === 'blocked' ? '차단' : '빈 슬롯',
        number: booking ? String(booking.studentNumber) : '-',
        studentName: booking ? getStudentName(booking.studentNumber) : '-',
        bookerInfo: booking ? (decryptedInfoMap.get(booking.id) ?? '-') : '-',
        method: booking ? getMethodLabel(booking.method) : '-',
      };
    });
    return { columns, rows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, bookings, decryptedInfoMap, nonVacant]);

  /* ── 메뉴 핸들러 ── */
  const handleArchive = useCallback(async () => {
    await archiveSchedule(schedule.id);
    showToast('보관 처리되었습니다', 'success');
    onBack();
  }, [archiveSchedule, schedule.id, showToast, onBack]);

  const handleDelete = useCallback(async () => {
    await deleteSchedule(schedule.id);
    showToast('삭제되었습니다', 'success');
    onBack();
  }, [deleteSchedule, schedule.id, showToast, onBack]);

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(schedule.shareUrl);
    showToast('링크가 복사되었습니다', 'success');
  }, [schedule.shareUrl, showToast]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="text-sp-muted hover:text-sp-text transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h3 className="text-sm font-bold text-sp-text truncate">{schedule.title}</h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowShareLink(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-muted text-xs hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-sm">share</span>
            링크 공유
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-muted text-xs hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-sm">file_download</span>
            내보내기
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-lg">more_vert</span>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[120px]">
                  <button
                    onClick={() => { setShowMenu(false); void handleArchive(); }}
                    className="w-full text-left px-3 py-2 text-xs text-sp-text hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">archive</span>
                    보관
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); void handleDelete(); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 요약 */}
      <div className="text-xs text-sp-muted mb-3 flex items-center gap-2 flex-wrap">
        <span>{schedule.type === 'parent' ? '👨‍👩‍👧 학부모 상담' : '🙋 학생 상담'}</span>
        <span>·</span>
        <span>{bookedSlots}/{totalSlots} 예약 ({percentage}%)</span>
        <span>·</span>
        <span>{schedule.slotMinutes}분</span>
      </div>

      {/* 오프라인 안내 */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3 text-xs text-amber-400 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">wifi_off</span>
          인터넷 연결이 필요합니다. 예약 현황은 온라인에서만 확인할 수 있습니다.
        </div>
      )}

      {/* 날짜 탭 */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {uniqueDates.map((date) => (
          <button
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              selectedDate === date
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {date.slice(5).replace('-', '/')}
          </button>
        ))}
      </div>

      {/* 슬롯 리스트 */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          {filteredSlots.map((slot) => {
            const booking = bookings.find((b) => b.slotId === slot.id);
            const isBooked = slot.status === 'booked';
            const isBlocked = slot.status === 'blocked';
            return (
              <div
                key={slot.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  isBooked
                    ? 'bg-green-500/10 border border-green-500/20'
                    : isBlocked
                      ? 'bg-red-500/10 border border-red-500/20'
                      : 'bg-sp-surface border border-sp-border'
                }`}
              >
                {/* 시간 */}
                <span className="text-xs text-sp-muted font-mono w-12 shrink-0">
                  {slot.startTime}
                </span>

                {/* 상태 아이콘 */}
                <span className={`text-sm ${isBooked ? 'text-green-400' : isBlocked ? 'text-red-400' : 'text-sp-muted'}`}>
                  {isBooked ? '✅' : isBlocked ? '🚫' : '⬜'}
                </span>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  {isBooked && booking ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sp-text text-xs font-medium">
                        {booking.studentNumber}번 {getStudentName(booking.studentNumber)}
                      </span>
                      {decryptedInfoMap.get(booking.id) && (
                        <span className="text-sp-muted text-xs">
                          ({decryptedInfoMap.get(booking.id)})
                        </span>
                      )}
                      <span className="text-sp-muted text-xs flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-xs">
                          {getMethodIcon(booking.method)}
                        </span>
                        {getMethodLabel(booking.method)}
                      </span>
                      {onWriteRecord && (
                        <button
                          onClick={() => {
                            const student = nonVacant[booking.studentNumber - 1];
                            if (!student) return;
                            onWriteRecord({
                              studentId: student.id,
                              category: 'counseling',
                              subcategory: schedule.type === 'parent' ? '학부모상담' : '학생상담',
                              method: booking.method === 'video' ? 'online' : booking.method,
                              date: slot.date,
                            });
                          }}
                          className="ml-auto text-sp-accent hover:text-sp-accent/80 transition-colors flex items-center gap-0.5 shrink-0"
                          title="상담 기록 작성"
                        >
                          <span className="material-symbols-outlined text-sm">edit_note</span>
                          <span className="text-[11px]">기록</span>
                        </button>
                      )}
                    </div>
                  ) : isBlocked ? (
                    <span className="text-red-400 text-xs">차단된 슬롯</span>
                  ) : (
                    <span className="text-sp-muted text-xs">빈 슬롯</span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredSlots.length === 0 && (
            <div className="py-8 text-center text-sm text-sp-muted">
              이 날짜에 슬롯이 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 하단: 통계 + 미신청 학생 */}
      <div className="mt-3 pt-3 border-t border-sp-border">
        <div className="flex flex-wrap gap-3 text-xs text-sp-muted mb-2">
          <span>✅ 예약: <strong className="text-green-400">{bookedSlots}명</strong></span>
          <span>⬜ 빈 슬롯: <strong>{totalSlots - bookedSlots}</strong></span>
        </div>
        {unbookedStudents.length > 0 && (
          <div className="text-xs text-amber-400 flex items-start gap-1">
            <span>⚠️</span>
            <span>
              미신청: {unbookedStudents.slice(0, 10).map((s) => `${s.number}번 ${s.name}`).join(', ')}
              {unbookedStudents.length > 10 && ` 외 ${unbookedStudents.length - 10}명`}
            </span>
          </div>
        )}
      </div>

      {/* 링크 공유 모달 */}
      {showShareLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowShareLink(false)}
        >
          <div
            className="bg-sp-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-sp-text flex items-center gap-2">
                <span className="material-symbols-outlined text-sp-accent">share</span>
                상담 예약 공유
              </h3>
              <button
                onClick={() => setShowShareLink(false)}
                className="text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-sm text-sp-text mb-3 text-center">{schedule.title}</p>

            <p className="text-xs text-sp-muted break-all text-center mb-4 select-all bg-sp-surface p-3 rounded-lg">
              {schedule.shareUrl}
            </p>

            <button
              onClick={() => void handleCopyLink()}
              className="w-full px-4 py-2.5 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <span className="material-symbols-outlined text-base">content_copy</span>
              링크 복사
            </button>

            <p className="text-[10px] text-sp-muted/60 text-center mt-3">
              학부모/학생에게 이 링크를 공유하세요.
            </p>
          </div>
        </div>
      )}

      {/* 내보내기 모달 */}
      {showExport && (
        <ExportModal
          title={`${schedule.title} — 내보내기`}
          columns={exportData.columns}
          rows={exportData.rows}
          onClose={() => setShowExport(false)}
          fileName={schedule.title}
        />
      )}
    </div>
  );
}
