import { Section } from './primitives';
import { formatDuration } from '../_lib/format';
import type { SessionDurationRow } from '../_lib/types';

export function SessionStatsSection({ sessions }: { sessions: SessionDurationRow[] }) {
  return (
    <Section title="세션 시간 통계">
      {/* 모바일 카드 */}
      <div className="block md:hidden space-y-3">
        {sessions.map((s) => (
          <div key={s.date} className="bg-gray-800/50 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{s.date}</span>
              <span className="text-xs text-gray-400">세션 {s.sessions}개</span>
            </div>
            <div className="grid grid-cols-3 gap-x-2 text-xs text-gray-400">
              <div>
                평균: <span className="text-gray-300">{formatDuration(s.avg_seconds)}</span>
              </div>
              <div>
                중간값: <span className="text-gray-300">{formatDuration(s.median_seconds)}</span>
              </div>
              <div>
                최대: <span className="text-gray-300">{formatDuration(s.max_seconds)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* 데스크톱 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 px-3">날짜</th>
              <th className="text-right py-2 px-3">세션 수</th>
              <th className="text-right py-2 px-3">평균</th>
              <th className="text-right py-2 px-3">중간값</th>
              <th className="text-right py-2 px-3">최대</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.date} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 px-3">{s.date}</td>
                <td className="text-right py-2 px-3">{s.sessions}</td>
                <td className="text-right py-2 px-3">{formatDuration(s.avg_seconds)}</td>
                <td className="text-right py-2 px-3">{formatDuration(s.median_seconds)}</td>
                <td className="text-right py-2 px-3">{formatDuration(s.max_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
