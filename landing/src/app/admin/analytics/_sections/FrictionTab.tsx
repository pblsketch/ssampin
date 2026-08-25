// ── 문제·마찰 탭 ──
// "어디서 막히는가". 오류가 어디서 얼마나 나는지, 그게 몇 명에게 닿았는지,
// 그리고 옛 버전에 머물러 이미 고친 문제를 계속 겪고 계신 분이 얼마나 되는지 본다.

import { Section, BarChart } from '../_components/primitives';
import { DataTable, Empty, Note, StatCard, num, pct } from '../_components/charts';
import { loadFriction } from '../_lib/data';
import type { DateRange } from '../_lib/data';

export default async function FrictionTab({ range }: { range: DateRange }) {
  const { errors, errorRate, versions, feedbackStats, feedbackEscalations } =
    await loadFriction(range);

  const errorRateAsc = [...errorRate].reverse();
  const totalErrors = errors.reduce((s, e) => s + e.occurrences, 0);
  // 오류를 겪은 분의 비율은 날마다 다르므로, 기간 안에서 가장 나빴던 날을 함께 본다.
  const worstDay = [...errorRate].sort((a, b) => (b.affected_pct ?? 0) - (a.affected_pct ?? 0))[0];
  const recentRate = errorRate[0];

  const current = versions.find((v) => v.is_current);
  const outdated = versions.filter((v) => !v.is_current && v.app_version !== 'unknown');
  const outdatedUsers = outdated.reduce((s, v) => s + v.users, 0);

  const feedback = feedbackStats[0];
  const escalations = feedbackEscalations[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="오류 발생 (기간 합계)"
          value={num(totalErrors)}
          sub={recentRate ? `가장 최근 날: ${num(recentRate.error_events)}건` : undefined}
          tone={totalErrors > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label="오류를 겪은 분 비율 (최악의 날)"
          value={pct(worstDay?.affected_pct)}
          sub={
            worstDay
              ? `${worstDay.d} — ${num(worstDay.affected_users)}명 / ${num(worstDay.active_users)}명`
              : undefined
          }
          tone={(worstDay?.affected_pct ?? 0) >= 20 ? 'bad' : 'neutral'}
        />
        <StatCard
          label="옛 버전에 머문 분"
          value={num(outdatedUsers)}
          sub={
            current
              ? `최신 ${current.app_version} 사용 ${num(current.users)}명 (${pct(current.pct)})`
              : '최근 30일 내 접속자 기준'
          }
          tone={outdatedUsers > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label="챗봇이 해결한 비율"
          value={pct(feedback?.resolution_rate)}
          sub={`답변 못 해 넘긴 문의 ${num(escalations?.escalation_count)}건 (전체 기간 누적)`}
          tone={(feedback?.resolution_rate ?? 0) >= 70 ? 'good' : 'warn'}
        />
      </div>

      <Section title="오류를 겪은 분의 비율 추이">
        <Note>
          그날 쌤핀을 쓴 선생님 중 몇 %가 오류를 겪었는지입니다. 오류 &ldquo;건수&rdquo;는 한 분이
          여러 번 겪으면 부풀기 때문에, 실제로 몇 분께 닿았는지를 기준으로 봅니다.
        </Note>
        {errorRateAsc.length === 0 ? (
          <Empty hint="migration 061 적용 여부를 확인하세요" />
        ) : (
          <BarChart
            data={errorRateAsc}
            labelKey="d"
            valueKey="affected_pct"
            formatLabel={(v) => v.slice(5)}
          />
        )}
      </Section>

      <Section title="어떤 오류가 나고 있나">
        <Note>
          같은 메시지끼리 묶었습니다. <strong>겪은 분</strong>이 많은 것이 우선 손볼 대상입니다 —
          횟수만 많고 한 분에게만 나는 건 그 환경만의 문제일 수 있습니다.
        </Note>
        <DataTable
          rows={errors}
          columns={[
            { header: '위치', cell: (r) => r.component },
            {
              header: '메시지',
              cell: (r) => (
                <span className="text-gray-300 break-all" title={r.message}>
                  {r.message}
                </span>
              ),
            },
            { header: '횟수', cell: (r) => num(r.occurrences), align: 'right' },
            {
              header: '겪은 분',
              cell: (r) => <span className="text-rose-300">{num(r.users)}</span>,
              align: 'right',
            },
            { header: '마지막', cell: (r) => r.last_date, align: 'right' },
          ]}
          emptyHint="이 기간에 기록된 오류가 없습니다"
        />
      </Section>

      <Section title="지금 어떤 버전을 쓰고 계신가">
        <Note>
          최근 30일 안에 접속한 분의 <strong>마지막 접속 시점 버전</strong>입니다. 옛 버전 비중이
          높으면 이미 고친 문제를 계속 겪고 계신다는 뜻이라, 업데이트 안내를 손볼 신호입니다.
        </Note>
        <DataTable
          rows={versions}
          columns={[
            {
              header: '버전',
              cell: (r) => (
                <span className={r.is_current ? 'text-emerald-300 font-medium' : ''}>
                  {r.app_version}
                  {r.is_current ? ' (최신)' : ''}
                </span>
              ),
            },
            { header: '사용자', cell: (r) => num(r.users), align: 'right' },
            { header: '비율', cell: (r) => pct(r.pct), align: 'right' },
            { header: '마지막 접속', cell: (r) => r.last_seen, align: 'right' },
          ]}
        />
      </Section>

      <Section title="챗봇이 못 풀어준 문의">
        <Note>
          챗봇 답변 뒤 &ldquo;해결됐나요?&rdquo;에 대한 응답입니다. 이 수치는 기간과 무관한 전체
          누적입니다 — 짧게 잘라 보면 응답이 몇 건 없어 오해를 부르기 때문입니다.
        </Note>
        {!feedback ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="해결됨" value={num(feedback.resolved_count)} tone="good" />
            <StatCard label="해결 안 됨" value={num(feedback.unresolved_count)} tone="bad" />
            <StatCard label="응답 없음" value={num(feedback.no_response_count)} />
            <StatCard label="해결률" value={pct(feedback.resolution_rate)} />
          </div>
        )}
      </Section>
    </div>
  );
}
