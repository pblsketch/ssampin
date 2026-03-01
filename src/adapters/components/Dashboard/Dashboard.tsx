import { useEffect } from 'react';
import { Clock } from './Clock';
import { WeatherBar } from './WeatherBar';
import { MessageBanner } from './MessageBanner';
import { DashboardTimetable } from './DashboardTimetable';
import { DashboardEvents } from './DashboardEvents';
import { DashboardMemo } from './DashboardMemo';
import { DashboardTodo } from './DashboardTodo';
import { DashboardStudentRecords } from './DashboardStudentRecords';
import { DashboardMeal } from './DashboardMeal';
import { DashboardPinGuard } from './DashboardPinGuard';
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
        {/* 상단 3열: 시간표 | 학급 자리 배치 | 일정 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DashboardPinGuard feature="timetable">
            <DashboardTimetable />
          </DashboardPinGuard>

          {/* 학급 자리 배치 - placeholder */}
          <DashboardPinGuard feature="seating">
            <div className="rounded-xl bg-sp-card p-6 flex items-center justify-center min-h-[260px]">
              <p className="text-sp-muted text-sm">학급 자리 배치 준비 중...</p>
            </div>
          </DashboardPinGuard>

          <DashboardPinGuard feature="schedule">
            <DashboardEvents />
          </DashboardPinGuard>
        </div>

        {/* 중단: 급식 | 메모 | 담임메모 | 할일 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DashboardPinGuard feature="meal">
            <DashboardMeal />
          </DashboardPinGuard>
          <DashboardPinGuard feature="memo">
            <DashboardMemo />
          </DashboardPinGuard>
          <DashboardPinGuard feature="studentRecords">
            <DashboardStudentRecords />
          </DashboardPinGuard>
          <DashboardPinGuard feature="todo">
            <DashboardTodo />
          </DashboardPinGuard>
        </div>
      </section>
    </div>
  );
}
