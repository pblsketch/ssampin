import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P4.2 데이터 안전 회귀 가드 (메타 테스트)
 *
 * 담임 출결은 "단일 날짜 = 그리드 단일 기록자, 여러 날 = 카드 경로" 로 분리된다.
 * 두 경로가 같은 (학급, 날짜)에 동시에 쓰면 그리드의 하루치 통째 교체가
 * 카드가 추가한 기록을 지우는 데이터 손실이 난다 (InputMode 인코드 경고 참조).
 * 이 불변식이 코드에서 무너지면 여기서 잡는다.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf-8');

describe('담임 출결 단일 기록자 불변식 (P4.2)', () => {
  const inputMode = read('InputMode.tsx');
  const grid = read('HomeroomAttendanceGrid.tsx');

  it('카드 출결 카테고리 UI는 여러 날 모드(dateRangeMode)에서만 렌더된다', () => {
    // 출결 카테고리 map 이 dateRangeMode 게이트 안에 있어야 한다
    expect(inputMode).toMatch(
      /dateRangeMode\s*&&\s*\n?\s*categories\s*\n?\s*\.filter\(\(cat\) => cat\.id === 'attendance'\)/,
    );
  });

  it('카드 출결 단축키(A/L/E/X)도 dateRangeMode 게이트 안에 있다', () => {
    const idx = inputMode.indexOf('if (dateRangeMode) {');
    const aKey = inputMode.indexOf("if (key === 'a')");
    expect(idx).toBeGreaterThan(-1);
    expect(aKey).toBeGreaterThan(idx); // A 단축키가 게이트 뒤에 위치
  });

  it('렌더 게이트: 번호 충돌 시 그리드 대신 정리 안내를 렌더한다', () => {
    // hasCollisionRisk 삼항의 false 분기에 HomeroomAttendanceGrid 가 있어야 한다
    const gateIdx = inputMode.indexOf('numberIssues.hasCollisionRisk ? (');
    const gridIdx = inputMode.indexOf('<HomeroomAttendanceGrid');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gridIdx).toBeGreaterThan(gateIdx);
  });

  it('그리드 저장 위임은 미러(bridgeHomeroomDayAttendance) 재매핑을 포함한다', () => {
    // saveGridDay 본문 안에 saveDayAttendance → bridge 순서 호출이 있어야 한다
    const fnIdx = inputMode.indexOf('const saveGridDay');
    const saveIdx = inputMode.indexOf(
      'await saveDayAttendance(className, date, recordsByPeriod)',
      fnIdx,
    );
    const bridgeIdx = inputMode.indexOf(
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

  it('그리드 교시 목록과 카드 교시 수는 같은 settings(maxPeriods) 출처를 쓴다', () => {
    // periodCount = maxPeriods ?? 7 이 단일 출처이고, gridPeriods 가 이를 소비해야 한다
    expect(inputMode).toMatch(/const periodCount = maxPeriods \?\? 7/);
    expect(inputMode).toMatch(
      /Array\.from\(\{ length: periodCount \}, \(_, i\) => i \+ 1\),?\s*\n?\s*PERIOD_CLOSING/,
    );
  });
});
