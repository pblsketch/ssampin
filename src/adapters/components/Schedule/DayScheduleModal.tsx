import { useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { getEventsForDate } from '@domain/rules/eventRules';
import { getKoreanHolidays } from '@domain/rules/holidayRules';
import { EventList } from './EventList';

interface DayScheduleModalProps {
    date: Date;
    events: readonly SchoolEvent[];
    categories: readonly CategoryItem[];
    onClose: () => void;
    onAddEvent: () => void;
    onEditEvent: (event: SchoolEvent) => void;
    onDeleteEvent: (id: string) => void;
    onSkipDate?: (eventId: string, date: string) => void;
}

export function DayScheduleModal({
    date,
    events,
    categories,
    onClose,
    onAddEvent,
    onEditEvent,
    onDeleteEvent,
    onSkipDate,
}: DayScheduleModalProps) {
    const y = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${mStr}-${dStr}`;
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    const titleStr = `${date.getMonth() + 1}월 ${date.getDate()}일 (${dayName})`;

    const dayEvents = useMemo(() => getEventsForDate(events, date), [events, date]);
    const dayHolidays = useMemo(() => {
        const allHolidays = getKoreanHolidays(y);
        return allHolidays.filter((h) => h.date === dateStr);
    }, [y, dateStr]);

    return (
        <div
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/60 p-4 md:p-8 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-sp-bg w-full max-w-md rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] border border-sp-border"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-sp-border bg-sp-surface shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-sp-text">{titleStr} 일정</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-sp-bg rounded-full transition-colors text-sp-muted hover:text-white"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-sp-bg/50">
                    <EventList
                        events={dayEvents}
                        categories={categories}
                        holidays={dayHolidays}
                        onEdit={onEditEvent}
                        onDelete={onDeleteEvent}
                        hideTitle={true}
                        onSkipDate={onSkipDate}
                        currentDate={dateStr}
                    />
                </div>

                <div className="p-4 border-t border-sp-border shrink-0 bg-sp-surface">
                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="w-full flex items-center justify-center gap-2 bg-sp-accent hover:bg-blue-600 text-white px-5 py-3 rounded-xl transition-all font-bold shadow-lg shadow-sp-accent/20"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        새 일정 추가
                    </button>
                </div>
            </div>
        </div>
    );
}
