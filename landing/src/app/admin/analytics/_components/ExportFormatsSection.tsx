import { Section } from './primitives';
import type { ExportFormatRow } from '../_lib/types';

export function ExportFormatsSection({ exports }: { exports: ExportFormatRow[] }) {
  // 막대 너비 기준 최댓값은 한 번만 계산(빈 배열이면 map 자체가 실행되지 않아 출력 동일).
  const maxCount = Math.max(...exports.map((x) => x.count));

  return (
    <Section title="내보내기 형식">
      {exports.length === 0 ? (
        <p className="text-gray-500 text-sm">데이터 없음</p>
      ) : (
        <div className="space-y-2">
          {exports.map((e) => (
            <div key={e.format} className="flex items-center gap-3">
              <span className="w-20 text-sm font-mono">{e.format}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full flex items-center justify-end pr-2 text-xs font-medium"
                  style={{
                    width: `${Math.min(100, (e.count / maxCount) * 100)}%`,
                    minWidth: '2rem',
                  }}
                >
                  {e.count}
                </div>
              </div>
              <span className="text-xs text-gray-400 w-16 text-right">{e.unique_users}명</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
