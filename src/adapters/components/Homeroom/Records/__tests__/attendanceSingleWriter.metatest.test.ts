import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 데이터 안전 회귀 가드 (메타 테스트)
 *
 * 담임 출결의 단일 기록자 불변식.
 *
 * attendance-grid-v2:
 * - P7.1: '오늘 출결' 그리드가 InputMode(누가기록) → AttendanceMode(출결 탭)로 분리.
 *   렌더 게이트·미러 순서·교시 단일 출처 불변식이 AttendanceMode로 리타깃.
 * - P7.3: 여러 날 출결 카드 경로까지 출결 탭으로 완전 이관 → **누가기록에는 출결 입력
 *   경로가 아예 존재하지 않는다**(ATTENDANCE_TYPES·attendanceType 쓰기·출결 저장 분기
 *   부재). 이는 ADR-018 단일 기록자 원칙의 **강화**다(경로 제거 = 완화 아님). 출결
 *   입력 컴포넌트는 AttendanceMode(그리드/여러 날 패널)가 유일하다.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf-8');

describe('담임 출결 단일 기록자 불변식 (P4.2 → P7.1/P7.3 리타깃·강화)', () => {
  const inputMode = read('InputMode.tsx');
  const attendanceMode = read('AttendanceMode.tsx');
  const grid = read('HomeroomAttendanceGrid.tsx');

  it('누가기록(InputMode)에 출결 입력 경로가 없다 (P7.3 강화 — 기록자 제거)', () => {
    // 출결 유형 상수·attendanceType 쓰기·출결 저장(saveDayAttendance)·미러(bridge) 부재.
    // (출결 미러 기록의 '표시'는 유지되므로 `record.category === 'attendance'` 참조는 허용 —
    //  여기서는 '입력/저장 경로'가 없음을 검증한다.)
    expect(inputMode).not.toMatch(/ATTENDANCE_TYPES/);
    expect(inputMode).not.toMatch(/setAttendanceType/);
    expect(inputMode).not.toMatch(/saveDayAttendance/);
    expect(inputMode).not.toMatch(/bridgeHomeroomDayAttendance/);
    expect(inputMode).not.toMatch(/updateAttendanceRecord/);
    // 출결 그리드 셸을 누가기록이 렌더하지 않는다(출결 입력구는 출결 탭 유일).
    expect(inputMode).not.toMatch(/HomeroomAttendanceGrid/);
  });

  it('출결 입력 컴포넌트는 AttendanceMode(출결 탭)가 유일하다', () => {
    // 그리드(단일 날짜) + 여러 날 패널 모두 출결 탭 호스트가 소유한다.
    expect(attendanceMode).toMatch(/<HomeroomAttendanceGrid/);
    expect(attendanceMode).toMatch(/MultiDayAttendancePanel/);
  });

  it('렌더 게이트: 번호 충돌 시 그리드 대신 정리 안내를 렌더한다 (AttendanceMode)', () => {
    // hasCollisionRisk 삼항의 false 분기에 HomeroomAttendanceGrid 가 있어야 한다.
    const gateIdx = attendanceMode.indexOf('numberIssues.hasCollisionRisk ? (');
    const gridIdx = attendanceMode.indexOf('<HomeroomAttendanceGrid');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gridIdx).toBeGreaterThan(gateIdx);
  });

  it('그리드 저장 위임은 미러(bridgeHomeroomDayAttendance) 재매핑을 포함한다 (AttendanceMode)', () => {
    // saveGridDay 본문 안에 saveDayAttendance → bridge 순서 호출이 있어야 한다.
    const fnIdx = attendanceMode.indexOf('const saveGridDay');
    const saveIdx = attendanceMode.indexOf(
      'await saveDayAttendance(className, date, recordsByPeriod)',
      fnIdx,
    );
    const bridgeIdx = attendanceMode.indexOf(
      'await bridgeHomeroomDayAttendance({ className, date, recordsByPeriod, students })',
      fnIdx,
    );
    expect(fnIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(fnIdx);
    expect(bridgeIdx).toBeGreaterThan(saveIdx);
  });

  it('담임 그리드 셸은 스토어를 직접 import 하지 않는다 (저장·데이터는 호스트 위임)', () => {
    expect(grid).not.toMatch(/from '@adapters\/stores\//);
  });

  it('좌석 뷰는 스토어·좌석 편집 액션을 import/참조하지 않는다 (읽기 전용 격리, §3.10-4)', () => {
    // 자리 배치 도구의 편집 액션(useSeatingStore)을 참조하면 좌석 편집 부작용이 유출된다.
    // 데이터(seats 그리드·매핑)는 prop으로만 받고, 편집 함수 import는 0이어야 한다.
    const seat = read('SeatAttendanceView.tsx');
    expect(seat).not.toMatch(/from '@adapters\/stores\//);
    expect(seat).not.toMatch(
      /updateStudent|swapSeats|moveFreestyleDesk|changeLayout|updateGroups|randomize|clearAllSeats|resizeGrid/,
    );
  });

  it('그리드 교시 목록과 교시 수는 같은 settings(maxPeriods) 출처를 쓴다 (AttendanceMode)', () => {
    // periodCount = maxPeriods ?? 7 이 단일 출처이고, gridPeriods 가 이를 소비해야 한다.
    expect(attendanceMode).toMatch(/const periodCount = maxPeriods \?\? 7/);
    expect(attendanceMode).toMatch(
      /Array\.from\(\{ length: periodCount \}, \(_, i\) => i \+ 1\),?\s*\n?\s*PERIOD_CLOSING/,
    );
  });
});
