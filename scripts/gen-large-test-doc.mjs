/**
 * 대용량(100페이지 이상) 마크다운 변환기 테스트 문서 생성기.
 *
 * 모든 데이터는 *가짜*다. 변환기 성능/안정성 테스트용으로 학생 다수의 생기부를 생성한다.
 * 출력: docs/markdown-converter-test-docs/
 *   - 생기부-대용량.pdf   (100+ 페이지 목표)
 *   - 생기부-대용량.hwpx
 *   - 학생명렬표-대용량.xlsx
 *
 * 실행: node scripts/gen-large-test-doc.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { markdownToHwpx } from 'kordoc';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const OUT_DIR = join(process.cwd(), 'docs', 'markdown-converter-test-docs');
mkdirSync(OUT_DIR, { recursive: true });

const N = 380; // 학생 수 (PDF 100+ 페이지가 나오도록)

const SURNAMES = [
  '김',
  '이',
  '박',
  '최',
  '정',
  '강',
  '조',
  '윤',
  '장',
  '임',
  '한',
  '오',
  '서',
  '신',
  '권',
  '황',
  '안',
  '송',
  '류',
  '홍',
];
const GIVEN = [
  '민준',
  '서연',
  '도윤',
  '지우',
  '하준',
  '서윤',
  '예준',
  '지호',
  '주원',
  '지민',
  '현우',
  '수아',
  '건우',
  '지아',
  '선우',
  '하윤',
  '서준',
  '다은',
  '시우',
  '윤서',
  '준우',
  '채원',
  'уน',
  '은우',
  '소율',
].filter((g) => /[가-힣]/.test(g));
const CITIES = [
  '서울특별시 강남구 테헤란로',
  '경기도 성남시 분당구 정자일로',
  '부산광역시 해운대구 센텀중앙로',
  '대전광역시 유성구 대학로',
  '인천광역시 연수구 송도과학로',
  '광주광역시 서구 상무중앙로',
];
const BUILDINGS = ['행복아파트', '한빛마을', '그린빌', '별빛아파트', '푸른숲단지', '햇살빌'];
const NOTE_SENTENCES = [
  '모둠 활동에서 리더 역할을 자주 맡아 친구들의 의견을 조율하였다.',
  '독서 토론에서 제시한 근거가 설득력 있었고 경청하는 태도가 돋보였다.',
  '수학·과학 탐구 활동에 흥미가 높아 자유 탐구 주제를 직접 설계하였다.',
  '예술 분야에 소질이 있어 학급 환경 미화에서 디자인 감각을 발휘하였다.',
  '어려운 친구를 먼저 돕는 배려심을 보였고 학급 일에 책임감 있게 참여하였다.',
  '발표 준비 과정에서 자료를 꼼꼼히 정리하고 구성하는 능력이 우수하였다.',
];

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function makeStudent(i) {
  const name = SURNAMES[i % SURNAMES.length] + GIVEN[(i * 7) % GIVEN.length];
  const yy = 8 + (i % 4); // 2008~2011
  const mm = (i % 12) + 1;
  const dd = (i % 28) + 1;
  const birth = `20${pad(yy, 2)}-${pad(mm, 2)}-${pad(dd, 2)}`;
  const rrnFront = `${pad(yy, 2)}${pad(mm, 2)}${pad(dd, 2)}`;
  const gender = (i % 2) + 3; // 3 or 4
  const rrn = `${rrnFront}-${gender}${pad((i * 137) % 1000000, 6)}`;
  const phone = `010-${pad(1000 + ((i * 31) % 9000), 4)}-${pad((i * 73) % 10000, 4)}`;
  const guardianPhone = `010-${pad(1000 + ((i * 53) % 9000), 4)}-${pad((i * 97) % 10000, 4)}`;
  const email = `student${pad(i + 1, 3)}@example-school.kr`;
  const city = CITIES[i % CITIES.length];
  const building = BUILDINGS[i % BUILDINGS.length];
  const address = `${city} ${10 + (i % 200)} ${building} ${1 + (i % 15)}동 ${100 + (i % 800)}호`;
  const account = `${pad(100 + (i % 900), 3)}-${pad(i % 100, 2)}-${pad((i * 911) % 1000000, 6)}`;
  const note = `${NOTE_SENTENCES[i % NOTE_SENTENCES.length]} ${NOTE_SENTENCES[(i + 3) % NOTE_SENTENCES.length]} ${NOTE_SENTENCES[(i + 1) % NOTE_SENTENCES.length]}`;
  return { no: i + 1, name, birth, rrn, phone, guardianPhone, email, address, account, note };
}

const STUDENTS = Array.from({ length: N }, (_, i) => makeStudent(i));

function buildMarkdown() {
  let md = '# 2026학년도 학생 종합 기록 (대용량 테스트용 가짜 문서)\n\n';
  md += `> 본 문서의 모든 인적사항은 테스트용 가짜 데이터입니다. (학생 ${N}명)\n\n`;
  for (const s of STUDENTS) {
    md += `## ${s.no}. ${s.name}\n\n`;
    md += `- 생년월일: ${s.birth}\n`;
    md += `- 연락처: ${s.phone}\n`;
    md += `- 주민등록번호: ${s.rrn}\n`;
    md += `- 이메일: ${s.email}\n`;
    md += `- 주소: ${s.address}\n`;
    md += `- 보호자 연락처: ${s.guardianPhone}\n`;
    md += `- 보호자 계좌: ${s.account}\n\n`;
    md += `${s.note}\n\n`;
  }
  return md;
}

function toPlainLines(md) {
  return md.split('\n').map((l) =>
    l
      .replace(/^#{1,6}\s*/, '')
      .replace(/^>\s*/, '')
      .replace(/^-\s*/, '• '),
  );
}

async function genHwpx() {
  const buf = await markdownToHwpx(buildMarkdown());
  writeFileSync(join(OUT_DIR, '생기부-대용량.hwpx'), Buffer.from(buf));
  console.log('✓ HWPX 생성 (생기부-대용량.hwpx)');
}

async function genXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('명렬표');
  ws.columns = [
    { header: '번호', key: 'no', width: 6 },
    { header: '이름', key: 'name', width: 10 },
    { header: '생년월일', key: 'birth', width: 14 },
    { header: '연락처', key: 'phone', width: 16 },
    { header: '주민등록번호', key: 'rrn', width: 18 },
    { header: '주소', key: 'address', width: 50 },
    { header: '보호자연락처', key: 'guardianPhone', width: 16 },
    { header: '이메일', key: 'email', width: 30 },
    { header: '보호자계좌', key: 'account', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const s of STUDENTS) ws.addRow(s);
  await wb.xlsx.writeFile(join(OUT_DIR, '학생명렬표-대용량.xlsx'));
  console.log(`✓ XLSX 생성 (학생명렬표-대용량.xlsx, ${N}행)`);
}

function findKoreanFont() {
  const candidates = [
    join(process.cwd(), 'scripts', 'font-subset', '.cache', 'NotoSansKR-Regular.static.ttf'),
    join(process.cwd(), 'scripts', 'font-subset', '.cache', 'NotoSansKR-Variable.ttf'),
    join(process.cwd(), 'supabase', 'functions', '_assets', 'NotoSansKR-Regular.otf'),
  ];
  return candidates.find((p) => existsSync(p));
}

async function genPdf() {
  const fontPath = findKoreanFont();
  if (!fontPath) {
    console.log('⚠ 한글 폰트를 찾지 못해 PDF 건너뜀');
    return;
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(fontPath), { subset: true });

  const lines = toPlainLines(buildMarkdown());
  const fontSize = 11;
  const margin = 50;
  const lineHeight = 17;
  const pageWidth = 595;
  const pageHeight = 842;
  const maxWidth = pageWidth - margin * 2;

  function wrap(text) {
    if (text.length === 0) return [''];
    const out = [];
    let cur = '';
    for (const ch of text) {
      const test = cur + ch;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth && cur.length > 0) {
        out.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    if (cur.length > 0) out.push(cur);
    return out;
  }

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  for (const raw of lines) {
    for (const line of wrap(raw)) {
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (line.length > 0) page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }
  }
  const bytes = await pdf.save();
  writeFileSync(join(OUT_DIR, '생기부-대용량.pdf'), bytes);
  console.log(`✓ PDF 생성 (생기부-대용량.pdf, ${pdf.getPageCount()} 페이지)`);
}

await genHwpx();
await genXlsx();
await genPdf();
console.log(`\n완료 → ${OUT_DIR}`);
