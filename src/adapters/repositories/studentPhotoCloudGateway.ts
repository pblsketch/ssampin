/**
 * 학생 사진 파기 시 **클라우드까지 지우기 위한** 연결 수단을 마련한다.
 *
 * 동기화 미사용(`disabled`)과 일시 연결 실패(`unavailable`)를 구분한다.
 * 미사용이면 로컬 파기가 완전한 삭제지만, 연결 실패면 다음 동기화까지 클라우드 삭제 대기다.
 *
 * ⚠️ 이 함수가 실패해도 파기 자체를 막으면 안 된다. 인터넷이 끊겼다고 사진을 못 지우게 하면
 * 정작 급할 때(기기를 넘기거나 분실 신고할 때) 아무것도 못 한다.
 * 그래서 실패도 상태로 돌려 로컬 파기만 진행시키고, 화면은 삭제 대기 사실을 알린다.
 */

import type { DeleteStudentPhotosDeps } from '@usecases/studentPhoto/DeleteStudentPhotos';

export type StudentPhotoCloudResolution =
  | { readonly status: 'ready'; readonly cloud: NonNullable<DeleteStudentPhotosDeps['cloud']> }
  | { readonly status: 'disabled' }
  | { readonly status: 'unavailable' };

export async function resolveStudentPhotoCloud(): Promise<StudentPhotoCloudResolution> {
  try {
    const { getDriveSyncAdapter, authenticateGoogle } = await import('@adapters/di/container');
    const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');

    const sync = useSettingsStore.getState().settings.sync;
    if (!sync?.enabled) return { status: 'disabled' };

    const port = getDriveSyncAdapter(() => authenticateGoogle.getValidAccessToken());
    const folder = await port.getOrCreateSyncFolder();
    return { status: 'ready', cloud: { port, folderId: folder.id } };
  } catch (err) {
    console.warn('[studentPhotoCloudGateway] 클라우드 연결 실패 — 로컬만 파기합니다:', err);
    return { status: 'unavailable' };
  }
}
