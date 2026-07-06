import { useState } from 'react';
import { AttendanceCheckPage } from '@mobile/pages/AttendanceCheckPage';
import { HomeroomAttendanceStatsView } from '@mobile/pages/HomeroomAttendanceStatsView';
import { SegmentedControl } from '@mobile/components/common/SegmentedControl';

type HomeroomAttendanceMode = 'check' | 'stats';

const MODE_OPTIONS = [
  { key: 'check' as const, label: '출결 체크' },
  { key: 'stats' as const, label: '출결 통계' },
];

interface HomeroomAttendanceViewProps {
  classId: string;
  className: string;
  onBack: () => void;
}

/**
 * 담임 출결 진입점 — 홈 "담임 출결하기" 카드(`TodayHub`)에서 `attendanceNav.type==='homeroom'`일
 * 때 App.tsx가 렌더한다(Design §6.1, Feature A). 상단 세그먼트(체크/통계)로 전환하며, 기본값은
 * "체크"라 기존 첫 화면 동작은 회귀 없음. 두 모드 모두 뒤로가기는 항상 홈으로(`onBack` 그대로
 * relay).
 *
 * 세그먼트 바가 safe-area-inset-top(노치 안전영역)을 흡수한다 — 아래 `AttendanceCheckPage`의
 * 비embedded 헤더는 `headerTopInset={false}`로 자체 top padding을 꺼서 이중 여백을 막는다(그
 * 헤더가 더 이상 화면 최상단이 아니게 됐으므로). `HomeroomAttendanceStatsView`의 자체 헤더도
 * 같은 이유로 top padding을 쓰지 않는다.
 */
export function HomeroomAttendanceView({
  classId,
  className,
  onBack,
}: HomeroomAttendanceViewProps) {
  const [mode, setMode] = useState<HomeroomAttendanceMode>('check');

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-4 py-2 border-b border-sp-border shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
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
            period={0}
            type="homeroom"
            onBack={onBack}
            headerTopInset={false}
          />
        ) : (
          <HomeroomAttendanceStatsView classId={classId} className={className} onBack={onBack} />
        )}
      </div>
    </div>
  );
}
