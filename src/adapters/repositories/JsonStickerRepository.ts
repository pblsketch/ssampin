import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IStickerRepository } from '@domain/repositories/IStickerRepository';
import type { StickersData } from '@domain/entities/Sticker';

export class JsonStickerRepository implements IStickerRepository {
  constructor(private readonly storage: IStoragePort) {}

  getStickers(): Promise<StickersData | null> {
    return this.storage.read<StickersData>('stickers');
  }

  saveStickers(data: StickersData): Promise<void> {
    return this.storage.write('stickers', data);
  }
}
