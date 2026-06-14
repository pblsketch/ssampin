/**
 * 마크다운 변환기 테스트용 가짜 문서 생성기.
 *
 * 모든 데이터는 *가짜*다(실제 학생 아님). 마스킹/변환 테스트용으로 이름·전화·주민번호·
 * 이메일·주소·계좌를 일부러 섞어 넣었다. 형식별로 HWPX/DOCX/PDF/XLSX 를 만든다.
 *
 * 실행: node scripts/gen-test-docs.mjs
 * 출력: docs/markdown-converter-test-docs/
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { markdownToHwpx } from 'kordoc';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const OUT_DIR = join(process.cwd(), 'docs', 'markdown-converter-test-docs');
mkdirSync(OUT_DIR, { recursive: true });

// ── 가짜 학생 데이터 (실제 인물 아님) ─────────────────────────────
const STUDENTS = [
  {
    no: 1,
    name: '김민준',
    birth: '2010-03-15',
    phone: '010-1234-5678',
    rrn: '100315-3123456',
    email: 'minjun.kim@example-school.kr',
    address: '서울특별시 강남구 테헤란로 123 행복아파트 101동 1502호',
    guardianPhone: '010-9876-5432',
    account: '110-234-567890',
  },
  {
    no: 2,
    name: '이서연',
    birth: '2010-07-22',
    phone: '010-2345-6789',
    rrn: '100722-4234567',
    email: 'seoyeon.lee@example-school.kr',
    address: '경기도 성남시 분당구 정자일로 95 한빛마을 3단지 502동 1203호',
    guardianPhone: '010-8765-4321',
    account: '333-12-3456789',
  },
  {
    no: 3,
    name: '박도윤',
    birth: '2009-11-30',
    phone: '010-3456-7890',
    rrn: '091130-3345678',
    email: 'doyun.park@example-school.kr',
    address: '부산광역시 해운대구 센텀중앙로 55 그린빌 7층',
    guardianPhone: '010-7654-3210',
    account: '1002-345-678901',
  },
  {
    no: 4,
    name: '최지우',
    birth: '2010-04-08',
    phone: '010-4567-8901',
    rrn: '100408-4456789',
    email: 'jiwoo.choi@example-school.kr',
    address: '대전광역시 유성구 대학로 99 별빛아파트 12동 304호',
    guardianPhone: '010-6543-2109',
    account: '301-0123-4567-89',
  },
];

const NOTE = {
  김민준:
    '김민준 학생은 1학기 모둠 활동에서 리더 역할을 자주 맡았다. 발표 준비 단계에서 김민준이 친구들의 의견을 조율하는 모습이 인상적이었고, 2학기에는 김민준에게 또래 멘토링을 권유하여 후배 지도에 참여하였다.',
  이서연:
    '이서연 학생은 글쓰기에 재능을 보였다. 교내 독서 토론에서 이서연이 제시한 근거가 설득력 있었으며, 이서연은 친구들과의 협업에서도 경청하는 태도가 돋보였다.',
  박도윤:
    '박도윤 학생은 수학·과학 탐구 활동에 흥미가 높다. 자유 탐구 주제로 박도윤이 직접 설계한 실험이 우수하였고, 박도윤에게 과학 동아리 부장을 맡겨 책임감을 길러 주었다.',
  최지우:
    '최지우 학생은 예술 분야에 소질이 있다. 학급 환경 미화에서 최지우의 디자인 감각이 발휘되었으며, 최지우는 어려운 친구를 먼저 돕는 배려심을 보였다.',
};

function buildNarrativeMarkdown() {
  let md = '# 2026학년도 3학년 2반 상담·관찰 기록 (테스트용 가짜 문서)\n\n';
  md += '> 본 문서의 모든 인적사항은 테스트용 가짜 데이터입니다.\n\n';
  for (const s of STUDENTS) {
    md += `## ${s.no}. ${s.name} (3학년 2반 ${s.no}번)\n\n`;
    md += `- 생년월일: ${s.birth}\n`;
    md += `- 연락처: ${s.phone}\n`;
    md += `- 주민등록번호: ${s.rrn}\n`;
    md += `- 이메일: ${s.email}\n`;
    md += `- 주소: ${s.address}\n`;
    md += `- 보호자 연락처: ${s.guardianPhone}\n`;
    md += `- 보호자 계좌: ${s.account}\n\n`;
    md += `${NOTE[s.name]}\n\n`;
  }
  return md;
}

function buildTableMarkdown() {
  let md = '# 3학년 2반 학생 명렬표 (테스트용 가짜 문서)\n\n';
  md += '| 번호 | 이름 | 생년월일 | 연락처 | 주민등록번호 | 주소 | 이메일 |\n';
  md += '| --- | --- | --- | --- | --- | --- | --- |\n';
  for (const s of STUDENTS) {
    md += `| ${s.no} | ${s.name} | ${s.birth} | ${s.phone} | ${s.rrn} | ${s.address} | ${s.email} |\n`;
  }
  return md;
}

/** 마크다운에서 표시용 평문 줄 추출 (헤딩/리스트 마커 제거) */
function toPlainLines(md) {
  return md
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,6}\s*/, '')
        .replace(/^>\s*/, '')
        .replace(/^-\s*/, '• '),
    )
    .filter((l) => !/^\|?\s*-{2,}/.test(l)); // 표 구분선 제거
}

// ── 1. HWPX (kordoc) ─────────────────────────────
async function genHwpx() {
  const narrative = await markdownToHwpx(buildNarrativeMarkdown());
  writeFileSync(join(OUT_DIR, '생기부-서술형.hwpx'), Buffer.from(narrative));
  const table = await markdownToHwpx(buildTableMarkdown());
  writeFileSync(join(OUT_DIR, '학생명렬표.hwpx'), Buffer.from(table));
  console.log('✓ HWPX 2개 생성');
}

// ── 2. XLSX (exceljs) ─────────────────────────────
async function genXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('명렬표');
  ws.columns = [
    { header: '번호', key: 'no', width: 6 },
    { header: '이름', key: 'name', width: 10 },
    { header: '생년월일', key: 'birth', width: 14 },
    { header: '연락처', key: 'phone', width: 16 },
    { header: '주민등록번호', key: 'rrn', width: 18 },
    { header: '주소', key: 'address', width: 44 },
    { header: '보호자연락처', key: 'guardianPhone', width: 16 },
    { header: '이메일', key: 'email', width: 28 },
    { header: '보호자계좌', key: 'account', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const s of STUDENTS) ws.addRow(s);
  await wb.xlsx.writeFile(join(OUT_DIR, '학생명렬표.xlsx'));
  console.log('✓ XLSX 1개 생성');
}

// ── 3. DOCX (jszip 최소 구조) ─────────────────────────────
function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function genDocx() {
  const lines = toPlainLines(buildNarrativeMarkdown());
  const paras = lines
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r></w:p>`)
    .join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(join(OUT_DIR, '생기부-서술형.docx'), buf);
  console.log('✓ DOCX 1개 생성');
}

// ── 4. PDF (pdf-lib + NotoSansKR) ─────────────────────────────
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
    console.log('⚠ 한글 폰트를 찾지 못해 PDF는 건너뜀');
    return;
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(fontPath), { subset: true });

  const lines = toPlainLines(buildNarrativeMarkdown()).filter((l) => l.trim().length > 0);
  const fontSize = 11;
  const margin = 50;
  const lineHeight = 18;
  const pageWidth = 595;
  const pageHeight = 842;
  const maxWidth = pageWidth - margin * 2;

  // 간단 줄바꿈(글자 단위 측정)
  function wrap(text) {
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
      page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }
  }
  const bytes = await pdf.save();
  writeFileSync(join(OUT_DIR, '생기부-서술형.pdf'), bytes);
  console.log('✓ PDF 1개 생성');
}

await genHwpx();
await genXlsx();
await genDocx();
await genPdf();
console.log(`\n완료 → ${OUT_DIR}`);
