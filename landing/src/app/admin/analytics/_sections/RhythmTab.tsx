// ── 현장 리듬 탭 ──
// "언제 쓰는가". 선생님의 하루 일과 안에서 쌤핀이 어느 자리에 있는지 본다.
// 시간대를 그냥 0~23시로만 보면 감이 안 오므로, 학교 일과(조회·수업·점심·종례·퇴근 후)로
// 묶어서도 보여준다. 아래 구간은 중·고등학교의 일반적인 일과 기준이며 학교마다 다를 수 있다.

import { Section } from '../_components/primitives';
import { Empty, HBarList, Heatmap, Note, StatCard, num } from '../_components/charts';
import { DOW_LABELS, SCHOOL_LEVEL_LABELS, labelOf, labelTableFor } from '../_lib/labels';
import { loadRhythm } from '../_lib/data';
import type { DateRange } from '../_lib/data';

/** 학교 일과 구간 — [시작시, 끝시) */
const SCHOOL_SLOTS: { label: string; from: number; to: number }[] = [
  { label: '이른 아침 (~8시)', from: 0, to: 8 },
  { label: '등교·조회 (8~9시)', from: 8, to: 9 },
  { label: '오전 수업 (9~12시)', from: 9, to: 12 },
  { label: '점심 (12~13시)', from: 12, to: 13 },
  { label: '오후 수업 (13~16시)', from: 13, to: 16 },
  { label: '종례·업무 (16~18시)', from: 16, to: 18 },
  { label: '퇴근 후 (18~22시)', from: 18, to: 22 },
  { label: '늦은 밤 (22시~)', from: 22, to: 24 },
];

export default async function RhythmTab({ range }: { range: DateRange }) {
  const { rhythm, daily, school, launchModes } = await loadRhythm(range);

  // 요일 × 시간대 히트맵 — 값은 그 칸의 하루 평균 사용자 수(기간 길이에 휘둘리지 않게).
  const heatCells = rhythm.map((r) => ({
    row: r.dow,
    col: r.hour,
    value: r.avg_users ?? 0,
    title: `${DOW_LABELS[r.dow]}요일 ${r.hour}시 — 하루 평균 ${num(r.avg_users)}명 (총 ${num(r.events)}회)`,
  }));

  // 학교 일과 구간별 합계
  const slotTotals = SCHOOL_SLOTS.map((slot) => ({
    label: slot.label,
    value: rhythm
      .filter((r) => r.hour >= slot.from && r.hour < slot.to)
      .reduce((s, r) => s + r.events, 0),
  }));

  // 요일별 합계
  const dowTotals = DOW_LABELS.map((label, dow) => ({
    label: `${label}요일`,
    value: rhythm.filter((r) => r.dow === dow).reduce((s, r) => s + r.events, 0),
  }));

  const weekdayEvents = dowTotals.slice(1, 6).reduce((s, d) => s + d.value, 0);
  const weekendEvents = dowTotals[0]!.value + dowTotals[6]!.value;
  const totalEvents = weekdayEvents + weekendEvents;

  const busiest = [...rhythm].sort((a, b) => (b.avg_users ?? 0) - (a.avg_users ?? 0))[0];

  const levels = school.filter((s) => s.dimension === 'level');
  const regions = school.filter((s) => s.dimension === 'region');

  // 하루 활동량이 가장 많았던 날 — 특정 학사 일정과 겹치는지 확인용
  const peakDay = [...daily].sort((a, b) => b.events - a.events)[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="가장 붐비는 시간"
          value={busiest ? `${DOW_LABELS[busiest.dow]} ${busiest.hour}시` : '-'}
          sub={busiest ? `하루 평균 ${num(busiest.avg_users)}명` : undefined}
        />
        <StatCard
          label="주중 비중"
          value={totalEvents > 0 ? `${Math.round((weekdayEvents / totalEvents) * 100)}%` : '-'}
          sub={`주중 ${num(weekdayEvents)}회 / 주말 ${num(weekendEvents)}회`}
        />
        <StatCard
          label="수업 시간대 비중"
          value={
            totalEvents > 0
              ? `${Math.round(
                  ((slotTotals[2]!.value + slotTotals[4]!.value) / totalEvents) * 100,
                )}%`
              : '-'
          }
          sub="오전·오후 수업 시간(9~12시, 13~16시)에 일어난 활동"
        />
        <StatCard
          label="가장 활동이 많았던 날"
          value={peakDay ? peakDay.d.slice(5) : '-'}
          sub={peakDay ? `${num(peakDay.events)}회 · ${num(peakDay.dau)}명` : undefined}
        />
      </div>

      <Section title="요일 × 시간대">
        <Note>
          칸이 진할수록 그 시간대에 쓰는 분이 많습니다. 값은 <strong>하루 평균 사용자 수</strong>라
          기간을 길게 잡아도 숫자가 부풀지 않습니다. 칸에 마우스를 올리면 정확한 수치가 나옵니다.
        </Note>
        {heatCells.length === 0 ? (
          <Empty hint="migration 061 적용 여부를 확인하세요" />
        ) : (
          <Heatmap
            rows={7}
            cols={24}
            cells={heatCells}
            rowLabels={DOW_LABELS}
            colLabels={Array.from({ length: 24 }, (_, h) => String(h))}
          />
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="학교 일과 안에서">
          <Note>
            중·고등학교의 일반적인 일과로 묶었습니다. 수업 중에 몰려 있으면 교실에서 바로 쓰는 도구,
            종례 이후에 몰려 있으면 업무 정리용으로 쓰이고 있다는 뜻입니다.
          </Note>
          <HBarList items={slotTotals} />
        </Section>

        <Section title="요일별">
          <Note>주말 비중이 높다면 수업 준비를 집에서 하고 계신다는 신호입니다.</Note>
          <HBarList items={dowTotals} />
        </Section>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Section title="어떤 모습으로 켜나">
          <Note>일반 창으로 여는지, 옆핀(위젯)으로 바로 쓰는지입니다.</Note>
          <HBarList
            items={launchModes.map((m) => ({
              label: labelOf(labelTableFor('app_open'), m.prop),
              value: m.uses,
              sub: `${num(m.users)}명`,
            }))}
          />
        </Section>

        <Section title="학교급">
          <Note>온보딩·설정에서 학교를 입력한 분만 집계됩니다. 학교 이름은 저장하지 않습니다.</Note>
          <HBarList
            items={levels.map((l) => ({
              label: labelOf(SCHOOL_LEVEL_LABELS, l.label),
              value: l.users,
            }))}
          />
        </Section>

        <Section title="지역">
          <Note>학교 주소에서 앞부분(시·도)만 뽑아 셉니다.</Note>
          <HBarList items={regions.map((r) => ({ label: r.label, value: r.users }))} />
        </Section>
      </div>
    </div>
  );
}
