/**
 * 쿨메신저가 없는 PC에서 "쪽지에서 가져오기"를 실제 앱으로 확인하기 위한 가짜 쪽지함 생성기.
 *
 * 쌤핀이 읽는 것은 결국 SQLite 파일 하나다. 실물과 **같은 표 이름·같은 칸 이름·같은 날짜
 * 형식·같은 WAL 모드**로 만들면 앱 입장에서는 진짜 쿨메신저와 구별되지 않는다.
 * 그래서 IPC·설정 스위치·목록·미리보기·등록까지 전 과정을 실기기로 확인할 수 있다.
 *
 * 사용법:
 *   node scripts/make-cool-demo-udb.mjs            # 데모 쪽지함 만들기
 *   node scripts/make-cool-demo-udb.mjs --clean    # 지우기
 *
 * 만들고 나면 안내되는 환경변수를 설정한 뒤 `npm run electron:dev` 로 앱을 띄운다.
 * 이 환경변수는 **개발 실행에서만** 먹는다(배포본은 무시 — electron/ipc/coolMessenger.ts).
 *
 * ⚠️ 여기 들어가는 이름·전화번호는 전부 지어낸 것이다. 실제 학생 정보를 넣지 말 것.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT_DIR = join(tmpdir(), 'ssampin-cool-demo');
const DB_PATH = join(OUT_DIR, 'DemoMemo.udb');

/** 쿨메신저 날짜 형식: 2026/08/21 09:00:00 (금) */
function formatReceived(d) {
  const p = (n) => String(n).padStart(2, '0');
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} (${wd})`;
}

function daysAgo(n, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** 앞으로 n일 뒤 날짜를 "M월 D일(요일)" 로 — 데모가 항상 미래 일정을 갖도록 */
function futureLabel(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${wd})`;
}

/**
 * 확인하고 싶은 상황을 하나씩 담은 쪽지들.
 * `check` 는 사람이 눈으로 볼 기대 결과다(코드가 쓰지 않음 — 콘솔 안내용).
 */
const MESSAGES = [
  {
    sender: '교무부',
    received: daysAgo(0, 9),
    unread: 1,
    title: '학교폭력대책심의위원회 심의 안내',
    body:
      `3학년 2반 김민준 학생 관련 학폭위 심의가 ${futureLabel(6)} 14:00 본관 회의실에서 열립니다.\n` +
      `담당: 이수진 선생님 (010-1234-5678)\n` +
      `※ 참석이 어려우시면 내선 031)345-6789 로 미리 연락 주세요.`,
    check: '날짜+시각 인식 · 개인정보 3~4곳 빨간 표시 · 일정으로 추천',
  },
  {
    sender: '연구부',
    received: daysAgo(1, 10),
    unread: 1,
    title: '2학기 교원 연수 신청서 제출',
    body: `${futureLabel(10)}까지 제출 바랍니다. 양식은 업무포털에서 내려받으세요.`,
    check: '"까지 제출" → 할일로 추천되어야 함',
  },
  {
    sender: '방과후부',
    received: daysAgo(2, 11),
    unread: 0,
    title: '여름 캠프 운영 기간 안내',
    body: `캠프는 ${futureLabel(20)}~${futureLabel(24)} 진행합니다. 인솔 교사는 추후 안내드립니다.`,
    check: '기간(~) 인식 → 시작·종료 두 날짜가 한 건으로',
  },
  {
    sender: '행정실',
    received: daysAgo(2, 14),
    unread: 0,
    title: '물품 신청 마감',
    body: '내일 오전 9시까지 신청해 주세요.',
    check: '★ 기준일이 오늘이 아니라 "쪽지 받은 날"이어야 함 (이틀 전 기준 = 어제)',
  },
  {
    sender: '보건실',
    received: daysAgo(3, 13),
    unread: 0,
    title: '건강검진 일정',
    body:
      '1. 준비물 안내\n' +
      '2. 3학년 대상\n' +
      '3. 문의는 보건실로\n' +
      '실시일은 1-2교시입니다. 자세한 날짜는 추후 공지.',
    check: '★ "2. 3"·"1-2교시"를 날짜로 오인하면 안 됨 → 후보 0건이 정답',
  },
  {
    sender: '교장',
    received: daysAgo(4, 8),
    unread: 0,
    title: '인사말',
    body: '한 학기 동안 수고 많으셨습니다. 감사합니다.',
    check: '날짜 없음 → "날짜를 찾지 못했습니다" 안내가 떠야 함',
  },
  {
    sender: '진로부',
    received: daysAgo(5, 15),
    unread: 0,
    title: '진로체험 안내 (여러 날짜)',
    body:
      `사전교육 ${futureLabel(3)} 15:00\n` +
      `체험 당일 ${futureLabel(8)} 09:00\n` +
      `보고서 제출 ${futureLabel(12)}까지`,
    check: '한 쪽지에서 후보 3건 · 마지막 건만 할일 추천',
  },
  {
    sender: '정보부',
    received: daysAgo(6, 16),
    unread: 0,
    title: '오탐 확인용 (숫자 덩어리)',
    body: '학번 20260812 확인 바랍니다. 13월 5일, 8월 32일, 25시 같은 값은 무시되어야 합니다.',
    check: '★ 후보 0건이 정답 (잘못된 날짜를 만들어내면 결함)',
  },
];

const STAFF = ['김영수', '이수진', '박지훈', '최은영', '정민호'];

function clean() {
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
    console.log(`지웠습니다: ${OUT_DIR}`);
  } else {
    console.log('지울 것이 없습니다.');
  }
}

function build() {
  mkdirSync(OUT_DIR, { recursive: true });
  // 이전 파일이 있으면 지운다 (.udb + -wal + -shm)
  for (const f of readdirSync(OUT_DIR)) {
    try {
      unlinkSync(join(OUT_DIR, f));
    } catch {
      /* 열려 있으면 건너뛴다 */
    }
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode=WAL'); // 쿨메신저와 같은 모드
  db.exec(`CREATE TABLE tbl_recv (
    MessageKey INTEGER PRIMARY KEY,
    Sender TEXT, ReceiveDate TEXT, Title TEXT, MessageText TEXT,
    IsUnRead INTEGER, DeletedDate TEXT
  )`);
  db.exec('CREATE TABLE tbl_member (MemberName TEXT)');

  const insert = db.prepare(
    'INSERT INTO tbl_recv (MessageKey, Sender, ReceiveDate, Title, MessageText, IsUnRead, DeletedDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  MESSAGES.forEach((m, i) => {
    insert.run(i + 1, m.sender, formatReceived(m.received), m.title, m.body, m.unread, null);
  });
  // 삭제된 쪽지 한 건 — 목록에 나오면 결함이다
  insert.run(
    999,
    '삭제된발신자',
    formatReceived(daysAgo(1, 12)),
    '이 쪽지가 보이면 결함입니다',
    '삭제된 쪽지는 목록에 나오면 안 됩니다.',
    1,
    '2026/08/21',
  );

  const member = db.prepare('INSERT INTO tbl_member (MemberName) VALUES (?)');
  for (const n of STAFF) member.run(n);
  db.close();

  console.log('데모 쪽지함을 만들었습니다.\n');
  console.log(`  ${DB_PATH}\n`);
  console.log('─'.repeat(70));
  console.log('실행 방법 (PowerShell):\n');
  console.log(`  $env:SSAMPIN_COOL_MEMO_DIR = "${OUT_DIR}"`);
  console.log('  npm run electron:dev\n');
  console.log('앱이 뜨면: 설정 → 일정 → "쿨메신저에서 가져오기" 켜기');
  console.log('        → 일정 화면 상단 [쿨메신저] 버튼\n');
  console.log('─'.repeat(70));
  console.log('쪽지별 확인 항목:\n');
  MESSAGES.forEach((m, i) => {
    console.log(`  ${i + 1}. [${m.sender}] ${m.title}`);
    console.log(`     → ${m.check}\n`);
  });
  console.log('  9. [삭제된발신자] → 목록에 아예 안 보여야 정상\n');
  console.log('끝나면 정리: node scripts/make-cool-demo-udb.mjs --clean');
}

if (process.argv.includes('--clean')) clean();
else build();
