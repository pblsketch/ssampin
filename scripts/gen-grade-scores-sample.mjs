/**
 * 가상 지필 점수 엑셀(.xlsx) 생성기 — 수업 관리 > 성적 '엑셀로 점수 가져오기' 테스트용.
 *
 * gradeImportRules.autoDetectColumns 가 인식하는 형식:
 *   헤더행에 (번호 또는 이름) + 점수 열 → 그 아래 데이터행.
 *   번호/이름은 정확 일치 별칭, 점수는 부분 일치(원점수/득점 등).
 * 가져오기는 번호 또는 이름으로 명단 학생과 매칭한다.
 *
 * 2-1반 명단(사용자 제공) 기준. 번호 7(자퇴)은 비활성이라 점수 파일에서 제외한다.
 * 전부 가상 데이터(실제 인물 아님). 실행: node scripts/gen-grade-scores-sample.mjs
 */
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'sample-scores');

// 2-1반 활성 학생(번호 7 자퇴 제외). [번호, 이름]
const ROSTER = [
  [1, '김민지'],
  [2, '이서연'],
  [3, '박지민'],
  [4, '최예은'],
  [5, '정수빈'],
  [6, '강민수'],
  [8, '윤서준'],
  [9, '장민혁'],
  [10, '임도윤'],
  [11, '한지우'],
  [12, '송예준'],
  [13, '오시우'],
  [14, '서준우'],
  [15, '신은우'],
  [16, '백승우'],
  [17, '권진우'],
  [18, '황지호'],
  [19, '안민재'],
  [20, '유건우'],
  [21, '홍성현'],
  [22, '전민성'],
  [23, '고우진'],
  [24, '나윤호'],
  [25, '문하준'],
];

// 학생별 기본 실력(가상, 50~97). 인덱스로 결정론적 생성.
function baseAbility(i) {
  // 50~97 사이에서 퍼지게: 톱니 + 약한 추세
  const v = 50 + ((i * 37 + 13) % 48); // 50~97
  return v;
}

/** 시험별 점수 = 기본 실력 + 시험 보정 + jitter, 0~100 정수 클램프. */
function examScore(i, examOffset, jitterSeed) {
  const base = baseAbility(i);
  const jitter = ((i * jitterSeed + examOffset) % 9) - 4; // -4~+4
  return Math.min(100, Math.max(0, Math.round(base + examOffset + jitter)));
}

async function makeFile(fileName, sheetName, examOffset, jitterSeed) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  // 1행: 제목(가져오기에는 영향 없음 — autoDetect 가 헤더행을 따로 찾음)
  ws.addRow([`2학년 1반 ${sheetName} 성적표 (가상)`]);
  // 2행: 헤더 (소속은 무시됨 / 번호·이름·원점수 인식)
  ws.addRow(['소속', '번호', '이름', '원점수']);
  // 3행~: 학생 점수
  for (let i = 0; i < ROSTER.length; i += 1) {
    const [num, name] = ROSTER[i];
    ws.addRow(['2-1', num, name, examScore(i, examOffset, jitterSeed)]);
  }

  ws.columns.forEach((col, idx) => {
    col.width = idx === 2 ? 14 : 10;
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, fileName);
  await wb.xlsx.writeFile(out);
  return out;
}

async function main() {
  const f1 = await makeFile('2-1-1회고사-점수.xlsx', '1회고사', 0, 7);
  const f2 = await makeFile('2-1-2회고사-점수.xlsx', '2회고사', 4, 11); // 2회고사는 평균 약간 상승
  console.log('생성 완료:');
  console.log(' -', f1);
  console.log(' -', f2);
  console.log(`학생 ${ROSTER.length}명 (번호 7 자퇴 제외)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
