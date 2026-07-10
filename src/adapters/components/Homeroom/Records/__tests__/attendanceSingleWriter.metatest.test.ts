import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 데이터 안전 회귀 가드 (메타 테스트)
 *
 * 담임 출결은 "단일 날짜 = 그리드 단일 기록자, 여러 날 = 카드 경로" 로 분리된다.
 * 두 경로가 같은 (학급, 날짜)에 동시에 쓰면 그리드의 하루치 통째 교체가
 * 카드가 추가한 기록을 지우는 데이터 손실이 난다.
 *
 * attendance-grid-v2 P7.1: '오늘 출결' 그리드가 InputMode(누가기록)에서
 * AttendanceMode(출결 탭)로 분리됐다. 렌더 게이트·미러 순서·교시 단일 출처
 * 불변식은 새 호스트(AttendanceMode)로 리타깃됐다(ADR-018 승계·강화, 완화 아님).
 * 카드 여러 날 경로(dateRangeMode 게이트)는 P7.3 이관 전까지 InputMode에 존치되므로
 * 해당 가드는 InputMode를 계속 읽는다.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf-8');

describe('담임 출결 단일 기록자 불변식 (P4.2 → P7.1 리타깃)', () => {
  const inputMode = read('InputMode.tsx');
  const attendanceMode = read('AttendanceMode.tsx');
  const grid = read('HomeroomAttendanceGrid.tsx');

  it('카드 출결 카테고리 UI는 여러 날 모드(dateRangeMode)에서만 렌더된다 (InputMode 존치)', () => {
    // 출결 카테고리 map 이 dateRangeMode 게이트 안에 있어야 한다.
    // P7.3에서 카드 출결이 소멸하면 이 가드는 "출결 입력 경로 부재"로 교체된다.
    expect(inputMode).toMatch(
      /dateRangeMode\s*&&\s*\n?\s*categories\s*\n?\s*\.filter\(\(cat\) => cat\.id === 'attendance'\)/,
    );
  });

  it('카드 출결 단축키(A/L/E/X)도 dateRangeMode 게이트 안에 있다 (InputMode 존치)', () => {
    const idx = inputMode.indexOf('if (dateRangeMode) {');
    const aKey = inputMode.indexOf("if (key === 'a')");
    expect(idx).toBeGreaterThan(-1);
    expect(aKey).toBeGreaterThan(idx); // A 단축키가 게이트 뒤에 위치
  });

  it('렌더 게이트: 번호 충돌 시 그리드 대신 정리 안내를 렌더한다 (AttendanceMode 리타깃)', () => {
    // hasCollisionRisk 삼항의 false 분기에 HomeroomAttendanceGrid 가 있어야 한다.
    // 그리드 호스트가 AttendanceMode로 이동했으므로 여기서 검증(강화: 유일 기록자화).
    const gateIdx = attendanceMode.indexOf('numberIssues.hasCollisionRisk ? (');
    const gridIdx = attendanceMode.indexOf('<HomeroomAttendanceGrid');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gridIdx).toBeGreaterThan(gateIdx);
  });

  it('그리드 저장 위임은 미러(bridgeHomeroomDayAttendance) 재매핑을 포함한다 (AttendanceMode 리타깃)', () => {
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

  it('그리드 교시 목록과 카드 교시 수는 같은 settings(maxPeriods) 출처를 쓴다 (AttendanceMode 리타깃)', () => {
    // periodCount = maxPeriods ?? 7 이 단일 출처이고, gridPeriods 가 이를 소비해야 한다.
    expect(attendanceMode).toMatch(/const periodCount = maxPeriods \?\? 7/);
    expect(attendanceMode).toMatch(
      /Array\.from\(\{ length: periodCount \}, \(_, i\) => i \+ 1\),?\s*\n?\s*PERIOD_CLOSING/,
    );
  });
});
