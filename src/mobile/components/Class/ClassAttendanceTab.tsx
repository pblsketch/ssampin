import { AttendanceCheckPage } from '@mobile/pages/AttendanceCheckPage';

interface ClassAttendanceTabProps {
  classId: string;
  className: string;
}

/**
 * 학급 상세 화면의 출결 서브탭.
 * AttendanceCheckPage를 embedded 모드로 호출하는 얇은 래퍼.
 *
 * Design §2.5 — period는 1교시 하드코딩 (현행 AttendanceListPage와 동일, R6 회귀 차단).
 * v2에서 시간표 매칭 자동 선택을 별도 PDCA로 검토.
 */
export function ClassAttendanceTab({ classId, className }: ClassAttendanceTabProps) {
  return (
    <AttendanceCheckPage
      classId={classId}
      className={className}
      period={1}
      type="class"
      onBack={() => {
        /* embedded 모드에서는 onBack 무시 — ClassDetailPage 헤더의 뒤로가기가 처리 */
      }}
      embedded
    />
  );
}
