/**
 * 교사 시간표 엑셀 업로드 테스트용 목업 파일 생성
 *
 * 생성 파일:
 *   test-data/teacher-ssampin.xlsx   — 쌤핀 양식
 *   test-data/teacher-comtime.xlsx   — 컴시간 양식
 *   test-data/teacher-empty.xlsx     — 빈 양식 (공강만)
 */

import ExcelJS from 'exceljs';
import { mkdirSync } from 'fs';

const OUT = 'test-data';
mkdirSync(OUT, { recursive: true });

/* ── 공통 스타일 ── */
function headerStyle(cell) {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

/* ══════════════════════════════════════
   1. 쌤핀 양식 (기본)
   ══════════════════════════════════════ */
async function genSsampin() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('교사 시간표');

  const days = ['월', '화', '수', '목', '금'];
  const hdr = ws.addRow(['교시', ...days]);
  hdr.eachCell(c => headerStyle(c));
  ws.getColumn(1).width = 8;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 16;

  // 7교시 시간표 데이터 — "학반 과목" 형태
  const data = [
    //  월          화          수          목          금
    ['302 언매',  '301 심국',  '',         '301 심국',  '302 언매'],
    ['',          '',          '303 언매',  '',          '301 언매'],
    ['304 언매',  '',          '',          '302 언매',  ''        ],
    ['',          '301 심국',  '304 언매',  '',          ''        ],
    ['',          '',          '',          '303 언매',  ''        ],
    ['',          '',          '301 심국',  '',          '304 언매'],
    ['',          '',          '',          '',          ''        ],
  ];

  data.forEach((row, i) => {
    ws.addRow([i + 1, ...row]);
  });

  await wb.xlsx.writeFile(`${OUT}/teacher-ssampin.xlsx`);
  console.log('✅ teacher-ssampin.xlsx');
}

/* ══════════════════════════════════════
   2. 컴시간 양식
   ══════════════════════════════════════ */
async function genComtime() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('시간표');

  const days = ['월(23)', '화(24)', '수(25)', '목(26)', '금(27)'];
  const hdr = ws.addRow(['', ...days]);
  hdr.eachCell(c => headerStyle(c));
  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 14;

  // 컴시간 특징: 1열에 "교시(시간)", 셀에 줄바꿈으로 학반+과목
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
    // 줄바꿈이 엑셀에서 보이도록 wrapText
    row.eachCell((cell, col) => {
      if (col > 1) cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    });
  }

  await wb.xlsx.writeFile(`${OUT}/teacher-comtime.xlsx`);
  console.log('✅ teacher-comtime.xlsx');
}

/* ══════════════════════════════════════
   3. 빈 양식 (공강만, edge case 테스트)
   ══════════════════════════════════════ */
async function genEmpty() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('교사 시간표');

  const days = ['월', '화', '수', '목', '금'];
  const hdr = ws.addRow(['교시', ...days]);
  hdr.eachCell(c => headerStyle(c));

  for (let p = 1; p <= 7; p++) {
    ws.addRow([p, '', '', '', '', '']);
  }

  await wb.xlsx.writeFile(`${OUT}/teacher-empty.xlsx`);
  console.log('✅ teacher-empty.xlsx');
}

/* ══════════════════════════════════════
   4. 기존 내보내기 형식 ("과목 (학급)")
   ══════════════════════════════════════ */
async function genExportFormat() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('교사 시간표');

  const days = ['월', '화', '수', '목', '금'];
  const hdr = ws.addRow(['교시', ...days]);
  hdr.eachCell(c => headerStyle(c));
  ws.getColumn(1).width = 8;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 18;

  const data = [
    ['언매 (3-2)',  '심국 (3-1)',  '',            '심국 (3-1)',  '언매 (3-2)'],
    ['',            '',            '언매 (3-3)',   '',            '언매 (3-1)'],
    ['언매 (3-4)',  '',            '',            '언매 (3-2)',   ''          ],
    ['',            '심국 (3-1)',  '언매 (3-4)',   '',            ''          ],
    ['',            '',            '',            '언매 (3-3)',   ''          ],
    ['',            '',            '심국 (3-1)',   '',            '언매 (3-4)'],
    ['',            '',            '',            '',             ''          ],
  ];

  data.forEach((row, i) => {
    ws.addRow([`${i + 1}교시`, ...row]);
  });

  await wb.xlsx.writeFile(`${OUT}/teacher-export-format.xlsx`);
  console.log('✅ teacher-export-format.xlsx');
}

/* ══════════════════════════════════════
   5. 토요수업 포함
   ══════════════════════════════════════ */
async function genWithSaturday() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('교사 시간표');

  const days = ['월', '화', '수', '목', '금', '토'];
  const hdr = ws.addRow(['교시', ...days]);
  hdr.eachCell(c => headerStyle(c));

  const data = [
    ['302 언매', '301 심국', '',         '301 심국', '302 언매', '301 언매'],
    ['',         '',         '303 언매', '',          '',         '302 심국'],
    ['304 언매', '',         '',         '302 언매',  '',         ''        ],
    ['',         '301 심국', '304 언매', '',          '',         ''        ],
  ];

  data.forEach((row, i) => {
    ws.addRow([i + 1, ...row]);
  });

  await wb.xlsx.writeFile(`${OUT}/teacher-saturday.xlsx`);
  console.log('✅ teacher-saturday.xlsx');
}

// ── 실행 ──
await genSsampin();
await genComtime();
await genEmpty();
await genExportFormat();
await genWithSaturday();

console.log('\n🎉 모든 테스트 파일 생성 완료! → test-data/ 폴더 확인');
