/**
 * 가상 NEIS 전과목 성적 일람표(.xlsx) 생성기 — 담임 '학급 성적' 기능 테스트용.
 *
 * NeisTranscriptExcelParser 가 인식하는 레이아웃에 정확히 맞춘다:
 *   1행 제목("2026학년도 1학기 …" → 학기 자동 감지)
 *   2행 과목명(각 과목 블록 첫 칸만 채움 → carrySubjects 가 carry-forward)
 *   3행 세부 헤더(번호·성명 + 과목별 4열)
 *   4행~ 학생 데이터(결합 셀 형식 "92/70.5(11.2)", "A(250)", "15/1")
 *
 * 학생 개인정보가 아니라 전부 가상 데이터다(실제 인물 아님).
 * 실행: node scripts/gen-transcript-sample.mjs
 */
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'sample-transcript');
const OUT_FILE = path.join(OUT_DIR, '학급-전과목-성적-샘플.xlsx');

// 과목: 고1 1학기(9등급제 가정 — 석차등급 1~9). 과목평균·표준편차는 과목별 고정.
const SUBJECTS = [
  { name: '국어', mean: 72.5, sd: 12.4 },
  { name: '수학', mean: 64.8, sd: 15.1 },
  { name: '영어', mean: 70.2, sd: 13.0 },
  { name: '한국사', mean: 75.6, sd: 11.2 },
  { name: '통합사회', mean: 73.1, sd: 10.8 },
  { name: '통합과학', mean: 67.4, sd: 13.7 },
];
const TOTAL_STUDENTS = 248; // 수강자수(학년 전체)

// 가상 학생 12명 + 과목별 원점수(0~100). 일부러 D·E·등급경계를 섞었다.
// 각 행: [이름, 국어, 수학, 영어, 한국사, 통합사회, 통합과학]
const STUDENTS = [
  ['김서준', 95, 92, 90, 98, 94, 88],
  ['이도윤', 88, 76, 84, 90, 86, 72],
  ['박지호', 72, 58, 69, 80, 74, 61],
  ['최예린', 90, 95, 93, 96, 91, 97],
  ['정하준', 64, 45, 58, 72, 66, 52], // 수학 E, 통합과학 D
  ['강민서', 81, 70, 77, 85, 83, 74],
  ['윤채원', 77, 83, 80, 79, 76, 85],
  ['장우진', 59, 52, 63, 68, 61, 49], // 국어 E, 통합과학 E
  ['임수아', 86, 89, 91, 88, 90, 84],
  ['한지안', 70, 66, 68, 74, 72, 60], // 등급 경계 다수
  ['오서윤', 93, 98, 88, 94, 89, 92],
  ['신준호', 55, 41, 50, 63, 58, 44], // 전반 하위(D·E)
];

/** 원점수 → 성취도(A~E). */
function achievementOf(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

/** 원점수 → 9등급 석차등급(대략적 절대 구간 — 가상 데이터용). */
function rankGradeOf(score) {
  if (score >= 96) return 1;
  if (score >= 89) return 2;
  if (score >= 83) return 3;
  if (score >= 76) return 4;
  if (score >= 68) return 5;
  if (score >= 60) return 6;
  if (score >= 50) return 7;
  if (score >= 40) return 8;
  return 9;
}

/** 원점수 → 석차(1~수강자수, 점수 높을수록 앞). 과목별 약간의 jitter. */
function rankOf(score, subjIdx) {
  const frac = (100 - score) / 100; // 0(만점)~1
  const base = Math.round(frac * (TOTAL_STUDENTS - 1)) + 1;
  const jitter = ((subjIdx * 7 + score) % 5) - 2; // -2~+2 결정론적
  return Math.min(TOTAL_STUDENTS, Math.max(1, base + jitter));
}

/** 동석차수: 대부분 1, 일부 동점 2~3(등급 경계 인원 테스트용). */
function tieOf(score, subjIdx) {
  if (score % 2 === 0 && subjIdx % 3 === 0) return 2;
  if (score === 70 || score === 68) return 3;
  return 1;
}

function buildScoreCell(score, mean, sd) {
  return `${score}/${mean.toFixed(1)}(${sd.toFixed(1)})`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('1학년 3반');

  // 1행: 제목 (학기 자동 감지 대상)
  ws.addRow(['2026학년도 1학기 전과목 성적 일람표 (1학년 3반)']);

  // 2행: 과목명 (각 과목 블록의 첫 칸에만 표기 → carry-forward)
  const subjectHeader = ['', ''];
  for (const subj of SUBJECTS) {
    subjectHeader.push(subj.name, '', '', '');
  }
  ws.addRow(subjectHeader);

  // 3행: 세부 헤더
  // ⚠️ 헤더 "원점수/과목평균(표준편차)" 는 파서가 '표준편차' 열로 오인(fieldOf 우선순위).
  //   → 헤더는 "원점수" 로 두고, 평균·편차는 결합 셀 값 "95/72.5(12.4)" 에서 분해되게 한다.
  const detailHeader = ['번호', '성명'];
  for (const _subj of SUBJECTS) {
    detailHeader.push('원점수', '성취도(수강자수)', '석차(동석차수)', '석차등급');
  }
  ws.addRow(detailHeader);

  // 4행~: 학생 데이터
  STUDENTS.forEach(([name, ...scores], i) => {
    const row = [i + 1, name];
    scores.forEach((score, subjIdx) => {
      const subj = SUBJECTS[subjIdx];
      row.push(
        buildScoreCell(score, subj.mean, subj.sd),
        `${achievementOf(score)}(${TOTAL_STUDENTS})`,
        `${rankOf(score, subjIdx)}/${tieOf(score, subjIdx)}`,
        rankGradeOf(score),
      );
    });
    ws.addRow(row);
  });

  // 보기 좋게 열 너비
  ws.columns.forEach((col, idx) => {
    col.width = idx < 2 ? 8 : 20;
  });

  mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log('생성 완료:', OUT_FILE);
  console.log(`학생 ${STUDENTS.length}명 · 과목 ${SUBJECTS.length}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
