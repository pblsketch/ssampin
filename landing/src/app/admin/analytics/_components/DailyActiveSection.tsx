import { BarChart, Section } from './primitives';
import type { DailyActiveRow } from '../_lib/types';

export function DailyActiveSection({ daily }: { daily: DailyActiveRow[] }) {
  return (
    <Section title="일별 활성 사용자 (DAU)">
      <BarChart
        data={[...daily].reverse()}
        labelKey="date"
        valueKey="dau"
        formatLabel={(d: string) => d.slice(5)} // MM-DD
      />
    </Section>
  );
}
