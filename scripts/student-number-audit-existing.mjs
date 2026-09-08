#!/usr/bin/env node
/**
 * 이미 저장된 과제·설문의 학생 번호를 **읽기만 해서** 점검한다.
 *
 * 배경(2026-09-08 학생 번호 무결성 수정): 새로 만드는 과제·설문은 이제 명렬표의 실제 출석번호를
 * 쓴다. 하지만 **이미 만들어 둔 과제·설문은 만들 당시의 번호를 그대로 갖고 있다.** 그 번호가
 * 실제 학번과 어긋나 있는지 알려면 대조가 필요하다.
 *
 * ★이 스크립트는 **아무것도 고치지 않는다.** 파일을 열어 읽고 표만 찍는다.
 *   과거 기록을 현재 명단 번호로 덮어쓰는 자동 복구는 하지 않는다 — 그 사이 명렬표가 바뀌었으면
 *   멀쩡한 기록을 망가뜨린다. 무엇이 어긋났는지 보여 주고 판단은 선생님께 맡긴다.
 *
 * 쓰는 법:
 *   node scripts/student-number-audit-existing.mjs "<쌤핀 데이터 폴더>"
 *
 * 데이터 폴더는 쌤핀 설정 > 데이터 위치에서 확인할 수 있고, 보통 아래 경로의 `data` 폴더다.
 *   Windows  %APPDATA%\ssampin\data
 *   macOS    ~/Library/Application Support/ssampin/data
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('쓰는 법: node scripts/student-number-audit-existing.mjs "<쌤핀 데이터 폴더>"');
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  console.error(`폴더를 찾을 수 없습니다: ${dir}`);
  process.exit(2);
}

/** 파일 하나를 읽어 JSON 으로. 없거나 깨졌으면 null — 여기서 멈추지 않는다. */
function readJson(name) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`! ${name}.json 을 읽지 못했습니다 (${err.message})`);
    return null;
  }
}

function isActive(s) {
  if (s.status !== undefined) return s.status === 'active';
  return !s.isVacant;
}

const students = readJson('students') ?? [];
const assignmentsData = readJson('assignments');
const surveysData = readJson('surveys');

const assignments = Array.isArray(assignmentsData)
  ? assignmentsData
  : (assignmentsData?.assignments ?? []);
const surveys = Array.isArray(surveysData) ? surveysData : (surveysData?.surveys ?? []);

console.log(`데이터 폴더: ${dir}`);
console.log(`담임 명렬표 ${students.length}명 (재학 ${students.filter(isActive).length}명)`);
console.log(`과제 ${assignments.length}건 · 설문 ${surveys.length}건`);
console.log('─'.repeat(72));

const byId = new Map(students.map((s) => [s.id, s]));
let mismatchedAssignments = 0;
let unknownStudents = 0;

for (const a of assignments) {
  const target = a.target;
  if (!target || target.type !== 'class') continue; // 담임반 과제만 — 수업반은 원래 실제 번호를 썼다
  const rows = [];
  for (const entry of target.students ?? []) {
    const real = byId.get(entry.id);
    if (!real) {
      rows.push({ kind: 'unknown', entry });
      continue;
    }
    const realNumber = real.studentNumber;
    if (typeof realNumber === 'number' && realNumber > 0 && realNumber !== entry.number) {
      rows.push({ kind: 'shifted', entry, real, realNumber });
    }
  }
  if (rows.length === 0) continue;
  mismatchedAssignments += 1;
  console.log(`\n[과제] ${a.title}  (만든 날 ${String(a.createdAt).slice(0, 10)})`);
  for (const r of rows) {
    if (r.kind === 'unknown') {
      unknownStudents += 1;
      console.log(
        `  ? ${r.entry.number}번 ${r.entry.name} — 지금 명렬표에 없는 학생입니다(전출 후 삭제 등). 확인만 하고 두세요.`,
      );
    } else {
      console.log(`  ! ${r.entry.number}번 ${r.entry.name} — 실제 학번은 ${r.realNumber}번입니다`);
    }
  }
}

let mismatchedSurveys = 0;
const activeNumbers = students
  .filter(isActive)
  .map((s) => s.studentNumber)
  .filter((n) => typeof n === 'number' && n > 0)
  .sort((x, y) => x - y);

for (const s of surveys) {
  if (s.mode !== 'student') continue; // 학생 응답 모드만 번호 목록을 쓴다
  if (s.classId) continue; // 수업반 설문은 그 반 명단을 봐야 한다 — 여기서는 담임 설문만 본다
  if (Array.isArray(s.targetNumbers) && s.targetNumbers.length > 0) continue; // 이미 새 방식
  const count = s.targetCount ?? 0;
  const old = Array.from({ length: count }, (_, i) => i + 1);
  const missing = activeNumbers.filter((n) => !old.includes(n));
  const extra = old.filter((n) => !activeNumbers.includes(n));
  if (missing.length === 0 && extra.length === 0) continue;
  mismatchedSurveys += 1;
  console.log(`\n[설문] ${s.title}  (만든 날 ${String(s.createdAt).slice(0, 10)})`);
  if (missing.length > 0) {
    console.log(`  ! 응답할 수 없는 재학생 번호: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.log(`  ! 재학생이 없는데 열려 있는 번호: ${extra.join(', ')}`);
  }
}

console.log('\n' + '─'.repeat(72));
console.log(`번호가 어긋난 담임반 과제: ${mismatchedAssignments}건`);
console.log(`지금 명렬표에서 찾을 수 없는 과제 명단 학생: ${unknownStudents}명`);
console.log(`번호 목록이 어긋난 담임 학생응답 설문: ${mismatchedSurveys}건`);
console.log(
  '\n이 스크립트는 아무것도 고치지 않았습니다. 어긋난 과제·설문은 새로 만들어 링크를 다시 나눠 주세요.\n' +
    '이미 받은 제출물·응답과 드라이브 파일은 그대로 남습니다.',
);
