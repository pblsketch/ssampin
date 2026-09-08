/**
 * 학생 번호 무결성 **수정 확인** 스크립트 (2026-09-08).
 *
 * 짝이 되는 파일: `student-number-audit-20260908.cjs` — 그쪽은 **결함을 재현**한다(통과 = 결함 있음).
 * 이 파일은 반대로 **올바른 동작**을 확인한다(통과 = 수정됨). 두 파일을 합치지 않는다.
 * 원본 재현 스크립트는 수정 전 HEAD `44a950ba` 의 증거로 그대로 남긴다.
 *
 * 재현 스크립트와 같은 방식으로 **실제 제품 모듈을 그대로 변환해 실행**한다.
 * React 훅 실행기와 저장소만 가상 데이터로 대체한다. 네트워크·운영 데이터 사용 없음.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const roster = [
  { id: 'a', name: '가상가', studentNumber: 1, status: 'active' },
  { id: 'b', name: '가상나', studentNumber: 2, status: 'transferred' },
  { id: 'c', name: '가상다', studentNumber: 3, status: 'active' },
];
const mocks = {
  react: { useMemo: (fn) => fn(), useEffect: () => {} },
  '@adapters/stores/useStudentStore': {
    useStudentStore: (fn) => fn({ students: roster, load() {} }),
  },
  '@adapters/stores/useSettingsStore': {
    useSettingsStore: (fn) => fn({ settings: { className: '가상반' } }),
  },
  '@adapters/stores/useTeachingClassStore': {
    useTeachingClassStore: (fn) => fn({ classes: [], load() {} }),
  },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('@domain/')) return load(`src/domain/${id.slice(8)}.ts`);
    if (id.startsWith('@usecases/')) return load(`src/usecases/${id.slice(10)}.ts`);
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.ts`));
    return require(id);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}

const teachingStudents = [
  { id: 'x', name: '가상1반', number: 3, grade: 1, classNum: 1 },
  { id: 'y', name: '가상2반', number: 3, grade: 1, classNum: 2 },
];
const submission = {
  id: 'sub-x',
  studentId: 'x',
  studentNumber: 3,
  studentGrade: '1',
  studentClass: '1',
  isLate: false,
};

async function main() {
  // A — 담임 과제 명단이 결번 뒤 번호를 보존한다
  const { useStudentLists } = load('src/adapters/hooks/useStudentLists.ts');
  const target = useStudentLists()[0];
  assert.deepEqual(
    target.students.map((s) => s.number),
    [1, 3],
  );
  assert.deepEqual(
    target.students.map((s) => s.name),
    ['가상가', '가상다'],
  );
  console.log('FIXED A: 2번 전출 뒤에도 담임 과제 명단은 1·3번 그대로');

  // B — 다른 반 같은 번호에 제출물이 붙지 않는다
  const { GetSubmissions } = load('src/usecases/assignment/GetSubmissions.ts');
  const overview = await new GetSubmissions(
    {
      getAssignments: async () => ({
        assignments: [{ id: 'test', target: { students: teachingStudents } }],
      }),
    },
    { getSubmissions: async () => [submission] },
  ).executeDetailed('test');
  assert.equal(overview.details[0].submission.id, 'sub-x');
  assert.equal(overview.details[1].submission, undefined);
  assert.equal(overview.details[1].status, 'missing');
  console.log('FIXED B: 1반 3번 제출이 2반 3번 칸에 붙지 않는다');

  // B-2 — 미제출 복사 목록도 같은 판정을 쓴다
  const { CopyMissingList } = load('src/usecases/assignment/CopyMissingList.ts');
  const text = await new CopyMissingList(
    {
      getAssignments: async () => ({
        assignments: [
          {
            id: 'test',
            title: '가상 과제',
            deadline: '2026-09-09T00:00:00Z',
            target: { students: teachingStudents },
          },
        ],
      }),
    },
    { getSubmissions: async () => [submission] },
  ).execute('test');
  assert.ok(text.includes('가상2반'), '2반 3번은 미제출로 남아야 한다');
  assert.ok(!text.includes('가상1반'), '1반 3번은 제출했으므로 목록에 없어야 한다');
  console.log('FIXED B-2: 상세 화면과 미제출 복사 목록의 판정이 일치');

  // C — 설문 CSV 번호가 밀리지 않는다
  const { formatSurveyForCSV, generateStudentPins, surveyAnswerableNumbers } = load(
    'src/domain/rules/surveyRules.ts',
  );
  const rows = formatSurveyForCSV({ questions: [] }, [], roster).rows;
  assert.deepEqual(
    rows.map((r) => r.number),
    ['1', '3'],
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ['가상가', '가상다'],
  );
  console.log('FIXED C: 설문 CSV 번호는 1·3');

  // D — 결번이 있어도 마지막 번호까지 PIN 이 있다
  const bigRoster = Array.from({ length: 33 }, (_, i) => ({
    id: `s${i + 1}`,
    name: `가상${i + 1}`,
    studentNumber: i + 1,
    status: i + 1 === 4 || i + 1 === 17 ? 'transferred' : 'active',
  }));
  const { activeRosterNumbers } = load('src/domain/rules/rosterNumbering.ts');
  const numbers = activeRosterNumbers(bigRoster);
  assert.equal(numbers.length, 31);
  const pins = generateStudentPins(numbers);
  assert.ok(pins[32], '32번에 PIN 이 있어야 한다');
  assert.ok(pins[33], '33번에 PIN 이 있어야 한다');
  assert.equal(pins[4], undefined, '결번 4번에는 PIN 이 없어야 한다');
  assert.deepEqual(surveyAnswerableNumbers({ targetNumbers: numbers }), numbers);
  assert.deepEqual(surveyAnswerableNumbers({ targetCount: 3 }), [1, 2, 3]);
  console.log('FIXED D: 재학 31명·마지막 번호 33번에도 응답 번호와 PIN 이 있고 결번은 빠진다');

  // E — 다른 반 학생 과제가 근거 후보로 오지 않는다
  const { listEvidenceCandidates } = load(
    'src/usecases/studentRecords/collectEvidenceCandidates.ts',
  );
  const evidenceInput = (assignments) => ({
    context: 'teaching',
    classId: 'class-other',
    student: { studentRef: 'other-student', studentKey: '1-2-3', number: 3 },
    observations: [],
    studentRecords: [],
    rubrics: [],
    gradings: [],
    plans: [],
    performanceResults: [],
    semesterResults: [],
    attachments: [],
    submissions: [
      {
        studentId: 'x',
        studentNumber: 3,
        submission: {
          ...submission,
          assignmentId: 'assignment-first',
          textContent: '다른 학생이 쓴 글',
          submittedAt: '2026-09-08T00:00:00Z',
          fileName: null,
        },
      },
    ],
    assignments,
  });
  const otherClassAssignment = {
    id: 'assignment-first',
    title: '다른 반 과제',
    target: { type: 'teaching', teachingClassId: 'class-first', students: teachingStudents },
  };
  assert.equal(
    listEvidenceCandidates(evidenceInput([otherClassAssignment]), 'submission').length,
    0,
  );
  console.log('FIXED E: 다른 수업반 3번 학생의 과제는 근거 후보 0건');

  // E-2 — 본인 과제는 계속 후보로 나온다(과도 차단 방지)
  const mineInput = evidenceInput([
    {
      id: 'assignment-first',
      title: '우리 반 과제',
      target: {
        type: 'teaching',
        teachingClassId: 'class-other',
        students: [{ id: 'x', name: '가상본인', number: 3, grade: 1, classNum: 2 }],
      },
    },
  ]);
  const mine = listEvidenceCandidates(mineInput, 'submission');
  assert.equal(mine.length, 1);
  assert.ok(mine[0].content.includes('다른 학생이 쓴 글'));
  console.log('FIXED E-2: 같은 반·같은 소속(1-2-3) 본인 제출물은 그대로 후보로 나온다');

  // 대조 — 상담은 원래 정상이었고 여전히 정상이다
  const { buildStudentNumberIndex, listUnbookedStudents } = load(
    'src/domain/rules/consultationRules.ts',
  );
  const active = roster.filter((s) => s.status === 'active');
  assert.equal(buildStudentNumberIndex(active).get(3).id, 'c');
  assert.deepEqual(
    listUnbookedStudents(active, new Set([1])).map((s) => s.number),
    [3],
  );
  console.log('CONTROL PASS: 상담의 실제 번호 조회·미신청 목록은 회귀 없음');

  console.log(
    'RESULT: 5건 전부 올바른 동작으로 확인 · 과도 차단 없음 · 네트워크/사용자 데이터 미사용',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
