// ── 기능 사용 탭 ──
// "무엇을 쓰는가". 많이 쓰인 순서만 보면 착시가 생긴다 — 한 분이 100번 쓴 기능과
// 100분이 한 번씩 쓴 기능이 같은 자리에 온다. 그래서 횟수·사람 수·재사용률을 함께 본다.

import { Section } from '../_components/primitives';
import { DataTable, HBarList, Note, num, pct } from '../_components/charts';
import { PAGE_LABELS, TOOL_LABELS, labelOf, labelTableFor } from '../_lib/labels';
import { loadFeatures } from '../_lib/data';
import type { DateRange } from '../_lib/data';
import type { AdoptionRow } from '../_lib/types';

/** 채택·재사용 표 — 라벨 표만 바꿔 도구/화면에 같은 형태로 쓴다. */
function AdoptionTable({ rows, labels }: { rows: AdoptionRow[]; labels: Record<string, string> }) {
  return (
    <DataTable
      rows={rows}
      columns={[
        { header: '이름', cell: (r) => labelOf(labels, r.prop) },
        {
          header: '써본 분',
          cell: (r) => (
            <span>
              {num(r.reach_users)}
              <span className="text-gray-500"> ({pct(r.reach_pct)})</span>
            </span>
          ),
          align: 'right',
        },
        {
          header: '두 번 이상',
          cell: (r) => (
            <span className={(r.repeat_pct ?? 0) >= 50 ? 'text-emerald-300' : ''}>
              {pct(r.repeat_pct)}
            </span>
          ),
          align: 'right',
        },
        {
          header: '한 번 쓰고 끝',
          cell: (r) => (
            <span className={(r.once_only_pct ?? 0) >= 50 ? 'text-rose-300' : 'text-gray-400'}>
              {pct(r.once_only_pct)}
            </span>
          ),
          align: 'right',
        },
        {
          header: '습관 (3일 이상)',
          cell: (r) => (
            <span className={(r.sticky_pct ?? 0) >= 30 ? 'text-emerald-300' : 'text-gray-400'}>
              {pct(r.sticky_pct)}
            </span>
          ),
          align: 'right',
        },
        { header: '1인 평균', cell: (r) => `${num(r.avg_uses)}회`, align: 'right' },
      ]}
    />
  );
}

export default async function FeaturesTab({ range }: { range: DateRange }) {
  const { tools, pages, discovery, exports, shares, toolAdoption, pageAdoption } =
    await loadFeatures(range);

  // 손이 거의 안 닿는 기능 — 써본 분이 전체의 5% 미만인데 존재하는 것들.
  const neglected = toolAdoption.filter((t) => (t.reach_pct ?? 0) < 5).slice(0, 8);
  // 소수가 붙잡고 있는 기능 — 도달은 좁은데 붙은 분은 습관이 된 것. 키울 여지가 있다.
  const hiddenGems = toolAdoption
    .filter((t) => (t.reach_pct ?? 0) < 25 && (t.sticky_pct ?? 0) >= 30)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="도구 — 얼마나 많이 쓰였나">
          <Note>막대는 사용 횟수, 오른쪽은 쓴 사람 수와 1인당 평균입니다.</Note>
          <HBarList
            items={tools.map((t) => ({
              label: labelOf(TOOL_LABELS, t.prop),
              value: t.uses,
              sub: `${num(t.users)}명 · 1인 ${num(t.uses_per_user)}회`,
            }))}
          />
        </Section>

        <Section title="화면 — 어디에 머무나">
          <Note>
            앱 안에서 실제로 열린 화면입니다. 도구함 밖의 기능(출결·기록·일정 등)이 얼마나 쓰이는지
            여기서 보입니다.
          </Note>
          <HBarList
            items={pages.map((p) => ({
              label: labelOf(PAGE_LABELS, p.prop),
              value: p.uses,
              sub: `${num(p.users)}명 · 1인 ${num(p.uses_per_user)}회`,
            }))}
          />
        </Section>
      </div>

      <Section title="도구 — 한 번 쓰고 마나, 습관이 되나">
        <Note>
          <strong>써본 분</strong>은 이 기간에 활동한 전체 선생님 중 몇 %가 그 도구에 닿았는지,
          <strong> 한 번 쓰고 끝</strong>은 그중 다시 안 돌아온 비율, <strong>습관</strong>은 서로
          다른 날 3일 이상 쓴 비율입니다. 써본 분은 많은데 한 번 쓰고 끝이 높다면, 발견은 되는데
          기대에 못 미친 기능입니다.
        </Note>
        <AdoptionTable rows={toolAdoption} labels={TOOL_LABELS} />
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="숨은 효자 — 좁게 알려졌는데 붙잡는 기능">
          <Note>
            써본 분은 25% 미만인데 습관이 된 비율이 30% 이상인 기능입니다. 더 잘 보이게 하면 효과가
            클 후보입니다.
          </Note>
          {hiddenGems.length === 0 ? (
            <p className="text-gray-500 text-sm">해당하는 기능이 없습니다.</p>
          ) : (
            <AdoptionTable rows={hiddenGems} labels={TOOL_LABELS} />
          )}
        </Section>

        <Section title="손이 안 닿는 기능">
          <Note>
            써본 분이 전체의 5% 미만입니다. 필요 없는 기능인지, 있는 줄 모르는 기능인지 구분이
            필요합니다 — 아래 &ldquo;기능 발견 경로&rdquo;와 함께 보세요.
          </Note>
          {neglected.length === 0 ? (
            <p className="text-gray-500 text-sm">해당하는 기능이 없습니다.</p>
          ) : (
            <AdoptionTable rows={neglected} labels={TOOL_LABELS} />
          )}
        </Section>
      </div>

      <Section title="화면 — 한 번 열고 마나">
        <AdoptionTable rows={pageAdoption} labels={PAGE_LABELS} />
      </Section>

      <div className="grid lg:grid-cols-3 gap-6">
        <Section title="기능 발견 경로">
          <Note>메뉴 등에서 기능을 눌러 처음 들어간 기록입니다.</Note>
          <HBarList
            items={discovery.map((d) => ({
              label: labelOf(labelTableFor('feature_discovery'), d.prop),
              value: d.uses,
              sub: `${num(d.users)}명`,
            }))}
          />
        </Section>

        <Section title="내보내기 형식">
          <Note>어떤 문서 형식으로 저장해 가는지입니다.</Note>
          <HBarList
            items={exports.map((e) => ({
              label: e.prop,
              value: e.uses,
              sub: `${num(e.users)}명`,
            }))}
          />
        </Section>

        <Section title="공유 방법">
          <Note>동료 선생님께 쌤핀을 알린 경로입니다.</Note>
          <HBarList
            items={shares.map((s) => ({
              label: labelOf(labelTableFor('share_click'), s.prop),
              value: s.uses,
              sub: `${num(s.users)}명`,
            }))}
          />
        </Section>
      </div>
    </div>
  );
}
