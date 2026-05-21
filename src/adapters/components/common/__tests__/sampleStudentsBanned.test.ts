/**
 * 메타 테스트 — useStudentStore.ts 에 SAMPLE_STUDENTS 또는 샘플 학생 이름이
 * 재도입되지 않았는지 확인.
 *
 * 회귀 시나리오:
 *   roster-sample-data-removal PDCA 이전에는 useStudentStore.ts 가 초기 상태로
 *   35명 샘플 학생 이름을 직접 박아 두었다. 신규 설치 시 실제 학생 대신 샘플
 *   명단이 자동 채워지면 교사가 직접 삭제해야 하므로 UX 문제가 된다.
 *   이 테스트로 해당 패턴이 다시 들어오는 회귀를 CI 에서 사전 차단한다.
 *
 * 화이트리스트 (검사 제외):
 *   - src/domain/rules/sampleRosterSignature.ts — 합법적으로 35명 시그니처 보유
 *   - src/domain/rules/sampleRosterSignature.test.ts
 *   - src/usecases/roster/cleanupSampleRoster.test.ts
 *
 * 검사 대상:
 *   - src/adapters/stores/useStudentStore.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../..');

const TARGET_FILE = 'src/adapters/stores/useStudentStore.ts';

describe('sampleStudentsBanned (meta)', () => {
  it('useStudentStore.ts 에 SAMPLE_STUDENTS 상수가 재도입되지 않았다', () => {
    const source = readFileSync(resolve(ROOT, TARGET_FILE), 'utf8');

    expect(
      source,
      `SAMPLE_STUDENTS 또는 샘플 학생 이름이 런타임 코드에 재도입되었습니다. ` +
        `메모리: PDCA roster-sample-data-removal 참고. ` +
        `${TARGET_FILE} 에서 const SAMPLE_STUDENTS 패턴을 제거하세요.`,
    ).not.toMatch(/const\s+SAMPLE_STUDENTS\s*=/);
  });

  it('useStudentStore.ts 에 샘플 학생 이름 2개 이상이 동시에 등장하지 않는다', () => {
    const source = readFileSync(resolve(ROOT, TARGET_FILE), 'utf8');

    const SAMPLE_NAMES = ["'김민지'", "'이서연'", "'박지민'"];
    const foundNames = SAMPLE_NAMES.filter((name) => source.includes(name));

    expect(
      foundNames.length,
      `SAMPLE_STUDENTS 또는 샘플 학생 이름이 런타임 코드에 재도입되었습니다. ` +
        `메모리: PDCA roster-sample-data-removal 참고. ` +
        `발견된 이름: ${foundNames.join(', ')}. ` +
        `${TARGET_FILE} 에서 샘플 학생 이름을 제거하세요.`,
    ).toBeLessThan(2);
  });
});
