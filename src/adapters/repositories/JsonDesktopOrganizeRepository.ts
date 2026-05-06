import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDesktopOrganizeRepository } from '@domain/repositories/IDesktopOrganizeRepository';
import type { DesktopOrganizeConfig } from '@domain/entities/DesktopOrganizeConfig';

/**
 * desktop-organize 카드 설정 영속화 어댑터.
 * IStoragePort에 위임 → Electron(userData JSON) / 브라우저(localStorage) 자동 분기.
 */
export class JsonDesktopOrganizeRepository implements IDesktopOrganizeRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<DesktopOrganizeConfig | null> {
    return this.storage.read<DesktopOrganizeConfig>('desktop-organize');
  }

  save(data: DesktopOrganizeConfig): Promise<void> {
    return this.storage.write('desktop-organize', data);
  }
}
