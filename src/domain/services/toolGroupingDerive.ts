import type { Student } from '../entities/Student';
import type { StudentPiiOverlay } from '../entities/StudentPiiOverlay';
import type { Gender, Level } from '../rules/groupingRules';
import { toLegacyLevel } from '../rules/academicLevelMapping';

/**
 * DerivedGroupingTags — 학생별 모둠 편성에 필요한 derive 태그 (gender + level).
 *
 * `Student` (PII-free 코어)와 `IStudentPiiReader`가 제공하는 overlay snapshot에서
 * 도출. PII overlay가 없는 학생은 `undefined`.
 */
export interface DerivedGroupingTags {
  readonly studentId: string;
  readonly gender?: Gender;
  readonly level?: Level;
}

/**
 * computeDerivedTags — 순수 함수. 학생 명단 + overlay map에서 tags 배열 도출.
 *
 * 5단계 ABCDE는 `toLegacyLevel`로 high/mid/low로 매핑된다.
 * overlay 비어있으면 tags의 gender/level은 undefined.
 *
 * 관련 ADR: Decision 7 + Architect §A-2
 */
export function computeDerivedTags(
  students: readonly Pick<Student, 'id'>[],
  overlays: ReadonlyMap<string, StudentPiiOverlay>,
): readonly DerivedGroupingTags[] {
  return students.map((s) => {
    const overlay = overlays.get(s.id);
    return {
      studentId: s.id,
      gender: overlay?.gender,
      level: toLegacyLevel(overlay?.academicLevel),
    };
  });
}

/**
 * buildMemoKey — Memoization 키 (Critic A-2 + N-9 closure).
 *
 * 형식: `${studentSetVersion}|${piiOverlayVersion}|${ruleSetHash}`.
 *
 * **PII 값 미포함** — version 카운터(integer)와 ruleSet hash (사용자 설정 식별자)만 사용.
 * 따라서 React 메모이제이션 키 자체가 PII 지문을 포함하지 않는다 (개인정보 누출 차단).
 *
 * - `studentSetVersion`: 학생 명단 변경 시 증가 (이름/번호/추가/삭제).
 *   *명단 변경*은 `gender/level` 불변이라면 derive 결과를 변경하지 않는다.
 * - `piiOverlayVersion`: PII overlay mutation 카운터. 증가 시 memo 무효화.
 * - `ruleSetHash`: ToolGrouping 옵션(method, genderMode 등) 변경 식별자.
 */
export function buildMemoKey(
  studentSetVersion: number,
  piiOverlayVersion: number,
  ruleSetHash: string,
): string {
  return `${studentSetVersion}|${piiOverlayVersion}|${ruleSetHash}`;
}

/**
 * MemoCache — buildMemoKey 기반 LRU(size=1) 단순 캐시.
 * useMemo 의존성 명세를 도메인 레이어에서 직접 검증하기 위한 헬퍼.
 */
export class GroupingDeriveMemoCache {
  private lastKey: string | null = null;
  private lastValue: readonly DerivedGroupingTags[] = [];
  private computeCount = 0;

  get(
    studentSetVersion: number,
    piiOverlayVersion: number,
    ruleSetHash: string,
    compute: () => readonly DerivedGroupingTags[],
  ): readonly DerivedGroupingTags[] {
    const key = buildMemoKey(studentSetVersion, piiOverlayVersion, ruleSetHash);
    if (key === this.lastKey) return this.lastValue;
    this.lastKey = key;
    this.lastValue = compute();
    this.computeCount++;
    return this.lastValue;
  }

  /** 디버깅·테스트용: 실제 compute 호출 횟수. */
  get callCount(): number {
    return this.computeCount;
  }
}
