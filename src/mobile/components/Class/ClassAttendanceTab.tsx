import { AttendanceCheckPage } from '@mobile/pages/AttendanceCheckPage';
import { useCurrentPeriod } from '@mobile/hooks/useCurrentPeriod';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';

interface ClassAttendanceTabProps {
  classId: string;
  className: string;
}

/**
 * 학급 상세 화면의 출결 서브탭.
 * AttendanceCheckPage를 embedded 모드로 호출하는 얇은 래퍼.
 *
 * 초기 교시 = 현재 시각이 속한 교시(수업 시간 외이면 1교시). 화면의 교시 드롭다운으로
 * 사용자가 직접 변경할 수 있으므로 자동 매칭으로 인한 오저장(R6) 위험은 없다.
 */
export function ClassAttendanceTab({ classId, className }: ClassAttendanceTabProps) {
  const periodTimes = useMobileSettingsStore((s) => s.settings.periodTimes);
  const { currentPeriod } = useCurrentPeriod(periodTimes);
  const initialPeriod = currentPeriod && currentPeriod >= 1 ? currentPeriod : 1;

  return (
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
  );
}
