/**
 * 학생 사진 파기 시 **클라우드까지 지우기 위한** 연결 수단을 마련한다.
 *
 * 동기화를 쓰지 않는 상태(끄거나 로그인 안 함)면 `undefined` 를 돌려준다 —
 * 그때는 로컬만 지우는 것이 완전한 파기다.
 *
 * ⚠️ 이 함수가 실패해도 파기 자체를 막으면 안 된다. 인터넷이 끊겼다고 사진을 못 지우게 하면
 * 정작 급할 때(기기를 넘기거나 분실 신고할 때) 아무것도 못 한다.
 * 그래서 실패는 `undefined` 로 돌려 로컬 파기만 진행시키고,
 * 클라우드에 남은 사실은 화면이 사용자에게 알린다.
 */

import type { DeleteStudentPhotosDeps } from '@usecases/studentPhoto/DeleteStudentPhotos';

export async function resolveStudentPhotoCloud(): Promise<DeleteStudentPhotosDeps['cloud']> {
  try {
    const { getDriveSyncAdapter, authenticateGoogle } = await import('@adapters/di/container');
    const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');

    const sync = useSettingsStore.getState().settings.sync;
    if (!sync?.enabled) return undefined;

    const port = getDriveSyncAdapter(() => authenticateGoogle.getValidAccessToken());
    const folder = await port.getOrCreateSyncFolder();
    return { port, folderId: folder.id };
  } catch (err) {
    console.warn('[studentPhotoCloudGateway] 클라우드 연결 실패 — 로컬만 파기합니다:', err);
    return undefined;
  }
}
