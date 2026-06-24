/**
 * 기록 조회 — 학생 식별 그룹핑 어댑터 (읽기 전용 · 표현 계층).
 *
 * 두 컨텍스트(담임 `StudentRecord`, 교과 `TeachingClass`)의 기록을 학생 단위로 묶을 때
 * **서로 다른 컨텍스트의 학생을 절대 같은 그룹으로 합치지 않도록** 합성 키를 만든다.
 * 담임 `Student.id`와 교과 `studentKey`가 우연히 같은 문자열이어도 분리된다(개인정보 오병합 hard gate).
 *
 * 불가침:
 * - 원본 식별키(`rawKey`)·`classId`를 변환·재발급·병합하지 않는다(표시·매칭에만 사용).
 * - store write(저장) 의존이 전혀 없다 — 순수 함수. (정적 검사: recordIdentityAdapter.test.ts)
 * - MCP 계약(식별키/카테고리/저장 경로) 미접근.
 */
import type { DisplayRecord } from './displayRecord';

/** 기록 출처 컨텍스트. 합성 키의 1차 분리축. */
export type RecordContext = 'homeroom' | 'teaching';

/** 학생 식별 — 컨텍스트별로 분리된 합성 키 + 보존된 원본 키. */
export interface SurfaceStudentKey {
  /**
   * 그룹핑용 합성 키. context+classId+rawKey를 구분자 주입에 안전하게(JSON) 직렬화한 것.
   * 컨텍스트/반이 다르면 rawKey가 같아도 절대 같은 값이 나오지 않는다.
   */
  readonly surfaceKey: string;
  readonly context: RecordContext;
  /** 원본 식별키 그대로(담임=`Student.id`, 교과=`studentKey`). 변환·재발급 0. */
  readonly rawKey: string;
  /** 교과 컨텍스트의 반 id(담임은 생략). */
  readonly classId?: string;
}

/**
 * 컨텍스트+반+원본키로 충돌하지 않는 합성 그룹 키 생성.
 * JSON 배열 직렬화라 rawKey/classId에 콜론(`tc:c1:5`)·따옴표가 있어도 구분자 모호성이 없다.
 */
export function makeSurfaceStudentKey(
  context: RecordContext,
  rawKey: string,
  classId?: string,
): SurfaceStudentKey {
  return {
    surfaceKey: JSON.stringify([context, classId ?? null, rawKey]),
    context,
    rawKey,
    classId,
  };
}

/** 학생(surfaceKey) 단위로 묶인 기록 그룹. */
export interface SurfaceStudentGroup {
  readonly key: SurfaceStudentKey;
  readonly items: readonly DisplayRecord[];
}

/**
 * 이미 키가 부여된 기록들을 학생(surfaceKey) 단위로 그룹핑. 입력 순서를 보존한다.
 * 서로 다른 컨텍스트/반의 항목은 surfaceKey가 다르므로 절대 한 그룹에 섞이지 않는다.
 */
export function groupBySurfaceKey(
  entries: readonly { key: SurfaceStudentKey; record: DisplayRecord }[],
): SurfaceStudentGroup[] {
  const map = new Map<string, { key: SurfaceStudentKey; items: DisplayRecord[] }>();
  for (const { key, record } of entries) {
    const existing = map.get(key.surfaceKey);
    if (existing) existing.items.push(record);
    else map.set(key.surfaceKey, { key, items: [record] });
  }
  return Array.from(map.values());
}

/**
 * 단일 컨텍스트의 DisplayRecord[]를 학생 단위로 그룹핑(편의 함수).
 * `DisplayRecord.studentKey`를 rawKey로 사용하며, 컨텍스트/반 접두로 안전한 surfaceKey를 만든다.
 */
export function groupRecordsByStudent(
  records: readonly DisplayRecord[],
  context: RecordContext,
  classId?: string,
): SurfaceStudentGroup[] {
  return groupBySurfaceKey(
    records.map((record) => ({
      key: makeSurfaceStudentKey(context, record.studentKey, classId),
      record,
    })),
  );
}
