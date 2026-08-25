// ── 정착·이탈 탭 ──
// "누가 계속 쓰는가". 설치 직후 어디서 빠지는지(퍼널), 몇 주째까지 남는지(코호트),
// 얼마나 자주 쓰는지(강도 등급), 그리고 떠난 분이 얼마나 되는지(이탈)를 본다.

import { Section } from '../_components/primitives';
import {
  DataTable,
  Empty,
  Funnel,
  Heatmap,
  Note,
  StackedShare,
  StatCard,
  num,
  pct,
} from '../_components/charts';
import { loadRetention } from '../_lib/data';
import type { DateRange } from '../_lib/data';

const TIER_COLORS = [
  'bg-gray-600',
  'bg-blue-800',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-emerald-400',
];

const CHURN_COLORS = [
  'bg-emerald-500',
  'bg-lime-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-rose-600',
];

export default async function RetentionTab({ range }: { range: DateRange }) {
  const { funnel, cohort, tiers, churn, overview } = await loadRetention(range);

  // 코호트를 히트맵 좌표로 옮긴다. 세로축 = 처음 쓴 주, 가로축 = 그로부터 몇 주째.
  const cohortWeeks = [...new Set(cohort.map((c) => c.cohort_week))].sort().reverse();
  const maxOffset = cohort.reduce((m, c) => Math.max(m, c.week_offset), 0);
  const cohortCells = cohort.map((c) => ({
    row: cohortWeeks.indexOf(c.cohort_week),
    col: c.week_offset,
    value: c.pct ?? 0,
    title: `${c.cohort_week} 시작 ${num(c.cohort_size)}명 중 ${c.week_offset}주째 ${num(c.retained)}명 (${pct(c.pct)})`,
  }));

  const churnActive = churn.find((c) => c.bucket_order === 1);
  const churnLost = churn.filter((c) => c.bucket_order >= 4);
  const lostDevices = churnLost.reduce((s, c) => s + c.devices, 0);
  const lostEngaged = churnLost.reduce((s, c) => s + c.engaged_devices, 0);

  // 4주째까지 남은 비율 — 코호트별 편차가 있어 평균 대신 "최근에 값이 있는 코호트" 기준으로 본다.
  const week4 = cohort.filter((c) => c.week_offset === 4 && c.cohort_size >= 3);
  const week4Avg =
    week4.length > 0
      ? Math.round((week4.reduce((s, c) => s + (c.pct ?? 0), 0) / week4.length) * 10) / 10
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="최근 7일 안에 쓴 분"
          value={num(churnActive?.devices)}
          sub={`전체의 ${pct(churnActive?.pct)}`}
          tone="good"
        />
        <StatCard
          label="한 달 넘게 안 오신 분"
          value={num(lostDevices)}
          sub={`그중 5일 이상 쓰셨던 분 ${num(lostEngaged)}명 — 이분들이 왜 떠났는지가 가장 중요합니다`}
          tone={lostDevices > 0 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="4주째 남는 비율"
          value={week4Avg == null ? '-' : `${week4Avg}%`}
          sub="처음 쓴 주로부터 4주 뒤에도 쓰고 계신 비율(코호트 평균)"
        />
        <StatCard
          label="습관화 정도 (주간÷월간)"
          value={pct(overview?.stickiness)}
          sub={`최근 7일 ${num(overview?.wau)}명 / 30일 ${num(overview?.mau)}명`}
        />
      </div>

      <Section title="처음 온 뒤 어디서 빠지나 (온보딩 퍼널)">
        <Note>
          고른 기간에 <strong>처음 쌤핀을 켠 분</strong>만 세어, 각 단계까지 도달한 비율을 봅니다.
          붉은 막대가 가장 많이 빠지는 단계입니다 — 손볼 곳이 거기입니다. 마지막 &ldquo;이틀째
          재방문&rdquo;은 하루 써보고 끝났는지 실제로 돌아왔는지를 가릅니다.
        </Note>
        <Funnel
          steps={funnel.map((f) => ({
            label: f.step,
            value: f.devices,
            pct: f.pct,
            drop: f.drop_from_prev,
          }))}
        />
      </Section>

      <Section title="처음 쓴 주별로, 몇 주째까지 남나 (코호트)">
        <Note>
          가로는 처음 쓴 주로부터 몇 주가 지났는지, 세로는 언제 처음 왔는지입니다. 색이 진할수록
          많이 남아 있다는 뜻입니다. 아래로 내려갈수록(최근 코호트일수록) 색이 진해지면 개선되고
          있다는 신호입니다. 0주째는 항상 100%입니다.
        </Note>
        {cohortWeeks.length === 0 ? (
          <Empty hint="migration 061 적용 여부를 확인하세요" />
        ) : (
          <Heatmap
            rows={cohortWeeks.length}
            cols={maxOffset + 1}
            cells={cohortCells}
            rowLabels={cohortWeeks.map((w) => w.slice(5))}
            colLabels={Array.from({ length: maxOffset + 1 }, (_, i) => `${i}주`)}
            formatValue={(v) => (v >= 10 ? String(Math.round(v)) : '')}
          />
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="얼마나 자주 쓰나 (사용 강도)">
          <Note>
            고른 기간 안에 실제로 쌤핀을 연 날이 며칠인지로 나눴습니다. &ldquo;하루만&rdquo;에 몰려
            있으면 한 번 써보고 마는 상태, 오른쪽이 두꺼워지면 일과에 자리 잡은 것입니다.
          </Note>
          <StackedShare
            parts={tiers.map((t, i) => ({
              label: t.tier,
              value: t.devices,
              color: TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] ?? 'bg-gray-600',
              sub: `평균 ${num(t.avg_events)}회 활동`,
            }))}
          />
        </Section>

        <Section title="마지막으로 쓴 지 얼마나 됐나 (이탈 신호)">
          <Note>
            전체 사용자를 마지막 접속 시점으로 나눴습니다. &ldquo;정착했던 분&rdquo;은 서로 다른 날
            5일 이상 쓰신 분입니다 — 이분들이 떠났다면 단순 이탈이 아니라 이유가 있습니다.
          </Note>
          <StackedShare
            parts={churn.map((c, i) => ({
              label: c.bucket,
              value: c.devices,
              color: CHURN_COLORS[Math.min(i, CHURN_COLORS.length - 1)] ?? 'bg-gray-600',
              sub: `정착했던 분 ${num(c.engaged_devices)}명`,
            }))}
          />
        </Section>
      </div>

      <Section title="코호트 원자료">
        <Note>히트맵의 숫자를 그대로 확인하고 싶을 때 봅니다.</Note>
        <DataTable
          rows={cohort.slice(0, 60)}
          columns={[
            { header: '처음 쓴 주', cell: (r) => r.cohort_week },
            { header: '인원', cell: (r) => num(r.cohort_size), align: 'right' },
            { header: '경과', cell: (r) => `${r.week_offset}주째`, align: 'right' },
            { header: '남은 인원', cell: (r) => num(r.retained), align: 'right' },
            { header: '비율', cell: (r) => pct(r.pct), align: 'right' },
          ]}
        />
      </Section>
    </div>
  );
}
