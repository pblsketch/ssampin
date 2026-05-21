/**
 * cleanupSampleRoster.test.ts
 *
 * Plan v1.2 §6.2 표의 시나리오 1~10에 대한 단위 테스트.
 *
 * 시나리오별 의도(요약):
 *   1.  신규 설치 빈 배열                       → noop  (가드 A 실패)
 *   2.  신규 설치 빈 배열, 화면 진입 시뮬레이션 → noop  (가드 A 실패)
 *   3.  샘플 35명만 박힌 데이터(피해 사용자)    → cleanup
 *   4.  샘플 35명 + 김민지 출결 1건             → banner (가드 D 실패)
 *   5.  샘플 35명 + 김민지 phone 입력           → banner (가드 E 실패)
 *   6.  본인 명단 25명                          → noop   (가드 A 실패: 길이)
 *   7.  본인 명단 35명 일괄 import              → noop   (가드 B 실패: id)
 *   8.  샘플 + 김민지 이름만 변경               → noop   (가드 C 실패: 이름)
 *   9.  샘플 그대로 + everEditedRoster=true     → noop   (가드 F 실패)
 *   10. 우연 일치 + 모든 가드 통과              → cleanup
 */

import { describe, it, expect } from 'vitest';
import type { Student } from '@domain/entities/Student';
import type { Settings } from '@domain/entities/Settings';
import { SAMPLE_ROSTER_SIGNATURE } from '@domain/rules/sampleRosterSignature';
import { decideCleanupAction, type SampleRosterExternalRefs } from './cleanupSampleRoster';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * 샘플 시그니처에서 35명 Student 객체 생성. 모든 추가 필드는 비어있다.
 * (가드 E의 흔적 필드들이 모두 falsy인 상태)
 */
function makeSampleStudents(): readonly Student[] {
  return SAMPLE_ROSTER_SIGNATURE.map((s) => ({
    id: s.id,
    name: s.name,
    studentNumber: s.studentNumber,
    phone: '',
    parentPhone: '',
    isVacant: false,
  }));
}

/** externalRefs 0(아무 참조 없음) 헬퍼 */
function zeroRefs(): SampleRosterExternalRefs {
  return {
    studentRecordCount: 0,
    seatingRefCount: 0,
    seatConstraintCount: 0,
    seatPickerRefCount: 0,
    homeroomAttendanceCount: 0,
    consultationRefCount: 0,
  };
}

/**
 * 테스트용 최소 Settings — `decideCleanupAction`이 참조하는 2개 플래그만 의미가 있다.
 * 나머지 필드는 타입 만족용. as unknown as Settings 캐스팅은 테스트 한정.
 */
function makeSettings(overrides: Partial<Settings> = {}): Settings {
  const base = {
    didCleanSampleRoster: undefined,
    everEditedRoster: undefined,
  };
  return { ...base, ...overrides } as unknown as Settings;
}

// ────────────────────────────────────────────────────────────────────
// Scenarios 1~10
// ────────────────────────────────────────────────────────────────────

describe('decideCleanupAction (Plan v1.2 §6.2 시나리오 1~10)', () => {
  it('시나리오 1: 신규 설치(빈 배열) → noop', () => {
    const students: readonly Student[] = [];
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('noop');
  });

  it('시나리오 2: 신규 설치(빈 배열, 화면 진입 시뮬레이션) → noop', () => {
    // 모든 화면이 진입해도 결정 함수 입력은 동일하므로 결과도 동일.
    // 멱등성/안정성 확인 의도.
    const students: readonly Student[] = [];
    const settings = makeSettings();
    const refs = zeroRefs();
    expect(decideCleanupAction(students, refs, settings)).toBe('noop');
    expect(decideCleanupAction(students, refs, settings)).toBe('noop');
    expect(decideCleanupAction(students, refs, settings)).toBe('noop');
  });

  it('시나리오 3: 샘플 35명만 박힌 데이터 → cleanup', () => {
    const students = makeSampleStudents();
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('cleanup');
  });

  it('시나리오 4: 샘플 35명 + 김민지에 출결 1건 → banner', () => {
    const students = makeSampleStudents();
    const refs: SampleRosterExternalRefs = {
      ...zeroRefs(),
      studentRecordCount: 1, // 가드 D 실패 트리거
    };
    const action = decideCleanupAction(students, refs, makeSettings());
    expect(action).toBe('banner');
  });

  it('시나리오 5: 샘플 35명 + 김민지 phone 입력 → banner', () => {
    const base = makeSampleStudents();
    // 첫 번째 학생(김민지)에 전화번호 1건 추가 → 가드 E 실패
    const students: readonly Student[] = base.map((s, i) =>
      i === 0 ? { ...s, phone: '010-1234-5678' } : s,
    );
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('banner');
  });

  it('시나리오 6: 본인 명단 25명 → noop (가드 A 실패: 길이)', () => {
    const students: readonly Student[] = Array.from({ length: 25 }, (_, i) => ({
      id: `s_my_${String(i + 1).padStart(2, '0')}`,
      name: `학생${i + 1}`,
      studentNumber: i + 1,
    }));
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('noop');
  });

  it('시나리오 7: 본인 명단 35명 일괄 import (id가 s_imported_*) → noop (가드 B 실패)', () => {
    // 인원·이름·번호는 시그니처와 일치하지만 id 형식이 다르다 → 가드 B 실패
    const students: readonly Student[] = SAMPLE_ROSTER_SIGNATURE.map((s, i) => ({
      id: `s_imported_${String(i + 1).padStart(3, '0')}`,
      name: s.name,
      studentNumber: s.studentNumber,
    }));
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('noop');
  });

  it('시나리오 8: 샘플 + 김민지 이름만 변경 → noop (가드 C 실패)', () => {
    const base = makeSampleStudents();
    // 첫 학생 이름만 변경 → 시그니처의 name 일치 깨짐
    const students: readonly Student[] = base.map((s, i) =>
      i === 0 ? { ...s, name: '김민서' } : s,
    );
    // 본 시나리오는 가드 C에서 먼저 걸리므로 everEditedRoster 플래그가 없어도 noop.
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('noop');
  });

  it('시나리오 9: 샘플 그대로 + everEditedRoster=true → noop (가드 F 실패)', () => {
    const students = makeSampleStudents();
    const settings = makeSettings({ everEditedRoster: true });
    const action = decideCleanupAction(students, zeroRefs(), settings);
    expect(action).toBe('noop');
  });

  it('시나리오 10: 우연 일치 + 모든 가드 통과 → cleanup', () => {
    // 신규 설치 직후 한 번도 안 만진 상태와 동치(설계 문서 명시).
    // 시나리오 3과 입력은 같으나, "우연 일치" 의도를 명시한 별도 케이스로 보존.
    const students = makeSampleStudents();
    const action = decideCleanupAction(students, zeroRefs(), makeSettings());
    expect(action).toBe('cleanup');
  });
});

// ────────────────────────────────────────────────────────────────────
// 가드 G(멱등성) 보조 — 시나리오 3 입력에 didCleanSampleRoster만 켜고 noop 확인
// ────────────────────────────────────────────────────────────────────

describe('decideCleanupAction — 가드 G(멱등성) 보조 검증', () => {
  it('didCleanSampleRoster=true이면 cleanup 후보라도 noop', () => {
    const students = makeSampleStudents();
    const settings = makeSettings({ didCleanSampleRoster: true });
    const action = decideCleanupAction(students, zeroRefs(), settings);
    expect(action).toBe('noop');
  });

  it('didCleanSampleRoster=true는 다른 모든 가드 결과를 덮어쓴다', () => {
    // 가드 D 실패 후보(banner) 입력에도 G가 우선해서 noop
    const students = makeSampleStudents();
    const refs: SampleRosterExternalRefs = { ...zeroRefs(), studentRecordCount: 3 };
    const settings = makeSettings({ didCleanSampleRoster: true });
    expect(decideCleanupAction(students, refs, settings)).toBe('noop');
  });
});
