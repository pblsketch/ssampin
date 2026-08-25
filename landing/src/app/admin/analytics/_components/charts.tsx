// ── 새 지표용 공용 차트 부품 ──
// primitives.tsx 의 SummaryCard / Section / BarChart 를 건드리지 않고 여기에 더한다.
// 모두 훅을 쓰지 않으므로 서버 컴포넌트로 동작한다(브라우저로 넘어가는 자바스크립트가 늘지 않는다).

import type { ReactNode } from 'react';

/** 값이 없을 때 섹션마다 같은 문구를 쓰기 위한 표시 */
export function Empty({ hint }: { hint?: string }) {
  return (
    <p className="text-gray-500 text-sm">
      데이터 없음{hint ? <span className="text-gray-600"> — {hint}</span> : null}
    </p>
  );
}

/** 숫자를 천 단위 쉼표로. null/undefined 는 '-' */
export function num(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toLocaleString('ko-KR');
}

/** 퍼센트 표기. null 은 '-' */
export function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return `${v}%`;
}

/**
 * 지표 하나를 크게 보여주는 카드. 아래에 보조 설명을 달 수 있다.
 * tone 으로 좋음/주의를 색으로 구분한다(수치만 보고 판단하기 어려운 지표에 쓴다).
 */
export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-rose-300'
          : 'text-gray-100';
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
      {sub ? <p className="text-[11px] text-gray-500 mt-1 leading-snug">{sub}</p> : null}
    </div>
  );
}

/** 섹션 제목 아래 한 줄 설명 — "이 표가 무슨 뜻인지"를 항상 붙여둔다. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{children}</p>;
}

export interface HBarItem {
  label: string;
  value: number;
  /** 막대 오른쪽에 덧붙일 보조 문구 (예: "32명 · 1인당 2.6회") */
  sub?: string;
}

/**
 * 가로 막대 목록. 항목이 많고 이름이 긴 순위(도구·화면·오류)에 적합하다.
 * 세로 막대(BarChart)는 날짜처럼 항목이 짧을 때만 읽기 좋다.
 */
export function HBarList({ items, max }: { items: HBarItem[]; max?: number }) {
  if (items.length === 0) return <Empty />;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="w-28 sm:w-36 shrink-0 truncate text-gray-300" title={item.label}>
            {item.label}
          </span>
          <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden min-w-[3rem]">
            <div
              className="h-full bg-blue-500 rounded"
              style={{ width: `${Math.max((item.value / top) * 100, 2)}%` }}
            />
          </div>
          <span className="w-12 text-right tabular-nums text-gray-200 shrink-0">
            {num(item.value)}
          </span>
          {item.sub ? (
            <span className="hidden sm:inline w-40 text-right text-[11px] text-gray-500 shrink-0 truncate">
              {item.sub}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export interface FunnelStep {
  label: string;
  value: number;
  pct: number | null;
  drop: number | null;
}

/**
 * 단계별 퍼널. 각 단계에서 몇 %가 남았는지, 직전 단계 대비 몇 %가 빠졌는지 함께 보여준다.
 * 가장 크게 빠진 단계를 붉게 강조해 "어디서 막히는지"가 눈에 먼저 들어오게 한다.
 */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) return <Empty />;
  const worstDrop = Math.max(...steps.map((s) => s.drop ?? 0), 0);
  return (
    <div className="space-y-2">
      {steps.map((s) => {
        const isWorst = worstDrop > 0 && s.drop === worstDrop;
        return (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-32 sm:w-40 shrink-0 text-gray-300 truncate" title={s.label}>
              {s.label}
            </span>
            <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden min-w-[3rem]">
              <div
                className={`h-full rounded ${isWorst ? 'bg-rose-500/80' : 'bg-blue-500'}`}
                style={{ width: `${Math.max(s.pct ?? 0, 2)}%` }}
              />
            </div>
            <span className="w-16 text-right tabular-nums text-gray-200 shrink-0">
              {num(s.value)}
            </span>
            <span className="w-14 text-right tabular-nums text-gray-400 shrink-0">
              {pct(s.pct)}
            </span>
            <span
              className={`w-20 text-right tabular-nums text-[11px] shrink-0 ${
                isWorst ? 'text-rose-300 font-medium' : 'text-gray-500'
              }`}
            >
              {s.drop == null || s.drop <= 0 ? '' : `-${s.drop}% 이탈`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface HeatCell {
  row: number;
  col: number;
  value: number;
  title?: string;
}

/**
 * 히트맵. 요일×시간대, 코호트×경과주차처럼 두 축이 있는 지표에 쓴다.
 * 색이 진할수록 값이 크다 — 절대값이 아니라 표 안에서의 상대 비교용이다.
 */
export function Heatmap({
  rows,
  cols,
  cells,
  rowLabels,
  colLabels,
  formatValue,
}: {
  rows: number;
  cols: number;
  cells: HeatCell[];
  rowLabels: string[];
  colLabels: string[];
  formatValue?: (v: number) => string;
}) {
  if (cells.length === 0) return <Empty />;
  const max = Math.max(...cells.map((c) => c.value), 1);
  const lookup = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-[10px]">
        <thead>
          <tr>
            <th className="w-10" />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="text-gray-500 font-normal px-0.5">
                {colLabels[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <td className="text-gray-400 pr-1 text-right whitespace-nowrap">
                {rowLabels[r] ?? r}
              </td>
              {Array.from({ length: cols }, (_, c) => {
                const cell = lookup.get(`${r}:${c}`);
                const v = cell?.value ?? 0;
                const ratio = v / max;
                return (
                  <td
                    key={c}
                    title={cell?.title ?? `${rowLabels[r] ?? r} ${colLabels[c] ?? c}: ${v}`}
                    className="w-6 h-6 rounded text-center align-middle text-gray-100"
                    style={{
                      backgroundColor:
                        v === 0 ? 'rgb(31 41 55)' : `rgba(59, 130, 246, ${0.15 + ratio * 0.85})`,
                    }}
                  >
                    {formatValue && v > 0 ? formatValue(v) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 표 한 장 — 열 정의만 넘기면 되는 간단한 형태 */
export function DataTable<T>({
  rows,
  columns,
  emptyHint,
}: {
  rows: T[];
  columns: { header: string; cell: (row: T) => ReactNode; align?: 'left' | 'right' }[];
  emptyHint?: string;
}) {
  if (rows.length === 0) return <Empty hint={emptyHint} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-gray-800">
            {columns.map((c) => (
              <th
                key={c.header}
                className={`py-2 px-2 font-normal ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/50 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`py-2 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 비율 한 줄을 색 띠로 — 등급 분포·이탈 구간처럼 합이 100%인 것에 쓴다. */
export function StackedShare({
  parts,
}: {
  parts: { label: string; value: number; color: string; sub?: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <Empty />;
  return (
    <div className="space-y-3">
      <div className="flex h-6 rounded overflow-hidden">
        {parts.map((p) => (
          <div
            key={p.label}
            className={p.color}
            style={{ width: `${(p.value / total) * 100}%` }}
            title={`${p.label}: ${num(p.value)}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-start gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm mt-1 shrink-0 ${p.color}`} />
            <div className="min-w-0">
              <p className="text-xs text-gray-300 truncate" title={p.label}>
                {p.label}
              </p>
              <p className="text-xs text-gray-400 tabular-nums">
                {num(p.value)}
                <span className="text-gray-600"> · {Math.round((p.value / total) * 100)}%</span>
              </p>
              {p.sub ? <p className="text-[10px] text-gray-600">{p.sub}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
