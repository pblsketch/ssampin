/**
 * 명렬표에서 읽은 사진을 **명단 반영이 끝난 뒤의 학생**에게 연결한다.
 *
 * ## 왜 별도 단계인가
 *
 * 파서가 돌려주는 건 (학번, 이름, 사진)이다. 그런데 사진 저장 키는 **불변 `Student.id`** 이고,
 * 그 id 는 명단 병합(`applyImportPlan`)이 끝나야 확정된다 — 새 학생이면 그때 발급되기 때문이다.
 * 그래서 "명단 반영 → id 확정 → 사진 연결" 순서를 반드시 지켜야 하고, 이 함수가 그 연결을 맡는다.
 *
 * ## 왜 이렇게 깐깐하게 맞추는가
 *
 * 여기서 잘못 연결하면 **얼굴과 이름이 어긋난 채로 저장된다** — 파일을 읽을 때 걸러 낸
 * 바로 그 사고가 저장 직전 단계에서 다시 열리는 셈이다. 그래서 **학번과 이름이 둘 다 같을 때만**
 * 연결하고, 조금이라도 어긋나면 그 학생의 사진을 붙이지 않고 목록으로 돌려준다.
 * 붙이지 못한 사진은 화면에서 "직접 지정" 경로로 넘긴다.
 */

import type { Student } from '@domain/entities/Student';
import type { RosterPhotoToSave } from './SaveRosterPhotos';

export interface PhotoTargetCandidate {
  readonly studentNumber: number;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface UnresolvedPhoto {
  readonly studentNumber: number;
  readonly name: string;
  /** 왜 못 붙였는지 — 화면 안내에 쓴다 */
  readonly reason: 'NO_MATCH' | 'AMBIGUOUS';
}

export interface ResolvePhotoTargetsResult {
  readonly resolved: readonly RosterPhotoToSave[];
  readonly unresolved: readonly UnresolvedPhoto[];
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '');
}

/**
 * 확정된 학생 명단과 사진 후보를 맞춘다.
 *
 * @param students `applyImportPlan` 이 돌려준 **최종** 명단 (id 가 확정된 상태)
 */
export function resolvePhotoTargets(
  students: readonly Student[],
  photos: readonly PhotoTargetCandidate[],
): ResolvePhotoTargetsResult {
  const resolved: RosterPhotoToSave[] = [];
  const unresolved: UnresolvedPhoto[] = [];

  // (학번 + 이름) 조합으로만 찾는다. 학번만 같고 이름이 다르면 다른 학생일 수 있다.
  const byKey = new Map<string, Student[]>();
  for (const student of students) {
    if (student.studentNumber === undefined) continue;
    const key = `${student.studentNumber}:${normalizeName(student.name)}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(student);
    byKey.set(key, bucket);
  }

  const usedIds = new Set<string>();

  for (const photo of photos) {
    const key = `${photo.studentNumber}:${normalizeName(photo.name)}`;
    const matches = (byKey.get(key) ?? []).filter((s) => !usedIds.has(s.id));

    if (matches.length === 0) {
      unresolved.push({ studentNumber: photo.studentNumber, name: photo.name, reason: 'NO_MATCH' });
      continue;
    }
    if (matches.length > 1) {
      // 같은 번호·같은 이름이 둘 이상 — 어느 쪽인지 고를 근거가 없으므로 붙이지 않는다
      unresolved.push({
        studentNumber: photo.studentNumber,
        name: photo.name,
        reason: 'AMBIGUOUS',
      });
      continue;
    }

    const target = matches[0]!;
    usedIds.add(target.id);
    resolved.push({
      studentId: target.id,
      studentNumber: photo.studentNumber,
      studentName: photo.name,
      bytes: photo.bytes,
      mimeType: photo.mimeType,
    });
  }

  return { resolved, unresolved };
}
