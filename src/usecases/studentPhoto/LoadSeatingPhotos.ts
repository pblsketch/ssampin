/**
 * 자리배치표를 내보낼 때 쓸 학생 사진을 읽어 온다.
 *
 * ## 왜 별도 함수인가
 *
 * 화면에 사진을 띄우는 통로는 `useStudentPhotoUrls` 하나로 좁혀 두었다. 그 훅은 화면이
 * 쓰라고 **주소(objectURL)** 를 만들어 주는데, 파일로 내보낼 때는 주소가 아니라
 * **사진 바이트 자체**가 필요하다. 그래서 통로를 하나 더 두되, 여기 하나로만 둔다.
 *
 * ## 내보내는 코드가 저장소를 직접 부르지 않게 한다
 *
 * PDF·엑셀·한글을 만드는 코드는 사진 저장소를 모른다. 부르는 쪽(자리배치 화면)이 이 함수로
 * 사진을 읽어 **넘겨준다.** 학생 정보를 `getStudent` 로 넘기는 것과 같은 방식이다.
 * 이렇게 해야 빌드 게이트(`scripts/check-bundle-isolation.mjs`)가 지키는 약속
 * — "학생용 화면에서는 사진에 닿을 방법이 원리적으로 없다" — 가 깨지지 않는다.
 *
 * ## 열쇠 변환은 여기서만 한다
 *
 * 저장소는 사진을 `subjectKey` 로 갖고 있는데 명단 종류마다 값이 다르다
 * (담임은 `Student.id`, 수업반은 `{반id}--{학년-반-번호}`). 좌석표가 쓰는 열쇠로 바꾸는 일을
 * 화면마다 따로 하면 한쪽만 고쳐져 "담임은 되는데 수업반은 안 되는" 상태가 된다.
 */

import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { StudentPhotoImage, StudentPhotoOwnerKind } from '@domain/entities/StudentPhoto';

export interface SeatingPhotoScope {
  readonly ownerKind: StudentPhotoOwnerKind;
  /** 담임이면 'homeroom', 수업반이면 TeachingClass.id */
  readonly ownerKey: string;
}

/**
 * 한 명단(담임/수업반)의 사진을 좌석표가 쓰는 열쇠 기준으로 읽는다.
 *
 * 사진 본체를 못 읽은 항목은 조용히 빠진다 — 그 학생은 이름만 나오면 되고,
 * 사진 한 장 때문에 배치표 전체가 실패하면 안 된다.
 *
 * @returns 좌석표 식별자 → 사진. 담임이면 `Student.id`, 수업반이면 `학년-반-번호`
 */
export async function loadSeatingPhotos(
  repository: IStudentPhotoRepository,
  scope: SeatingPhotoScope,
): Promise<ReadonlyMap<string, StudentPhotoImage>> {
  const result = new Map<string, StudentPhotoImage>();

  const all = await repository.list();
  const mine = all.filter((p) => p.ownerKind === scope.ownerKind && p.ownerKey === scope.ownerKey);

  for (const photo of mine) {
    const bytes = await repository.readPhoto(photo.subjectKey);
    if (!bytes || bytes.byteLength === 0) continue;

    // 수업반 열쇠에서 반 번호 접두사를 떼어 좌석표가 쓰는 `학년-반-번호` 로 맞춘다
    const viewKey =
      scope.ownerKind === 'teaching-class'
        ? photo.subjectKey.slice(`${scope.ownerKey}--`.length)
        : photo.subjectKey;

    result.set(viewKey, {
      bytes,
      mimeType: photo.mimeType,
      width: photo.width,
      height: photo.height,
    });
  }

  return result;
}

/**
 * 사진이 한 장이라도 있는지만 확인한다 (사진 본체는 읽지 않는다).
 *
 * 내보내기 메뉴에서 "사진 넣기" 줄을 보여줄지 정하는 데 쓴다. 메뉴를 열 때마다 사진 수백 장을
 * 읽으면 느려지므로, 목록(메타)만 보고 판단한다.
 */
export async function hasSeatingPhotos(
  repository: IStudentPhotoRepository,
  scope: SeatingPhotoScope,
): Promise<boolean> {
  const all = await repository.list();
  return all.some((p) => p.ownerKind === scope.ownerKind && p.ownerKey === scope.ownerKey);
}
