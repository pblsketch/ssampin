'use client';

import { useState } from 'react';
import { formatDuration } from '../_lib/format';
import type { SessionDurationRow } from '../_lib/types';

/** 'YYYY-MM-DD'(KST 일자)가 주말(토·일)인지. 로컬 생성으로 TZ 이동 없음. */
function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const wd = new Date(y, m - 1, d).getDay(); // 0=일, 6=토
  return wd === 0 || wd === 6;
}

/** 세션 수로 가중 평균한 평균 세션 시간 문자열 */
function weightedAvgDuration(rows: SessionDurationRow[]): string {
  if (rows.length === 0) return '-';
  const totalWeighted = rows.reduce((sum, s) => sum + (s.avg_seconds ?? 0) * (s.sessions ?? 1), 0);
  const totalSessions = rows.reduce((sum, s) => sum + (s.sessions ?? 1), 0);
  return formatDuration(Math.round(totalWeighted / Math.max(1, totalSessions)));
}

/**
 * 평균 세션 시간 요약 카드. '주말 제외' 토글로 주중(월~금)만 집계해서 볼 수 있다.
 * 최근 7개 (선택 시 주중 7개) 세션-일을 가중 평균한다.
 */
export function AvgSessionCard({ sessions }: { sessions: SessionDurationRow[] }) {
  const [weekdayOnly, setWeekdayOnly] = useState(false);

  const source = weekdayOnly ? sessions.filter((s) => !isWeekend(s.date)) : sessions;
  const value = weightedAvgDuration(source.slice(0, 7));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-1">
        <p className="text-gray-400 text-xs">평균 세션 ({weekdayOnly ? '주중 7일' : '7일'})</p>
        <button
          type="button"
          onClick={() => setWeekdayOnly((v) => !v)}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
            weekdayOnly ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
          title="주말(토·일)을 제외하고 평균을 계산합니다"
        >
          주말 제외
        </button>
      </div>
      <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
