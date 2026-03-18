import { useState, useEffect } from 'react';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { DayOfWeek } from '@domain/valueObjects/DayOfWeek';
import { getCurrentPeriod, getDayOfWeek, parseMinutes } from '@domain/rules/periodRules';

export interface CurrentPeriodInfo {
  currentPeriod: number | null;
  nextPeriod: number | null;
  progress: number;
  remainingMinutes: number;
  isBreak: boolean;
  isBeforeSchool: boolean;
  isAfterSchool: boolean;
  dayOfWeek: DayOfWeek;
}

export function useCurrentPeriod(periodTimes: readonly PeriodTime[]): CurrentPeriodInfo {
  const [info, setInfo] = useState<CurrentPeriodInfo>(() => calcInfo(periodTimes));

  useEffect(() => {
    const timer = setInterval(() => {
      setInfo(calcInfo(periodTimes));
    }, 1000);
    return () => clearInterval(timer);
  }, [periodTimes]);

  return info;
}

function calcInfo(periodTimes: readonly PeriodTime[]): CurrentPeriodInfo {
  const now = new Date();
  const dayOfWeek = getDayOfWeek(now) ?? '월';
  const currentPeriod = getCurrentPeriod(periodTimes, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (periodTimes.length === 0) {
    return {
      currentPeriod: null,
      nextPeriod: null,
      progress: 0,
      remainingMinutes: 0,
      isBreak: false,
      isBeforeSchool: true,
      isAfterSchool: false,
      dayOfWeek,
    };
  }

  const firstStart = parseMinutes(periodTimes[0]!.start);
  const lastEnd = parseMinutes(periodTimes[periodTimes.length - 1]!.end);

  if (nowMin < firstStart) {
    return {
      currentPeriod: null,
      nextPeriod: 1,
      progress: 0,
      remainingMinutes: firstStart - nowMin,
      isBreak: false,
      isBeforeSchool: true,
      isAfterSchool: false,
      dayOfWeek,
    };
  }

  if (nowMin >= lastEnd) {
    return {
      currentPeriod: null,
      nextPeriod: null,
      progress: 100,
      remainingMinutes: 0,
      isBreak: false,
      isBeforeSchool: false,
      isAfterSchool: true,
      dayOfWeek,
    };
  }

  if (currentPeriod != null) {
    const pt = periodTimes.find((p) => p.period === currentPeriod)!;
    const start = parseMinutes(pt.start);
    const end = parseMinutes(pt.end);
    const elapsed = nowMin - start;
    const total = end - start;
    return {
      currentPeriod,
      nextPeriod: currentPeriod < periodTimes.length ? currentPeriod + 1 : null,
      progress: Math.round((elapsed / total) * 100),
      remainingMinutes: end - nowMin,
      isBreak: false,
      isBeforeSchool: false,
      isAfterSchool: false,
      dayOfWeek,
    };
  }

  // 쉬는 시간
  let nextPeriod: number | null = null;
  let remainingMinutes = 0;
  for (const pt of periodTimes) {
    const start = parseMinutes(pt.start);
    if (nowMin < start) {
      nextPeriod = pt.period;
      remainingMinutes = start - nowMin;
      break;
    }
  }

  return {
    currentPeriod: null,
    nextPeriod,
    progress: 0,
    remainingMinutes,
    isBreak: true,
    isBeforeSchool: false,
    isAfterSchool: false,
    dayOfWeek,
  };
}
