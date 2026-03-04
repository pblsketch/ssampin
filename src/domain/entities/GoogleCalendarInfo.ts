/** 구글 캘린더 정보 */
export interface GoogleCalendarInfo {
  readonly id: string;
  readonly summary: string;
  readonly backgroundColor?: string;
  readonly primary?: boolean;
  readonly accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
}
