import { useEffect, useState } from 'react';

/** 로컬 기준 오늘 날짜 문자열 (YYYY-MM-DD). */
export function formatTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 오늘 날짜(로컬, YYYY-MM-DD)를 상태로 제공 — 자정을 넘기면 자동 갱신된다.
 *
 * 검토 큐의 기한 계산·학생 경고 점이 렌더 시점 날짜를 메모 안에 가둬,
 * 자정 이후에도 기록이 변하기 전까지 어제 기준으로 남던 문제(codex QA) 해소.
 * 갱신 시각은 자정+5초 — 경계 직전 타이머 오차로 같은 날짜를 다시 읽는 일을 피한다.
 */
export function useTodayStr(): string {
  const [today, setToday] = useState(formatTodayStr);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(
      () => setToday(formatTodayStr()),
      nextMidnight.getTime() - now.getTime(),
    );
    return () => clearTimeout(timer);
  }, [today]);

  return today;
}
