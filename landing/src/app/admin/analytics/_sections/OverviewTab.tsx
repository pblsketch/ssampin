// ── 개요 탭 ──
// "지금 쌤핀이 어떤 상태인가"를 한 화면에서 본다.
// 예전 요약 카드는 누적 총합만 보여줘서 기간을 바꿔도 숫자가 그대로였다.
// 여기서는 고른 기간의 값과, 기간과 무관한 누적값을 명확히 나눠 적는다.

import { Section, BarChart } from '../_components/primitives';
import { DataTable, Empty, HBarList, Note, StatCard, num, pct } from '../_components/charts';
import { formatDuration } from '../_lib/format';
import { EVENT_LABELS, labelOf } from '../_lib/labels';
import { loadOverview } from '../_lib/data';
import type { DateRange } from '../_lib/data';

export default async function OverviewTab({ range }: { range: DateRange }) {
  const { overview, daily, weekly, sessions, breakdown } = await loadOverview(range);

  // 차트는 오래된 → 최근 순으로 읽는 게 자연스럽다. RPC 는 최신순으로 준다.
  const dailyAsc = [...daily].reverse();
  const weeklyAsc = [...weekly].reverse();
  const latestSession = sessions[0];

  const stickinessTone =
    overview?.stickiness == null
      ? 'neutral'
      : overview.stickiness >= 40
        ? 'good'
        : overview.stickiness >= 20
          ? 'warn'
          : 'bad';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="이 기간에 쓴 선생님"
          value={num(overview?.active_users)}
          sub={`새로 오신 분 ${num(overview?.new_users)} · 다시 오신 분 ${num(overview?.returning_users)}`}
        />
        <StatCard
          label="하루 평균 사용자"
          value={num(overview?.avg_dau)}
          sub={`오늘 ${num(overview?.today_users)}명`}
        />
        <StatCard
          label="습관화 정도 (주간÷월간)"
          value={pct(overview?.stickiness)}
          tone={stickinessTone}
          sub={`최근 7일 ${num(overview?.wau)}명 / 최근 30일 ${num(overview?.mau)}명`}
        />
        <StatCard
          label="누적 사용자 (전체 기간)"
          value={num(overview?.total_users)}
          sub={`온보딩 마친 분 ${num(overview?.onboarded_users)}`}
        />
      </div>

      <Section title="하루하루 — 새로 온 분과 다시 온 분">
        <Note>
          막대는 그날 쌤핀을 연 선생님 수입니다. 새로 오신 분이 계속 늘어도 다시 오시는 분이 늘지
          않으면, 알리는 건 되는데 붙잡지는 못하고 있다는 뜻입니다.
        </Note>
        {dailyAsc.length === 0 ? (
          <Empty hint="migration 061 적용 여부를 확인하세요" />
        ) : (
          <>
            <BarChart data={dailyAsc} labelKey="d" valueKey="dau" formatLabel={(v) => v.slice(5)} />
            <div className="mt-4">
              <DataTable
                rows={dailyAsc.slice(-10).reverse()}
                columns={[
                  { header: '날짜', cell: (r) => r.d },
                  { header: '사용자', cell: (r) => num(r.dau), align: 'right' },
                  { header: '새로 온 분', cell: (r) => num(r.new_users), align: 'right' },
                  { header: '다시 온 분', cell: (r) => num(r.returning_users), align: 'right' },
                  { header: '활동 수', cell: (r) => num(r.events), align: 'right' },
                ]}
              />
            </div>
          </>
        )}
      </Section>

      <Section title="주간 흐름">
        <Note>주 단위로 묶어 보면 방학·시험처럼 학교 일정에 따른 오르내림이 보입니다.</Note>
        {weeklyAsc.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            rows={[...weeklyAsc].reverse()}
            columns={[
              { header: '주 시작', cell: (r) => r.week_start },
              { header: '사용자', cell: (r) => num(r.weekly_active_users), align: 'right' },
              { header: '신규', cell: (r) => num(r.new_users), align: 'right' },
              { header: '앱 열기', cell: (r) => num(r.app_opens), align: 'right' },
              { header: '도구 사용', cell: (r) => num(r.tool_uses), align: 'right' },
              { header: '내보내기', cell: (r) => num(r.exports), align: 'right' },
              { header: '온보딩 완료', cell: (r) => num(r.onboarding_completions), align: 'right' },
              { header: '오류', cell: (r) => num(r.errors), align: 'right' },
            ]}
          />
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="한 번 켜면 얼마나 머무나">
          <Note>
            앱을 켜서 마지막으로 뭔가 한 시점까지의 간격입니다. 절반의 선생님이 중앙값보다 오래
            머뭅니다. 상위 10%는 90분위 값을 넘습니다.
          </Note>
          {!latestSession ? (
            <Empty />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard label="중앙값" value={formatDuration(latestSession.median_seconds)} />
                <StatCard label="평균" value={formatDuration(latestSession.avg_seconds)} />
                <StatCard label="상위 10%" value={formatDuration(latestSession.p90_seconds)} />
              </div>
              <DataTable
                rows={sessions.slice(0, 10)}
                columns={[
                  { header: '날짜', cell: (r) => r.d },
                  { header: '세션', cell: (r) => num(r.sessions), align: 'right' },
                  {
                    header: '중앙값',
                    cell: (r) => formatDuration(r.median_seconds),
                    align: 'right',
                  },
                  {
                    header: '상위 10%',
                    cell: (r) => formatDuration(r.p90_seconds),
                    align: 'right',
                  },
                ]}
              />
            </>
          )}
        </Section>

        <Section title="앱 안에서 무슨 일이 일어나나">
          <Note>
            기록되는 행동 전체를 많은 순으로 봅니다. 옆의 수는 그 행동을 한 번이라도 한 선생님
            수입니다 — 횟수는 많은데 사람 수가 적으면 소수가 몰아서 쓰는 기능입니다.
          </Note>
          <HBarList
            items={breakdown.map((b) => ({
              label: labelOf(EVENT_LABELS, b.event),
              value: b.events,
              sub: `${num(b.users)}명`,
            }))}
          />
        </Section>
      </div>
    </div>
  );
}
