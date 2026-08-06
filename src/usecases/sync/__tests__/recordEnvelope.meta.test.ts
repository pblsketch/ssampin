/**
 * recordEnvelope.meta.test.ts — 병합 3도메인 봉투 재조립 금지 메타 가드 (S2.2, r2 NEW-5로 S1.6에서 이동)
 *
 * 계획: docs/01-plan/features/school-year-archive.plan.md §4 S2.2 AC-10 · ADR-034 선결 검증 ①
 *
 * 목적: 병합 3도메인(attendance/observations/student-records)의 봉투(`{records: ...}`)를
 * build* 3함수 밖에서 재조립하는 새 저장 경로를 기계로 차단한다. 우회 경로가 하나라도
 * 생기면 그 경로의 레코드에는 term 스탬프가 안 붙고, 툼스톤(deleted)이 통째로 떨어진다.
 *
 * 경계 설계(정규식으로 "객체 리터럴"을 직접 잡는 대신 저장 표면을 봉쇄):
 *  ① 저장 API(.saveAttendance/.saveObservations/.saveRecords) 호출 파일 = 화이트리스트 고정.
 *     새 파일이 저장 API를 부르면 즉시 실패 — 봉투를 어떻게 만들었든 우회 저장 자체가 불가.
 *  ② storage.write('attendance'|'observations'|'student-records') 리터럴 직접 쓰기 =
 *     Json 리포지토리 3파일만. (SyncFromCloud는 mergeAndWriteLocked가 변수 filename으로
 *     쓰는 정본 병합 지점 — 병합 3함수의 봉투 조립은 계획이 명시한 6편집의 나머지 3이다.)
 *  ③ 화이트리스트 안에서도 저장 호출 수 == build* 경유 수를 강제(내부 우회 차단) +
 *     build* 3함수의 term 스탬프(withDerivedTerm) 존재를 긍정형으로 고정.
 *  ④ 유일한 build* 비경유 예외(MigrateStudentRecordsSubcatToTags — 레코드 무신설·additive
 *     정규화·봉투 spread 승계)는 형태 그대로 고정 — 예외가 늘거나 변형되면 실패.
 *
 *  ⚠️ teaching-classes 봉투(`{classes: ...}`)는 대상이 아니다 — 통파일 도메인은 epoch가
 *  막을 것이 없고, ManageTeachingClasses.reorder가 정당한 봉투 리터럴을 갖는다(r2 NEW-5).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SRC_DIR = resolve(REPO_ROOT, 'src');

/** ① 저장 API dot-호출이 허용된 파일 (비테스트 src 전체 스캔 대상) */
const SAVE_API_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  saveAttendance: ['src/usecases/classManagement/ManageAttendance.ts'],
  saveObservations: ['src/usecases/classManagement/ManageObservations.ts'],
  saveRecords: [
    'src/usecases/studentRecords/ManageStudentRecords.ts',
    // 유일한 build* 비경유 예외 — 아래 ④에서 형태를 고정한다.
    'src/usecases/studentRecords/MigrateStudentRecordsSubcatToTags.ts',
  ],
};

/** ② 병합 3도메인 파일명 리터럴로 storage.write가 허용된 파일 */
const STORAGE_WRITE_ALLOWED: readonly string[] = [
  'src/adapters/repositories/JsonTeachingClassRepository.ts', // attendance
  'src/adapters/repositories/JsonObservationRepository.ts', // observations
  'src/adapters/repositories/JsonStudentRecordsRepository.ts', // student-records
];

/** ③ 저장 chokepoint 3함수와 그 소유 파일 */
const BUILD_CHOKEPOINTS: readonly {
  readonly file: string;
  readonly buildFn: string;
  readonly saveApi: string;
}[] = [
  {
    file: 'src/usecases/classManagement/ManageAttendance.ts',
    buildFn: 'buildAttendanceSaveData',
    saveApi: 'saveAttendance',
  },
  {
    file: 'src/usecases/classManagement/ManageObservations.ts',
    buildFn: 'buildObservationSaveData',
    saveApi: 'saveObservations',
  },
  {
    file: 'src/usecases/studentRecords/ManageStudentRecords.ts',
    buildFn: 'buildStudentRecordsSaveData',
    saveApi: 'saveRecords',
  },
];

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function isTestFile(posixPath: string): boolean {
  return (
    posixPath.includes('/__tests__/') ||
    posixPath.endsWith('.test.ts') ||
    posixPath.endsWith('.test.tsx') ||
    posixPath.endsWith('.spec.ts') ||
    posixPath.endsWith('.spec.tsx')
  );
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walkTsFiles(full, out);
    } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

function nonTestSrcFiles(): { rel: string; content: string }[] {
  return walkTsFiles(SRC_DIR)
    .map((f) => toPosix(relative(REPO_ROOT, f)))
    .filter((rel) => !isTestFile(rel))
    .map((rel) => ({ rel, content: readFileSync(resolve(REPO_ROOT, rel), 'utf-8') }));
}

function countMatches(content: string, re: RegExp): number {
  return content.match(re)?.length ?? 0;
}

describe('병합 3도메인 봉투 재조립 금지 (메타 테스트 — S2.2)', () => {
  const files = nonTestSrcFiles();

  it('① 저장 API 호출은 화이트리스트 파일에서만 일어난다', () => {
    const violations: string[] = [];
    for (const [api, allowed] of Object.entries(SAVE_API_ALLOWED)) {
      const callRe = new RegExp(`\\.\\s*${api}\\s*\\(`);
      for (const { rel, content } of files) {
        if (!callRe.test(content)) continue;
        if (!allowed.includes(rel)) {
          violations.push(`${rel} → .${api}( 호출`);
        }
      }
    }
    expect(
      violations,
      `병합 3도메인 저장 API를 화이트리스트 밖에서 호출합니다. 새 저장 경로는 반드시 ` +
        `해당 도메인의 build*SaveData chokepoint(Manage* 유즈케이스)를 경유해야 합니다 — ` +
        `우회하면 term 스탬프가 안 붙고 툼스톤이 통째로 떨어집니다:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it("② storage.write('attendance'|'observations'|'student-records') 리터럴 직접 쓰기는 Json 리포지토리 3파일만", () => {
    const writeRe =
      /\.\s*write(?:<[^>\n]*>)?\s*\(\s*['"](attendance|observations|student-records)['"]/;
    const violations: string[] = [];
    for (const { rel, content } of files) {
      if (!writeRe.test(content)) continue;
      if (!STORAGE_WRITE_ALLOWED.includes(rel)) violations.push(rel);
    }
    expect(
      violations,
      `병합 3도메인 파일을 리포지토리 밖에서 직접 씁니다(봉투 재조립 우회):\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('③ chokepoint 파일 안에서도 저장 호출 수 == build* 경유 수 (내부 우회 차단)', () => {
    for (const { file, buildFn, saveApi } of BUILD_CHOKEPOINTS) {
      const content = readFileSync(resolve(REPO_ROOT, file), 'utf-8');
      const saveCalls = countMatches(content, new RegExp(`\\.\\s*${saveApi}\\s*\\(`, 'g'));
      const buildRefs = countMatches(content, new RegExp(`${buildFn}\\s*\\(`, 'g'));
      const buildDefs = countMatches(content, new RegExp(`export function ${buildFn}\\s*\\(`, 'g'));
      expect(buildDefs, `${file}: ${buildFn} 정의가 정확히 1개여야 한다`).toBe(1);
      expect(
        saveCalls,
        `${file}: 저장 호출(${saveCalls})과 ${buildFn} 경유(${buildRefs - buildDefs})가 다릅니다 — ` +
          `build* 를 우회한 저장이 추가된 것으로 보입니다`,
      ).toBe(buildRefs - buildDefs);
      expect(saveCalls, `${file}: 저장 경로가 하나도 없으면 chokepoint가 무의미`).toBeGreaterThan(
        0,
      );
    }
  });

  it('③-b build* 3함수가 term 스탬프(withDerivedTerm)를 유지한다 (S2.2 긍정형 앵커)', () => {
    for (const { file, buildFn } of BUILD_CHOKEPOINTS) {
      const content = readFileSync(resolve(REPO_ROOT, file), 'utf-8');
      expect(
        content.includes('withDerivedTerm'),
        `${file}: ${buildFn}에서 withDerivedTerm(term 스탬프)이 사라졌습니다 — ` +
          `date(사건 발생일) 파생 스탬프는 ADR-034의 성립 조건입니다`,
      ).toBe(true);
    }
  });

  it('④ 유일한 build* 비경유 예외(Q2 마이그레이션)는 형태 그대로 고정', () => {
    const content = readFileSync(
      resolve(REPO_ROOT, 'src/usecases/studentRecords/MigrateStudentRecordsSubcatToTags.ts'),
      'utf-8',
    );
    // 저장 호출은 정확히 1개, 봉투는 spread 승계({ ...baseEnvelope, records }), 레코드 무신설
    // (normalizeStudentRecordsSubcatToTags — tags additive 정규화만). 이 형태가 변하면
    // 예외 지위를 재심사할 것 — build* 경유로 바꾸거나 이 테스트를 계획과 함께 갱신한다.
    expect(countMatches(content, /\.\s*saveRecords\s*\(/g)).toBe(1);
    expect(content.includes('{ ...baseEnvelope, records }')).toBe(true);
    expect(content.includes('normalizeStudentRecordsSubcatToTags')).toBe(true);
  });

  it('⑤ SyncFromCloud 병합 정본 지점 앵커 — merge 3함수 + mergeAndWriteLocked 경유', () => {
    const content = readFileSync(resolve(REPO_ROOT, 'src/usecases/sync/SyncFromCloud.ts'), 'utf-8');
    for (const fn of ['mergeAttendance', 'mergeObservations', 'mergeStudentRecords']) {
      expect(
        content.includes(`export function ${fn}(`),
        `SyncFromCloud.ts: ${fn} 정본이 사라졌습니다(이동 시 이 테스트와 계획 §4 S2.2 갱신)`,
      ).toBe(true);
    }
    // 병합 쓰기는 락 헬퍼 경유(읽기부터 감싼 임계구역) — 호출 3개 이상(3도메인 × 충돌/첫 다운로드)
    expect(countMatches(content, /mergeAndWriteLocked\s*\(/g)).toBeGreaterThanOrEqual(3);
  });
});
