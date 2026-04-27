import type { IStickerRepository } from '@domain/repositories/IStickerRepository';
import type {
  Sticker,
  StickerPack,
  StickerSettings,
  StickersData,
} from '@domain/entities/Sticker';
import {
  createDefaultPack,
  createEmptyStickersData,
  DEFAULT_PACK_ID,
} from '@domain/entities/Sticker';
import { incrementUsage, findDuplicate } from '@domain/rules/stickerRules';
import { generateUUID } from '@infrastructure/utils/uuid';

/**
 * 이모티콘(스티커) 관리 유스케이스.
 * 모든 메서드는 풀-블롭 read → mutate → write 패턴을 따른다.
 */
export class ManageStickers {
  constructor(private readonly repo: IStickerRepository) {}

  /**
   * 저장된 데이터를 로드한다. 없으면 빈 데이터를 생성·저장 후 반환한다.
   * 마이그레이션: 기본 팩(DEFAULT_PACK_ID)이 누락되어 있으면 선두에 삽입한다.
   */
  async load(): Promise<StickersData> {
    const data = await this.repo.getStickers();
    const now = new Date().toISOString();

    if (!data) {
      const empty = createEmptyStickersData(now);
      await this.repo.saveStickers(empty);
      return empty;
    }

    if (!data.packs.some((p) => p.id === DEFAULT_PACK_ID)) {
      const migrated: StickersData = {
        ...data,
        packs: [createDefaultPack(now), ...data.packs],
      };
      await this.repo.saveStickers(migrated);
      return migrated;
    }

    return data;
  }

  async addSticker(input: {
    /**
     * 미리 발급된 id (선택). atomic 흐름에서 PNG 파일을 먼저 저장한 뒤
     * 동일 id로 metadata를 기록할 때 사용된다. 미지정 시 generateUUID() 사용.
     */
    id?: string;
    name: string;
    tags: readonly string[];
    packId: string;
    contentHash?: string;
  }): Promise<{ sticker: Sticker; data: StickersData }> {
    const current = await this.load();

    if (input.contentHash !== undefined && input.contentHash.length > 0) {
      const dup = findDuplicate(current.stickers, input.contentHash);
      if (dup) {
        throw new Error(`동일한 이모티콘이 이미 등록되어 있어요: ${dup.name}`);
      }
    }

    const newSticker: Sticker = {
      id: input.id !== undefined && input.id.length > 0 ? input.id : generateUUID(),
      name: input.name.trim(),
      tags: [...input.tags],
      packId: input.packId,
      createdAt: new Date().toISOString(),
      usageCount: 0,
      lastUsedAt: null,
      ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
    };

    const next: StickersData = {
      ...current,
      stickers: [...current.stickers, newSticker],
    };
    await this.repo.saveStickers(next);
    return { sticker: newSticker, data: next };
  }

  /**
   * 다수 이모티콘을 한 번에 등록한다 (시트 분할 등).
   *
   * - 각 input의 contentHash가 기존 stickers와 중복이면 skipped 항목으로만 기록하고
   *   계속 진행 (전체 트랜잭션 실패 X). 한 번의 saveStickers로 일괄 저장.
   * - id가 미리 발급되어 있으면 PNG 파일과 metadata id를 일치시킬 수 있다.
   */
  async addStickersBulk(
    inputs: ReadonlyArray<{
      id?: string;
      name: string;
      tags: readonly string[];
      packId: string;
      contentHash?: string;
    }>,
  ): Promise<{
    stickers: Sticker[];
    data: StickersData;
    skipped: Array<{ index: number; reason: string }>;
  }> {
    const current = await this.load();
    const newStickers: Sticker[] = [];
    const skipped: Array<{ index: number; reason: string }> = [];
    const stickers: Sticker[] = [...current.stickers];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      if (input.contentHash !== undefined && input.contentHash.length > 0) {
        const dup = findDuplicate(stickers, input.contentHash);
        if (dup) {
          skipped.push({ index: i, reason: `중복: ${dup.name}` });
          continue;
        }
      }
      const sticker: Sticker = {
        id: input.id !== undefined && input.id.length > 0 ? input.id : generateUUID(),
        name: input.name.trim(),
        tags: [...input.tags],
        packId: input.packId,
        createdAt: new Date().toISOString(),
        usageCount: 0,
        lastUsedAt: null,
        ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
      };
      stickers.push(sticker);
      newStickers.push(sticker);
    }

    const next: StickersData = { ...current, stickers };
    await this.repo.saveStickers(next);
    return { stickers: newStickers, data: next, skipped };
  }

  async updateSticker(
    id: string,
    patch: Partial<Pick<Sticker, 'name' | 'tags' | 'packId'>>,
  ): Promise<StickersData> {
    const current = await this.load();
    const next: StickersData = {
      ...current,
      stickers: current.stickers.map((s) => {
        if (s.id !== id) return s;
        const nextName = patch.name !== undefined ? patch.name.trim() : s.name;
        const nextTags = patch.tags !== undefined ? [...patch.tags] : s.tags;
        const nextPackId = patch.packId !== undefined ? patch.packId : s.packId;
        return { ...s, name: nextName, tags: nextTags, packId: nextPackId };
      }),
    };
    await this.repo.saveStickers(next);
    return next;
  }

  async deleteSticker(id: string): Promise<StickersData> {
    const current = await this.load();
    const next: StickersData = {
      ...current,
      stickers: current.stickers.filter((s) => s.id !== id),
    };
    await this.repo.saveStickers(next);
    return next;
  }

  async recordUsage(id: string): Promise<StickersData> {
    const current = await this.load();
    const now = new Date().toISOString();
    const next: StickersData = {
      ...current,
      stickers: current.stickers.map((s) =>
        s.id === id ? incrementUsage(s, now) : s,
      ),
    };
    await this.repo.saveStickers(next);
    return next;
  }

  async addPack(name: string): Promise<{ pack: StickerPack; data: StickersData }> {
    const current = await this.load();
    const maxOrder = current.packs.reduce((m, p) => Math.max(m, p.order), -1);
    const pack: StickerPack = {
      id: generateUUID(),
      name: name.trim(),
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };
    const next: StickersData = {
      ...current,
      packs: [...current.packs, pack],
    };
    await this.repo.saveStickers(next);
    return { pack, data: next };
  }

  async renamePack(id: string, newName: string): Promise<StickersData> {
    const current = await this.load();
    const next: StickersData = {
      ...current,
      packs: current.packs.map((p) =>
        p.id === id ? { ...p, name: newName.trim() } : p,
      ),
    };
    await this.repo.saveStickers(next);
    return next;
  }

  async deletePack(id: string): Promise<StickersData> {
    if (id === DEFAULT_PACK_ID) {
      throw new Error('기본 팩은 삭제할 수 없어요.');
    }
    const current = await this.load();
    const next: StickersData = {
      ...current,
      packs: current.packs.filter((p) => p.id !== id),
      stickers: current.stickers.map((s) =>
        s.packId === id ? { ...s, packId: DEFAULT_PACK_ID } : s,
      ),
    };
    await this.repo.saveStickers(next);
    return next;
  }

  async reorderPacks(orderedIds: readonly string[]): Promise<StickersData> {
    const current = await this.load();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    const next: StickersData = {
      ...current,
      packs: current.packs.map((p) => ({
        ...p,
        order: orderMap.get(p.id) ?? p.order,
      })),
    };
    await this.repo.saveStickers(next);
    return next;
  }

  async updateSettings(patch: Partial<StickerSettings>): Promise<StickersData> {
    const current = await this.load();
    const next: StickersData = {
      ...current,
      settings: { ...current.settings, ...patch },
    };
    await this.repo.saveStickers(next);
    return next;
  }
}
