import { useSchoolDisclosure } from './useSchoolDisclosure';

/**
 * 학교 현황 한눈에 — 학년별 학생수(09) 응답에서 핵심 지표를 큰 숫자 카드로.
 * 학교 현황 탭 상단에 배치해 표를 읽기 전에 규모를 바로 파악하게 한다.
 * 값에 단위(명/개)를 붙여 숫자만으로 의미가 모호하지 않게 한다.
 */
const KEY_STATS = [
  { col: 'COL_S_SUM', label: '학생수', icon: 'groups', unit: '명' },
  { col: 'COL_C_SUM', label: '학급수', icon: 'meeting_room', unit: '개' },
  { col: 'COL_SUM', label: '학급당 인원', icon: 'person', unit: '명' },
  { col: 'TEACH_CNT', label: '교원수', icon: 'school', unit: '명' },
] as const;

export function SchoolSummaryCards() {
  const { state, ourRows } = useSchoolDisclosure('09');
  if (state !== 'loaded' || ourRows.length === 0) return null;
  const row = ourRows[0]!;
  const stats = KEY_STATS.map((s) => ({ ...s, value: String(row[s.col] ?? '').trim() })).filter(
    (s) => s.value.length > 0,
  );
  if (stats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.col} className="bg-sp-card border border-sp-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-sp-muted text-xs mb-1.5">
            <span className="material-symbols-outlined text-icon text-sp-accent">{s.icon}</span>
            {s.label}
          </div>
          <p className="text-2xl font-sp-bold text-sp-text tabular-nums leading-none">
            {s.value}
            <span className="text-sm font-sp-medium text-sp-muted ml-0.5">{s.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
