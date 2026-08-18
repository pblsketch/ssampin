import { useClock } from '@adapters/hooks/useClock';

export function Clock() {
  const { date, time, dayOfWeek } = useClock();

  return (
    /*
      `tabular-nums` — 숫자 폭을 고정한다. 없으면 분이 바뀔 때마다 글자 폭이 달라져
      옆의 날씨 줄까지 흔들린다.
      `whitespace-nowrap` — 한글은 낱말 묶기 없이는 글자 사이 어디서나 끊긴다.
      좁은 창에서 "8월 18일 (화)" 가 두 줄로 갈라지는 것을 막는다.
    */
    <h2 className="text-3xl xl:text-4xl font-bold text-sp-text font-display mb-2 tabular-nums whitespace-nowrap">
      {date} ({dayOfWeek}) {time}
    </h2>
  );
}
