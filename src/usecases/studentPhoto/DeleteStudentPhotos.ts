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

import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { StudentPhotoOwnerKind } from '@domain/entities/StudentPhoto';
import { withDataOperationLock } from '@usecases/shared/dataOperationMutex';

export interface DeleteStudentPhotosDeps {
  readonly repository: IStudentPhotoRepository;
  /**
   * 동기화 장부. 로컬 삭제 직후 삭제 표식을 저장해 오프라인이어도 다음 동기화에서
   * 다른 기기와 클라우드에 전달한다.
   */
  readonly syncRepository?: IDriveSyncRepository;
  /**
   * 클라우드 삭제 수단. 동기화를 쓰지 않는 상태(로그인 안 함 등)면 넘기지 않는다 —
   * 그때는 로컬만 지우면 그것이 완전한 파기다.
   */
  readonly cloud?: object;
}

export type DeleteStudentPhotosTarget =
  | { readonly scope: 'all' }
  | {
      readonly scope: 'owner';
      readonly ownerKind: StudentPhotoOwnerKind;
      readonly ownerKey: string;
    }
  | { readonly scope: 'student'; readonly subjectKey: string };

export interface DeleteStudentPhotosResult {
  /** 로컬에서 지운 사진 수 */
  readonly deletedCount: number;
  /**
   * 클라우드에서 지우지 못한 파일들. 비어 있지 않으면 **사용자에게 반드시 알려야 한다** —
   * 파기가 끝나지 않았다는 뜻이다.
   */
  readonly cloudFailures: readonly string[];
  /** 동기화가 켜져 있어 다음 동기화에서 클라우드 실제 파일을 정리해야 하는 사진 수 */
  readonly cloudPendingCount: number;
}

export async function deleteStudentPhotos(
  deps: DeleteStudentPhotosDeps,
  target: DeleteStudentPhotosTarget,
): Promise<DeleteStudentPhotosResult> {
  return withDataOperationLock(() => deleteStudentPhotosUnlocked(deps, target));
}

async function deleteStudentPhotosUnlocked(
  deps: DeleteStudentPhotosDeps,
  target: DeleteStudentPhotosTarget,
): Promise<DeleteStudentPhotosResult> {
  const all = await deps.repository.list();
  const targets = all.filter((photo) => {
    if (target.scope === 'all') return true;
    if (target.scope === 'student') return photo.subjectKey === target.subjectKey;
    return photo.ownerKind === target.ownerKind && photo.ownerKey === target.ownerKey;
  });

  if (targets.length === 0) return { deletedCount: 0, cloudFailures: [], cloudPendingCount: 0 };

  // 1) 실제 파일보다 삭제 표식을 먼저 남긴다. 네트워크가 없어도 이 의도는 보존된다.
  const cloudFailures: string[] = [];
  if (deps.syncRepository) {
    try {
      const manifest = await deps.syncRepository.getLocalManifest();
      if (manifest) {
        const files = { ...manifest.files };
        const deletions = { ...(manifest.deletions ?? {}) };
        const restorations = { ...(manifest.restorations ?? {}) };
        const deletedAt = new Date().toISOString();
        for (const photo of targets) {
          const previousFile = files[photo.storageRef];
          delete files[photo.storageRef];
          delete restorations[photo.storageRef];
          deletions[photo.storageRef] = {
            deletedAt,
            deletedBy: manifest.deviceId,
            deletionId: `${manifest.deviceId}:${deletedAt}:${photo.storageRef}`,
            ...(previousFile?.driveFilename ? { driveFilename: previousFile.driveFilename } : {}),
            ...(previousFile?.lastModified
              ? { expectedModifiedTime: previousFile.lastModified }
              : {}),
          };
        }
        await deps.syncRepository.saveLocalManifest({
          ...manifest,
          version: Math.max(2, manifest.version),
          files,
          deletions,
          restorations,
        });
      } else if (deps.cloud) {
        cloudFailures.push(...targets.map((photo) => photo.storageRef));
      }
    } catch (err) {
      cloudFailures.push(...targets.map((photo) => photo.storageRef));
      console.warn('[deleteStudentPhotos] 동기화 삭제 표식을 저장하지 못했습니다:', err);
    }
  } else if (deps.cloud) {
    cloudFailures.push(...targets.map((photo) => photo.storageRef));
  }

  // 2) 장부 상태와 무관하게 요청한 로컬 파기는 반드시 수행한다.
  if (target.scope === 'all') {
    await deps.repository.deleteAll();
  } else if (target.scope === 'student') {
    await deps.repository.delete(target.subjectKey);
  } else {
    await deps.repository.deleteByOwner(target.ownerKind, target.ownerKey);
  }

  return {
    deletedCount: targets.length,
    cloudFailures,
    cloudPendingCount: deps.cloud && cloudFailures.length === 0 ? targets.length : 0,
  };
}
