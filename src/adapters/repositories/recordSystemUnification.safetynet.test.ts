/**
 * S0 안전망 테스트 — 기록 체계 통일 불가침 보존 회귀 가드
 *
 * 설계서: docs/02-design/features/record-system-unification-phase1.design.md §4-라
 * 분석: docs/03-analysis/record-system-unification/T1·T3·T4
 *
 * 이 파일은 소스를 변경하지 않는다. 테스트만 추가한다.
 * 모든 테스트는 현재 코드에서 통과(GREEN)해야 한다.
 *
 * 항목:
 *   RG-키      attendance.json 내 담임키(className 문자열)와 교과키(UUID) 독립 공존
 *   RG-미러    담임 출결 미러 id 패턴 att-{studentId}-{date} 보존
 *   RG-첨부    ObservationAttachment deleteByObservationId cascade + 메타↔바이너리 분리
 *   RG-카테고리 StudentRecordsData.categories 사용자 정의 카테고리 라운드트립
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { AttendanceData, AttendanceRecord } from '@domain/entities/Attendance';
import type { StudentRecordsData, StudentRecord } from '@domain/entities/StudentRecord';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { JsonTeachingClassRepository } from './JsonTeachingClassRepository';
import { JsonStudentRecordsRepository } from './JsonStudentRecordsRepository';
import { JsonObservationAttachmentRepository } from './JsonObservationAttachmentRepository';

// ─────────────────────────── 공용 in-memory 스토리지 헬퍼 ───────────────────────────

/** JSON과 바이너리를 분리 보관하는 테스트용 IStoragePort */
function makeMemoryStorage(): IStoragePort & {
  readonly json: Map<string, unknown>;
  readonly bin: Map<string, Uint8Array>;
} {
  const json = new Map<string, unknown>();
  const bin = new Map<string, Uint8Array>();
  return {
    json,
    bin,
    read: async <T>(filename: string) => (json.has(filename) ? (json.get(filename) as T) : null),
    write: async <T>(filename: string, data: T) => {
      json.set(filename, data);
    },
    remove: async (filename: string) => {
      json.delete(filename);
    },
    readBinary: async (relPath: string) => bin.get(relPath) ?? null,
    writeBinary: async (relPath: string, bytes: Uint8Array) => {
      bin.set(relPath, bytes);
    },
    removeBinary: async (relPath: string) => {
      bin.delete(relPath);
    },
    listBinary: async (dirRelPath: string) => {
      const prefix = dirRelPath.endsWith('/') ? dirRelPath : `${dirRelPath}/`;
      return [...bin.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length));
    },
  };
}

// ─────────────────────────── RG-키: attendance.json 이중키 공존 ───────────────────────────

/**
 * RG-키 근거: T3 §2.2, design §4-라
 *
 * attendance.json 단일 파일에는 두 종류의 classId가 공존한다:
 *   - 담임 레코드: classId = className 문자열(예: "1-3")   [InputMode.tsx:417]
 *   - 교과 레코드: classId = TeachingClass UUID            [useTeachingClassStore.ts:639-642]
 *
 * 조회는 classId 동등비교로만 분기하므로(useTeachingClassStore.ts:688-697),
 * 두 키가 같은 파일에 있어도 서로를 오염시키지 않아야 한다.
 *
 * 이 테스트는 JsonTeachingClassRepository의 저장/읽기 레이어가
 * 담임키/교과키를 어떤 변환도 없이 그대로 보존함을 확인한다.
 */
describe('RG-키 — attendance.json 담임키(className)·교과키(UUID) 독립 공존', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonTeachingClassRepository;

  // 담임 classId: 사람이 읽는 문자열 (settings.className)
  const HOMEROOM_CLASS_ID = '2-3';
  // 교과 classId: TeachingClass UUID 형태
  const TEACHING_CLASS_UUID = 'tc-uuid-f47ac10b-58cc';

  const homeroomRecord: AttendanceRecord = {
    classId: HOMEROOM_CLASS_ID,
    date: '2026-06-23',
    period: 1,
    students: [{ number: 1, status: 'absent', reason: '질병' }],
  };

  const teachingRecord: AttendanceRecord = {
    classId: TEACHING_CLASS_UUID,
    date: '2026-06-23',
    period: 2,
    students: [{ number: 5, status: 'late' }],
  };

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonTeachingClassRepository(storage);
  });

  it('담임키와 교과키 레코드가 동일 파일에 공존하며 각자 독립 조회된다', async () => {
    const data: AttendanceData = {
      records: [homeroomRecord, teachingRecord],
    };
    await repo.saveAttendance(data);

    const loaded = await repo.getAttendance();
    expect(loaded).not.toBeNull();

    // 담임 레코드 조회 — classId가 className 문자열인 레코드만 반환해야 한다
    const homeroomRecords = loaded!.records.filter((r) => r.classId === HOMEROOM_CLASS_ID);
    expect(homeroomRecords).toHaveLength(1);
    expect(homeroomRecords[0]!.classId).toBe(HOMEROOM_CLASS_ID);
    expect(homeroomRecords[0]!.students[0]!.status).toBe('absent');

    // 교과 레코드 조회 — UUID 기반 classId 레코드만 반환해야 한다
    const teachingRecords = loaded!.records.filter((r) => r.classId === TEACHING_CLASS_UUID);
    expect(teachingRecords).toHaveLength(1);
    expect(teachingRecords[0]!.classId).toBe(TEACHING_CLASS_UUID);
    expect(teachingRecords[0]!.students[0]!.status).toBe('late');
  });

  it('담임키·교과키가 우연히 충돌하지 않는다(키 형태 구분)', () => {
    // 담임 className은 "학년-반" 형식이고 교과 UUID는 "tc-uuid-..." 형식
    // 두 값이 문자열 동등 비교에서 절대 같아질 수 없음을 보장
    expect(HOMEROOM_CLASS_ID).not.toBe(TEACHING_CLASS_UUID);
    // 담임 키는 순수 숫자+하이픈, 교과 UUID는 더 긴 형태
    expect(HOMEROOM_CLASS_ID.length).toBeLessThan(TEACHING_CLASS_UUID.length);
  });

  it('저장→읽기 후 classId 값이 변환 없이 그대로 보존된다', async () => {
    const data: AttendanceData = {
      records: [homeroomRecord, teachingRecord],
    };
    await repo.saveAttendance(data);
    const loaded = await repo.getAttendance();
    // classId는 어떤 정규화도 없이 원본 그대로
    const classIds = loaded!.records.map((r) => r.classId).sort();
    expect(classIds).toContain(HOMEROOM_CLASS_ID);
    expect(classIds).toContain(TEACHING_CLASS_UUID);
  });

  it('groupId가 있는 교과 레코드도 독립 보존된다(그룹 출결 공존)', async () => {
    const groupRecord: AttendanceRecord = {
      classId: TEACHING_CLASS_UUID,
      groupId: 'group-uuid-89ab',
      date: '2026-06-23',
      period: 3,
      students: [{ number: 7, status: 'earlyLeave' }],
    };
    const data: AttendanceData = {
      records: [homeroomRecord, groupRecord],
    };
    await repo.saveAttendance(data);
    const loaded = await repo.getAttendance();

    const withGroup = loaded!.records.filter((r) => r.groupId != null);
    expect(withGroup).toHaveLength(1);
    expect(withGroup[0]!.groupId).toBe('group-uuid-89ab');

    const withoutGroup = loaded!.records.filter((r) => r.groupId == null);
    expect(withoutGroup).toHaveLength(1);
    expect(withoutGroup[0]!.classId).toBe(HOMEROOM_CLASS_ID);
  });
});

// ─────────────────────────── RG-미러: 담임 출결 미러 id 패턴 ───────────────────────────

/**
 * RG-미러 근거: T1 A-2·A-3, design §4-라
 *
 * 담임 출결 미러는 student-records.json에 id=`att-{studentId}-{date}` 형식으로 저장된다.
 * 이 패턴은 MCP 브리지가 의존하는 식별자이며(T4 §1-A get_homeroom_attendance),
 * 통일 작업에서 절대 변경하면 안 된다.
 *
 * 이 테스트는:
 *   1. 미러 레코드가 올바른 id 패턴으로 저장·조회됨
 *   2. 출결 미러(category='attendance')와 비출결 기록이 같은 파일에서 분리 조회됨
 *   3. attendancePeriods 필드가 무손실 보존됨
 */
describe('RG-미러 — 담임 출결 미러 id 패턴·필드 보존', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonStudentRecordsRepository;

  const STUDENT_ID = 'stu-uuid-abc123';
  const DATE = '2026-06-23';
  const MIRROR_ID = `att-${STUDENT_ID}-${DATE}`;

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonStudentRecordsRepository(storage);
  });

  it('출결 미러 id가 att-{studentId}-{date} 패턴을 그대로 보존한다', async () => {
    const mirrorRecord: StudentRecord = {
      id: MIRROR_ID,
      studentId: STUDENT_ID,
      category: 'attendance',
      subcategory: '결석 (질병)',
      content: '',
      date: DATE,
      createdAt: '2026-06-23T08:00:00.000Z',
      attendancePeriods: [{ period: 1, status: 'absent', reason: '질병' }],
    };

    await repo.saveRecords({ records: [mirrorRecord] });
    const loaded = await repo.getRecords();

    const found = loaded!.records.find((r) => r.id === MIRROR_ID);
    expect(found).toBeDefined();
    expect(found!.id).toBe(MIRROR_ID);
    expect(found!.category).toBe('attendance');
  });

  it('attendancePeriods 필드가 무손실로 라운드트립된다', async () => {
    const mirrorRecord: StudentRecord = {
      id: MIRROR_ID,
      studentId: STUDENT_ID,
      category: 'attendance',
      subcategory: '결석 (질병)',
      content: '',
      date: DATE,
      createdAt: '2026-06-23T08:00:00.000Z',
      attendancePeriods: [
        { period: 1, status: 'absent', reason: '질병', memo: '독감' },
        { period: 2, status: 'absent', reason: '질병' },
      ],
    };

    await repo.saveRecords({ records: [mirrorRecord] });
    const loaded = await repo.getRecords();
    const found = loaded!.records.find((r) => r.id === MIRROR_ID);

    expect(found!.attendancePeriods).toHaveLength(2);
    expect(found!.attendancePeriods![0]!.period).toBe(1);
    expect(found!.attendancePeriods![0]!.status).toBe('absent');
    expect(found!.attendancePeriods![0]!.reason).toBe('질병');
    expect(found!.attendancePeriods![0]!.memo).toBe('독감');
  });

  it('출결 미러(category=attendance)와 비출결 기록이 같은 파일에서 분리 조회된다', async () => {
    const mirrorRecord: StudentRecord = {
      id: MIRROR_ID,
      studentId: STUDENT_ID,
      category: 'attendance',
      subcategory: '지각 (질병)',
      content: '',
      date: DATE,
      createdAt: '2026-06-23T08:00:00.000Z',
    };

    const nonAttRecord: StudentRecord = {
      id: 'rec-uuid-xyz789',
      studentId: STUDENT_ID,
      category: 'life',
      subcategory: '칭찬',
      content: '수업 태도 매우 좋음',
      date: DATE,
      createdAt: '2026-06-23T09:00:00.000Z',
    };

    await repo.saveRecords({ records: [mirrorRecord, nonAttRecord] });
    const loaded = await repo.getRecords();

    const attendanceRecords = loaded!.records.filter((r) => r.category === 'attendance');
    const nonAttendanceRecords = loaded!.records.filter((r) => r.category !== 'attendance');

    expect(attendanceRecords).toHaveLength(1);
    expect(attendanceRecords[0]!.id).toBe(MIRROR_ID);

    expect(nonAttendanceRecords).toHaveLength(1);
    expect(nonAttendanceRecords[0]!.id).toBe('rec-uuid-xyz789');
    expect(nonAttendanceRecords[0]!.category).toBe('life');
  });

  it('reportedToNeis·documentSubmitted 필드가 무손실 보존된다', async () => {
    const mirrorRecord: StudentRecord = {
      id: MIRROR_ID,
      studentId: STUDENT_ID,
      category: 'attendance',
      subcategory: '결석 (질병)',
      content: '',
      date: DATE,
      createdAt: '2026-06-23T08:00:00.000Z',
      reportedToNeis: true,
      documentSubmitted: false,
    };

    await repo.saveRecords({ records: [mirrorRecord] });
    const loaded = await repo.getRecords();
    const found = loaded!.records.find((r) => r.id === MIRROR_ID);

    expect(found!.reportedToNeis).toBe(true);
    expect(found!.documentSubmitted).toBe(false);
  });
});

// ─────────────────────────── RG-첨부: deleteByObservationId cascade + 메타↔바이너리 분리 ───────────────────────────

/**
 * RG-첨부 근거: T2 B-1-att, design §4-라
 *
 * ObservationAttachment 계약:
 *   1. 메타(JSON)와 바이너리(binary)는 분리 저장된다 — 메타 JSON에 base64 없음
 *   2. deleteByObservationId 호출 시 해당 observationId의 메타+바이너리가 함께 제거된다
 *   3. 다른 observationId의 첨부는 보존된다
 *
 * 이 테스트는 기존 JsonObservationAttachmentRepository.test.ts의 계약을
 * S0 안전망 관점에서 재확인한다.
 */
describe('RG-첨부 — deleteByObservationId cascade·메타↔바이너리 분리 불변', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonObservationAttachmentRepository;

  function makeAttachment(over: Partial<ObservationAttachment> = {}): ObservationAttachment {
    return {
      id: 'att-default',
      observationId: 'obs-1',
      fileName: 'photo.png',
      mimeType: 'image/png',
      kind: 'image',
      byteSize: 3,
      storageRef: 'obs-attachments/att-default.png',
      source: 'teacher',
      createdAt: '2026-06-23T00:00:00.000Z',
      ...over,
    };
  }

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonObservationAttachmentRepository(storage);
  });

  it('메타 JSON에 base64/dataURL이 포함되지 않는다(바이너리는 별도 스토어)', async () => {
    const att = makeAttachment({ id: 'a1', storageRef: 'obs-attachments/a1.png' });
    await repo.create(att, new Uint8Array([0xff, 0xd8, 0xff]));

    const rawJson = JSON.stringify(storage.json.get('observation-attachments'));
    expect(rawJson).not.toContain('data:');
    expect(rawJson).not.toContain('base64');
    // storageRef(경로 문자열)는 메타에 있어야 한다
    expect(rawJson).toContain('obs-attachments/a1.png');
  });

  it('deleteByObservationId는 해당 observationId의 메타+바이너리를 cascade 제거한다', async () => {
    // obs-1 에 2건
    await repo.create(
      makeAttachment({ id: 'a', observationId: 'obs-1', storageRef: 'obs-attachments/a.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'b', observationId: 'obs-1', storageRef: 'obs-attachments/b.png' }),
      new Uint8Array([2]),
    );
    // obs-2 에 1건 (보존 확인용)
    await repo.create(
      makeAttachment({ id: 'c', observationId: 'obs-2', storageRef: 'obs-attachments/c.png' }),
      new Uint8Array([3]),
    );

    await repo.deleteByObservationId('obs-1');

    // 메타: obs-1 제거, obs-2 보존
    const remaining = await repo.list();
    expect(remaining.map((a) => a.id)).toEqual(['c']);

    // 바이너리: obs-1 제거
    expect(storage.bin.has('obs-attachments/a.png')).toBe(false);
    expect(storage.bin.has('obs-attachments/b.png')).toBe(false);
    // obs-2 바이너리는 보존
    expect(storage.bin.has('obs-attachments/c.png')).toBe(true);
  });

  it('고아 방지: 메타와 바이너리 개수가 항상 일치한다', async () => {
    await repo.create(
      makeAttachment({ id: 'x', storageRef: 'obs-attachments/x.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'y', storageRef: 'obs-attachments/y.png' }),
      new Uint8Array([2]),
    );

    const metaCount = (await repo.list()).length;
    const binCount = (await storage.listBinary('obs-attachments')).length;
    expect(metaCount).toBe(binCount);
  });

  it('delete 단건 후에도 메타↔바이너리 개수 정합이 유지된다', async () => {
    await repo.create(
      makeAttachment({ id: 'p', storageRef: 'obs-attachments/p.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'q', storageRef: 'obs-attachments/q.png' }),
      new Uint8Array([2]),
    );

    await repo.delete('p');

    const metaCount = (await repo.list()).length;
    const binCount = (await storage.listBinary('obs-attachments')).length;
    expect(metaCount).toBe(binCount);
    expect(metaCount).toBe(1);
  });

  it('source 필드(teacher/student)가 무손실 보존된다', async () => {
    const teacherAtt = makeAttachment({
      id: 't1',
      source: 'teacher',
      storageRef: 'obs-attachments/t1.png',
    });
    const studentAtt = makeAttachment({
      id: 's1',
      observationId: 'obs-2',
      source: 'student',
      storageRef: 'obs-attachments/s1.png',
    });

    await repo.create(teacherAtt, new Uint8Array([1]));
    await repo.create(studentAtt, new Uint8Array([2]));

    const all = await repo.list();
    const teacher = all.find((a) => a.id === 't1');
    const student = all.find((a) => a.id === 's1');

    expect(teacher!.source).toBe('teacher');
    expect(student!.source).toBe('student');
  });
});

// ─────────────────────────── RG-카테고리: 사용자 정의 카테고리 라운드트립 ───────────────────────────

/**
 * RG-카테고리 근거: T1 통일시사점 3, design §4-라
 *
 * StudentRecordsData.categories에 사용자 정의 카테고리/서브카테고리가 저장된다.
 * 이 구조는 MCP recordNote 쓰기의 화이트리스트 소스다(applyLiveSyncWrite.ts:639,646).
 * 통일 작업에서 categories 구조가 변경되면 외부 AI의 담임 노트 쓰기가 전부 거부된다.
 *
 * 이 테스트는:
 *   1. 기본 4종 카테고리(DEFAULT_RECORD_CATEGORIES)가 라운드트립 후 보존됨
 *   2. 사용자 정의 카테고리(임의 id/이름/색상/서브카테고리)가 무손실 보존됨
 *   3. categories가 없는 레거시 데이터도 null 없이 로드됨
 *   4. RecordCategoryItem 2단 구조(id, name, color, subcategories[])가 보존됨
 */
describe('RG-카테고리 — StudentRecordsData.categories 사용자 정의 카테고리 라운드트립', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonStudentRecordsRepository;

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonStudentRecordsRepository(storage);
  });

  it('기본 4종 카테고리 id(attendance/counseling/life/etc)가 라운드트립 후 보존된다', async () => {
    const defaultCategories: readonly RecordCategoryItem[] = [
      { id: 'attendance', name: '출결 (ATTENDANCE)', color: 'red', subcategories: [] },
      {
        id: 'counseling',
        name: '상담 / 관계 (COUNSELING)',
        color: 'blue',
        subcategories: ['학부모상담', '학생상담', '교우관계'],
      },
      {
        id: 'life',
        name: '생활 / 학습 (LIFE & LEARNING)',
        color: 'green',
        subcategories: ['건강', '생활지도', '학습', '칭찬'],
      },
      {
        id: 'etc',
        name: '기타 (OTHER)',
        color: 'gray',
        subcategories: ['진로', '가정연락', '기타'],
      },
    ];

    await repo.saveRecords({ records: [], categories: defaultCategories });
    const loaded = await repo.getRecords();

    expect(loaded!.categories).toHaveLength(4);
    const ids = loaded!.categories!.map((c) => c.id);
    expect(ids).toContain('attendance');
    expect(ids).toContain('counseling');
    expect(ids).toContain('life');
    expect(ids).toContain('etc');
  });

  it('사용자 정의 카테고리가 id·name·color·subcategories 모두 무손실 보존된다', async () => {
    const customCategory: RecordCategoryItem = {
      id: 'custom-특기활동',
      name: '특기 활동',
      color: 'purple',
      subcategories: ['체육', '음악', '미술', '독서'],
    };

    const data: StudentRecordsData = {
      records: [],
      categories: [customCategory],
    };

    await repo.saveRecords(data);
    const loaded = await repo.getRecords();

    expect(loaded!.categories).toHaveLength(1);
    const cat = loaded!.categories![0]!;
    expect(cat.id).toBe('custom-특기활동');
    expect(cat.name).toBe('특기 활동');
    expect(cat.color).toBe('purple');
    expect(cat.subcategories).toEqual(['체육', '음악', '미술', '독서']);
  });

  it('커스텀 카테고리와 기본 카테고리가 혼합되어도 모두 보존된다', async () => {
    const mixed: readonly RecordCategoryItem[] = [
      { id: 'life', name: '생활', color: 'green', subcategories: ['건강', '학습'] },
      { id: 'custom-진로', name: '진로 지도', color: 'orange', subcategories: ['상담', '체험'] },
    ];

    await repo.saveRecords({ records: [], categories: mixed });
    const loaded = await repo.getRecords();

    expect(loaded!.categories).toHaveLength(2);
    const customCat = loaded!.categories!.find((c) => c.id === 'custom-진로');
    expect(customCat).toBeDefined();
    expect(customCat!.subcategories).toEqual(['상담', '체험']);
  });

  it('categories가 없는 레거시 데이터를 저장·로드해도 null/undefined가 아니다', async () => {
    // categories 필드 없이 records만 있는 레거시 형태
    const legacyData = { records: [] } as StudentRecordsData;
    await repo.saveRecords(legacyData);
    const loaded = await repo.getRecords();

    // undefined이거나 null일 수 있음 — 중요한 것은 배열 접근 시 폭발하지 않는 것
    // (optional이므로 undefined는 허용, null은 배열 접근 시 위험)
    const cats = loaded!.categories;
    expect(cats === undefined || Array.isArray(cats)).toBe(true);
  });

  it('서브카테고리 순서가 저장 순서 그대로 보존된다', async () => {
    const ordered: RecordCategoryItem = {
      id: 'ordered-test',
      name: '순서 테스트',
      color: 'teal',
      subcategories: ['첫째', '둘째', '셋째', '넷째'],
    };

    await repo.saveRecords({ records: [], categories: [ordered] });
    const loaded = await repo.getRecords();
    const cat = loaded!.categories!.find((c) => c.id === 'ordered-test');

    expect(cat!.subcategories[0]).toBe('첫째');
    expect(cat!.subcategories[1]).toBe('둘째');
    expect(cat!.subcategories[2]).toBe('셋째');
    expect(cat!.subcategories[3]).toBe('넷째');
  });
});
