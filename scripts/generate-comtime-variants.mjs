/**
 * 컴시간(Comsihan) 엑셀 실제 export 변형 시뮬레이션
 *
 * 현재 파서(src/infrastructure/export/ExcelExporter.ts)가 실패할 수 있는
 * 실제 컴시간 export의 다양한 패턴을 재현한다.
 *
 * 출력:
 *   test-data/comtime-01-with-title.xlsx       — 제목 행이 있는 케이스 (가장 흔함)
 *   test-data/comtime-02-day-full.xlsx         — "월요일" 전체 요일명
 *   test-data/comtime-03-merged-header.xlsx    — 병합된 제목/헤더
 *   test-data/comtime-04-no-prefix.xlsx        — "3-1\n수학" (과목 접두어 없음)
 *   test-data/comtime-05-teacher-name.xlsx     — "301\n수학(김영희)" 교사명 포함
 *   test-data/comtime-06-one-line.xlsx         — "3-1 수학" 한 줄 표기
 *   test-data/comtime-07-realistic-mix.xlsx    — 현실적인 혼합 (제목 + 다양한 셀)
 *   test-data/comtime-08-period-no-time.xlsx   — 교시에 시간 없이 "1교시"만
 *
 * 실행: node scripts/generate-comtime-variants.mjs
 */

import ExcelJS from 'exceljs';
import { mkdirSync } from 'fs';

const OUT = 'test-data';
mkdirSync(OUT, { recursive: true });

function headerStyle(cell) {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function titleStyle(cell) {
  cell.font = { bold: true, size: 14 };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function wrapCells(row, startCol = 2) {
  row.eachCell((cell, col) => {
    if (col >= startCol) {
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    }
  });
}

/* ══════════════════════════════════════════════════
   01. 제목 행이 있는 컴시간 (실제에서 가장 흔함)
   → 현재 감지는 row 2 col 1의 "1(08:40)"만 찾기 때문에 실패
   ══════════════════════════════════════════════════ */
async function variant01_withTitle() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  // 1행: 학교/교사 제목
  const title = ws.addRow(['○○고등학교 2026학년도 1학기 교사 시간표 (김영희)']);
  ws.mergeCells('A1:F1');
  titleStyle(title.getCell(1));

  // 2행: 빈 행 또는 구분선
  ws.addRow([]);

  // 3행: 요일 헤더
  const days = ['월(23)', '화(24)', '수(25)', '목(26)', '금(27)'];
  const hdr = ws.addRow(['', ...days]);
  hdr.eachCell(c => headerStyle(c));

  // 4행~: 교시 데이터
  const periods = [
    { label: '1(08:40)', data: ['',           '',           '',           '301\nJ_심국', '302\nI_언매'] },
    { label: '2(09:40)', data: ['302\nI_언매', '',           '',           '301\nG_언매', ''          ] },
    { label: '3(10:40)', data: ['',           '302\nI_언매', '',           '',            ''          ] },
    { label: '4(11:40)', data: ['',           '',           '301\nJ_심국', '304\n언매',   '301\nG_언매'] },
    { label: '5(12:40)', data: ['303\nI_언매', '',           '304\nG_언매', '',            ''          ] },
    { label: '6(13:40)', data: ['',           '301\nJ_심국', '',           '',            '303\n언매'  ] },
    { label: '7(14:30)', data: ['',           '',           '',           '',            ''          ] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-01-with-title.xlsx`);
  console.log('✅ comtime-01-with-title.xlsx  (제목 행 때문에 감지 실패 예상)');
}

/* ══════════════════════════════════════════════════
   02. 요일이 "월요일" 전체 표기
   → startsWith('월') 매칭은 되지만, 일부 시스템에서 "요일"만 또는
     "월(23/03)" 처럼 복잡한 헤더가 있을 수 있음
   ══════════════════════════════════════════════════ */
async function variant02_dayFull() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  const days = ['월요일', '화요일', '수요일', '목요일', '금요일'];
  const hdr = ws.addRow(['교시', ...days]);
  hdr.eachCell(c => headerStyle(c));

  const periods = [
    { label: '1(08:40)', data: ['302\nJ_언매', '', '', '301\nJ_심국', ''] },
    { label: '2(09:40)', data: ['', '302\nJ_언매', '', '', ''] },
    { label: '3(10:40)', data: ['', '', '303\nJ_언매', '', '304\nG_언매'] },
    { label: '4(11:40)', data: ['301\nJ_심국', '', '', '', ''] },
    { label: '5(12:40)', data: ['', '', '301\nJ_심국', '304\nJ_언매', ''] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-02-day-full.xlsx`);
  console.log('✅ comtime-02-day-full.xlsx  (요일 "월요일" 전체 표기)');
}

/* ══════════════════════════════════════════════════
   03. 병합된 제목 + 병합된 헤더 (실제 인쇄용 파일)
   ══════════════════════════════════════════════════ */
async function variant03_merged() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  // 병합된 큰 제목
  ws.mergeCells('A1:F2');
  const title = ws.getCell('A1');
  title.value = '2026학년도 1학기\n3학년 담임 김영희 시간표';
  title.font = { bold: true, size: 16 };
  title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // 빈 행
  ws.addRow([]);

  // 요일 헤더 (이전 병합 때문에 실제로는 4행에 위치)
  const hdr = ws.addRow(['교시', '월', '화', '수', '목', '금']);
  hdr.eachCell(c => headerStyle(c));

  const periods = [
    { label: '1(08:40)', data: ['', '', '', '301\nJ_심국', '302\nI_언매'] },
    { label: '2(09:40)', data: ['302\nI_언매', '', '', '301\nG_언매', ''] },
    { label: '3(10:40)', data: ['', '302\nI_언매', '', '', ''] },
    { label: '4(11:40)', data: ['', '', '301\nJ_심국', '304\n언매', '301\nG_언매'] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-03-merged-header.xlsx`);
  console.log('✅ comtime-03-merged-header.xlsx  (병합 셀 + 제목 행)');
}

/* ══════════════════════════════════════════════════
   04. 과목 접두어 없음 "3-1\n수학"
   → normalizeSubject는 통과하지만 학급 표기가 "3-1" 인 경우 OK
      다만 "301\n수학" 도 함께 시험해야 함
   ══════════════════════════════════════════════════ */
async function variant04_noPrefix() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  const hdr = ws.addRow(['', '월', '화', '수', '목', '금']);
  hdr.eachCell(c => headerStyle(c));

  const periods = [
    { label: '1(08:40)', data: ['', '', '', '3-1\n심국', '3-2\n언매'] },
    { label: '2(09:40)', data: ['3-2\n언매', '', '', '3-1\n언매', ''] },
    { label: '3(10:40)', data: ['', '3-2\n언매', '', '', ''] },
    { label: '4(11:40)', data: ['', '', '3-1\n심국', '3-4\n언매', '3-1\n언매'] },
    { label: '5(12:40)', data: ['3-3\n언매', '', '3-4\n언매', '', ''] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-04-no-prefix.xlsx`);
  console.log('✅ comtime-04-no-prefix.xlsx  (과목 접두어 "J_" 없음)');
}

/* ══════════════════════════════════════════════════
   05. 교사명 포함 "301\n수학(김영희)"
   ══════════════════════════════════════════════════ */
async function variant05_teacherName() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  const hdr = ws.addRow(['', '월', '화', '수', '목', '금']);
  hdr.eachCell(c => headerStyle(c));

  const periods = [
    { label: '1(08:40)', data: ['', '', '', '301\n심국(김영희)', '302\n언매(김영희)'] },
    { label: '2(09:40)', data: ['302\n언매(김영희)', '', '', '301\n언매(김영희)', ''] },
    { label: '3(10:40)', data: ['', '302\n언매(김영희)', '', '', ''] },
    { label: '4(11:40)', data: ['', '', '301\n심국(김영희)', '304\n언매(김영희)', ''] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 18;

  await wb.xlsx.writeFile(`${OUT}/comtime-05-teacher-name.xlsx`);
  console.log('✅ comtime-05-teacher-name.xlsx  (셀에 교사명 포함)');
}

/* ══════════════════════════════════════════════════
   06. 한 줄 표기 "3-1 수학"
   ══════════════════════════════════════════════════ */
async function variant06_oneLine() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  const hdr = ws.addRow(['', '월', '화', '수', '목', '금']);
  hdr.eachCell(c => headerStyle(c));

  const periods = [
    { label: '1(08:40)', data: ['', '', '', '3-1 심국', '3-2 언매'] },
    { label: '2(09:40)', data: ['3-2 언매', '', '', '3-1 언매', ''] },
    { label: '3(10:40)', data: ['', '3-2 언매', '', '', ''] },
    { label: '4(11:40)', data: ['', '', '3-1 심국', '3-4 언매', '3-1 언매'] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-06-one-line.xlsx`);
  console.log('✅ comtime-06-one-line.xlsx  ("3-1 수학" 한 줄, 줄바꿈 없음)');
}

/* ══════════════════════════════════════════════════
   07. 현실적인 혼합 — 제목 + 정보행 + 병합
   ══════════════════════════════════════════════════ */
async function variant07_realistic() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('김영희 시간표');

  // 1행: 병합된 제목
  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  title.value = '2026학년도 1학기 교사 개별 시간표';
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };

  // 2행: 교사 정보
  ws.mergeCells('A2:F2');
  const info = ws.getCell('A2');
  info.value = '교사: 김영희    담당: 국어    작성일: 2026-03-02';
  info.alignment = { horizontal: 'center' };

  // 3행: 빈
  ws.addRow([]);

  // 4행: 요일 헤더
  const hdr = ws.addRow(['교시', '월(03)', '화(04)', '수(05)', '목(06)', '금(07)']);
  hdr.eachCell(c => headerStyle(c));

  // 5행~: 데이터 (다양한 셀 형식 혼재)
  const periods = [
    { label: '1(08:40)', data: ['',           '',           '',           '301\nJ_심국', '3-2\n언매'    ] },
    { label: '2(09:40)', data: ['3-2 언매',   '',           '',           '301\nG_언매', ''             ] },
    { label: '3(10:40)', data: ['',           '302\nI_언매', '',           '',            ''             ] },
    { label: '4(11:40)', data: ['',           '',           '301\n심국',   '304\n언매',   '301\nG_언매'   ] },
    { label: '5(12:40)', data: ['303\nJ_언매', '',           '304\nG_언매', '',            ''             ] },
    { label: '6(13:40)', data: ['',           '301\n심국',   '',           '',            '303\n언매'    ] },
    { label: '7(14:30)', data: ['',           '',           '',           '',            ''             ] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-07-realistic-mix.xlsx`);
  console.log('✅ comtime-07-realistic-mix.xlsx  (제목+정보+다양한 셀 혼합)');
}

/* ══════════════════════════════════════════════════
   08. 교시에 시간 없이 "1교시" 또는 숫자만
   → 감지 regex (\d+\(\d{2}:\d{2}\)) 가 매칭 안 됨 → 쌤핀 포맷으로 폴백
      하지만 셀에 "301\nJ_심국" 같은 컴시간 셀 형식이면 parseTeacherCell은 통과
   ══════════════════════════════════════════════════ */
async function variant08_periodNoTime() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  const hdr = ws.addRow(['교시', '월', '화', '수', '목', '금']);
  hdr.eachCell(c => headerStyle(c));

  const periods = [
    { label: '1교시', data: ['', '', '', '301\nJ_심국', '302\nI_언매'] },
    { label: '2교시', data: ['302\nI_언매', '', '', '301\nG_언매', ''] },
    { label: '3교시', data: ['', '302\nI_언매', '', '', ''] },
    { label: '4교시', data: ['', '', '301\nJ_심국', '304\n언매', '301\nG_언매'] },
    { label: '5교시', data: ['303\nI_언매', '', '304\nG_언매', '', ''] },
  ];

  for (const p of periods) {
    const row = ws.addRow([p.label, ...p.data]);
    wrapCells(row);
  }

  ws.getColumn(1).width = 10;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  await wb.xlsx.writeFile(`${OUT}/comtime-08-period-no-time.xlsx`);
  console.log('✅ comtime-08-period-no-time.xlsx  (교시에 시간 없이 "1교시"만)');
}

/* ══════════════════════════════════════════════════
   실행
   ══════════════════════════════════════════════════ */
async function main() {
  console.log('\n🔬 컴시간 양식 변형 테스트 파일 생성\n');
  await variant01_withTitle();
  await variant02_dayFull();
  await variant03_merged();
  await variant04_noPrefix();
  await variant05_teacherName();
  await variant06_oneLine();
  await variant07_realistic();
  await variant08_periodNoTime();
  console.log('\n✨ 완료! 생성된 파일:\n  test-data/comtime-01 ~ 08-*.xlsx\n');
  console.log('📋 테스트 방법:');
  console.log('  1. npm run dev 또는 npm run electron:dev 실행');
  console.log('  2. 시간표 페이지 → 엑셀 업로드 → 각 파일 시도');
  console.log('  3. 어떤 파일이 "양식을 확인하세요" 에러를 내는지 기록\n');
}

main().catch(err => { console.error(err); process.exit(1); });
