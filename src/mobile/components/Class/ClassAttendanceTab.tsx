import { useState } from 'react';
import { AttendanceCheckPage } from '@mobile/pages/AttendanceCheckPage';
import { useCurrentPeriod } from '@mobile/hooks/useCurrentPeriod';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { SegmentedControl } from '@mobile/components/common/SegmentedControl';
import { ClassAttendanceStatsView } from '@mobile/components/Class/ClassAttendanceStatsView';

interface ClassAttendanceTabProps {
  classId: string;
  className: string;
}

type AttendanceMode = 'check' | 'stats';

const MODE_OPTIONS = [
  { key: 'check' as const, label: '출결 체크' },
  { key: 'stats' as const, label: '출결 통계' },
];

/**
 * 학급 상세 화면의 출결 서브탭.
 * 상단 세그먼트(출결 체크/출결 통계)로 전환한다. Design §3 (S3) — 4번째 최상위 탭이 아니라
 * 이 탭 내부 표현 전환으로 배치(설계서 핵심 배치 결정 #3).
 *
 * "체크" — AttendanceCheckPage를 embedded 모드로 호출하는 기존 얇은 래퍼(무변경 동작).
 * 초기 교시 = 현재 시각이 속한 교시(수업 시간 외이면 1교시). 화면의 교시 드롭다운으로
 * 사용자가 직접 변경할 수 있으므로 자동 매칭으로 인한 오저장(R6) 위험은 없다.
 *
 * "통계" — 신규 ClassAttendanceStatsView(읽기 전용 집계).
 */
export function ClassAttendanceTab({ classId, className }: ClassAttendanceTabProps) {
  const [mode, setMode] = useState<AttendanceMode>('check');
  const periodTimes = useMobileSettingsStore((s) => s.settings.periodTimes);
  const { currentPeriod } = useCurrentPeriod(periodTimes);
  const initialPeriod = currentPeriod && currentPeriod >= 1 ? currentPeriod : 1;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-sp-border shrink-0">
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          ariaLabel="출결 화면 전환"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === 'check' ? (
          <AttendanceCheckPage
            classId={classId}
            className={className}
            period={initialPeriod}
            currentPeriod={currentPeriod ?? undefined}
            type="class"
            onBack={() => {
              /* embedded 모드에서는 onBack 무시 — ClassDetailPage 헤더의 뒤로가기가 처리 */
            }}
            embedded
          />
        ) : (
          <ClassAttendanceStatsView classId={classId} className={className} />
        )}
      </div>
    </div>
  );
}
