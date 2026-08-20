/**
 * 수업반(교과) 명렬표의 사진을 수업반 학생에게 연결한다.
 *
 * ## 담임과 무엇이 다른가
 *
 * 담임은 학생마다 **불변 id**가 있어서 명단을 반영한 뒤 그 id 에 사진을 붙였다.
 * 수업반 학생에게는 불변 id 가 없고 **`학년-반-번호`** 로만 구분한다.
 * 다행히 수업반 사진 명렬표에는 그 세 값이 그대로 적혀 있다(`3학년 1반 2번  권지민`).
 *
 * ## 그래서 연결이 오히려 단순하다
 *
 * 명단을 먼저 반영할 필요가 없다. 파일에서 읽은 `학년-반-번호`를 그대로
 * 수업반 학생의 키와 맞추면 된다. 다만 **이름까지 같아야** 붙인다 —
 * 번호만 맞고 이름이 다르면 그 사이에 학생이 바뀐 것이므로 얼굴을 붙이면 안 된다.
 */

import { studentKey, type TeachingClassStudent } from '@domain/entities/TeachingClass';
import { photoSubjectKey } from '@domain/rules/studentPhotoRules';
import type { RosterNameCandidate } from '@domain/valueObjects/PhotoRoster';
import type { RosterPhotoToSave } from './SaveRosterPhotos';
import type { UnresolvedPhoto } from './resolvePhotoTargets';

export interface TeachingClassPhotoInput {
  readonly studentNumber: number;
  readonly name: string;
  readonly grade?: number;
  readonly classNum?: number;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface ResolveTeachingClassPhotoResult {
  readonly resolved: readonly RosterPhotoToSave[];
  readonly unresolved: readonly UnresolvedPhoto[];
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '');
}

/**
 * @param teachingClassId 사진 키를 반별로 가르기 위해 필요하다 (한 학생이 여러 수업반에 있을 수 있다)
 */
export function resolveTeachingClassPhotoTargets(
  teachingClassId: string,
  students: readonly TeachingClassStudent[],
  photos: readonly TeachingClassPhotoInput[],
): ResolveTeachingClassPhotoResult {
  const resolved: RosterPhotoToSave[] = [];
  const unresolved: UnresolvedPhoto[] = [];

  // 학생 키 + 이름을 함께 맞춘다. 번호만 보면 그 사이에 바뀐 학생에게 얼굴이 붙는다.
  const byKey = new Map<string, TeachingClassStudent[]>();
  for (const student of students) {
    const key = `${studentKey(student)}:${normalizeName(student.name)}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(student);
    byKey.set(key, bucket);
  }

  const used = new Set<string>();

  for (const photo of photos) {
    const ref = studentKey({
      number: photo.studentNumber,
      ...(photo.grade !== undefined ? { grade: photo.grade } : {}),
      ...(photo.classNum !== undefined ? { classNum: photo.classNum } : {}),
    });
    const lookup = `${ref}:${normalizeName(photo.name)}`;
    const matches = (byKey.get(lookup) ?? []).filter((s) => !used.has(studentKey(s)));

    if (matches.length === 0) {
      unresolved.push({
        studentNumber: photo.studentNumber,
        name: photo.name,
        reason: 'NO_MATCH',
      });
      continue;
    }
    if (matches.length > 1) {
      // 같은 키·같은 이름이 둘 이상 — 고를 근거가 없으므로 붙이지 않는다
      unresolved.push({
        studentNumber: photo.studentNumber,
        name: photo.name,
        reason: 'AMBIGUOUS',
      });
      continue;
    }

    used.add(studentKey(matches[0]!));
    resolved.push({
      subjectKey: photoSubjectKey('teaching-class', teachingClassId, ref),
      studentNumber: photo.studentNumber,
      studentName: photo.name,
      bytes: photo.bytes,
      mimeType: photo.mimeType,
    });
  }

  return { resolved, unresolved };
}

/** 파서 결과(이름 목록)에서 수업반 사진 후보를 만든다 */
export function toTeachingClassPhotoInputs(
  names: readonly RosterNameCandidate[],
  photoBytesOf: (name: RosterNameCandidate) => { bytes: Uint8Array; mimeType: string } | null,
): TeachingClassPhotoInput[] {
  const inputs: TeachingClassPhotoInput[] = [];
  for (const name of names) {
    const photo = photoBytesOf(name);
    if (!photo) continue;
    inputs.push({
      studentNumber: name.studentNumber,
      name: name.name,
      ...(name.grade !== undefined ? { grade: name.grade } : {}),
      ...(name.classNum !== undefined ? { classNum: name.classNum } : {}),
      bytes: photo.bytes,
      mimeType: photo.mimeType,
    });
  }
  return inputs;
}
