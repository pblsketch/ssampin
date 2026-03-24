import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IImageWidgetRepository } from '@domain/repositories/IImageWidgetRepository';
import type { ImageWidgetsData } from '@domain/entities/ImageWidget';

export class JsonImageWidgetRepository implements IImageWidgetRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getAll(): Promise<ImageWidgetsData | null> {
    return this.storage.read<ImageWidgetsData>('image-widgets');
  }

  async save(data: ImageWidgetsData): Promise<void> {
    return this.storage.write('image-widgets', data);
  }
}
