import type { SchoolEvent } from '../entities/SchoolEvent';
import type { GoogleCalendarEvent } from '../ports/IGoogleCalendarPort';

/**
 * 타임존 안전한 날짜 산술 (문자열 기반, Date 객체 불사용)
 * @param dateStr 'YYYY-MM-DD' 형식
 * @param days 더할 일수 (음수 가능)
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  // UTC 정오로 설정하여 DST/타임존 영향 제거
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const ry = date.getUTCFullYear();
  const rm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(date.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/**
 * 쌤핀 이벤트를 구글 캘린더 이벤트 형태로 변환
 */
export function toGoogleEvent(event: SchoolEvent): Partial<GoogleCalendarEvent> {
  // 종일 이벤트인지 판단 (time이 없으면 종일)
  const isAllDay = !event.time && !event.startTime;

  if (isAllDay) {
    // Google Calendar 종일 이벤트는 exclusive end date 사용 (1일 추가)
    const endDate = event.endDate || event.date;
    const endStr = addDays(endDate, 1);

    return {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: { date: event.date },
      end: { date: endStr },
    };
  }

  // 시간이 있는 이벤트
  const startTime = event.startTime || (event.time?.split(' - ')[0]) || '09:00';
  const endTime = event.endTime || (event.time?.split(' - ')[1]) || '10:00';

  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: `${event.date}T${startTime}:00`, timeZone: 'Asia/Seoul' },
    end: { dateTime: `${event.endDate || event.date}T${endTime}:00`, timeZone: 'Asia/Seoul' },
  };
}

/**
 * 구글 캘린더 이벤트를 쌤핀 이벤트로 변환
 */
export function fromGoogleEvent(
  gEvent: GoogleCalendarEvent,
  googleCalendarId: string,
  categoryId: string,
): SchoolEvent {
  const isAllDay = !!gEvent.start.date;

  let date: string;
  let endDate: string | undefined;
  let time: string | undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;

  if (isAllDay) {
    date = gEvent.start.date!;
    // Google의 exclusive end date에서 1일 빼기 (타임존 안전)
    if (gEvent.end.date) {
      const endStr = addDays(gEvent.end.date, -1);
      endDate = endStr !== date ? endStr : undefined;
    }
  } else {
    // dateTime에서 날짜와 시간 추출
    const startDt = gEvent.start.dateTime!;
    const endDt = gEvent.end.dateTime!;
    date = startDt.substring(0, 10);
    startTime = startDt.substring(11, 16);
    endTime = endDt.substring(11, 16);
    time = `${startTime} - ${endTime}`;
    const endDateStr = endDt.substring(0, 10);
    endDate = endDateStr !== date ? endDateStr : undefined;
  }

  return {
    id: `gcal:${googleCalendarId}:${gEvent.id}`,
    title: gEvent.summary || '(제목 없음)',
    date,
    endDate,
    category: categoryId,
    description: gEvent.description,
    location: gEvent.location,
    time,
    startTime,
    endTime,
    googleEventId: gEvent.id,
    googleCalendarId,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    googleUpdatedAt: gEvent.updated,
    etag: gEvent.etag,
    source: 'google',
  };
}

/**
 * 충돌 감지: 로컬과 리모트 이벤트가 모두 수정되었는지 확인
 */
export function detectConflict(
  local: SchoolEvent,
  remote: GoogleCalendarEvent,
): boolean {
  if (!remote.updated) return false;
  // 로컬이 마지막 동기화 이후 수정됨: isModified 플래그 또는 googleUpdatedAt 비교
  const localUpdated = local.isModified || (
    local.googleUpdatedAt && local.lastSyncedAt
      ? new Date(local.googleUpdatedAt).getTime() > new Date(local.lastSyncedAt).getTime()
      : false
  );
  // 리모트가 마지막 동기화 이후 수정됨
  const remoteUpdated = local.lastSyncedAt
    ? new Date(remote.updated).getTime() > new Date(local.lastSyncedAt).getTime()
    : true;
  return !!localUpdated && remoteUpdated;
}

/**
 * 최근 수정 우선으로 충돌 해결
 */
export function resolveConflictByLatest(
  local: SchoolEvent,
  remote: GoogleCalendarEvent,
): 'local' | 'remote' {
  const localTime = local.googleUpdatedAt ? new Date(local.googleUpdatedAt).getTime() : 0;
  const remoteTime = new Date(remote.updated).getTime();
  return localTime >= remoteTime ? 'local' : 'remote';
}

/**
 * 토큰 만료 확인 (기본 5분 버퍼)
 */
export function isTokenExpired(expiresAt: number, bufferMs: number = 5 * 60 * 1000): boolean {
  return Date.now() >= expiresAt - bufferMs;
}

