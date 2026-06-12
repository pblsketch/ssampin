/**
 * ManageUserTemplates — "내 템플릿" 저장/목록/삭제 유스케이스 (PDCA-4 / G006)
 *
 * 저장: 보드 스냅샷(Y.Doc 바이너리) → 살아있는 요소 추출 → templates/{id}.json.
 * 호출 측(electron/ipc/board.ts)이 스냅샷 출처를 결정한다 —
 * 활성 세션이면 handle.encodeState()(실시간), 아니면 저장된 .ybin.
 */
import {
  sanitizeUserTemplateName,
  type UserTemplate,
  type UserTemplateMeta,
} from '@domain/entities/UserTemplate';
import type { IBoardSnapshotCodec } from '@domain/ports/IBoardSnapshotCodec';
import type { IUserTemplateRepo } from '@domain/ports/IUserTemplateRepo';

/** 저장 당시 Excalidraw 버전 — infrastructure/board/constants.ts 와 동기 */
const EXCALIDRAW_VERSION_SCHEMA = '0.17.6';

export class ManageUserTemplates {
  constructor(
    private readonly repo: IUserTemplateRepo,
    private readonly codec: IBoardSnapshotCodec,
  ) {}

  async listAll(): Promise<UserTemplateMeta[]> {
    return this.repo.listAll();
  }

  /**
   * 보드 스냅샷을 내 템플릿으로 저장.
   * - 빈 보드(살아있는 요소 0)는 거부 — USER_TEMPLATE_EMPTY
   * - 이름이 비면 "내 템플릿 N" 자동 부여
   */
  async saveFromSnapshot(name: string | undefined, snapshot: Uint8Array): Promise<UserTemplate> {
    const elements = this.codec.extractElements(snapshot);
    if (elements.length === 0) {
      throw new Error('USER_TEMPLATE_EMPTY');
    }
    const resolvedName = sanitizeUserTemplateName(name ?? '') ?? (await this.nextDefaultName());
    return this.repo.save({
      name: resolvedName,
      versionSchema: EXCALIDRAW_VERSION_SCHEMA,
      elements,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private async nextDefaultName(): Promise<string> {
    const existing = await this.repo.listAll();
    return `내 템플릿 ${existing.length + 1}`;
  }
}
