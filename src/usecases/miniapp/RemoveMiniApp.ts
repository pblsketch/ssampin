import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';
import type { MiniApp } from '@domain/entities/MiniApp';

export interface RemoveMiniAppDeps {
  readonly repo: IMiniAppRepository;
}

/**
 * 미니앱 삭제 — 파일(HTML·아이콘)을 지우고 메타 목록에서도 제거한다.
 *
 * @returns id가 제거된 다음 목록
 */
export async function removeMiniApp(
  deps: RemoveMiniAppDeps,
  id: string,
  existing: readonly MiniApp[],
): Promise<readonly MiniApp[]> {
  await deps.repo.remove(id);
  return existing.filter((app) => app.id !== id);
}
