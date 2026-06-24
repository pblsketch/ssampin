/**
 * recordIdentityAdapter — 식별 그룹핑 어댑터 hard-gate 테스트.
 * 핵심: 서로 다른 컨텍스트/반의 동일 rawKey를 절대 합치지 않는다(개인정보 오병합 0).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  makeSurfaceStudentKey,
  groupBySurfaceKey,
  groupRecordsByStudent,
  type SurfaceStudentKey,
} from './recordIdentityAdapter';
import type { DisplayRecord } from './displayRecord';

function rec(studentKey: string, date: string, content = ''): DisplayRecord {
  return {
    key: `${studentKey}-${date}-${content}`,
    date,
    studentKey,
    studentName: studentKey,
    kind: 'observation',
    kindKey: 'observation',
    kindLabel: '특기사항',
    content,
  };
}

describe('makeSurfaceStudentKey — 컨텍스트 분리', () => {
  it('같은 rawKey라도 컨텍스트가 다르면 surfaceKey가 다르다 (hard gate)', () => {
    const a = makeSurfaceStudentKey('homeroom', 'shared-id');
    const b = makeSurfaceStudentKey('teaching', 'shared-id', 'c1');
    expect(a.surfaceKey).not.toBe(b.surfaceKey);
    expect(a.rawKey).toBe('shared-id'); // 원본 보존
    expect(b.rawKey).toBe('shared-id');
  });

  it('같은 컨텍스트라도 반(classId)이 다르면 surfaceKey가 다르다', () => {
    const a = makeSurfaceStudentKey('teaching', 'k', 'c1');
    const b = makeSurfaceStudentKey('teaching', 'k', 'c2');
    expect(a.surfaceKey).not.toBe(b.surfaceKey);
  });

  it('동일 (context, classId, rawKey)는 같은 surfaceKey', () => {
    const a = makeSurfaceStudentKey('teaching', 'k', 'c1');
    const b = makeSurfaceStudentKey('teaching', 'k', 'c1');
    expect(a.surfaceKey).toBe(b.surfaceKey);
  });

  it('구분자 주입 안전 — 콜론/따옴표가 든 키도 다른 삼중쌍과 충돌하지 않는다', () => {
    // 교과 studentKey는 'tc:c1:5'처럼 콜론을 포함한다.
    const a = makeSurfaceStudentKey('teaching', 'tc:c1:5', 'c1');
    // 단순 문자열 접합('teaching:c1:tc:c1:5')과 같은 모양을 인위적으로 만들 수 있는 다른 삼중쌍
    const b = makeSurfaceStudentKey('teaching', '5', 'c1:tc:c1');
    expect(a.surfaceKey).not.toBe(b.surfaceKey);
  });
});

describe('groupBySurfaceKey — 컨텍스트 교차 병합 0', () => {
  it('동일 rawKey·다른 컨텍스트는 별도 그룹으로 유지된다 (C-AC3)', () => {
    const homeroomKey: SurfaceStudentKey = makeSurfaceStudentKey('homeroom', 'X');
    const teachingKey: SurfaceStudentKey = makeSurfaceStudentKey('teaching', 'X', 'c1');
    const groups = groupBySurfaceKey([
      { key: homeroomKey, record: rec('X', '2026-03-10', '담임 기록') },
      { key: teachingKey, record: rec('X', '2026-03-11', '교과 기록') },
    ]);
    expect(groups).toHaveLength(2);
    const contents = groups.map((g) => g.items.map((i) => i.content).join());
    expect(contents).toContain('담임 기록');
    expect(contents).toContain('교과 기록');
    // 어느 그룹도 두 컨텍스트 기록을 함께 갖지 않는다.
    for (const g of groups) {
      expect(g.items).toHaveLength(1);
    }
  });

  it('입력 순서를 보존한다', () => {
    const k = makeSurfaceStudentKey('teaching', 'A', 'c1');
    const groups = groupBySurfaceKey([
      { key: k, record: rec('A', '2026-03-10', '1') },
      { key: k, record: rec('A', '2026-03-12', '2') },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.content)).toEqual(['1', '2']);
  });
});

describe('groupRecordsByStudent — 단일 컨텍스트 편의 함수', () => {
  it('학생별로 묶고 원본 rawKey를 보존하며 건수가 맞다', () => {
    const groups = groupRecordsByStudent(
      [rec('s1', '2026-03-10'), rec('s2', '2026-03-10'), rec('s1', '2026-03-11')],
      'teaching',
      'c1',
    );
    expect(groups).toHaveLength(2);
    const s1 = groups.find((g) => g.key.rawKey === 's1');
    expect(s1?.items).toHaveLength(2);
    expect(s1?.key.context).toBe('teaching');
    expect(s1?.key.classId).toBe('c1');
  });
});

describe('C-AC5 hard gate — 어댑터는 store write 의존이 없다 (정적 검사)', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./recordIdentityAdapter.ts', import.meta.url)),
    'utf-8',
  );

  it('store import가 0건이다', () => {
    expect(source).not.toMatch(/from\s+['"]@adapters\/stores/);
    expect(source).not.toMatch(/useStudentRecordsStore|useObservationStore|useTeachingClassStore/);
  });

  it('저장(write) 메서드명이 0건이다', () => {
    const writeMethods = [
      'updateAttendanceRecord',
      'updateRecord',
      'deleteRecord',
      'addRecord',
      'saveDayAttendance',
      'bridgeHomeroomDayAttendance',
    ];
    for (const m of writeMethods) {
      expect(source.includes(m)).toBe(false);
    }
  });
});
