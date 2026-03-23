import { useEffect, useMemo, useState } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { consultationSupabaseClient } from '@adapters/di/container';
import type { SlotPublic } from '@infrastructure/supabase/ConsultationSupabaseClient';

export function ConsultationWidget() {
  const { schedules, loaded, load } = useConsultationStore();
  const [slotData, setSlotData] = useState<Map<string, { total: number; booked: number }>>(new Map());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const activeSchedules = useMemo(
    () => schedules.filter((s) => !s.isArchived),
    [schedules],
  );

  // Fetch slot data for active schedules (once)
  useEffect(() => {
    if (!isOnline || activeSchedules.length === 0) return;
    const fetchAll = async () => {
      const map = new Map<string, { total: number; booked: number }>();
      for (const schedule of activeSchedules.slice(0, 3)) {
        try {
          const slots = await consultationSupabaseClient.getSlots(schedule.id);
          const total = slots.length;
          const booked = slots.filter((s: SlotPublic) => s.status === 'booked').length;
          map.set(schedule.id, { total, booked });
        } catch {
          // ignore
        }
      }
      setSlotData(map);
    };
    void fetchAll();
  }, [activeSchedules, isOnline]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sp-muted text-xs">불러오는 중...</p>
      </div>
    );
  }

  if (activeSchedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-sp-muted">
        <span className="text-2xl">📅</span>
        <p className="text-xs">진행 중인 상담 없음</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {activeSchedules.slice(0, 3).map((schedule) => {
        const data = slotData.get(schedule.id);
        const percentage = data && data.total > 0
          ? Math.round((data.booked / data.total) * 100)
          : 0;

        return (
          <div key={schedule.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {schedule.type === 'parent' ? '👨‍👩‍👧' : '🙋'}
              </span>
              <span className="text-xs text-sp-text font-medium truncate flex-1">
                {schedule.title}
              </span>
              {data && (
                <span className="text-caption text-sp-muted whitespace-nowrap">
                  {data.booked}/{data.total}
                </span>
              )}
            </div>
            {data ? (
              <div className="h-1.5 bg-sp-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-blue-400"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            ) : (
              <p className="text-caption text-sp-muted">
                {isOnline ? '로딩 중...' : '(연결 필요)'}
              </p>
            )}
          </div>
        );
      })}

      {activeSchedules.length > 3 && (
        <p className="text-caption text-sp-muted text-right">
          외 {activeSchedules.length - 3}건
        </p>
      )}

      <p className="text-caption text-sp-muted mt-auto">
        진행 중 {activeSchedules.length}건
      </p>
    </div>
  );
}
