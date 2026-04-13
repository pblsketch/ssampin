/**
 * 수정된 파서 로직을 inline으로 재구현하여 생성된 테스트 파일들을 검증.
 * (실제 소스와 동일한 알고리즘 — 빠른 sanity check용)
 */
import ExcelJS from 'exceljs';

const DAY_TOKENS = ['월', '화', '수', '목', '금', '토'];

function findHeaderRow(ws) {
  const maxScan = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const found = new Set();
    row.eachCell({ includeEmpty: false }, (cell) => {
      const val = String(cell.value ?? '').trim();
      if (!val) return;
      for (const d of DAY_TOKENS) {
        if (val === d || val.startsWith(d) || val === `${d}요일`) found.add(d);
      }
    });
    if (found.size >= 2) return r;
  }
  return -1;
}

function detectComTime(ws, headerRow) {
  const cell = String(ws.getRow(headerRow + 1).getCell(1).value ?? '');
  return /^\d+\s*\(\d{1,2}:\d{2}\)/.test(cell);
}

function buildDayColMap(ws, headerRow) {
  const map = {};
  ws.getRow(headerRow).eachCell((cell, colNumber) => {
    const val = String(cell.value ?? '').trim();
    for (const d of DAY_TOKENS) {
      if ((val === d || val === `${d}요일` || val.startsWith(d)) && !(d in map)) {
        map[d] = colNumber;
      }
    }
  });
  return map;
}

function extractText(cellValue) {
  if (typeof cellValue === 'object' && cellValue !== null && 'richText' in cellValue) {
    return cellValue.richText.map(r => r.text).join('');
  }
  return String(cellValue ?? '').trim();
}

function normalizeClassroom(raw) {
  const t = raw.trim();
  if (/^\d+-\d+$/.test(t)) return t;
  if (/^\d{3}$/.test(t)) return `${t[0]}-${parseInt(t.substring(1), 10)}`;
  return t;
}

function normalizeSubject(raw) {
  const t = raw.trim();
  const m = t.match(/^[A-Z]_(.+)$/i);
  return m ? m[1] : t;
}

function parseCell(text) {
  const trimmed = text.trim();
  const exp = trimmed.match(/^(.+?)\s*\((.+?)\)$/);
  if (exp) {
    const subj = exp[1].trim();
    if (subj) return { classroom: normalizeClassroom(exp[2].trim()), subject: subj };
  }
  const lines = trimmed.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { classroom: normalizeClassroom(lines[0]), subject: normalizeSubject(lines[1]) };
  }
  if (lines.length === 1) {
    const m = lines[0].match(/^(\d{3}|\d+-\d+)\s+(.+)$/);
    if (m) return { classroom: normalizeClassroom(m[1]), subject: normalizeSubject(m[2]) };
  }
  return null;
}

function parseAny(ws, headerRow) {
  const dayMap = buildDayColMap(ws, headerRow);
  const days = DAY_TOKENS.filter(d => d in dayMap);
  const data = {};
  for (const d of days) data[d] = [];

  const isComtime = detectComTime(ws, headerRow);

  ws.eachRow((row, rn) => {
    if (rn <= headerRow) return;
    const raw = String(row.getCell(1).value ?? '');
    let period;
    if (isComtime) {
      const m = raw.match(/^(\d+)/);
      if (!m) return;
      period = parseInt(m[1], 10);
    } else {
      const s = raw.replace('교시', '').trim();
      const n = parseInt(s, 10);
      if (isNaN(n) || n <= 0) return;
      period = n;
    }
    const idx = period - 1;
    for (const d of days) {
      const text = extractText(row.getCell(dayMap[d]).value);
      while (data[d].length <= idx) data[d].push(null);
      if (!text) data[d][idx] = null;
      else {
        const p = parseCell(text);
        data[d][idx] = p;
      }
    }
  });
  return { data, days, isComtime, dayMap };
}

async function test(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(`test-data/${file}`);
  const ws = wb.worksheets[0];
  const hr = findHeaderRow(ws);
  if (hr === -1) {
    console.log(`❌ ${file}  — 헤더 행 찾기 실패`);
    return;
  }
  const { data, days, isComtime } = parseAny(ws, hr);
  const total = Object.values(data).flat().filter(c => c !== null).length;
  const status = total > 0 ? '✅' : '❌';
  const kind = isComtime ? '컴시간' : '쌤핀';
  console.log(`${status} ${file}  (headerRow=${hr}, ${kind}, 요일=${days.length}, 유효셀=${total})`);
}

const files = [
  'comtime-01-with-title.xlsx',
  'comtime-02-day-full.xlsx',
  'comtime-03-merged-header.xlsx',
  'comtime-04-no-prefix.xlsx',
  'comtime-05-teacher-name.xlsx',
  'comtime-06-one-line.xlsx',
  'comtime-07-realistic-mix.xlsx',
  'comtime-08-period-no-time.xlsx',
  'teacher-ssampin.xlsx',
  'teacher-comtime.xlsx',
  'teacher-export-format.xlsx',
];

console.log('\n🔬 수정된 파서 동작 검증\n');
for (const f of files) {
  try { await test(f); } catch (e) { console.log(`💥 ${f}: ${e.message}`); }
}
console.log();
