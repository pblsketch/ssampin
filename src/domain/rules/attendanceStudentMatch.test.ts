import { describe, it, expect } from 'vitest';
import type { StudentAttendance } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import { buildAttendanceMatrix } from './attendanceRules';
import {
  buildAttendanceRows,
  createAttendanceRosterMatcher,
  isSameAttendanceStudent,
  mergeAttendanceStudents,
  resolveIncomingAttendanceStudents,
} from './attendanceStudentMatch';

/**
 * 출결 항목 → 명단 학생 잇기(공통 규칙).
 *
 * 배경: AI 연결(브릿지)이 앱이 켜진 채 넣은 수업반 출결은 학년·반 없이 번호만 저장됐다.
 * 화면은 `studentKey` 문자열(`"7"` vs `"2-3-7"`)만 비교해서 그 항목이 통계에서 빠지고,
 * 조회에는 "?" 로, 입력 화면에는 출석으로 보였다(2026-11-02 신고).
 */

/** 여러 학급에서 모인 수업반 — 7번은 한 명, 2번은 둘이다. */
const mixedRoster = [
  { number: 2, name: '도유산', grade: 2, classNum: 1 },
  { number: 2, name: '민서율', grade: 2, classNum: 3 },
  { number: 7, name: '한지후', grade: 2, classNum: 3 },
  { number: 11, name: '오다인', grade: 2, classNum: 4 },
];

describe('번호만 있는 항목을 누구의 것으로 보는가', () => {
  it('번호만 있는 항목은 명단에서 번호가 유일하면 그 학생으로 본다', () => {
    const matcher = createAttendanceRosterMatcher(mixedRoster);
    const legacy: StudentAttendance = { number: 7, status: 'absent' };

    expect(matcher.resolveKey(legacy)).toBe('2-3-7');
    expect(matcher.resolveStudent(legacy)?.name).toBe('한지후');
  });

  it('번호가 겹치면 매칭하지 않는다 — 누구인지 짐작하지 않는다', () => {
    const matcher = createAttendanceRosterMatcher(mixedRoster);
    const legacy: StudentAttendance = { number: 2, status: 'absent' };

    expect(matcher.resolveKey(legacy)).toBeNull();
    expect(matcher.resolveStudent(legacy)).toBeNull();
  });

  it('학년·반까지 적힌 항목은 번호가 겹쳐도 그 학생으로 본다', () => {
    const matcher = createAttendanceRosterMatcher(mixedRoster);

    expect(matcher.resolveStudent({ number: 2, grade: 2, classNum: 3 })?.name).toBe('민서율');
    expect(matcher.resolveStudent({ number: 2, grade: 2, classNum: 1 })?.name).toBe('도유산');
  });

  it('학년·반이 명단과 어긋나는 항목은 번호가 유일해도 잇지 않는다', () => {
    const matcher = createAttendanceRosterMatcher(mixedRoster);

    // 7번은 명단에 한 명뿐이지만 2학년 3반이다 — 1학년 1반 7번은 다른 학생이다.
    expect(matcher.resolveKey({ number: 7, grade: 1, classNum: 1 })).toBeNull();
  });

  it('★지금은 수업을 안 듣는 학생도 같은 번호였다면 유일하다고 보지 않는다', () => {
    const roster = [
      ...mixedRoster,
      { number: 7, name: '전학 간 학생', grade: 2, classNum: 5, status: 'transferred' as const },
    ];
    const matcher = createAttendanceRosterMatcher(roster);

    expect(matcher.resolveKey({ number: 7 })).toBeNull();
  });

  it('학년·반이 없는 명단(담임 학급)은 예전처럼 번호로 잇는다', () => {
    const homeroom = [{ number: 1 }, { number: 2 }, { number: 3 }];
    const matcher = createAttendanceRosterMatcher(homeroom);

    expect(matcher.resolveKey({ number: 2 })).toBe('2');
    // 항목에만 학년·반이 실려 있어도 번호가 한 명뿐이면 그 학생이다(기존 그리드의 관용 유지).
    expect(matcher.resolveKey({ number: 2, grade: 3, classNum: 5 })).toBe('2');
    expect(matcher.resolveKey({ number: 9 })).toBeNull();
  });

  it('★명단에서의 위치가 아니라 실제 번호로 찾는다 — 앞 번호가 비어 있어도 밀리지 않는다', () => {
    // 1·2번이 없는 명단: 배열 위치(0,1,2)를 번호로 쓰면 3번 기록이 엉뚱한 학생에게 간다.
    const roster = [
      { number: 3, name: '셋', grade: 1, classNum: 1 },
      { number: 4, name: '넷', grade: 1, classNum: 1 },
      { number: 5, name: '다섯', grade: 1, classNum: 1 },
    ];
    const matcher = createAttendanceRosterMatcher(roster);

    expect(matcher.resolveStudent({ number: 3 })?.name).toBe('셋');
    expect(matcher.resolveStudent({ number: 1 })).toBeNull();
    expect(matcher.resolveStudent({ number: 2 })).toBeNull();
  });
});

describe('한 교시의 항목들을 학생에 잇기', () => {
  it('같은 학생에 옛 항목과 새 항목이 함께 있으면 학년·반까지 맞는 쪽만 남긴다', () => {
    const matcher = createAttendanceRosterMatcher(mixedRoster);
    const entries: StudentAttendance[] = [
      { number: 7, status: 'absent' }, // 번호만 있는 옛 항목
      { number: 7, status: 'late', grade: 2, classNum: 3 }, // 나중에 제대로 적힌 항목
    ];

    const resolved = matcher.resolveEntries(entries);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.entry.status).toBe('late');
    expect(matcher.indexByStudentKey(entries).get('2-3-7')?.status).toBe('late');
  });

  it('누구인지 못 정한 항목은 버리지 않고 돌려준다 — 조회 화면이 "?" 로라도 보여 줘야 한다', () => {
    const matcher = createAttendanceRosterMatcher(mixedRoster);
    const entries: StudentAttendance[] = [
      { number: 2, status: 'absent' }, // 2번이 둘이라 못 정한다
      { number: 11, status: 'late' },
    ];

    const resolved = matcher.resolveEntries(entries);
    expect(resolved.map((item) => item.key)).toEqual([null, '2-4-11']);
    // 묶음에는 정한 것만 들어간다(통계는 못 정한 항목을 누구에게도 세지 않는다).
    expect([...matcher.indexByStudentKey(entries).keys()]).toEqual(['2-4-11']);
  });
});

describe('입력 화면 — 살려 보여 준 뒤 저장하면 어떤 키로 적히는가', () => {
  it('번호만 있던 항목이 그 학생 줄에 뜬다(출석으로 보이지 않는다)', () => {
    const saved: StudentAttendance[] = [{ number: 7, status: 'absent', reason: '질병' }];

    const rows = buildAttendanceRows(mixedRoster, mixedRoster, saved);
    const row = rows.find((r) => studentKey(r) === '2-3-7');
    expect(row?.status).toBe('absent');
    expect(row?.reason).toBe('질병');
  });

  it('★회귀: 저장되는 줄의 키가 명단 키와 같다 — 옛 키("7")로 다시 적히지 않는다', () => {
    const saved: StudentAttendance[] = [{ number: 7, status: 'absent' }];

    const rows = buildAttendanceRows(mixedRoster, mixedRoster, saved);

    // 화면 저장은 이 줄들로 그 교시를 통째로 쓴다 → 줄의 키 = 저장되는 키.
    expect(rows.map((r) => studentKey(r))).toEqual(mixedRoster.map((s) => studentKey(s)));
    // 한 학생이 두 줄이 되지 않는다(옛 항목과 새 항목이 나란히 남지 않는다).
    expect(rows.filter((r) => r.number === 7)).toHaveLength(1);
    // 다시 읽어도 같은 학생에게 그대로 붙는다.
    const reread = buildAttendanceRows(mixedRoster, mixedRoster, rows);
    expect(reread.find((r) => studentKey(r) === '2-3-7')?.status).toBe('absent');
  });

  it('번호가 겹치는 옛 항목은 누구에게도 붙이지 않는다 — 엉뚱한 학생을 결석으로 만들지 않는다', () => {
    const saved: StudentAttendance[] = [{ number: 2, status: 'absent' }];

    const rows = buildAttendanceRows(mixedRoster, mixedRoster, saved);
    expect(rows.filter((r) => r.number === 2).map((r) => r.status)).toEqual(['present', 'present']);
  });

  it('저장된 것이 없으면 전원 출석으로 시작한다', () => {
    const rows = buildAttendanceRows(mixedRoster, mixedRoster, undefined);
    expect(rows.every((r) => r.status === 'present')).toBe(true);
    expect(rows).toHaveLength(mixedRoster.length);
  });
});

describe('출결 그리드(하루 교시 표)도 같은 규칙으로 읽는다', () => {
  it('번호만 있는 항목이 그 학생 칸에 뜬다 — 못 이으면 그리드 저장 때 지워진다', () => {
    const matrix = buildAttendanceMatrix(
      [
        {
          classId: 'tc-1',
          date: '2026-11-02',
          period: 3,
          students: [
            { number: 7, status: 'absent' },
            { number: 2, status: 'late' },
          ],
        },
      ],
      'tc-1',
      '2026-11-02',
      mixedRoster,
      [3],
    );

    expect(matrix.get('2-3-7')?.get(3)?.status).toBe('absent');
    // 2번은 둘이라 어느 쪽에도 붙지 않는다.
    expect(matrix.get('2-1-2')?.get(3)).toBeUndefined();
    expect(matrix.get('2-3-2')?.get(3)).toBeUndefined();
  });

  it('★전출 학생과 번호가 같은 재적 학생에게 번호만 있는 옛 항목을 붙이지 않는다(출결표)', () => {
    // 표에는 재적 학생만 그리지만, 번호가 유일한지는 명단 전체로 가른다.
    const fullRoster = [
      ...mixedRoster,
      { number: 7, name: '전학 간 학생', grade: 2, classNum: 5, status: 'transferred' as const },
    ];
    const records = [
      {
        classId: 'tc-1',
        date: '2026-11-02',
        period: 3,
        students: [
          { number: 7, status: 'absent' as const },
          { number: 11, status: 'late' as const },
        ],
      },
    ];

    const matrix = buildAttendanceMatrix(
      records,
      'tc-1',
      '2026-11-02',
      mixedRoster, // 그릴 행: 재적 학생
      [3],
      fullRoster, // 가르는 기준: 명단 전체
    );

    // 7번은 명단 전체에 둘이다 — 재적 한지후(2-3-7)의 것이라고 짐작하지 않는다.
    expect(matrix.get('2-3-7')?.get(3)).toBeUndefined();
    // 번호가 한 명뿐인 11번은 그대로 붙는다.
    expect(matrix.get('2-4-11')?.get(3)?.status).toBe('late');
    // 행은 그릴 학생만큼만 만든다(전출 학생 행은 없다).
    expect([...matrix.keys()]).toEqual(mixedRoster.map((s) => studentKey(s)));
  });

  it('명단 전체를 따로 안 넘기면 그릴 학생 목록으로 가른다 — 담임 그리드(번호만 쓰는 키)는 그대로다', () => {
    const homeroom = [{ number: 1 }, { number: 2 }];
    const matrix = buildAttendanceMatrix(
      [
        {
          classId: 'hr',
          date: '2026-11-02',
          period: 1,
          students: [{ number: 2, status: 'late' }],
        },
      ],
      'hr',
      '2026-11-02',
      homeroom,
      [1],
    );

    expect(matrix.get('2')?.get(1)?.status).toBe('late');
    expect(matrix.get('1')?.get(1)).toBeUndefined();
  });
});

describe('이번에 든 학생만 갈아 끼우기(mergeAttendanceStudents)', () => {
  it('든 학생만 바뀌고 나머지 학생 항목은 그대로다', () => {
    const existing: StudentAttendance[] = [
      { number: 7, status: 'absent', grade: 2, classNum: 3 },
      { number: 11, status: 'late', grade: 2, classNum: 4 },
    ];
    const incoming: StudentAttendance[] = [
      { number: 11, status: 'present', grade: 2, classNum: 4 },
    ];

    const merged = mergeAttendanceStudents(existing, incoming, mixedRoster);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(existing[0]);
    expect(merged.find((s) => s.number === 11)?.status).toBe('present');
  });

  it('번호가 겹치는 수업반 — 같은 2번이라도 다른 학급 학생의 기록은 지워지지 않는다', () => {
    const existing: StudentAttendance[] = [{ number: 2, status: 'absent', grade: 2, classNum: 1 }];
    const incoming: StudentAttendance[] = [{ number: 2, status: 'late', grade: 2, classNum: 3 }];

    const merged = mergeAttendanceStudents(existing, incoming, mixedRoster);
    expect(merged.map((s) => [studentKey(s), s.status])).toEqual([
      ['2-1-2', 'absent'],
      ['2-3-2', 'late'],
    ]);
  });

  it('번호만 있던 옛 항목은 새 항목으로 바뀐다 — 한 학생이 두 줄이 되지 않는다', () => {
    const existing: StudentAttendance[] = [{ number: 7, status: 'absent' }];
    const incoming: StudentAttendance[] = [{ number: 7, status: 'late', grade: 2, classNum: 3 }];

    const merged = mergeAttendanceStudents(existing, incoming, mixedRoster);
    expect(merged).toEqual([{ number: 7, status: 'late', grade: 2, classNum: 3 }]);
  });

  it('명단을 못 읽었으면 번호·학년·반이 모두 같은 항목만 같은 학생으로 본다', () => {
    const existing: StudentAttendance[] = [
      { number: 7, status: 'absent' },
      { number: 7, status: 'absent', grade: 2, classNum: 3 },
    ];
    const incoming: StudentAttendance[] = [{ number: 7, status: 'late', grade: 2, classNum: 3 }];

    const merged = mergeAttendanceStudents(existing, incoming, []);
    expect(merged).toEqual([
      { number: 7, status: 'absent' },
      { number: 7, status: 'late', grade: 2, classNum: 3 },
    ]);
  });

  it('한 번에 같은 학생이 두 번 들어 있으면 뒤엣것이 남는다', () => {
    const incoming: StudentAttendance[] = [
      { number: 7, status: 'absent', grade: 2, classNum: 3 },
      { number: 7, status: 'late', grade: 2, classNum: 3 },
    ];

    const merged = mergeAttendanceStudents([], incoming, mixedRoster);
    expect(merged).toEqual([{ number: 7, status: 'late', grade: 2, classNum: 3 }]);
  });
});

describe('밖에서 들어온 항목을 저장 전에 명단에 맞추기(resolveIncomingAttendanceStudents)', () => {
  it('번호가 한 명뿐이면 명단의 학년·반을 실어 준다', () => {
    const result = resolveIncomingAttendanceStudents(
      [{ number: 7, status: 'late' as const }],
      mixedRoster,
    );
    expect(result).toEqual({
      ok: true,
      students: [{ number: 7, status: 'late', grade: 2, classNum: 3 }],
    });
  });

  it('번호가 겹치는데 학년·반 없이 오면 정하지 않고 그 번호들을 알려 준다', () => {
    const result = resolveIncomingAttendanceStudents(
      [
        { number: 7, status: 'late' as const },
        { number: 2, status: 'absent' as const },
        { number: 2, status: 'late' as const, grade: 2 }, // 반이 없다
      ],
      mixedRoster,
    );
    expect(result).toEqual({ ok: false, ambiguousNumbers: [2] });
  });

  it('학년·반까지 적혀 있으면 번호가 겹쳐도 그대로 받는다', () => {
    const incoming = [{ number: 2, status: 'absent' as const, grade: 2, classNum: 3 }];
    expect(resolveIncomingAttendanceStudents(incoming, mixedRoster)).toEqual({
      ok: true,
      students: incoming,
    });
  });

  it('★전출 학생과 번호가 같으면 재적 학생 것이라고 짐작하지 않는다', () => {
    const roster = [
      ...mixedRoster,
      { number: 7, name: '전학 간 학생', grade: 2, classNum: 5, status: 'transferred' as const },
    ];
    expect(
      resolveIncomingAttendanceStudents([{ number: 7, status: 'late' as const }], roster),
    ).toEqual({ ok: false, ambiguousNumbers: [7] });
  });

  it('명단에 없는 번호·학년과 반이 없는 명단(담임 학급)은 받은 그대로 둔다', () => {
    const unknown = [{ number: 30, status: 'absent' as const }];
    expect(resolveIncomingAttendanceStudents(unknown, mixedRoster)).toEqual({
      ok: true,
      students: unknown,
    });

    const homeroom = [{ number: 1 }, { number: 2 }];
    const entry = [{ number: 2, status: 'late' as const }];
    expect(resolveIncomingAttendanceStudents(entry, homeroom)).toEqual({
      ok: true,
      students: entry,
    });
    // 명단을 못 읽었을 때(빈 명단)도 막지 않는다
    expect(resolveIncomingAttendanceStudents(entry, [])).toEqual({ ok: true, students: entry });
  });
});

describe('isSameAttendanceStudent', () => {
  it('번호·학년·반이 모두 같아야 같은 학생 칸이다', () => {
    expect(
      isSameAttendanceStudent(
        { number: 2, grade: 2, classNum: 1 },
        { number: 2, grade: 2, classNum: 1 },
      ),
    ).toBe(true);
    expect(
      isSameAttendanceStudent(
        { number: 2, grade: 2, classNum: 1 },
        { number: 2, grade: 2, classNum: 3 },
      ),
    ).toBe(false);
    expect(isSameAttendanceStudent({ number: 2 }, { number: 2, grade: 2, classNum: 1 })).toBe(
      false,
    );
    expect(isSameAttendanceStudent({ number: 2 }, { number: 2 })).toBe(true);
  });
});
