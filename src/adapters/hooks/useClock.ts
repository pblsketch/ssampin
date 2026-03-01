import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ClockState {
  date: string;
  time: string;
  dayOfWeek: string;
}

const DAY_OF_WEEK_KR: Record<number, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
};

function getClockState(now: Date): ClockState {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dayIndex = now.getDay();
  return {
    date: `${month}월 ${day}일`,
    time: format(now, 'HH:mm', { locale: ko }),
    dayOfWeek: DAY_OF_WEEK_KR[dayIndex] ?? '월',
  };
}

export function useClock(): ClockState {
  const [state, setState] = useState<ClockState>(() => getClockState(new Date()));

  useEffect(() => {
    const id = setInterval(() => {
      setState(getClockState(new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return state;
}
