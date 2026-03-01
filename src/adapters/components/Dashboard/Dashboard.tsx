import { useEffect } from 'react';
import { Clock } from './Clock';
import { WeatherBar } from './WeatherBar';
import { MessageBanner } from './MessageBanner';
import { DashboardTimetable } from './DashboardTimetable';
import { DashboardEvents } from './DashboardEvents';
import { DashboardMemo } from './DashboardMemo';
import { DashboardTodo } from './DashboardTodo';
import { DashboardStudentRecords } from './DashboardStudentRecords';
import { useMessageStore } from '@adapters/stores/useMessageStore';

export function Dashboard() {
  const loadMessage = useMessageStore((s) => s.loadMessage);

  useEffect(() => {
    void loadMessage();
  }, [loadMessage]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더: 날짜/날씨 + 메시지 배너 */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Clock />
          <WeatherBar />
        </div>
        <MessageBanner />
      </header>

      {/* 위젯 영역 */}
      <section className="flex-1 space-y-4">
        {/* 상단 3열: 시간표 | 좌석배치 | 일정 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DashboardTimetable />

          {/* 좌석배치 - placeholder */}
          <div className="rounded-xl bg-sp-card p-6 flex items-center justify-center min-h-[260px]">
            <p className="text-sp-muted text-sm">좌석배치 준비 중...</p>
          </div>

          <DashboardEvents />
        </div>

        {/* 중단 3열: 메모 | 담임메모 | 할일 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DashboardMemo />
          <DashboardStudentRecords />
          <DashboardTodo />
        </div>
      </section>
    </div>
  );
}
