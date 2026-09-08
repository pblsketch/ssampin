// Read-only probes of current production modules; assertions confirm defects, not fixes.
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
async function main() {
  const { useStudentLists } = load('src/adapters/hooks/useStudentLists.ts');
  const target = useStudentLists()[0];
  assert.deepEqual(
    target.students.map((s) => s.number),
    [1, 2],
  );
  console.log('CONFIRMED A: homeroom assignment numbers [1,3] become [1,2] after transfer');

  const { GetSubmissions } = load('src/usecases/assignment/GetSubmissions.ts');
  const students = [
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
  const details = await new GetSubmissions(
    { getAssignments: async () => ({ assignments: [{ id: 'test', target: { students } }] }) },
    { getSubmissions: async () => [submission] },
  ).execute('test');
  assert.equal(details[1].submission.id, 'sub-x');
  console.log(
    'CONFIRMED B: class 2 number 3 receives class 1 number 3 submission despite distinct IDs',
  );

  const { formatSurveyForCSV, generateStudentPins } = load('src/domain/rules/surveyRules.ts');
  const rows = formatSurveyForCSV({ questions: [] }, [], roster).rows;
  assert.deepEqual(
    rows.map((r) => r.number),
    ['1', '2'],
  );
  console.log('CONFIRMED C: survey CSV numbers [1,3] become [1,2]');
  const pins = generateStudentPins(31);
  assert.equal(pins[32], undefined);
  assert.equal(pins[33], undefined);
  console.log('CONFIRMED D: 31 active students with last number 33 receive no PIN for 32/33');

  const { listEvidenceCandidates } = load(
    'src/usecases/studentRecords/collectEvidenceCandidates.ts',
  );
  const candidates = listEvidenceCandidates(
    {
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
            textContent: 'Synthetic other student work',
            submittedAt: '2026-09-08T00:00:00Z',
            fileName: null,
          },
        },
      ],
      assignments: [
        {
          id: 'assignment-first',
          title: 'Other class assignment',
          target: { type: 'teaching', teachingClassId: 'class-first', students },
        },
      ],
    },
    'submission',
  );
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].content.includes('Synthetic other student work'));
  console.log('CONFIRMED E: other class number 3 work becomes this student evidence candidate');

  const { buildStudentNumberIndex, listUnbookedStudents } = load(
    'src/domain/rules/consultationRules.ts',
  );
  const active = roster.filter((s) => s.status === 'active');
  assert.equal(buildStudentNumberIndex(active).get(3).id, 'c');
  assert.deepEqual(
    listUnbookedStudents(active, new Set([1])).map((s) => s.number),
    [3],
  );
  console.log('CONTROL PASS: consultation preserves number 3 and matches the correct student');
  console.log(
    'RESULT: 5 defects reproduced; 1 consultation control passed; no network or user data used',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
