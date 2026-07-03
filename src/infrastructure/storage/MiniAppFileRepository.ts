/**
 * MiniAppFileRepository — {@link IMiniAppRepository} 구현체.
 *
 * 미니앱의 HTML 본문·이미지 아이콘은 메인 프로세스만 파일로 쓸 수 있으므로, 이 어댑터는
 * renderer에서 받은 요청을 `window.electronAPI.miniApp` IPC로 메인에 위임한다
 * (파일 경로/바이트 처리는 `electron/ipc/miniapp.ts`가 담당).
 *
 * 브라우저 모드(electronAPI 부재)에서는 로컬 파일 시스템이 없으므로:
 *  - save/saveIcon: 명확한 한국어 오류를 throw(무음 실패 방지).
 *  - remove/list  : 무해한 no-op/빈 목록(삭제·조회할 로컬 파일이 애초에 없음).
 *
 * (ElectronStorageAdapter의 writeBinary=throw, removeBinary/listBinary=no-op 규칙과 동일.)
 */

import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';

export class MiniAppFileRepository implements IMiniAppRepository {
  async save(id: string, htmlBytes: Uint8Array): Promise<void> {
    const api = window.electronAPI?.miniApp;
    if (!api) {
      throw new Error('미니앱 저장은 데스크톱 앱에서만 지원됩니다.');
    }
    await api.save(id, htmlBytes);
  }

  async saveIcon(id: string, bytes: Uint8Array, ext: string): Promise<string> {
    const api = window.electronAPI?.miniApp;
    if (!api) {
      throw new Error('미니앱 아이콘 저장은 데스크톱 앱에서만 지원됩니다.');
    }
    return api.saveIcon(id, bytes, ext);
  }

  async remove(id: string): Promise<void> {
    const api = window.electronAPI?.miniApp;
    if (!api) return;
    await api.remove(id);
  }

  async list(): Promise<readonly string[]> {
    const api = window.electronAPI?.miniApp;
    if (!api) return [];
    return api.list();
  }
}
