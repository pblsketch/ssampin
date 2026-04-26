import { useMemo, useCallback } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { getEventsForDate, sortByDate } from '@domain/rules/eventRules';
import { getKoreanHolidays } from '@domain/rules/holidayRules';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EventList } from './EventList';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

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

/** 드래그 핸들이 있는 Sortable 래퍼 */
function SortableEventWrapper({ id, children }: { id: string; children: React.ReactNode }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : 'auto' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative group/sortable">
            {/* 드래그 핸들 */}
            <button
                type="button"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-7 opacity-0 group-hover/sortable:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 text-sp-muted hover:text-sp-text"
                {...attributes}
                {...listeners}
            >
                <span className="material-symbols-outlined text-icon">drag_indicator</span>
            </button>
            {children}
        </div>
    );
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

    const reorderEvents = useEventsStore((s) => s.reorderEvents);

    const dayEvents = useMemo(() => {
        const filtered = getEventsForDate(events, date);
        return sortByDate(filtered);
    }, [events, date]);

    const dayHolidays = useMemo(() => {
        const allHolidays = getKoreanHolidays(y);
        return allHolidays.filter((h) => h.date === dateStr);
    }, [y, dateStr]);

    // 드래그 가능한 이벤트 (외부/NEIS 이벤트 제외)
    const sortableIds = useMemo(
        () => dayEvents.filter((e) => !e.id.startsWith('ext:')).map((e) => e.id),
        [dayEvents],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const oldIndex = sortableIds.indexOf(active.id as string);
            const newIndex = sortableIds.indexOf(over.id as string);
            if (oldIndex === -1 || newIndex === -1) return;

            const reordered = arrayMove(sortableIds, oldIndex, newIndex);
            void reorderEvents(dateStr, reordered);
        },
        [sortableIds, dateStr, reorderEvents],
    );

    const hasSortableEvents = sortableIds.length > 1;

    return (
        <Modal isOpen onClose={onClose} title={`${titleStr} 일정`} srOnlyTitle size="md">
            <div className="flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-sp-border bg-sp-surface shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-sp-text">{titleStr} 일정</h3>
                        {hasSortableEvents && (
                            <p className="text-xs text-sp-muted mt-0.5">드래그하여 순서 변경</p>
                        )}
                    </div>
                    <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
                </div>

                <div className="flex-1 overflow-y-auto p-4 pl-10 bg-sp-bg/50">
                    {hasSortableEvents ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                                <EventList
                                    events={dayEvents}
                                    categories={categories}
                                    holidays={dayHolidays}
                                    onEdit={onEditEvent}
                                    onDelete={onDeleteEvent}
                                    hideTitle={true}
                                    onSkipDate={onSkipDate}
                                    currentDate={dateStr}
                                    renderWrapper={(id, children) => (
                                        <SortableEventWrapper key={id} id={id}>
                                            {children}
                                        </SortableEventWrapper>
                                    )}
                                />
                            </SortableContext>
                        </DndContext>
                    ) : (
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
                    )}
                </div>

                <div className="p-4 border-t border-sp-border shrink-0 bg-sp-surface">
                    <button
                        type="button"
                        onClick={onAddEvent}
                        className="w-full flex items-center justify-center gap-2 bg-sp-accent hover:bg-sp-accent/90 text-sp-accent-fg px-5 py-3 rounded-xl transition-all font-bold shadow-sp-md"
                    >
                        <span className="material-symbols-outlined text-icon-lg">add</span>
                        새 일정 추가
                    </button>
                </div>
            </div>
        </Modal>
    );
}
