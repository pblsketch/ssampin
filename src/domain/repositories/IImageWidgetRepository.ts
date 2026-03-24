import type { ImageWidgetsData } from '../entities/ImageWidget';

export interface IImageWidgetRepository {
  getAll(): Promise<ImageWidgetsData | null>;
  save(data: ImageWidgetsData): Promise<void>;
}
