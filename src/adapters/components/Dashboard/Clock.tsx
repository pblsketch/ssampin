import { useClock } from '@adapters/hooks/useClock';

export function Clock() {
  const { date, time, dayOfWeek } = useClock();

  return (
    <h2 className="text-4xl font-bold text-white font-display mb-2">
      {date} ({dayOfWeek}) {time}
    </h2>
  );
}
