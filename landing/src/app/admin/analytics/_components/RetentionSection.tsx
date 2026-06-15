import { Section } from './primitives';
import type { RetentionRow } from '../_lib/types';

export function RetentionSection({ retention }: { retention: RetentionRow[] }) {
  return (
    <Section title="리텐션 (코호트 분석)">
      <p className="text-gray-400 text-xs mb-4">
        특정 날짜에 처음 앱을 사용한 사용자(코호트)가 이후에도 다시 사용하는지 추적합니다. Day 1 =
        첫 사용 다음날 재방문율, Day 3 = 3일 후, Day 7 = 7일 후 재방문율.
      </p>
      {retention.length === 0 ? (
        <p className="text-gray-500 text-sm">데이터 없음</p>
      ) : (
        <>
          {/* 모바일 카드 */}
          <div className="block md:hidden space-y-3">
            {retention.map((r) => (
              <div key={r.cohort_date} className="bg-gray-800/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.cohort_date}</span>
                  <span className="text-xs text-gray-400">신규 {r.cohort_size}명</span>
                </div>
                <div className="grid grid-cols-3 gap-x-2 text-xs text-gray-400">
                  <div>
                    Day 1:{' '}
                    <span
                      className={
                        r.day1_pct > 50
                          ? 'text-green-400'
                          : r.day1_pct > 20
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }
                    >
                      {r.day1_pct}%
                    </span>
                    <span className="text-gray-600 ml-0.5">({r.day1})</span>
                  </div>
                  <div>
                    Day 3:{' '}
                    <span
                      className={
                        r.day3_pct > 30
                          ? 'text-green-400'
                          : r.day3_pct > 10
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }
                    >
                      {r.day3_pct}%
                    </span>
                    <span className="text-gray-600 ml-0.5">({r.day3})</span>
                  </div>
                  <div>
                    Day 7:{' '}
                    <span
                      className={
                        r.day7_pct > 20
                          ? 'text-green-400'
                          : r.day7_pct > 5
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }
                    >
                      {r.day7_pct}%
                    </span>
                    <span className="text-gray-600 ml-0.5">({r.day7})</span>
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
                  <th className="text-left py-2 px-3">코호트 날짜</th>
                  <th className="text-right py-2 px-3">신규</th>
                  <th className="text-right py-2 px-3">Day 1</th>
                  <th className="text-right py-2 px-3">Day 3</th>
                  <th className="text-right py-2 px-3">Day 7</th>
                </tr>
              </thead>
              <tbody>
                {retention.map((r) => (
                  <tr
                    key={r.cohort_date}
                    className="border-b border-gray-800/50 hover:bg-gray-900/50"
                  >
                    <td className="py-2 px-3">{r.cohort_date}</td>
                    <td className="text-right py-2 px-3 font-medium">{r.cohort_size}명</td>
                    <td className="text-right py-2 px-3">
                      <span
                        className={
                          r.day1_pct > 50
                            ? 'text-green-400'
                            : r.day1_pct > 20
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }
                      >
                        {r.day1_pct}%
                      </span>
                      <span className="text-gray-600 ml-1">({r.day1})</span>
                    </td>
                    <td className="text-right py-2 px-3">
                      <span
                        className={
                          r.day3_pct > 30
                            ? 'text-green-400'
                            : r.day3_pct > 10
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }
                      >
                        {r.day3_pct}%
                      </span>
                      <span className="text-gray-600 ml-1">({r.day3})</span>
                    </td>
                    <td className="text-right py-2 px-3">
                      <span
                        className={
                          r.day7_pct > 20
                            ? 'text-green-400'
                            : r.day7_pct > 5
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }
                      >
                        {r.day7_pct}%
                      </span>
                      <span className="text-gray-600 ml-1">({r.day7})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}
