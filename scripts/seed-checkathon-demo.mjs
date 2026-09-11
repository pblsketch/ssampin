#!/usr/bin/env node
/**
 * 「기후생태 뉴스 체커톤」 예시 자료 심기 — 테스트·홍보 캡처용. **덧붙이기(append)**, 덮어쓰기 아님.
 *
 * 무엇이 심어지나(내용은 `fixtures/checkathon-demo.mjs`):
 *  - 수업반 '독서와 작문 2-5' 학생 5명(이름은 전부 지어낸 것)
 *  - 교사 관찰 31건(슬롯 포함) · 진도 7차시(2022 개정 독서와 작문 성취기준)
 *  - 과제 2개: 팩트체크 보고서(파일, 본문 추출 성공) · 체커톤 성찰 자기평가서(글 제출, 문항 4개)
 *  - 루브릭 1개(요소 4개) + 학생별 채점 메모
 *  - 근거 창고 · 주제 5개(장면 열 · 장면 이음말 · 주제 이음말) · 세특 초안 2건
 *
 * ## 안전 — `seed-record-flow-test-data.mjs` 와 같은 규칙
 *  - 쌤핀이 실행 중이면 중단한다(앱이 파일을 덮어쓴다). 다른 폴더를 대상으로 줄 때는 검사하지 않는다.
 *  - 기존 반·학생·기록을 건드리지 않는다. 모든 id 가 `chk-demo-` 로 시작해 몇 번 돌려도 겹치지 않고 `--clean` 으로 지운다.
 *  - 바꾸는 파일마다 `.pre-chkdemo-<시각>` 백업을 남긴다. 손댈 파일을 **전부 먼저 읽어 본 뒤** 첫 글자를 쓴다.
 *
 * ## 사용
 *   node scripts/seed-checkathon-demo.mjs                 # 기본 = %APPDATA%/ssampin/data
 *   node scripts/seed-checkathon-demo.mjs "D:/경로/data"  # 대상 지정(빈 폴더도 된다)
 *   node scripts/seed-checkathon-demo.mjs --clean         # 심은 것만 제거
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEMO_CLASS,
  DEMO_LESSONS,
  DEMO_RUBRIC,
  DEMO_SELF_QUESTIONS,
  DEMO_STANDARDS,
  DEMO_STUDENTS,
  DEMO_TERM,
} from './fixtures/checkathon-demo.mjs';

const rawArgs = process.argv.slice(2);
const clean = rawArgs.includes('--clean');
const force = rawArgs.includes('--force');
const targetArg = rawArgs.find((a) => !a.startsWith('--'));
const defaultDir = path.join(
  process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? '.', 'AppData', 'Roaming'),
  'ssampin',
  'data',
);
const dataDir = targetArg ?? defaultDir;

if (!fs.existsSync(dataDir)) {
  console.error(`[chkdemo] 대상 폴더가 없습니다: ${dataDir}`);
  console.error('          쌤핀을 한 번 실행해 데이터 폴더를 만든 뒤 다시 시도하세요.');
  process.exit(1);
}

/* ── 안전장치: 앱 실행 중이면 중단(앱 데이터 폴더를 대상으로 할 때만) ── */
function appHeartbeatFresh() {
  const ctrl = path.join(dataDir, '.ssampin-aibridge', 'control.json');
  if (!fs.existsSync(ctrl)) return false;
  try {
    const c = JSON.parse(fs.readFileSync(ctrl, 'utf-8'));
    return typeof c.heartbeatAt === 'number' && Date.now() - c.heartbeatAt < 20_000;
  } catch {
    return false;
  }
}
function appProcessRunning() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('tasklist.exe', ['/fo', 'csv', '/nh'], { encoding: 'utf-8' });
      if (r.status !== 0 || typeof r.stdout !== 'string') return null;
      return /(쌤핀|ssampin|electron)\.exe/i.test(r.stdout);
    }
    const r = spawnSync('pgrep', ['-fil', 'ssampin|쌤핀|electron'], { encoding: 'utf-8' });
    if (r.status > 1) return null;
    return (r.stdout ?? '').trim().length > 0;
  } catch {
    return null;
  }
}
const isAppDir = path.resolve(dataDir) === path.resolve(defaultDir);
const running = appHeartbeatFresh() || (isAppDir ? appProcessRunning() : false);
if (running === true && !force) {
  console.error('[chkdemo] 쌤핀이 실행 중입니다. 앱을 완전히 닫고 다시 실행하세요.');
  console.error('          켜 둔 채로 심으면 앱이 메모리에 든 옛 내용으로 파일을 도로 덮습니다.');
  console.error('          다른 Electron 앱을 잘못 본 것이라면 --force 로 넘길 수 있습니다.');
  process.exit(1);
}
if (running === null) {
  console.warn('[chkdemo] ⚠ 쌤핀이 켜져 있는지 확인하지 못했습니다. 닫혀 있는지 직접 확인하세요.');
}

/* ── 공통 ── */
const PREFIX = 'chk-demo-';
const CLASS_ID = `${PREFIX}class`;
const TAG = new Date().toISOString().replace(/[:.]/g, '-');
const NOW_MS = Date.now();
const NOW_ISO = new Date().toISOString();

const TS = DEMO_STUDENTS.map((s) => ({
  number: s.number,
  name: s.name,
  grade: DEMO_CLASS.grade,
  classNum: DEMO_CLASS.classNum,
}));
const sKey = (s) => `${s.grade}-${s.classNum}-${s.number}`;
const sRef = (s) => `tc:${CLASS_ID}:${sKey(s)}`;
const obsId = (n, key) => `${PREFIX}obs-${n}-${key}`;
const evId = (n, key) => `${PREFIX}ev-${n}-${key}`;
const threadId = (n, key) => `${PREFIX}thread-${n}-${key}`;
const reportSubId = (n) => `${PREFIX}sub-report-${n}`;
const selfSubId = (n) => `${PREFIX}sub-self-${n}`;
const ASG_REPORT = `${PREFIX}asg-report`;
const ASG_SELF = `${PREFIX}asg-self`;

function readJson(file, fallback) {
  const p = path.join(dataDir, file);
  if (!fs.existsSync(p)) return fallback;
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf-8');
  } catch (e) {
    console.error(`[chkdemo] '${file}' 을 열 수 없습니다: ${e.message}`);
    console.error(
      '          쌤핀이 정말 닫혀 있는지 확인하고 다시 실행하세요. 아무것도 바꾸지 않았습니다.',
    );
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[chkdemo] '${file}' 이 올바른 JSON 이 아닙니다: ${e.message}`);
    console.error(
      '          실데이터일 수 있어 덮어쓰지 않고 멈춥니다. 아무것도 바꾸지 않았습니다.',
    );
    process.exit(1);
  }
}
function backupAndWrite(file, value) {
  const p = path.join(dataDir, file);
  const backup = `${p}.pre-chkdemo-${TAG}`;
  if (fs.existsSync(p) && !fs.existsSync(backup)) fs.copyFileSync(p, backup);
  fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf-8');
}
const mine = (x) => typeof x?.id === 'string' && x.id.startsWith(PREFIX);
const notMine = (x) => !mine(x);
const arr = (o, k) => (Array.isArray(o[k]) ? o[k] : (o[k] = []));

const TARGETS = [
  ['teaching-classes.json', { classes: [] }],
  ['observations.json', { records: [] }],
  ['inquiry-threads.json', { records: [] }],
  ['record-evidence.json', { records: [] }],
  ['curriculum-progress.json', { entries: [] }],
  ['rubrics.json', { rubrics: [], gradings: [] }],
  ['assignments.json', { assignments: [] }],
  ['submission-texts.json', { records: [] }],
  ['record-drafts.json', { records: [] }],
];
const loaded = new Map(TARGETS.map(([f, fb]) => [f, readJson(f, fb)]));
const touched = [];
function edit(file, fn) {
  const data = loaded.get(file);
  if (data === undefined) throw new Error(`TARGETS 에 '${file}' 이 없습니다`);
  fn(data);
  backupAndWrite(file, data);
  touched.push(file);
}

/** NEIS 바이트 길이 — 한글 3B / ASCII 1B. 앱·브릿지와 같은 규칙. */
function neisByteLength(s) {
  let b = 0;
  for (const ch of s) b += (ch.codePointAt(0) ?? 0) <= 0x7f ? 1 : 3;
  return b;
}

/** 자기평가서 답을 글 제출 본문으로 — 문항과 답을 함께 남긴다(문항이 바뀌어도 무엇에 답했는지 알 수 있게). */
function selfText(answers) {
  return DEMO_SELF_QUESTIONS.map((q) => `[${q.slot}] ${q.prompt}\n${answers[q.id] ?? ''}`).join(
    '\n\n',
  );
}

/* ─────────────── 1. 수업반 ─────────────── */
edit('teaching-classes.json', (tc) => {
  tc.classes = arr(tc, 'classes').filter((c) => c.id !== CLASS_ID);
  if (clean) return;
  tc.classes.push({
    id: CLASS_ID,
    name: DEMO_CLASS.name,
    subject: DEMO_CLASS.subject,
    students: TS,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });
});

/* ─────────────── 2. 교사 관찰 ─────────────── */
edit('observations.json', (ob) => {
  const records = arr(ob, 'records');
  ob.records = records.filter(notMine);
  if (clean) return;
  const authorId = records.find((r) => r?.authorId)?.authorId ?? 'teacher';
  DEMO_STUDENTS.forEach((s, si) => {
    // 관찰이 근거로 옮겨져 주제에 묶였으면 관찰에도 같은 주제를 단다(입력 화면의 주제 표시와 맞춘다).
    const threadOfObs = new Map(
      s.evidence
        .filter((e) => e.from.startsWith('obs:') && e.thread)
        .map((e) => [e.from.slice(4), threadId(s.number, e.thread)]),
    );
    for (const [key, date, slots, content] of s.obs) {
      const rec = {
        id: obsId(s.number, key),
        studentId: sKey(TS[si]),
        classId: CLASS_ID,
        authorId,
        date,
        content,
        tags: ['교과역량'],
        category: '수업 관찰',
        visibility: 'private',
        term: DEMO_TERM,
        slots,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      };
      const t = threadOfObs.get(key);
      if (t) rec.threadId = t;
      ob.records.push(rec);
    }
  });
});

/* ─────────────── 3. 과제 2개 + 제출물 ─────────────── */
edit('assignments.json', (a) => {
  a.assignments = arr(a, 'assignments').filter(notMine);
  if (clean) return;
  const target = {
    type: 'teaching',
    name: DEMO_CLASS.name,
    teachingClassId: CLASS_ID,
    students: TS.map((t) => ({
      number: t.number,
      name: t.name,
      grade: String(t.grade),
      classNum: String(t.classNum),
    })),
  };
  const base = {
    target,
    allowLate: true,
    allowResubmit: true,
    shareUrl: 'https://example.invalid/checkathon-demo',
    adminKey: `${PREFIX}adminkey`,
    createdAt: NOW_ISO,
  };
  a.assignments.push(
    {
      ...base,
      id: ASG_REPORT,
      title: '기후생태 뉴스 팩트체크 보고서',
      description: '명제, 관련 기사, 판정, 핵심 용어, 검증 질문 3개와 출처를 담아 제출하세요.',
      deadline: '2026-05-08T23:59:00.000Z',
      driveFolder: { id: `${PREFIX}folder-report`, name: '체커톤 보고서' },
      submitType: 'file',
      fileTypeRestriction: 'document',
      standardCodes: [DEMO_STANDARDS.argue, DEMO_STANDARDS.evaluateReading],
      submissions: DEMO_STUDENTS.map((s, si) => ({
        id: reportSubId(s.number),
        assignmentId: ASG_REPORT,
        studentGrade: String(TS[si].grade),
        studentClass: String(TS[si].classNum),
        studentNumber: s.number,
        studentName: s.name,
        submittedAt: `2026-05-0${6 + (si % 3)}T09:${10 + si * 7}:00.000Z`,
        fileName: s.report.fileName,
        fileSize: 180_000 + si * 23_000,
        driveFileId: `${PREFIX}drive-report-${s.number}`,
        extractedText: s.report.text,
        isLate: false,
      })),
    },
    {
      ...base,
      id: ASG_SELF,
      title: '체커톤 성찰 자기평가서',
      description: DEMO_SELF_QUESTIONS.map((q, i) => `${i + 1}. ${q.prompt}`).join('\n'),
      deadline: '2026-05-20T23:59:00.000Z',
      driveFolder: { id: `${PREFIX}folder-self`, name: '체커톤 성찰' },
      submitType: 'text',
      fileTypeRestriction: 'all',
      submissions: DEMO_STUDENTS.map((s, si) => ({
        id: selfSubId(s.number),
        assignmentId: ASG_SELF,
        studentGrade: String(TS[si].grade),
        studentClass: String(TS[si].classNum),
        studentNumber: s.number,
        studentName: s.name,
        submittedAt: `2026-05-18T0${1 + si}:30:00.000Z`,
        fileName: null,
        fileSize: 0,
        textContent: selfText(s.self),
        isLate: false,
      })),
    },
  );
});

/* ─────────────── 4. 제출 본문 캐시 — 보고서 5건 모두 추출 성공 ─────────────── */
edit('submission-texts.json', (st) => {
  st.records = arr(st, 'records').filter(
    (r) => !(typeof r?.submissionId === 'string' && r.submissionId.startsWith(PREFIX)),
  );
  if (clean) return;
  DEMO_STUDENTS.forEach((s, si) => {
    st.records.push({
      assignmentId: ASG_REPORT,
      submissionId: reportSubId(s.number),
      driveFileId: `${PREFIX}drive-report-${s.number}`,
      submittedAt: `2026-05-0${6 + (si % 3)}T09:${10 + si * 7}:00.000Z`,
      fileSize: 180_000 + si * 23_000,
      status: 'ok',
      text: s.report.text,
      attempts: 1,
      updatedAt: NOW_ISO,
    });
  });
});

/* ─────────────── 5. 진도 ─────────────── */
edit('curriculum-progress.json', (cp) => {
  cp.entries = arr(cp, 'entries').filter(notMine);
  if (clean) return;
  DEMO_LESSONS.forEach(([date, lesson, codes], i) => {
    cp.entries.push({
      id: `${PREFIX}pg-${i + 1}`,
      classId: CLASS_ID,
      date,
      period: 2,
      unit: '기후생태 뉴스 체커톤',
      lesson,
      status: 'completed',
      note: '',
      ...(codes.length > 0 ? { standardCodes: codes } : {}),
    });
  });
});

/* ─────────────── 6. 루브릭 + 채점 메모 ─────────────── */
edit('rubrics.json', (r) => {
  r.rubrics = arr(r, 'rubrics').filter(notMine);
  r.gradings = arr(r, 'gradings').filter(notMine);
  if (clean) return;
  const LV = [
    {
      id: 'l1',
      name: '탁월함',
      score: 4,
      description: '기준을 모두 충족하고 스스로 한 단계 더 나아갔다',
    },
    { id: 'l2', name: '잘함', score: 3, description: '대부분 충족한다' },
    { id: 'l3', name: '보통', score: 2, description: '부분적으로 충족한다' },
    { id: 'l4', name: '노력요함', score: 1, description: '미흡하다' },
  ];
  r.rubrics.push({
    id: `${PREFIX}rb-1`,
    classId: CLASS_ID,
    title: DEMO_RUBRIC.title,
    standardCodes: [DEMO_STANDARDS.argue, DEMO_STANDARDS.evaluateReading],
    criteria: DEMO_RUBRIC.criteria.map((c, i) => ({
      id: c.id,
      name: c.name,
      order: i,
      levels: LV,
    })),
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });
  DEMO_STUDENTS.forEach((s, si) => {
    r.gradings.push({
      id: `${PREFIX}gr-${s.number}`,
      rubricId: `${PREFIX}rb-1`,
      classId: CLASS_ID,
      studentId: sKey(TS[si]),
      status: 'graded',
      marks: s.grading.marks,
      criterionNotes: s.grading.notes,
      overallFeedback: s.grading.overall,
      // 채점일은 공유회 다음 날로 둔다 — "지금"으로 두면 근거 카드 날짜가 시드를 돌린 날로 찍힌다.
      gradedAt: '2026-05-12T07:00:00.000Z',
    });
  });
});

/* ─────────────── 7. 근거 창고 ─────────────── */
edit('record-evidence.json', (ev) => {
  ev.records = arr(ev, 'records').filter(notMine);
  if (clean) return;
  DEMO_STUDENTS.forEach((s, si) => {
    const obsByKey = new Map(s.obs.map((o) => [o[0], o]));
    for (const e of s.evidence) {
      const rec = {
        id: evId(s.number, e.key),
        studentRef: sRef(TS[si]),
        areas: ['subject'],
        classId: CLASS_ID,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      };
      if (e.from.startsWith('obs:')) {
        const o = obsByKey.get(e.from.slice(4));
        if (!o) throw new Error(`${s.name}: 관찰 '${e.from}' 이 없습니다`);
        Object.assign(rec, {
          content: o[3],
          date: o[1],
          slots: o[2],
          sourceType: 'observation',
          // 관찰을 가리켜야 같은 관찰이 거울 카드로 한 번 더 뜨지 않는다.
          sourceId: obsId(s.number, o[0]),
        });
      } else if (e.from === 'report') {
        Object.assign(rec, {
          content: e.content,
          date: '2026-05-06',
          slots: ['산출물'],
          sourceType: 'assignment',
          sourceId: reportSubId(s.number),
        });
      } else if (e.from === 'self') {
        Object.assign(rec, {
          content: e.content,
          date: '2026-05-18',
          sourceType: 'assignment',
          sourceId: selfSubId(s.number),
        });
      } else {
        Object.assign(rec, { content: e.content, date: e.date, sourceType: 'manual' });
      }
      if (e.thread) rec.threadId = threadId(s.number, e.thread);
      ev.records.push(rec);
    }
  });
});

/* ─────────────── 8. 주제 · 장면 · 이음말 ─────────────── */
edit('inquiry-threads.json', (it) => {
  it.records = arr(it, 'records').filter(notMine);
  if (clean) return;
  let order = 0;
  DEMO_STUDENTS.forEach((s, si) => {
    for (const t of s.threads) {
      const rec = {
        id: threadId(s.number, t.key),
        studentRef: sRef(TS[si]),
        classId: CLASS_ID,
        title: t.title,
        keywords: t.keywords ?? [],
        standardCodes: [DEMO_STANDARDS.evaluateReading, DEMO_STANDARDS.integrate],
        status: 'open',
        term: DEMO_TERM,
        order: order++,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      };
      if (t.competencyKeywords) rec.competencyKeywords = t.competencyKeywords;
      if (t.nextNotes) rec.nextNotes = t.nextNotes;
      if (t.link) {
        rec.link = {
          fromThreadId: threadId(s.number, t.link.from),
          ...(t.link.note ? { note: t.link.note } : {}),
        };
      }
      if (t.scenes) {
        rec.scenes = t.scenes.map((sc, i) => ({
          id: `${PREFIX}sc-${s.number}-${t.key}-${i + 1}`,
          role: sc.role,
          moduleId: sc.moduleId,
          ...(sc.note ? { note: sc.note, noteSource: 'teacher' } : {}),
          ...(sc.leadIn ? { leadIn: sc.leadIn } : {}),
          evidenceIds: sc.ev.map((k) => evId(s.number, k)),
        }));
      }
      it.records.push(rec);
    }
  });
});

/* ─────────────── 9. 세특 초안 ─────────────── */
edit('record-drafts.json', (rd) => {
  rd.records = arr(rd, 'records').filter(notMine);
  if (clean) return;
  DEMO_STUDENTS.forEach((s, si) => {
    if (!s.draft) return;
    const main = s.threads.find((t) => t.key === 'main');
    rd.records.push({
      id: `${PREFIX}draft-${s.number}`,
      area: 'subject',
      studentRef: sRef(TS[si]),
      classId: CLASS_ID,
      studentKey: sKey(TS[si]),
      subject: DEMO_CLASS.subject,
      content: s.draft,
      byteLength: neisByteLength(s.draft),
      basisObservationIds: s.obs.map((o) => obsId(s.number, o[0])),
      requiresTeacherReview: true,
      status: 'draft',
      term: DEMO_TERM,
      ...(main ? { threadId: threadId(s.number, main.key) } : {}),
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
  });
});

/* ─────────────── 결과 보고 ─────────────── */
const nObs = DEMO_STUDENTS.reduce((n, s) => n + s.obs.length, 0);
const nEv = DEMO_STUDENTS.reduce((n, s) => n + s.evidence.length, 0);
const nThreads = DEMO_STUDENTS.reduce((n, s) => n + s.threads.length, 0);
const nDrafts = DEMO_STUDENTS.filter((s) => s.draft).length;
console.log(`[chkdemo] 대상: ${dataDir}`);
console.log(`[chkdemo] ${clean ? '제거' : '심기'} 완료 — 건드린 파일 ${touched.length}개`);
if (!clean) {
  console.log('');
  console.log(`  수업반 "${DEMO_CLASS.name}" (학생 ${TS.length}명)`);
  console.log(
    `   · 관찰 ${nObs}건 · 근거 ${nEv}건 · 주제 ${nThreads}개 · 초안 ${nDrafts}건 · 진도 ${DEMO_LESSONS.length}차시`,
  );
  console.log('   · 과제: 팩트체크 보고서(본문 추출 5건) · 체커톤 성찰 자기평가서(글 제출 5건)');
  console.log('');
  console.log('  근거 정리(지도)에서 학생마다 다른 상태가 보입니다:');
  console.log(
    '   1 한서윤 — 장면 5개 + 장면 이음말 + 아래로 이어진 제안문 주제(주제 이음말) + 초안',
  );
  console.log('   2 정다온 — 장면을 짰고 「자리 미정」에 근거 2건');
  console.log('   3 오지유 — 현장 확인 주제, 장면·이음말 완성 + 초안');
  console.log('   4 배수아 — 장면 없는 주제(날짜순 흐름, [뼈대 깔기])');
  console.log('   5 문채원 — 주제 없음, 관찰이 「아직 근거 아님」 카드로 보임');
  console.log('');
  console.log('  되돌리기: node scripts/seed-checkathon-demo.mjs --clean');
  console.log(`  백업:     각 파일 옆 .pre-chkdemo-${TAG}`);
}
