import type { StaffContactsData } from '../entities/StaffContact';

export interface IStaffContactRepository {
  load(): Promise<StaffContactsData | null>;
  save(data: StaffContactsData): Promise<void>;
}
