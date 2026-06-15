import { Section } from './primitives';
import type { WeeklySummaryRow } from '../_lib/types';

export function WeeklySummarySection({ weekly }: { weekly: WeeklySummaryRow[] }) {
  return (
    <Section title="주간 요약">
      {/* 모바일 카드 */}
      <div className="block md:hidden space-y-3">
        {weekly.map((w) => (
          <div key={w.week_start} className="bg-gray-800/50 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{w.week_start}</span>
              <span className="text-sm font-bold text-blue-400">WAU {w.weekly_active_users}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
              <div>
                이벤트: <span className="text-gray-300">{w.total_events}</span>
              </div>
              <div>
                앱 열기: <span className="text-gray-300">{w.app_opens}</span>
              </div>
              <div>
                좌석배치: <span className="text-gray-300">{w.seat_shuffles}</span>
              </div>
              <div>
                도구: <span className="text-gray-300">{w.tool_uses}</span>
              </div>
              <div>
                내보내기: <span className="text-gray-300">{w.exports}</span>
              </div>
              <div>
                온보딩: <span className="text-gray-300">{w.onboarding_completions}</span>
              </div>
              <div>
                에러: <span className="text-red-400">{w.errors}</span>
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
              <th className="text-left py-2 px-3">주 시작</th>
              <th className="text-right py-2 px-3">WAU</th>
              <th className="text-right py-2 px-3">이벤트</th>
              <th className="text-right py-2 px-3">앱 열기</th>
              <th className="text-right py-2 px-3">좌석배치</th>
              <th className="text-right py-2 px-3">도구</th>
              <th className="text-right py-2 px-3">내보내기</th>
              <th className="text-right py-2 px-3">온보딩</th>
              <th className="text-right py-2 px-3">에러</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((w) => (
              <tr key={w.week_start} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 px-3">{w.week_start}</td>
                <td className="text-right py-2 px-3 font-medium">{w.weekly_active_users}</td>
                <td className="text-right py-2 px-3">{w.total_events}</td>
                <td className="text-right py-2 px-3">{w.app_opens}</td>
                <td className="text-right py-2 px-3">{w.seat_shuffles}</td>
                <td className="text-right py-2 px-3">{w.tool_uses}</td>
                <td className="text-right py-2 px-3">{w.exports}</td>
                <td className="text-right py-2 px-3">{w.onboarding_completions}</td>
                <td className="text-right py-2 px-3 text-red-400">{w.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
