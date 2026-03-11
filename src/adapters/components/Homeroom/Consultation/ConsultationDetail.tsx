import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { ExportModal } from '@adapters/components/Homeroom/shared/ExportModal';
import { consultationSupabaseClient } from '@adapters/di/container';
import { decrypt } from '@domain/rules/cryptoUtils';
import {
  buildConsultationEventTitle,
  buildConsultationEventDescription,
} from '@domain/rules/consultationCalendarRules';
import type { ConsultationSchedule, ConsultationMethod } from '@domain/entities/Consultation';
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

function parseBookerInfo(raw: string): { relation: string; name: string; contact: string } | null {
  const parts = raw.split('|');
  if (parts.length >= 3) {
    return { relation: parts[0]!, name: parts[1]!, contact: parts[2]! };
  }
  return null;
}

/* ──────────────── ConsultationShareModal ──────────────── */

interface ConsultationShareModalProps {
  schedule: ConsultationSchedule;
  onClose: () => void;
  onCopyLink: () => Promise<void>;
}

function ConsultationShareModal({ schedule, onClose, onCopyLink }: ConsultationShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showToast = useToastStore((s) => s.show);
  const url = schedule.shortUrl ?? schedule.shareUrl;

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      color: { dark: '#1a2332', light: '#ffffff' },
    });
  }, [url]);

  const handleDownloadQR = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `상담_QR_${schedule.title.slice(0, 20)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    showToast('QR 이미지가 저장되었습니다', 'success');
  }, [schedule.title, showToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <h3 className="text-sm font-bold text-sp-text">상담 예약 공유</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 flex flex-col items-center gap-4">
          <p className="text-xs text-sp-muted text-center">{schedule.title}</p>

          {/* QR 코드 */}
          <div className="bg-white rounded-xl p-3">
            <canvas ref={canvasRef} />
          </div>

          {/* 링크 */}
          <div className="w-full flex items-center gap-2 bg-sp-surface rounded-lg border border-sp-border px-3 py-2">
            <span className="material-symbols-outlined text-sm text-sp-muted">link</span>
            <span className="flex-1 text-xs text-sp-text truncate select-all">{url}</span>
            <button
              onClick={() => { void onCopyLink(); }}
              className="shrink-0 text-xs text-sp-accent hover:text-sp-accent/80 font-medium transition-colors"
            >
              복사
            </button>
          </div>

          {/* 버튼들 */}
          <div className="w-full grid grid-cols-2 gap-2">
            <button
              onClick={() => { void onCopyLink(); }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              링크 복사
            </button>
            <button
              onClick={handleDownloadQR}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent/50 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              QR 저장
            </button>
          </div>

          <p className="text-[10px] text-sp-muted/60 text-center">
            학부모/학생에게 이 링크를 공유하세요.
          </p>
        </div>
      </div>
    </div>
  );
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
  const [decryptedMemoMap, setDecryptedMemoMap] = useState<Map<string, string>>(new Map());
  const [showExport, setShowExport] = useState(false);
  const [showAllUnbooked, setShowAllUnbooked] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareLink, setShowShareLink] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [addedToCalendarIds, setAddedToCalendarIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`ssampin:consultation-cal:${schedule.id}`);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [addingCalendarId, setAddingCalendarId] = useState<string | null>(null);
  const [expandedSlotIds, setExpandedSlotIds] = useState<Set<string>>(new Set());
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
      const infoMap = new Map<string, string>();
      const memoMap = new Map<string, string>();
      for (const b of bookings) {
        if (b.bookerInfoEncrypted) {
          try {
            const info = await decrypt(b.bookerInfoEncrypted, schedule.adminKey);
            infoMap.set(b.id, info);
          } catch {
            infoMap.set(b.id, '(정보 없음)');
          }
        }
        if (b.memoEncrypted) {
          try {
            const memo = await decrypt(b.memoEncrypted, schedule.adminKey);
            memoMap.set(b.id, memo);
          } catch {
            // ignore
          }
        }
      }
      setDecryptedInfoMap(infoMap);
      setDecryptedMemoMap(memoMap);
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

  /* ── 오전/오후 그룹 ── */
  const slotSections = useMemo(() => {
    const morning: typeof filteredSlots = [];
    const afternoon: typeof filteredSlots = [];
    for (const slot of filteredSlots) {
      const hour = parseInt(slot.startTime.slice(0, 2), 10);
      if (hour < 12) morning.push(slot);
      else afternoon.push(slot);
    }
    const sections: { label: string; slots: typeof filteredSlots }[] = [];
    if (morning.length > 0) sections.push({ label: '오전', slots: morning });
    if (afternoon.length > 0) sections.push({ label: '오후', slots: afternoon });
    return sections;
  }, [filteredSlots]);

  /* ── 학생 번호 → 이름 ── */
  function getStudentName(studentNumber: number): string {
    const s = nonVacant[studentNumber - 1];
    return s ? s.name : `${studentNumber}번`;
  }

  /* ── 진행률 ── */
  const totalSlots = slots.length;
  const bookedSlots = slots.filter((s) => s.status === 'booked').length;
  const blockedSlots = slots.filter((s) => s.status === 'blocked').length;
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
      { key: 'topic', label: '상담 주제' },
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
        topic: booking ? (decryptedMemoMap.get(booking.id) ?? '-') : '-',
      };
    });
    return { columns, rows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, bookings, decryptedInfoMap, decryptedMemoMap, nonVacant]);

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
    const shareUrl = schedule.shortUrl ?? schedule.shareUrl;
    await navigator.clipboard.writeText(shareUrl);
    showToast('링크가 복사되었습니다', 'success');
  }, [schedule.shortUrl, schedule.shareUrl, showToast]);

  const handleAddToCalendar = useCallback(async (
    booking: BookingPublic,
    slot: SlotPublic,
  ) => {
    setAddingCalendarId(booking.id);
    try {
      const studentName = getStudentName(booking.studentNumber);
      const raw = decryptedInfoMap.get(booking.id);
      const parsed = raw ? parseBookerInfo(raw) : null;
      const topic = decryptedMemoMap.get(booking.id);

      const title = buildConsultationEventTitle(
        booking.studentNumber,
        studentName,
        booking.method as ConsultationMethod,
        schedule.type,
        parsed?.relation,
      );
      const description = buildConsultationEventDescription({
        method: booking.method as ConsultationMethod,
        bookerName: parsed?.name,
        bookerPhone: parsed?.contact,
        topic,
      });

      await useEventsStore.getState().addEvent({
        title,
        date: slot.date,
        category: 'class',
        description,
        time: `${slot.startTime} - ${slot.endTime}`,
      });

      const next = new Set(addedToCalendarIds);
      next.add(booking.id);
      setAddedToCalendarIds(next);
      localStorage.setItem(
        `ssampin:consultation-cal:${schedule.id}`,
        JSON.stringify([...next]),
      );
      showToast('일정이 캘린더에 추가되었습니다', 'success');
    } catch {
      showToast('캘린더 추가에 실패했습니다', 'error');
    } finally {
      setAddingCalendarId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decryptedInfoMap, decryptedMemoMap, addedToCalendarIds, schedule.id, showToast, nonVacant]);

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
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">{schedule.type === 'parent' ? 'family_restroom' : 'school'}</span>
          {schedule.type === 'parent' ? '학부모 상담' : '학생 상담'}
        </span>
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

      {/* 예약 현황 진행 바 */}
      {filteredSlots.length > 0 && (() => {
        const dateBooked = filteredSlots.filter((s) => s.status === 'booked').length;
        const dateBlocked = filteredSlots.filter((s) => s.status === 'blocked').length;
        const dateTotal = filteredSlots.length;
        const bookedPct = Math.round((dateBooked / dateTotal) * 100);
        const blockedPct = Math.round((dateBlocked / dateTotal) * 100);
        return (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] text-sp-muted mb-1">
              <span>예약 현황</span>
              <span className="text-sp-text font-medium">{dateBooked}/{dateTotal}</span>
            </div>
            <div className="h-1.5 rounded-full bg-sp-border/30 overflow-hidden flex" aria-label={`예약 ${dateBooked}명 / 전체 ${dateTotal}슬롯`}>
              {bookedPct > 0 && (
                <div
                  className="bg-green-500/70 transition-all duration-500"
                  style={{ width: `${bookedPct}%` }}
                />
              )}
              {blockedPct > 0 && (
                <div
                  className="bg-red-500/50 transition-all duration-500"
                  style={{ width: `${blockedPct}%` }}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* 슬롯 리스트 */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {slotSections.map((section, si) => (
            <div key={section.label}>
              {/* 섹션 헤더 */}
              <div className={`flex items-center gap-2 px-1 mb-1.5 ${si > 0 ? 'mt-3' : ''}`}>
                <span className="text-[10px] font-bold text-sp-muted uppercase tracking-widest">
                  {section.label}
                </span>
                <span className="text-[10px] text-sp-muted/50 bg-sp-surface rounded-full px-1.5 py-0.5">
                  {section.slots.length}슬롯
                </span>
                <div className="flex-1 h-px bg-sp-border/40" />
              </div>

              {/* 슬롯 목록 */}
              <div className="flex flex-col gap-1.5">
                {section.slots.map((slot) => {
                  const booking = bookings.find((b) => b.slotId === slot.id);
                  const isBooked = slot.status === 'booked';
                  const isBlocked = slot.status === 'blocked';
                  return (
                    <div
                      key={slot.id}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        isBooked
                          ? 'bg-green-500/8 border border-green-500/20 border-l-2 border-l-green-500 shadow-sm'
                          : isBlocked
                            ? 'bg-sp-surface/40 border border-sp-border/30 opacity-60'
                            : 'bg-transparent border border-dashed border-sp-border/60 hover:bg-sp-accent/5 hover:border-sp-accent/40'
                      }`}
                      {...(isBlocked ? { 'aria-disabled': 'true' } : {})}
                    >
                      {/* 시간 */}
                      <div className="flex flex-col items-end shrink-0 w-14">
                        <span className="text-xs font-semibold text-sp-text font-mono leading-none">
                          {slot.startTime.slice(0, 5)}
                        </span>
                        <span className="text-[10px] text-sp-muted/70 font-mono leading-none mt-0.5">
                          {slot.endTime.slice(0, 5)}
                        </span>
                      </div>

                      {/* 상태 아이콘 */}
                      <span className={`text-sm mt-0.5 ${isBooked ? 'text-green-400' : isBlocked ? 'text-red-400' : 'text-sp-border'}`}>
                        <span className="material-symbols-outlined text-base">
                          {isBooked ? 'check_circle' : isBlocked ? 'do_not_disturb_on' : 'radio_button_unchecked'}
                        </span>
                      </span>

                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        {isBooked && booking ? (() => {
                          const isExpanded = expandedSlotIds.has(slot.id);
                          const toggleExpand = () => {
                            setExpandedSlotIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(slot.id)) next.delete(slot.id);
                              else next.add(slot.id);
                              return next;
                            });
                          };
                          const raw = decryptedInfoMap.get(booking.id);
                          const parsed = raw ? parseBookerInfo(raw) : null;
                          const memo = decryptedMemoMap.get(booking.id);
                          return (
                          <div>
                            {/* 1줄: 학생 정보 + 상담 방식 + 상세 토글 + 액션 */}
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/25">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                예약됨
                              </span>
                              <span className="text-sp-text text-xs font-medium">
                                {booking.studentNumber}번 {getStudentName(booking.studentNumber)}
                              </span>
                              <span className="text-sp-muted text-[11px] flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-xs">
                                  {getMethodIcon(booking.method)}
                                </span>
                                {getMethodLabel(booking.method)}
                              </span>
                              <button
                                onClick={toggleExpand}
                                className="text-sp-muted hover:text-sp-accent transition-colors flex items-center gap-0.5"
                                title={isExpanded ? '상세 정보 접기' : '상세 정보 보기'}
                              >
                                <span className="material-symbols-outlined text-sm">
                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                                <span className="text-[11px]">{isExpanded ? '접기' : '상세'}</span>
                              </button>
                              {/* 액션 버튼들 */}
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                {addedToCalendarIds.has(booking.id) ? (
                                  <span className="text-green-400 flex items-center gap-0.5 text-[11px]">
                                    <span className="material-symbols-outlined text-sm">event_available</span>
                                    추가됨
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => { void handleAddToCalendar(booking, slot); }}
                                    disabled={addingCalendarId === booking.id}
                                    className="text-sp-muted hover:text-sp-accent transition-colors flex items-center gap-0.5 disabled:opacity-50"
                                    title="캘린더에 추가"
                                  >
                                    <span className="material-symbols-outlined text-sm">
                                      {addingCalendarId === booking.id ? 'hourglass_empty' : 'calendar_add_on'}
                                    </span>
                                    <span className="text-[11px]">캘린더</span>
                                  </button>
                                )}
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
                                    className="text-sp-accent hover:text-sp-accent/80 transition-colors flex items-center gap-0.5"
                                    title="상담 기록 작성"
                                  >
                                    <span className="material-symbols-outlined text-sm">edit_note</span>
                                    <span className="text-[11px]">기록</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* 펼치기: 예약자 상세 정보 (개인정보) */}
                            {isExpanded && (
                              <div className="mt-2 ml-0.5 p-2.5 rounded-lg bg-sp-surface/60 border border-sp-border/40 text-[11px] text-sp-muted space-y-1.5">
                                {parsed && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-xs text-sp-muted/60">person</span>
                                      <span className="text-sp-muted/60 w-12 shrink-0">관계</span>
                                      <span className="text-sp-text">{parsed.relation}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-xs text-sp-muted/60">badge</span>
                                      <span className="text-sp-muted/60 w-12 shrink-0">이름</span>
                                      <span className="text-sp-text">{parsed.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-xs text-sp-muted/60">call</span>
                                      <span className="text-sp-muted/60 w-12 shrink-0">연락처</span>
                                      <span className="text-sp-text">{parsed.contact}</span>
                                    </div>
                                  </>
                                )}
                                {!parsed && raw && (
                                  <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xs text-sp-muted/60">info</span>
                                    <span className="text-sp-text">{raw}</span>
                                  </div>
                                )}
                                {memo && (
                                  <div className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-xs text-sp-muted/60 mt-0.5">chat</span>
                                    <span className="text-sp-muted/60 w-12 shrink-0">메모</span>
                                    <span className="text-sp-text">{memo}</span>
                                  </div>
                                )}
                                {!parsed && !raw && !memo && (
                                  <div className="flex items-center gap-2 text-sp-muted/50">
                                    <span className="material-symbols-outlined text-xs">info</span>
                                    <span>추가 입력 정보가 없습니다</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          );
                        })() : isBlocked ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-red-400 text-xs">차단된 슬롯</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-sp-muted/70">예약 가능</span>
                            <span className="ml-auto text-[10px] text-sp-accent/50 font-medium">
                              {schedule.slotMinutes}분
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredSlots.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sp-muted">
              <span className="material-symbols-outlined text-3xl">event_busy</span>
              <p className="text-sm font-medium">이 날짜에 슬롯이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 하단: 통계 + 미신청 학생 */}
      <div className="mt-3 pt-3 border-t border-sp-border">
        <div className="flex flex-wrap gap-3 text-xs text-sp-muted mb-2">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-green-400">event_available</span>
            예약: <strong className="text-green-400">{bookedSlots}명</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">schedule</span>
            빈 슬롯: <strong>{totalSlots - bookedSlots - blockedSlots}</strong>
          </span>
        </div>
        {unbookedStudents.length > 0 && (
          <div className="rounded-lg bg-sp-card border border-sp-border p-2.5">
            <button
              type="button"
              onClick={() => setShowAllUnbooked((v) => !v)}
              className="w-full flex items-center justify-between text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <span className="material-symbols-outlined text-xs">warning</span>
                미신청: {unbookedStudents.length}명
              </span>
              <span className="text-[10px] text-sp-muted">
                {showAllUnbooked ? '접기 ▲' : '펼치기 ▼'}
              </span>
            </button>
            {showAllUnbooked && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unbookedStudents.map((s) => (
                  <span
                    key={s.number}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-sp-border/60 text-sp-text text-[11px]"
                  >
                    {s.number}번 {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 링크 공유 모달 */}
      {showShareLink && (
        <ConsultationShareModal
          schedule={schedule}
          onClose={() => setShowShareLink(false)}
          onCopyLink={handleCopyLink}
        />
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
