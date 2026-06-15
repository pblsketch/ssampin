import { Section } from './primitives';
import { TOOL_LABELS } from '../_lib/labels';
import type { ToolRankingRow } from '../_lib/types';

export function ToolRankingSection({
  toolsRanged,
  tools,
}: {
  /** 선택 기간 도구 순위 (DateRangePicker 반영) */
  toolsRanged: ToolRankingRow[];
  /** 전체 기간 도구 순위 ('전체 기간 보기' 상세) */
  tools: ToolRankingRow[];
}) {
  // 막대 너비 기준 최댓값은 한 번만 계산(빈 배열이면 map 미실행 → 출력 동일).
  const rangedMax = Math.max(...toolsRanged.map((x) => x.usage_count));
  const allTimeMax = Math.max(...tools.map((x) => x.usage_count));

  return (
    <Section title="도구 사용 순위">
      {toolsRanged.length === 0 ? (
        <p className="text-gray-500 text-sm">데이터 없음</p>
      ) : (
        <div className="space-y-2">
          {toolsRanged.map((t) => (
            <div key={t.tool_name} className="flex items-center gap-3">
              <span className="w-20 sm:w-28 text-sm truncate" title={t.tool_name}>
                {TOOL_LABELS[t.tool_name] || t.tool_name}
              </span>
              <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
                  style={{
                    width: `${Math.min(100, (t.usage_count / rangedMax) * 100)}%`,
                    minWidth: '2rem',
                  }}
                >
                  {t.usage_count}
                </div>
              </div>
              <span className="text-xs text-gray-400 w-16 text-right">{t.unique_users}명</span>
            </div>
          ))}
        </div>
      )}
      <details className="mt-4">
        <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-200">
          전체 기간 보기
        </summary>
        <div className="mt-3 space-y-2">
          {tools.map((t) => (
            <div key={t.tool_name} className="flex items-center gap-3">
              <span className="w-20 sm:w-28 text-sm truncate" title={t.tool_name}>
                {TOOL_LABELS[t.tool_name] || t.tool_name}
              </span>
              <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-blue-500/60 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
                  style={{
                    width: `${Math.min(100, (t.usage_count / allTimeMax) * 100)}%`,
                    minWidth: '2rem',
                  }}
                >
                  {t.usage_count}
                </div>
              </div>
              <span className="text-xs text-gray-400 w-16 text-right">{t.unique_users}명</span>
            </div>
          ))}
        </div>
      </details>
    </Section>
  );
}
