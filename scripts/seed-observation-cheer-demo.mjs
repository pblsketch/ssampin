#!/usr/bin/env node
/**
 * 관찰 기록 응원(잔디) 2·3차(ADR-137) 실기기 확인용 더미 자료.
 *
 * ## 안전
 *  - 선생님 **실제 자료(%APPDATA%/ssampin)는 건드리지 않는다.** 저장소 안 별도 폴더 두 개를 통째로 새로 만든다.
 *      .dev-data-cheer        — 한 주 정리가 오는 날
 *      .dev-data-cheer-retro  — 학기 돌아보기가 오는 날(학기 종료일을 이번 주 금요일로 넣어 둔다)
 *    두 폴더 모두 .gitignore(`.dev-data-*`) 대상이다.
 *  - 실행할 때마다 폴더를 지우고 다시 만든다 — 그날 알림 표시(이 컴퓨터에만 두는 값)도 지워져 처음부터 다시 볼 수 있다.
 *    그 폴더로 앱이 켜져 있으면 지우지 못하고 멈춘다.
 *  - 학생 이름은 모두 지어낸 이름이다. 동기화·사용 통계는 끈다.
 *
 * ## 사용
 *   node scripts/seed-observation-cheer-demo.mjs
 *   npx concurrently -k "vite" "node scripts/electron-dev.mjs --user-data-dir=.dev-data-cheer"
 *   npx concurrently -k "vite" "node scripts/electron-dev.mjs --user-data-dir=.dev-data-cheer-retro"
 *
 * ## 날짜
 *  실행한 날을 기준으로 만든다(그날이 평일이어야 한다). 이번 주 남은 평일은 '(테스트) 쉬는 날'로 넣어 두어
 *  오늘이 이번 주 마지막 등교일이 되게 한다 — 그래야 오늘 한 주 정리가 온다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
);
const BASE_SETTINGS = path.join(ROOT, '.dev-data', 'data', 'settings.json');
const TARGETS = [
  { dir: path.join(ROOT, '.dev-data-cheer'), retro: false },
  { dir: path.join(ROOT, '.dev-data-cheer-retro'), retro: true },
];

// ── 날짜 ──
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const today = new Date();
today.setHours(0, 0, 0, 0);
const dow = today.getDay();
if (dow === 0 || dow === 6) {
  console.error(
    '[cheer-demo] 오늘은 주말입니다. 평일에 실행해 주세요(오늘 챙길 학생·한 주 정리는 등교일에만 나옵니다).',
  );
  process.exit(1);
}
const monday = addDays(today, -((dow + 6) % 7));
const friday = addDays(monday, 4);
const WEEKDAY_KEYS = ['월', '화', '수', '목', '금'];
const todayKey = WEEKDAY_KEYS[(dow + 6) % 7];

// ── 학기 ──
const y = today.getFullYear();
const m = today.getMonth() + 1;
let term;
let termStart;
let pastTerm;
let pastStart;
let pastEnd;
if (m <= 2) {
  term = `${y - 1}-2`;
  termStart = `${y - 1}-08-18`;
  pastTerm = `${y - 1}-1`;
  pastStart = `${y - 1}-03-02`;
  pastEnd = `${y - 1}-08-17`;
} else if (m > 8 || (m === 8 && today.getDate() >= 18)) {
  term = `${y}-2`;
  termStart = `${y}-08-18`;
  pastTerm = `${y}-1`;
  pastStart = `${y}-03-02`;
  pastEnd = `${y}-08-17`;
} else {
  term = `${y}-1`;
  termStart = `${y}-03-02`;
  pastTerm = `${y - 1}-2`;
  pastStart = `${y - 1}-08-18`;
  pastEnd = `${y}-03-01`;
}

/** from~to(포함) 평일 날짜들 */
function weekdaysBetween(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00`); iso(d) <= to; d = addDays(d, 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(iso(d));
  }
  return out;
}
const firstTermDay = weekdaysBetween(
  termStart,
  iso(addDays(new Date(`${termStart}T00:00:00`), 6)),
)[0];
/** 이번 학기 안의 n일 전(주말이면 그 전 평일, 학기 시작 전이면 학기 첫 평일) */
const daysAgo = (n) => {
  let d = addDays(today, -n);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, -1);
  return iso(d) < firstTermDay ? firstTermDay : iso(d);
};
const thisWeekSoFar = weekdaysBetween(iso(monday), iso(today));
const pastDays = weekdaysBetween(pastStart, pastEnd);

// ── 사람(모두 지어낸 이름) ──
const HOMEROOM_NAMES = [
  '강하윤',
  '권도윤',
  '김서아',
  '김시우',
  '남지안',
  '문하준',
  '박서윤',
  '배준우',
  '서지호',
  '손예린',
  '신도현',
  '오채원',
  '유건우',
  '윤하린',
  '이주원',
  '임수아',
  '장민재',
  '정다인',
  '조은호',
  '한지율',
];
const students = HOMEROOM_NAMES.map((name, i) => ({
  id: `cheer-demo-s${pad(i + 1)}`,
  name,
  studentNumber: i + 1,
  phone: '',
  parentPhone: '',
  isVacant: false,
}));
const sid = (n) => students[n - 1].id; // 출석번호 → id

const roster = (names) => names.map((name, i) => ({ number: i + 1, name }));
const NOW = new Date().toISOString();
const classes = [
  {
    id: 'cheer-demo-sci',
    name: '3학년 2반',
    subject: '통합과학',
    students: roster([
      '고은서',
      '구태민',
      '나윤아',
      '노시현',
      '류지훈',
      '마서진',
      '백하람',
      '변도하',
    ]),
    order: 1,
  },
  {
    id: 'cheer-demo-kor',
    name: '3학년 5반',
    subject: '국어',
    students: roster(['석가은', '성준혁', '송다은', '안지섭', '양서하', '엄태윤']),
    order: 2,
  },
  {
    id: 'cheer-demo-math',
    name: '1학년 1반',
    subject: '수학',
    students: roster(['연하늘', '예준서', '옥지유', '용시안', '우채린', '원도율']),
    order: 3,
  },
  {
    id: 'cheer-demo-eng',
    name: '1학년 2반',
    subject: '영어',
    students: roster(['위서율', '육하진', '은지오', '인소윤']),
    order: 4,
  },
  // 지난 학기에 가르치고 보관한 반 — 지난 학기 돌아보기에 나온다
  {
    id: 'cheer-demo-sci-old',
    name: '2학년 4반',
    subject: '통합과학',
    students: roster(['전하율', '제시온', '주아린', '지건', '진서우']),
    order: 51,
    archived: true,
    archivedAt: `${pastEnd}T09:00:00.000Z`,
    archivedTerm: pastTerm,
  },
].map((c) => ({ createdAt: `${pastStart}T09:00:00.000Z`, updatedAt: NOW, ...c }));

// ── 기록 ──
const HR_TEXT = {
  '학습 태도': '수업 시작 전에 스스로 교과서를 펴 두고 모둠원에게 오늘 할 일을 알려 주었다.',
  '인성·관계': '쉬는 시간에 혼자 있던 친구에게 먼저 말을 걸어 함께 활동하자고 했다.',
  '학급 역할': '학급 게시판 담당으로 공지를 새로 붙이고 지난 안내문을 정리했다.',
  변화: '학기 초보다 발표 목소리가 커졌고 손을 드는 횟수가 늘었다.',
  '아쉬운 점': '모둠 과제 마감을 한 번 놓쳐 다음부터는 미리 알리겠다고 말했다.',
  진로: '과학 탐구 동아리 활동 뒤 생명과학 관련 진로를 알아보고 싶다고 했다.',
  '': '점심시간에 교실 화분에 물을 주는 모습을 보았다.',
};
const homeroomRecords = [];
let seq = 0;
function hr(n, date, scene, t = term) {
  const id = `cheer-demo-hr-${pad(++seq)}`;
  homeroomRecords.push({
    id,
    studentId: sid(n),
    category: 'life',
    subcategory: '일반',
    content: `${students[n - 1].name} — ${HR_TEXT[scene ?? '']}`,
    date,
    createdAt: `${date}T02:${pad(seq % 60)}:00.000Z`,
    updatedAt: `${date}T02:${pad(seq % 60)}:00.000Z`,
    term: t,
    ...(scene ? { slots: [scene] } : {}),
  });
}
const S = ['학습 태도', '인성·관계', '학급 역할', '진로']; // '변화'·'아쉬운 점'은 일부러 비워 둔다(아직 없는 장면)

// 이번 학기 — 담임 20명
// 1~10번: 꾸준히(장면 서로 다르게 3~4가지 → 초안 준비), 11~14번: 장면 1~2가지, 15번: 이번 학기 기록 없음,
// 16번: 장면 없이 한 번, 17번·19·20번: 이번 주에도 기록, 18번: 관심 학생 — 9일 전이 마지막(보통은 14일, 관심은 7일).
for (let n = 1; n <= 10; n++) {
  hr(n, daysAgo(40 - n), S[n % 4]);
  hr(n, daysAgo(30 - n), S[(n + 1) % 4]);
  hr(n, daysAgo(12 - (n % 5)), S[(n + 2) % 4]);
  if (n <= 5) hr(n, daysAgo(20 + n), S[(n + 3) % 4]);
}
for (let n = 11; n <= 14; n++) {
  hr(n, daysAgo(25 + n), S[n % 4]);
  hr(n, daysAgo(n - 3), S[n % 4]);
}
hr(16, daysAgo(6), null);
hr(18, daysAgo(9), '인성·관계');
hr(18, daysAgo(33), '학습 태도');
// 이번 주(월요일~오늘) — 한 주 정리에 나온다
const weekDates = thisWeekSoFar;
[1, 2, 3, 4, 17, 19, 20].forEach((n, i) => {
  hr(n, weekDates[i % weekDates.length], n >= 17 ? S[i % 4] : S[(n + i) % 4]);
});

// 지난 학기 — 담임 20명 모두 두 번씩
pastDays.length > 0 &&
  students.forEach((_, i) => {
    const a = pastDays[(i * 3) % pastDays.length];
    const b = pastDays[(i * 3 + 45) % pastDays.length];
    hr(i + 1, a < b ? a : b, S[i % 4], pastTerm);
    hr(i + 1, a < b ? b : a, S[(i + 2) % 4], pastTerm);
  });

// 수업반 관찰
const OB_TEXT = {
  질문: '실험 결과가 예상과 다른 까닭을 되물으며 변인을 다시 확인했다.',
  시도: '모둠 발표 자료의 그래프를 스스로 다시 그려 보겠다고 나섰다.',
  시행착오: '측정값이 맞지 않자 기구를 바꿔 두 번 더 측정했다.',
  산출물: '탐구 보고서에 자료 출처를 정리한 표를 붙여 제출했다.',
  '': '수업 중 활동지에 자기 생각을 끝까지 적었다.',
};
const observations = [];
function ob(classId, number, date, scene, t = term) {
  const id = `cheer-demo-ob-${pad(++seq)}`;
  const at = Date.parse(`${date}T03:${pad(seq % 60)}:00.000Z`);
  observations.push({
    id,
    studentId: String(number),
    classId,
    authorId: 'default',
    date,
    content: OB_TEXT[scene ?? ''],
    tags: [],
    visibility: 'private',
    createdAt: at,
    updatedAt: at,
    category: '수업 관찰',
    term: t,
    ...(scene ? { slots: [scene] } : {}),
  });
}
const OS = ['질문', '시도', '시행착오', '산출물'];
// 3학년 2반 통합과학 — 8명 모두 한 번(한 바퀴 끝), 1~3번은 한 번 더. 7·8번은 오래됨(오늘 수업 뒤 챙길 학생 후보).
for (let n = 1; n <= 8; n++) ob('cheer-demo-sci', n, daysAgo(n >= 7 ? 28 + n : 20 + n), OS[n % 4]);
for (let n = 1; n <= 3; n++) ob('cheer-demo-sci', n, daysAgo(5 + n), OS[(n + 1) % 4]);
for (let n = 4; n <= 6; n++) ob('cheer-demo-sci', n, daysAgo(3 + n), OS[(n + 2) % 4]);
// 3학년 5반 국어 — 장면을 거의 안 고름(한 줄 안내가 나온다), 5·6번은 기록 없음
[1, 2, 3, 4].forEach((n) => ob('cheer-demo-kor', n, daysAgo(4 + n * 2), null));
// 1학년 1반 수학 — 이번 학기 기록 없음
// 1학년 2반 영어 — 4명 모두 한 번(한 바퀴 끝)
[1, 2, 3, 4].forEach((n) => ob('cheer-demo-eng', n, daysAgo(8 + n), OS[n % 4]));
// 지난 학기 — 보관한 반 5명 모두 한 번 + 둘은 한 번 더
if (pastDays.length > 0) {
  [1, 2, 3, 4, 5].forEach((n) =>
    ob('cheer-demo-sci-old', n, pastDays[(n * 7) % pastDays.length], OS[n % 4], pastTerm),
  );
  [1, 2].forEach((n) =>
    ob(
      'cheer-demo-sci-old',
      n,
      pastDays[(n * 7 + 30) % pastDays.length],
      OS[(n + 1) % 4],
      pastTerm,
    ),
  );
}

// ── 시간표: 오늘 1·2·3·5교시에 수업(끝난 수업 반에서 한 명씩 챙길 학생이 더해진다) ──
const lesson = (c) => ({ subject: c.subject, classroom: c.name });
const [sci, kor, math, eng] = classes;
const week = {};
WEEKDAY_KEYS.forEach((k, i) => {
  const row = [null, null, null, null, null, null, null];
  if (k === todayKey) {
    row[0] = lesson(sci);
    row[1] = lesson(kor);
    row[2] = lesson(math);
    row[4] = lesson(eng);
  } else {
    row[i % 3] = lesson([sci, kor, math][i % 3]);
    row[4] = lesson(eng);
  }
  week[k] = row;
});

// ── 학사일정(나이스 학교 일정처럼) ──
const neis = (date, title, subtractDayType = '해당없음', endDate) => ({
  id: `cheer-demo-neis-${date}-${title}`,
  title,
  date,
  ...(endDate ? { endDate } : {}),
  category: 'school',
  source: 'neis',
  neis: {
    eventId: `${date.replace(/-/g, '')}_${title}`,
    eventName: title,
    schoolYear: String(y),
    gradeYn: {},
    subtractDayType,
    loadDate: iso(today).replace(/-/g, ''),
  },
});
const events = [neis(termStart, '개학식')];
// 지난 시험 주 하나(반 흐름·잔디에서 '쉬는 주'로 옅게 보인다)
const examMonday = addDays(monday, -21);
if (iso(examMonday) > termStart) {
  events.push(neis(iso(examMonday), '(테스트) 1회고사', '해당없음', iso(addDays(examMonday, 2))));
}
// 이번 주 남은 평일은 쉬는 날로 — 오늘이 이번 주 마지막 등교일이 된다
for (let d = addDays(today, 1); iso(d) <= iso(friday); d = addDays(d, 1)) {
  events.push(neis(iso(d), '(테스트) 쉬는 날', '공휴일'));
}

// ── 설정 ──
if (!fs.existsSync(BASE_SETTINGS)) {
  console.error(`[cheer-demo] 기본 설정 파일이 없습니다: ${BASE_SETTINGS}`);
  process.exit(1);
}
const base = JSON.parse(fs.readFileSync(BASE_SETTINGS, 'utf8'));
function settingsFor(retro) {
  const s = structuredClone(base);
  s.className = '2학년 3반';
  s.schoolName = '쌤핀중학교(테스트)';
  s.teacherName = '테스트';
  // 이번 주 남은 평일에 넣은 '(테스트) 쉬는 날'이 '오늘 행사 알림' 창으로 뜨지 않게
  s.eventAlertEnabled = false;
  s.analytics = { ...(s.analytics ?? {}), enabled: false };
  if (s.sync) {
    s.sync = { ...s.sync, enabled: false };
    delete s.sync.deviceId;
  }
  s.termStartDates = { [pastTerm]: pastStart, [term]: termStart };
  s.termStartPromptSkipped = term;
  if (retro) {
    s.termEndDates = { [term]: iso(friday) };
    delete s.termEndPromptSkipped;
  } else {
    delete s.termEndDates;
    s.termEndPromptSkipped = term;
  }
  s.recordReminder = {
    ...(s.recordReminder ?? {}),
    enabled: true,
    preset: 'normal',
    weekdays: [],
    staleDays: 14,
    targets: ['homeroom', 'subject'],
    nameExposure: 'full',
    subtleEnabled: true,
    osToastEnabled: false,
    cheerEnabled: true,
    focusedStudentIds: [sid(18)],
    excludedStudentIds: [],
    exclusions: [],
  };
  s.widget = {
    ...(s.widget ?? {}),
    visibleSections: { ...(s.widget?.visibleSections ?? {}), studentRecords: true },
  };
  return s;
}

// ── 쓰기 ──
for (const t of TARGETS) {
  try {
    fs.rmSync(t.dir, { recursive: true, force: true });
  } catch (e) {
    console.error(
      `[cheer-demo] ${path.basename(t.dir)} 폴더를 지우지 못했습니다 — 그 폴더로 쌤핀이 켜져 있으면 닫고 다시 실행하세요.`,
    );
    console.error(`            (${e.code ?? e.message})`);
    process.exit(1);
  }
  const data = path.join(t.dir, 'data');
  fs.mkdirSync(data, { recursive: true });
  const write = (name, value) =>
    fs.writeFileSync(path.join(data, name), JSON.stringify(value, null, 2));
  write('settings.json', settingsFor(t.retro));
  write('students.json', students);
  write('teaching-classes.json', { classes });
  write('student-records.json', { records: homeroomRecords });
  write('observations.json', { records: observations });
  write('teacher-schedule.json', week);
  write('events.json', { events });
}

console.log(
  `[cheer-demo] 오늘 ${iso(today)}(${todayKey}) · 이번 학기 ${term}(${termStart}~) · 지난 학기 ${pastTerm}`,
);
console.log(
  `[cheer-demo] 담임 20명·수업반 4개(+보관 1)·담임 기록 ${homeroomRecords.length}건·수업 관찰 ${observations.length}건`,
);
console.log(
  '[cheer-demo] 만든 폴더: .dev-data-cheer (한 주 정리) · .dev-data-cheer-retro (학기 돌아보기, 종료일 ' +
    iso(friday) +
    ')',
);
