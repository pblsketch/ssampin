import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IStaffContactRepository } from '@domain/repositories/IStaffContactRepository';
import type { StaffContactsData } from '@domain/entities/StaffContact';

export class JsonStaffContactRepository implements IStaffContactRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<StaffContactsData | null> {
    return this.storage.read<StaffContactsData>('staff-contacts');
  }

  save(data: StaffContactsData): Promise<void> {
    return this.storage.write('staff-contacts', data);
  }
}
