#!/usr/bin/env node
/**
 * 생기부 흐름(T1~T5) 손 테스트용 더미 데이터 — **덧붙이기(append)**, 덮어쓰기 아님.
 *
 * 왜 필요한가: 이 기능은 관찰 → 근거 창고 → 주제(탐구 흐름) → 성취기준 → 초안 → 점검이 **사슬로**
 * 엮여 있다. 손으로 만들면 점검 6종을 각각 재현하기가 특히 번거롭고(문장을 정확히 맞춰야 한다),
 * "주제로 묶기"의 제안 정확도나 "빈 고리 힌트"는 데이터가 어느 정도 쌓여야 보인다.
 *
 * ## 안전
 *  - 쌤핀이 실행 중이면 중단한다(앱이 파일을 덮어쓴다).
 *  - **기존 반·학생·기록을 건드리지 않는다.** 충돌하지 않는 테스트 수업반 하나만 더한다.
 *    (선례 교훈: 예전 시드가 실제 학생을 더미로 *교체*해 출결·자리 참조가 깨졌다.)
 *  - 바꾸는 파일마다 `.pre-recseed-<타임스탬프>` 백업을 남긴다.
 *  - 모든 id 가 `rec-test-` 접두사라 **몇 번 돌려도 중복되지 않는다**(멱등). `--clean` 으로 지운다.
 *  - 실명·실제 연락처를 쓰지 않는다. 학생 이름은 전부 '흐름'으로 시작하는 가짜다.
 *
 * ## 사용
 *   node scripts/seed-record-flow-test-data.mjs                 # 기본 = %APPDATA%/ssampin/data
 *   node scripts/seed-record-flow-test-data.mjs "D:/경로/data"  # 대상 지정
 *   node scripts/seed-record-flow-test-data.mjs --clean         # 심은 것만 제거
 *
 * ## 무엇이 심어지나 (화면에서 무엇을 볼 수 있나)
 *  - 수업반 '흐름테스트 3-8' 학생 4명 — 담임 학급과 겹치지 않는다.
 *  - 관찰 16건: 슬롯(질문·시도·시행착오·산출물·피드백·융합)이 붙어 있고 4~7월에 걸쳐 있다.
 *  - 근거 창고 18건: 주제에 묶인 것 / 미분류 / 기재 금지로 AI 제외된 것 / 본문 추출 실패 표시.
 *  - 탐구 흐름 3개: 키워드 있는 것(제안이 뜬다) · 키워드 없는 것(제안 0건이 정상) · 닫힌 것.
 *  - 초안 8건: **점검 6종을 하나씩 일부러 건드리는 문장** + 깨끗한 문장 1건.
 *  - 성취기준 코드가 붙은 진도·과제·루브릭, 본문이 추출된 제출물과 실패한 제출물.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SEED_DRAFTS } from './fixtures/record-flow-drafts.mjs';

const rawArgs = process.argv.slice(2);
const clean = rawArgs.includes('--clean');
const targetArg = rawArgs.find((a) => !a.startsWith('--'));
const dataDir =
  targetArg ??
  path.join(
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? '.', 'AppData', 'Roaming'),
    'ssampin',
    'data',
  );

if (!fs.existsSync(dataDir)) {
  console.error(`[recseed] 대상 폴더가 없습니다: ${dataDir}`);
  console.error('          쌤핀을 한 번 실행해 데이터 폴더를 만든 뒤 다시 시도하세요.');
  process.exit(1);
}

// ── 안전장치: 앱 실행 중이면 중단 ──
const ctrl = path.join(dataDir, '.ssampin-aibridge', 'control.json');
if (fs.existsSync(ctrl)) {
  try {
    const c = JSON.parse(fs.readFileSync(ctrl, 'utf-8'));
    if (typeof c.heartbeatAt === 'number' && Date.now() - c.heartbeatAt < 20_000) {
      console.error(
        '[recseed] 쌤핀이 실행 중입니다. 앱을 완전히 닫고 다시 실행하세요(앱이 덮어씀).',
      );
      process.exit(1);
    }
  } catch {
    /* 손상된 control 은 무시 */
  }
}

const PREFIX = 'rec-test-';
const CLASS_ID = `${PREFIX}class`;
const TAG = new Date().toISOString().replace(/[:.]/g, '-');
const NOW_MS = Date.now();
const NOW_ISO = new Date().toISOString();
const G = 3;
const C = 8; // 3학년 8반 — 실제 반과 충돌 가능성이 낮은 조합

/** 학생 4명. 이름은 전부 가짜이며 실명·연락처를 담지 않는다. */
const TS = [
  { number: 1, name: '흐름가온', grade: G, classNum: C },
  { number: 2, name: '흐름나래', grade: G, classNum: C },
  { number: 3, name: '흐름다솜', grade: G, classNum: C },
  { number: 4, name: '흐름라온', grade: G, classNum: C },
];
const sKey = (s) => `${s.grade}-${s.classNum}-${s.number}`;
/** 수업반 학생의 신원 키 — RecordDraft·RecordEvidence·InquiryThread 가 공유하는 체계. */
const sRef = (s) => `tc:${CLASS_ID}:${sKey(s)}`;

const THREAD_A = `${PREFIX}thread-a`; // 키워드 있음 — "이것도 이 주제?" 제안이 뜬다
const THREAD_B = `${PREFIX}thread-b`; // 키워드 없음 — 제안 0건이 정상
const THREAD_C = `${PREFIX}thread-c`; // 닫힌 주제

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
  } catch {
    return fallback;
  }
}
function backupAndWrite(file, value) {
  const p = path.join(dataDir, file);
  if (fs.existsSync(p)) fs.copyFileSync(p, `${p}.pre-recseed-${TAG}`);
  fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf-8');
}
/** 심은 것만 걸러 낸다 — 기존 데이터는 그대로 둔다(멱등 + --clean 공용). */
const mine = (x) => typeof x?.id === 'string' && x.id.startsWith(PREFIX);
const notMine = (x) => !mine(x);
const arr = (o, k) => (Array.isArray(o[k]) ? o[k] : (o[k] = []));

const touched = [];
function edit(file, fallback, fn) {
  const data = readJson(file, fallback);
  fn(data);
  backupAndWrite(file, data);
  touched.push(file);
}

/* ─────────────────────────── 1. 수업반 ─────────────────────────── */
edit('teaching-classes.json', { classes: [] }, (tc) => {
  tc.classes = arr(tc, 'classes').filter((c) => c.id !== CLASS_ID);
  if (clean) return;
  tc.classes.push({
    id: CLASS_ID,
    name: '흐름테스트 3-8',
    subject: '통합사회',
    students: TS,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });
});

/* ─────────────────────────── 2. 관찰 기록 ───────────────────────────
 * 가온에게 한 줄기(질문 → 시도 → 시행착오 → 산출물 → 피드백)를 몰아 준다 — 흐름 화면이
 * 제대로 그려지는지 보려면 줄기 하나가 온전해야 한다.
 * 나래는 **질문만 1건**이라 "빈 고리 힌트"가 떠야 정상이다.
 * 다솜은 슬롯을 아예 안 붙였다 — 슬롯 없는 교사의 화면이 어떻게 보이는지 확인용.
 */
const OBS = [
  // ── 가온: 온전한 줄기 (THREAD_A) ──
  [
    '가온',
    0,
    '2026-04-08',
    '"쿠폰이 있으면 왜 필요 없는 물건도 사게 되나요?" 라고 물어, 수업에서 다룬 합리적 선택 개념과 어긋나는 지점을 스스로 짚었다.',
    ['질문'],
    THREAD_A,
  ],
  [
    '가온',
    0,
    '2026-04-15',
    '행동경제학의 준거점 개념을 찾아 읽고, 반 친구 20명에게 물어볼 설문 문항 5개를 직접 만들었다.',
    ['시도'],
    THREAD_A,
  ],
  [
    '가온',
    0,
    '2026-04-22',
    '설문 문항이 유도 질문이라는 지적을 받고, 선택지를 중립적으로 바꿔 다시 돌렸다. 1차 결과는 쓰지 않기로 스스로 결정했다.',
    ['시행착오'],
    THREAD_A,
  ],
  [
    '가온',
    0,
    '2026-05-13',
    '2차 설문 결과를 그래프로 정리해 "할인율이 클수록 불필요한 구매가 늘어난다"는 경향을 발표했다.',
    ['산출물'],
    THREAD_A,
  ],
  [
    '가온',
    0,
    '2026-05-20',
    '표본이 우리 반 20명뿐이라는 되물음에, 일반화할 수 없다고 인정하고 한계를 보고서에 따로 적었다.',
    ['피드백'],
    THREAD_A,
  ],
  [
    '가온',
    0,
    '2026-06-10',
    '수학 시간에 배운 표본오차 개념을 가져와 자기 설문의 한계를 수치로 다시 설명했다.',
    ['융합'],
    THREAD_A,
  ],
  [
    '가온',
    0,
    '2026-06-24',
    '다음에는 다른 학년까지 표본을 넓혀 보고 싶다고 적었다.',
    ['질문'],
    THREAD_A,
  ],
  // ── 가온: 두 번째 주제 (THREAD_C, 닫힘) ──
  [
    '가온',
    0,
    '2026-03-12',
    '지역 청년 실업 통계에서 분모가 무엇인지 되물었다.',
    ['질문'],
    THREAD_C,
  ],
  [
    '가온',
    0,
    '2026-03-19',
    '통계청 자료를 직접 받아 경제활동인구 정의를 확인했다.',
    ['시도'],
    THREAD_C,
  ],
  // ── 나래: 질문 1건뿐 → 빈 고리 힌트 확인용 (THREAD_B) ──
  ['나래', 1, '2026-04-11', '"차별과 구별은 어떻게 다른가요?" 라고 물었다.', ['질문'], THREAD_B],
  // ── 나래: 미분류(주제 없음) ──
  [
    '나래',
    1,
    '2026-05-06',
    '일상 속 차별 사례를 조사해 카드뉴스로 만들어 학급에 공유했다.',
    ['산출물'],
    null,
  ],
  [
    '나래',
    1,
    '2026-05-28',
    '자료의 출처를 1차·2차로 구분해 표기하는 습관을 보였다.',
    ['시도'],
    null,
  ],
  // ── 다솜: 슬롯 없음(구 데이터처럼) ──
  [
    '다솜',
    2,
    '2026-05-07',
    '실험 데이터를 그래프로 정리하고 오차 원인을 스스로 추론했다.',
    null,
    null,
  ],
  [
    '다솜',
    2,
    '2026-06-04',
    '모둠에서 역할을 정할 때 가장 손이 많이 가는 자료 정리를 자원했다.',
    null,
    null,
  ],
  // ── 라온: 근거가 적은 학생(초안 쓸 재료가 부족한 상태 확인용) ──
  ['라온', 3, '2026-06-18', '수업 중 배운 개념을 자기 말로 바꿔 짝에게 설명했다.', ['시도'], null],
  [
    '라온',
    3,
    '2026-07-02',
    '보고서 마감을 앞두고 계획표를 다시 짜서 제출 기한을 지켰다.',
    ['산출물'],
    null,
  ],
];

edit('observations.json', { records: [] }, (ob) => {
  const records = arr(ob, 'records');
  ob.records = records.filter(notMine);
  if (clean) return;
  const authorId = records.find((r) => r?.authorId)?.authorId ?? 'teacher';
  OBS.forEach(([, si, date, content, slots, threadId], i) => {
    const rec = {
      id: `${PREFIX}obs-${i + 1}`,
      studentId: sKey(TS[si]),
      classId: CLASS_ID,
      authorId,
      date,
      content,
      tags: [],
      visibility: 'private',
      term: '2026-1',
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    };
    // ★부재는 빈 배열이 아니다 — 슬롯 없는 관찰은 칸 자체를 만들지 않는다.
    if (slots) rec.slots = slots;
    if (threadId) rec.threadId = threadId;
    ob.records.push(rec);
  });
});

/* ─────────────────────────── 3. 탐구 흐름(주제) ─────────────────────────── */
edit('inquiry-threads.json', { records: [] }, (it) => {
  it.records = arr(it, 'records').filter(notMine);
  if (clean) return;
  it.records.push(
    {
      id: THREAD_A,
      studentRef: sRef(TS[0]),
      classId: CLASS_ID,
      // 주제 이름 1순위 = 수행평가 이름(오너 결정). 아래 루브릭 title 과 일부러 맞췄다.
      title: '소비 선택과 준거점 — 사회문제 탐구 보고서',
      // 루브릭 요소 이름에서 온 매칭 키워드 → "이것도 이 주제?" 제안이 실제로 뜬다.
      keywords: ['설문', '준거점', '할인', '표본', '소비'],
      standardCodes: ['[10통사2-02-01]'],
      competencyKeywords: ['경제 현상에 대한 자료 해석력'],
      nextNotes: '다음 학기에 표본을 다른 학년까지 넓혀 볼 것.',
      status: 'open',
      term: '2026-1',
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    },
    {
      id: THREAD_B,
      studentRef: sRef(TS[1]),
      classId: CLASS_ID,
      title: '차별과 구별',
      // ★키워드가 비어 있다 — 손으로 지은 주제의 정상 상태. 제안이 0건이어야 맞다.
      keywords: [],
      status: 'open',
      term: '2026-1',
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    },
    {
      id: THREAD_C,
      studentRef: sRef(TS[0]),
      classId: CLASS_ID,
      title: '지역 청년 실업 통계 읽기',
      keywords: ['실업', '통계', '경제활동인구'],
      nextNotes: '통계 정의를 따지는 습관이 자리 잡았다. 마무리함.',
      status: 'closed',
      term: '2026-1',
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    },
  );
});

/* ─────────────────────────── 4. 근거 창고 ───────────────────────────
 * 관찰에서 끌어온 것(sourceType: 'observation')과 손으로 적은 것을 섞는다.
 * 마지막 3건은 특수 상태 확인용 — 금지 항목 / 본문 추출 실패 / 사진 파일.
 */
edit('record-evidence.json', { records: [] }, (ev) => {
  ev.records = arr(ev, 'records').filter(notMine);
  if (clean) return;
  let n = 0;
  const push = (si, areas, content, opt = {}) => {
    n += 1;
    ev.records.push({
      id: `${PREFIX}ev-${n}`,
      studentRef: sRef(TS[si]),
      areas,
      content,
      classId: CLASS_ID,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
      ...opt,
    });
  };

  // 가온 — THREAD_A 로 묶인 근거(관찰에서 끌어옴, 슬롯 승계)
  OBS.filter((o) => o[5] === THREAD_A).forEach((o, i) => {
    push(0, ['subject'], o[3], {
      date: o[2],
      sourceType: 'observation',
      sourceId: `${PREFIX}obs-${OBS.indexOf(o) + 1}`,
      ...(o[4] ? { slots: o[4] } : {}),
      threadId: THREAD_A,
      ...(i === 0 ? {} : {}),
    });
  });
  // 가온 — 미분류지만 THREAD_A 키워드('설문')를 품고 있다 → "이것도 이 주제?" 제안 대상
  push(
    0,
    ['subject'],
    '가정에서 장을 볼 때도 할인 표시가 붙은 물건을 먼저 집게 되는지 설문으로 물어보고 싶다고 말했다.',
    {
      date: '2026-06-26',
      sourceType: 'manual',
    },
  );
  // 가온 — THREAD_C(닫힌 주제)
  push(0, ['subject'], '지역 청년 실업 통계에서 경제활동인구의 정의를 직접 확인했다.', {
    date: '2026-03-19',
    sourceType: 'observation',
    slots: ['시도'],
    threadId: THREAD_C,
  });

  // 나래
  push(1, ['subject'], '"차별과 구별은 어떻게 다른가요?" 라고 물었다.', {
    date: '2026-04-11',
    sourceType: 'observation',
    slots: ['질문'],
    threadId: THREAD_B,
  });
  push(
    1,
    ['subject', 'autonomy'],
    '일상 속 차별 사례를 조사해 카드뉴스로 만들어 학급에 공유했다.',
    {
      date: '2026-05-06',
      sourceType: 'observation',
      slots: ['산출물'],
    },
  );

  // 다솜 · 라온 — 미분류
  push(2, ['subject'], '실험 데이터를 그래프로 정리하고 오차 원인을 스스로 추론했다.', {
    date: '2026-05-07',
  });
  push(3, ['subject'], '수업 중 배운 개념을 자기 말로 바꿔 짝에게 설명했다.', {
    date: '2026-06-18',
  });

  // ── 특수 상태 3건 ──
  // (1) 기재 금지 항목이 섞여 AI 경로에서 빠진다 — 교사가 이유를 알 수 있는지 확인용
  push(2, ['subject'], '교내 과학탐구대회에서 최우수상을 받은 실험을 확장해 보고서를 썼다.', {
    date: '2026-06-11',
    excludedFromAi: true,
  });
  // (2) 과제 파일에서 본문을 못 뽑은 경우
  push(3, ['subject'], '제출 파일: 7월_보고서.hwp (본문 추출 안 됨)', {
    date: '2026-07-03',
    sourceType: 'submission',
    sourceId: `${PREFIX}sub-3`,
  });
  // (3) 사진 파일이라 애초에 본문이 없는 경우
  push(3, ['subject'], '제출 파일: 실험사진.jpg (사진 파일 — 본문 추출 불가)', {
    date: '2026-07-03',
    sourceType: 'submission',
    sourceId: `${PREFIX}sub-4`,
  });
});

/* ─────────────────────────── 5. 진도 (성취기준 코드) ─────────────────────────── */
edit('curriculum-progress.json', { entries: [] }, (cp) => {
  cp.entries = arr(cp, 'entries').filter(notMine);
  if (clean) return;
  cp.entries.push(
    {
      id: `${PREFIX}pg-1`,
      classId: CLASS_ID,
      date: '2026-04-08',
      period: 3,
      unit: '합리적 선택과 시장',
      lesson: '기회비용과 합리적 선택',
      status: 'done',
      note: '',
      standardCodes: ['[10통사2-02-01]'],
    },
    {
      id: `${PREFIX}pg-2`,
      classId: CLASS_ID,
      date: '2026-05-13',
      period: 3,
      unit: '합리적 선택과 시장',
      lesson: '소비자 선택의 한계',
      status: 'done',
      note: '설문 결과 발표 진행',
      standardCodes: ['[10통사2-02-01]', '[10통사2-02-02]'],
    },
    {
      // 2015 개정 학년(자료 없음)에서 교사가 직접 적은 경우 — 화면이 이 상태를 어떻게 보여 주는지 확인용
      id: `${PREFIX}pg-3`,
      classId: CLASS_ID,
      date: '2026-06-10',
      period: 3,
      unit: '인권과 헌법',
      lesson: '차별과 구별',
      status: 'done',
      note: '',
      standardText: '일상생활에서 나타나는 차별 사례를 찾아 그 원인을 설명할 수 있다.',
    },
  );
});

/* ─────────────────────────── 6. 루브릭 (성취기준 코드 + 요소 이름) ───────────────────────────
 * criteria 의 name 이 주제 매칭 키워드의 원천이다(수행평가 이름으로 주제를 만들면 자동으로 실린다).
 */
edit('rubrics.json', { rubrics: [], gradings: [] }, (r) => {
  r.rubrics = arr(r, 'rubrics').filter(notMine);
  r.gradings = arr(r, 'gradings').filter(notMine);
  if (clean) return;
  const LV = [
    { id: 'l1', name: '탁월함', score: 4, description: '기준을 모두 충족하고 독창성이 있다' },
    { id: 'l2', name: '잘함', score: 3, description: '대부분 충족한다' },
    { id: 'l3', name: '보통', score: 2, description: '부분적으로 충족한다' },
    { id: 'l4', name: '노력요함', score: 1, description: '미흡하다' },
  ];
  r.rubrics.push({
    id: `${PREFIX}rb-1`,
    classId: CLASS_ID,
    title: '소비 선택과 준거점 — 사회문제 탐구 보고서',
    standardCodes: ['[10통사2-02-01]'],
    criteria: [
      { id: 'c1', name: '탐구 주제 설정', order: 0, levels: LV },
      { id: 'c2', name: '설문 설계와 표본', order: 1, levels: LV },
      { id: 'c3', name: '자료 해석과 한계 인식', order: 2, levels: LV },
    ],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });
  r.gradings.push(
    {
      id: `${PREFIX}gr-1`,
      rubricId: `${PREFIX}rb-1`,
      classId: CLASS_ID,
      studentId: sKey(TS[0]),
      status: 'graded',
      marks: { c1: 'l1', c2: 'l2', c3: 'l1' },
      criterionNotes: {
        c2: '1차 설문의 유도 질문을 스스로 발견해 문항을 고쳐 다시 돌림',
        c3: '표본이 20명뿐이라는 한계를 보고서에 명시함',
      },
      overallFeedback: '자기 설문의 한계를 스스로 짚어 낸 점이 특히 좋았다.',
      gradedAt: NOW_ISO,
    },
    {
      id: `${PREFIX}gr-2`,
      rubricId: `${PREFIX}rb-1`,
      classId: CLASS_ID,
      studentId: sKey(TS[1]),
      status: 'partial',
      marks: { c1: 'l2' },
      criterionNotes: { c1: '주제는 적절하나 범위가 넓다' },
      gradedAt: NOW_ISO,
    },
  );
});

/* ─────────────────────────── 7. 과제 + 제출물(본문 추출 상태 4종) ─────────────────────────── */
edit('assignments.json', { assignments: [] }, (a) => {
  a.assignments = arr(a, 'assignments').filter(notMine);
  if (clean) return;
  a.assignments.push({
    id: `${PREFIX}asg-1`,
    title: '소비 선택 탐구 보고서 제출',
    description: '설문 결과와 해석, 한계를 함께 적어 제출하세요.',
    deadline: '2026-07-03T23:59:00.000Z',
    target: { type: 'teachingClass', teachingClassId: CLASS_ID },
    driveFolder: { id: `${PREFIX}folder`, name: '흐름테스트 과제' },
    submitType: 'file',
    fileTypeRestriction: 'document',
    allowLate: true,
    allowResubmit: true,
    shareUrl: 'https://example.invalid/seed-only',
    adminKey: `${PREFIX}adminkey`,
    standardCodes: ['[10통사2-02-01]'],
    createdAt: NOW_ISO,
    submissions: [
      {
        id: `${PREFIX}sub-1`,
        assignmentId: `${PREFIX}asg-1`,
        studentNumber: 1,
        studentName: TS[0].name,
        submittedAt: '2026-07-02T10:00:00.000Z',
        fileName: '소비선택_보고서.hwp',
        fileSize: 24000,
        driveFileId: `${PREFIX}drive-1`,
        // 본문 추출 성공 — 근거 창고에 본문이 실리는 경로
        extractedText:
          '1차 설문은 "할인 상품을 사는 것이 합리적이라고 생각하나요?" 처럼 답을 유도하는 문항이었다. ' +
          '지적을 받고 선택지를 중립적으로 바꿔 2차 설문을 다시 돌렸다. ' +
          '결과는 할인율이 클수록 필요하지 않은 물건도 구매한다는 경향을 보였으나, 표본이 우리 반 20명뿐이라 일반화하기는 어렵다.',
      },
      {
        id: `${PREFIX}sub-2`,
        assignmentId: `${PREFIX}asg-1`,
        studentNumber: 2,
        studentName: TS[1].name,
        submittedAt: '2026-07-03T09:30:00.000Z',
        fileName: '차별사례_조사.txt',
        fileSize: 1800,
        driveFileId: `${PREFIX}drive-2`,
        // ★.txt — T6 에서 새로 본문이 들어오게 된 형식
        extractedText:
          '차별과 구별의 차이를 정리했다. 구별은 다름을 인정하는 것이고 차별은 그 다름을 이유로 불이익을 주는 것이다.',
      },
      {
        id: `${PREFIX}sub-3`,
        assignmentId: `${PREFIX}asg-1`,
        studentNumber: 4,
        studentName: TS[3].name,
        submittedAt: '2026-07-03T22:10:00.000Z',
        fileName: '7월_보고서.hwp',
        fileSize: 15000,
        driveFileId: `${PREFIX}drive-3`,
        // extractedText 없음 = 추출 실패 — [다시 시도] 입구가 필요한 상태
      },
      {
        id: `${PREFIX}sub-4`,
        assignmentId: `${PREFIX}asg-1`,
        studentNumber: 4,
        studentName: TS[3].name,
        submittedAt: '2026-07-03T22:12:00.000Z',
        fileName: '실험사진.jpg',
        fileSize: 900000,
        driveFileId: `${PREFIX}drive-4`,
        // 사진 — 내려받지도 않는다(정상)
      },
    ],
  });
});

/* ─────────────────────────── 8. 제출 본문 캐시 ───────────────────────────
 * 상태 4종을 그대로 심어 "왜 본문이 없는지"가 화면에서 구분되는지 본다.
 */
edit('submission-texts.json', { records: [] }, (st) => {
  st.records = arr(st, 'records').filter(
    (r) => !(typeof r?.submissionId === 'string' && r.submissionId.startsWith(PREFIX)),
  );
  if (clean) return;
  const base = { assignmentId: `${PREFIX}asg-1`, attempts: 1, updatedAt: NOW_ISO };
  st.records.push(
    {
      ...base,
      submissionId: `${PREFIX}sub-1`,
      driveFileId: `${PREFIX}drive-1`,
      submittedAt: '2026-07-02T10:00:00.000Z',
      fileSize: 24000,
      status: 'ok',
      text: '(본문 캐시 — 과제 제출물 참조)',
    },
    {
      ...base,
      submissionId: `${PREFIX}sub-2`,
      driveFileId: `${PREFIX}drive-2`,
      submittedAt: '2026-07-03T09:30:00.000Z',
      fileSize: 1800,
      status: 'ok',
      text: '(본문 캐시 — .txt 해독 성공)',
    },
    {
      ...base,
      submissionId: `${PREFIX}sub-3`,
      driveFileId: `${PREFIX}drive-3`,
      submittedAt: '2026-07-03T22:10:00.000Z',
      fileSize: 15000,
      status: 'failed',
      attempts: 2,
    },
    {
      ...base,
      submissionId: `${PREFIX}sub-4`,
      driveFileId: `${PREFIX}drive-4`,
      submittedAt: '2026-07-03T22:12:00.000Z',
      fileSize: 900000,
      status: 'image_only',
      attempts: 0,
    },
  );
});

/* ─────────────────────────── 9. 생기부 초안 — 점검 6종을 하나씩 건드린다 ───────────────────────────
 * ★여기가 이 시드의 핵심이다. 손으로 만들면 문장을 정확히 맞추기 어렵다.
 *   각 초안은 **그 갈래 하나만** 걸리도록 다듬었고, 아래 자체 검증에서 실제로 확인한다.
 *   전부 경고일 뿐 저장은 되는 상태이므로, 화면에서 "막지 않고 알린다"를 눈으로 볼 수 있다.
 */
const DRAFTS = SEED_DRAFTS;
edit('record-drafts.json', { records: [] }, (rd) => {
  rd.records = arr(rd, 'records').filter(notMine);
  if (clean) return;
  DRAFTS.forEach((d, i) => {
    const rec = {
      id: `${PREFIX}draft-${i + 1}`,
      area: 'subject',
      studentRef: sRef(TS[d.si]),
      classId: CLASS_ID,
      studentKey: sKey(TS[d.si]),
      subject: '통합사회',
      content: d.content,
      byteLength: neisByteLength(d.content),
      basisObservationIds: [],
      requiresTeacherReview: true,
      status: 'draft',
      term: '2026-1',
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    };
    // 가온의 깨끗한 초안만 주제에 묶어 둔다 — "이 주제로 쓴 초안" 조회 확인용.
    if (d.key === '(clean)') rec.threadId = THREAD_A;
    rd.records.push(rec);
  });
});

/** NEIS 바이트 길이 — 한글 3B / ASCII 1B. 앱·브릿지와 같은 규칙. */
function neisByteLength(s) {
  let b = 0;
  for (const ch of s) b += (ch.codePointAt(0) ?? 0) <= 0x7f ? 1 : 3;
  return b;
}

/* ─────────────────────────── 결과 보고 ─────────────────────────── */
console.log(`[recseed] 대상: ${dataDir}`);
console.log(`[recseed] ${clean ? '제거' : '심기'} 완료 — 건드린 파일 ${touched.length}개`);
for (const f of touched) console.log(`           · ${f}`);
if (!clean) {
  console.log('');
  console.log('  수업반 "흐름테스트 3-8" 에서 확인하세요:');
  console.log(`   · 관찰 ${OBS.length}건(슬롯 포함) · 근거 창고 · 탐구 흐름 3개(열림2·닫힘1)`);
  console.log(`   · 초안 ${DRAFTS.length}건 — 점검 6종을 하나씩 건드리는 문장 + 대조군 1건`);
  console.log('   · 나래는 질문 1건뿐이라 "빈 고리 힌트"가 떠야 정상입니다.');
  console.log('   · "차별과 구별" 주제는 키워드가 비어 있어 제안 0건이 정상입니다.');
  console.log('');
  console.log('  되돌리기: node scripts/seed-record-flow-test-data.mjs --clean');
  console.log(`  백업:     각 파일 옆 .pre-recseed-${TAG}`);
}
