// ── 대시보드 공용 UI 부품 ──
// page.tsx 하단에 인라인으로 있던 SummaryCard / Section / BarChart 를 그대로 옮긴다.
// 모두 훅을 쓰지 않으므로 서버 컴포넌트로 동작한다(마크업·클래스 변경 없음).

export function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-5">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

export function BarChart<T extends object>({
  data,
  labelKey,
  valueKey,
  formatLabel,
}: {
  data: T[];
  labelKey: keyof T;
  valueKey: keyof T;
  formatLabel?: (v: string) => string;
}) {
  if (data.length === 0) return <p className="text-gray-500 text-sm">데이터 없음</p>;

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey]) || 0));
  // 그리드 라인 값 계산 (4등분)
  const gridLines =
    maxVal > 0 ? [0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxVal * ratio)) : [];

  return (
    <div className={`relative ${data.length <= 5 ? 'max-w-lg' : 'w-full'}`}>
      {/* 그리드 라인 — bar 영역에 맞춰 위치 */}
      <div
        className="absolute left-0 right-0 pointer-events-none hidden sm:block"
        style={{ top: '1.5rem', bottom: '1.25rem' }}
      >
        {gridLines.map((val, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-gray-700/40"
            style={{ bottom: `${((i + 1) / 4) * 100}%` }}
          >
            <span className="absolute -top-3 -left-1 text-[10px] text-gray-600">{val}</span>
          </div>
        ))}
      </div>
      {/* overflow-x-auto wrapper ensures bars are scrollable on mobile when many data points */}
      <div className="overflow-x-auto">
        {/* items-stretch(기본값)로 자식이 h-48 전체를 차지 → bar height % 가 정상 동작 */}
        <div
          className="flex gap-1 sm:gap-2 h-48 relative z-10"
          style={{ minWidth: data.length > 10 ? `${data.length * 2.5}rem` : undefined }}
        >
          {data.map((d, i) => {
            const val = Number(d[valueKey]) || 0;
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            const label = String(d[labelKey]);
            return (
              <div
                key={i}
                className="flex-1 min-w-[1.5rem] sm:min-w-[2.5rem] flex flex-col items-center gap-1 group"
              >
                {/* 값 라벨 */}
                <div className="relative shrink-0">
                  <span className="text-xs text-gray-300 group-hover:hidden">{val}</span>
                  <span className="text-xs text-blue-300 font-medium hidden group-hover:inline">
                    {val}
                  </span>
                </div>
                {/* 바 영역 — flex-1로 남은 공간을 차지하여 height %의 기준이 됨 */}
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full bg-blue-500 rounded-t transition-all group-hover:bg-blue-400 cursor-default"
                    style={{ height: `${Math.max(pct, 3)}%` }}
                    title={`${formatLabel ? formatLabel(label) : label}: ${val}`}
                  />
                </div>
                {/* 날짜 라벨 */}
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 truncate w-full text-center transition-colors shrink-0">
                  {formatLabel ? formatLabel(label) : label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
