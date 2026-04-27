import type { StickersData } from '../entities/Sticker';

export interface IStickerRepository {
  getStickers(): Promise<StickersData | null>;
  saveStickers(data: StickersData): Promise<void>;
}
