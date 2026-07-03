import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { CurrentPeriodInfo } from '@mobile/hooks/useCurrentPeriod';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import { CurrentClassCard } from './CurrentClassCard';
import { WeeklyTimetableCard } from './WeeklyTimetableCard';

interface Props {
  periodInfo: CurrentPeriodInfo;
  teacherSchedule: TeacherScheduleData;
  classSchedule: ClassScheduleData | null;
}

/** 학급 시간표에 실제 내용이 있는지 (담임이 아니면 보통 비어 있음) */
function hasClassContent(classSchedule: ClassScheduleData | null): boolean {
  if (!classSchedule) return false;
  return Object.values(classSchedule).some((periods) =>
    periods.some((p) => (p?.subject ?? '').trim() !== ''),
  );
}

/**
 * 홈 상단 카드 캐러셀 — 좌우 스와이프로 [오늘 현황 → 주간 교사 시간표 → 주간 학급 시간표] 전환.
 * 별도 라이브러리 없이 CSS scroll-snap + 스크롤 위치로 활성 슬라이드를 추적한다.
 */
export function HomeScheduleCarousel({ periodInfo, teacherSchedule, classSchedule }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  // 컨테이너 높이를 "현재 보이는 슬라이드" 높이에 맞춘다.
  // (flex 행은 기본적으로 가장 큰 슬라이드 높이로 고정돼, 짧은 카드일 때 아래에 빈 공간이
  //  크게 남고 다음 카드와의 간격이 벌어져 보인다. 활성 슬라이드 높이로 동기화해 해소.)
  const [height, setHeight] = useState<number | undefined>(undefined);

  const slides: { key: string; node: ReactNode }[] = [
    {
      key: 'today',
      node: <CurrentClassCard periodInfo={periodInfo} teacherSchedule={teacherSchedule} />,
    },
    {
      key: 'teacher',
      node: (
        <WeeklyTimetableCard
          variant="teacher"
          teacherSchedule={teacherSchedule}
          classSchedule={classSchedule}
          todayDow={periodInfo.dayOfWeek}
          currentPeriod={periodInfo.currentPeriod}
        />
      ),
    },
  ];

  // 우리 반 시간표는 담임 등 내용이 있을 때만 슬라이드로 추가
  if (hasClassContent(classSchedule)) {
    slides.push({
      key: 'class',
      node: (
        <WeeklyTimetableCard
          variant="class"
          teacherSchedule={teacherSchedule}
          classSchedule={classSchedule}
          todayDow={periodInfo.dayOfWeek}
          currentPeriod={periodInfo.currentPeriod}
        />
      ),
    });
  }

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive((prev) => (prev === idx ? prev : idx));
  }, []);

  const goTo = useCallback((idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }, []);

  // 활성 슬라이드 높이를 추적(콘텐츠 변화·접힘 등도 ResizeObserver로 반영).
  useEffect(() => {
    const el = slideRefs.current[active];
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, slides.length]);

  // 슬라이드가 하나뿐이면 캐러셀 UI 불필요
  if (slides.length <= 1) {
    return <div className="px-4">{slides[0]?.node}</div>;
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex items-start gap-3 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide px-4 transition-[height] duration-300 ease-out"
        style={{ scrollPaddingLeft: '1rem', scrollPaddingRight: '1rem', height }}
        role="group"
        aria-roledescription="carousel"
        aria-label="오늘 현황과 주간 시간표"
      >
        {slides.map((s, i) => (
          <div
            key={s.key}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className="w-full shrink-0 snap-center snap-always self-start"
          >
            {s.node}
          </div>
        ))}
      </div>

      {/* 점 인디케이터 */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {slides.map((s, i) => {
          const isActive = i === active;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}번째 카드로 이동`}
              aria-current={isActive ? 'true' : undefined}
              className="flex items-center justify-center px-1 py-2"
            >
              <span
                className={`block rounded-full transition-all ${
                  isActive ? 'w-4 h-1.5 bg-sp-accent' : 'w-1.5 h-1.5 bg-sp-muted opacity-40'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
