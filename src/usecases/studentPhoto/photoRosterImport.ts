/**
 * 사진 명렬표 해석 결과 → 기존 명단 가져오기 파이프라인 입력으로 변환.
 *
 * ## 왜 변환만 하고 병합은 하지 않는가
 *
 * 이 저장소에는 이미 검증된 명단 병합 기계가 있다:
 * `planImport` → (충돌이 있으면) `ConflictResolveModal` → `applyImportPlan`.
 * 학생 id 를 최대한 보존해 학생기록·좌석·과제 제출 같은 **외부 참조가 끊기지 않도록** 하는
 * 규칙이 거기 다 들어 있다. 사진 가져오기가 그 규칙을 다시 구현하면
 * **명단 병합 규칙이 두 벌**이 되어 한쪽만 고쳐지는 사고가 난다.
 *
 * 그래서 여기서는 **입력 형태를 맞춰 주기만** 하고, 병합은 기존 기계에 그대로 맡긴다.
 *
 * ## 순서가 중요하다
 *
 * ```
 * 파일 해석  →  이름을 명단에 반영(id 확정)  →  확정된 id 에 사진 저장
 *                                    ↑ 새 학생은 이 시점에 id 가 생긴다
 * ```
 * 사진을 먼저 저장하면 존재하지 않는 학생을 가리키게 된다.
 */

import type { ImportReadyStudent } from '@domain/rules/rosterImportRules';
import type { PhotoRosterParseResult, RosterNameCandidate } from '@domain/valueObjects/PhotoRoster';
import type { PhotoTargetCandidate } from './resolvePhotoTargets';

/**
 * 명렬표에서 읽은 이름을 명단 가져오기 입력으로 바꾼다.
 *
 * 사진 명렬표에는 번호와 이름만 있다 — 연락처·생년월일은 담기지 않는다.
 * 빈 값으로 두면 기존 병합 규칙이 **기존 값을 지우지 않고 보존**한다.
 */
export function toImportReadyStudents(names: readonly RosterNameCandidate[]): ImportReadyStudent[] {
  return names
    .map((entry) => ({
      name: entry.name.trim(),
      studentNumber: entry.studentNumber,
      phone: '',
      parentPhone: '',
      parentPhoneLabel: '',
      parentPhone2: '',
      parentPhone2Label: '',
      birthDate: '',
      isVacant: false,
    }))
    .sort((a, b) => a.studentNumber - b.studentNumber);
}

/**
 * 저장할 사진 후보를 뽑는다.
 *
 * **짝짓기 검산을 통과한 경우에만** 사진을 넘긴다.
 * 검산에 실패했다면 사진을 통째로 버리고 이름만 반영한다 —
 * 어긋난 얼굴을 저장하느니 사진이 없는 편이 낫다.
 */
export function collectPhotoCandidates(result: PhotoRosterParseResult): PhotoTargetCandidate[] {
  if (!result.pairing.ok) return [];
  return result.pairing.pairs.map((pair) => ({
    studentNumber: pair.studentNumber,
    name: pair.name,
    bytes: pair.photo.bytes,
    mimeType: pair.photo.mimeType,
  }));
}

/** 화면 상단에 그대로 띄울 요약 문장 */
export function describeParseResult(result: PhotoRosterParseResult): string {
  const nameCount = result.names.length;
  if (result.pairing.ok) {
    return `이름 ${nameCount}명, 사진 ${result.pairing.pairs.length}장을 가져왔어요.`;
  }
  if (result.pairing.reason === 'NO_PHOTOS') {
    return `사진이 들어 있지 않아 이름 ${nameCount}명만 가져왔어요.`;
  }
  return `사진 위치를 확실히 읽지 못해 이름 ${nameCount}명만 가져왔어요. 사진은 나중에 직접 넣을 수 있어요.`;
}
