/**
 * 학생 사진 파기.
 *
 * ## 왜 별도 유즈케이스인가 — "지웠습니다"가 사실이어야 한다
 *
 * 사진을 드라이브로 동기화하기로 했으므로(오너 확정), 로컬에서만 지우면
 * **클라우드에는 그대로 남는다.** 그 상태로 "사진을 지웠습니다"라고 안내하면
 * 개인정보 처리방침 위반이다. 그래서 파기는 반드시 **로컬 + 클라우드 두 곳**을 함께 처리한다.
 *
 * ## 클라우드 삭제가 실패해도 로컬은 지운다
 *
 * 인터넷이 끊겼거나 로그인이 풀렸을 때 파기 자체가 막히면 안 된다.
 * 로컬은 확실히 지우고, 클라우드에서 못 지운 파일은 **목록으로 돌려준다** —
 * 화면은 "휴대폰·클라우드에서 N장이 아직 남아 있어요. 인터넷 연결 후 다시 시도해 주세요"처럼
 * 사실대로 안내해야 한다. 조용히 성공한 척하는 것이 가장 나쁘다.
 */

import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { StudentPhotoOwnerKind } from '@domain/entities/StudentPhoto';
import { toBinaryDriveFilename } from '@usecases/sync/binaryDriveFilename';

export interface DeleteStudentPhotosDeps {
  readonly repository: IStudentPhotoRepository;
  /**
   * 동기화 장부. 지운 사진의 항목을 장부에서도 빼기 위해 필요하다.
   *
   * ⚠️ 이걸 안 지우면 **장부에는 있는데 실제 파일은 없는** 상태가 남는다.
   * 다음 동기화가 "장부에 있는 파일이 클라우드에 없다"고 판단해 무결성 오류를 던지면
   * 사진과 무관한 출결·기록 동기화까지 함께 멈춘다.
   */
  readonly syncRepository?: IDriveSyncRepository;
  /**
   * 클라우드 삭제 수단. 동기화를 쓰지 않는 상태(로그인 안 함 등)면 넘기지 않는다 —
   * 그때는 로컬만 지우면 그것이 완전한 파기다.
   */
  readonly cloud?: {
    readonly port: Pick<IDriveSyncPort, 'deleteSyncFile'>;
    readonly folderId: string;
  };
}

export type DeleteStudentPhotosTarget =
  | { readonly scope: 'all' }
  | {
      readonly scope: 'owner';
      readonly ownerKind: StudentPhotoOwnerKind;
      readonly ownerKey: string;
    }
  | { readonly scope: 'student'; readonly studentId: string };

export interface DeleteStudentPhotosResult {
  /** 로컬에서 지운 사진 수 */
  readonly deletedCount: number;
  /**
   * 클라우드에서 지우지 못한 파일들. 비어 있지 않으면 **사용자에게 반드시 알려야 한다** —
   * 파기가 끝나지 않았다는 뜻이다.
   */
  readonly cloudFailures: readonly string[];
}

export async function deleteStudentPhotos(
  deps: DeleteStudentPhotosDeps,
  target: DeleteStudentPhotosTarget,
): Promise<DeleteStudentPhotosResult> {
  const all = await deps.repository.list();
  const targets = all.filter((photo) => {
    if (target.scope === 'all') return true;
    if (target.scope === 'student') return photo.studentId === target.studentId;
    return photo.ownerKind === target.ownerKind && photo.ownerKey === target.ownerKey;
  });

  if (targets.length === 0) return { deletedCount: 0, cloudFailures: [] };

  // 1) 로컬 파기 — 여기는 반드시 성공시킨다
  if (target.scope === 'all') {
    await deps.repository.deleteAll();
  } else if (target.scope === 'student') {
    await deps.repository.delete(target.studentId);
  } else {
    await deps.repository.deleteByOwner(target.ownerKind, target.ownerKey);
  }

  // 2) 클라우드 파기 — 실패해도 로컬 파기를 되돌리지 않고 목록으로 알린다
  const cloudFailures: string[] = [];
  if (deps.cloud) {
    for (const photo of targets) {
      try {
        await deps.cloud.port.deleteSyncFile(
          deps.cloud.folderId,
          toBinaryDriveFilename(photo.storageRef),
        );
      } catch (err) {
        cloudFailures.push(photo.storageRef);
        console.warn(`[deleteStudentPhotos] 클라우드에서 ${photo.storageRef} 삭제 실패:`, err);
      }
    }
  }

  // 3) 동기화 장부에서도 항목을 뺀다.
  //    장부에만 남으면 다음 동기화가 "있어야 할 파일이 없다"고 판단해 무결성 오류를 던지고,
  //    그 오류는 사이클 전체를 멈추므로 출결·기록 동기화까지 함께 죽는다.
  if (deps.syncRepository) {
    try {
      const manifest = await deps.syncRepository.getLocalManifest();
      if (manifest) {
        const removed = new Set(targets.map((photo) => photo.storageRef));
        const nextFiles = Object.fromEntries(
          Object.entries(manifest.files).filter(([key]) => !removed.has(key)),
        );
        await deps.syncRepository.saveLocalManifest({ ...manifest, files: nextFiles });
      }
    } catch (err) {
      // 장부 정리에 실패해도 파기 자체는 이미 끝났다 — 되돌리지 않고 알리기만 한다
      console.warn('[deleteStudentPhotos] 동기화 장부 정리 실패:', err);
    }
  }

  return { deletedCount: targets.length, cloudFailures };
}
