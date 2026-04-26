/**
 * Drive 동기화 후 스토어 리로드 유틸리티.
 *
 * 다운로드된 파일 목록을 SYNC_REGISTRY에 dispatch하여 각 도메인별 reload를
 * 호출한다. 새 도메인 추가 시 syncRegistry.ts에 SyncDomain 항목만 추가하면
 * 본 파일은 변경 불필요.
 */
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';

export async function reloadStores(downloadedFiles: string[]): Promise<void> {
  for (const file of downloadedFiles) {
    try {
      // 동적 파일(note-body--{pageId}) 별도 처리.
      // 정적 키(note-notebooks/note-sections/note-pages-meta)는 SYNC_REGISTRY에 등록되어
      // 아래 registry dispatch가 처리한다. 동적 파일은 registry의 fileName과 일치하지
      // 않으므로 prefix 매칭으로 useNoteStore reload만 호출한다.
      if (file.startsWith('note-body--')) {
        const { useNoteStore } = await import('@adapters/stores/useNoteStore');
        useNoteStore.setState({ loaded: false });
        await useNoteStore.getState().load(true);
        continue;
      }

      // registry 기반 dispatch.
      const domain = SYNC_REGISTRY.find((d) => d.fileName === file);
      if (domain) {
        await domain.reload();
      } else {
        console.warn(`[DriveSync] reloadStores: registry에 없는 파일 키 (스킵): ${file}`);
      }
    } catch (err) {
      console.error(`[DriveSync] Failed to reload store for ${file}:`, err);
    }
  }
}
