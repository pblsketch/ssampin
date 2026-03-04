import type { IGoogleCalendarPort } from '@domain/ports/IGoogleCalendarPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { CalendarMapping } from '@domain/entities/CalendarMapping';
import type { GoogleCalendarInfo } from '@domain/entities/GoogleCalendarInfo';

/** 캘린더 매핑 관리 유스케이스 */
export class ManageCalendarMapping {
  constructor(
    private readonly calendarPort: IGoogleCalendarPort,
    private readonly syncRepo: ICalendarSyncRepository,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  /** 사용자의 구글 캘린더 목록 조회 */
  async listGoogleCalendars(): Promise<readonly GoogleCalendarInfo[]> {
    const accessToken = await this.getAccessToken();
    return this.calendarPort.listCalendars(accessToken);
  }

  /** 새 구글 캘린더 생성 */
  async createGoogleCalendar(name: string): Promise<GoogleCalendarInfo> {
    const accessToken = await this.getAccessToken();
    return this.calendarPort.createCalendar(accessToken, name);
  }

  /** 매핑 저장 */
  async saveMappings(mappings: readonly CalendarMapping[]): Promise<void> {
    await this.syncRepo.saveMappings(mappings);
  }

  /** 현재 매핑 조회 */
  async getMappings(): Promise<readonly CalendarMapping[]> {
    return this.syncRepo.getMappings();
  }
}
