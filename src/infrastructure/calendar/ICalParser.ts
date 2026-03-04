/**
 * iCal(.ics) 파서 — RFC 5545 기본 지원
 * 외부 라이브러리 없이 VEVENT 블록에서 핵심 속성만 추출
 */

export interface ParsedCalEvent {
  uid: string;
  summary: string;
  dtstart: string;      // "YYYY-MM-DD"
  dtend?: string;       // "YYYY-MM-DD"
  description?: string;
  location?: string;
  rrule?: string;
}

/**
 * iCal(.ics) 텍스트를 파싱하여 이벤트 배열로 변환
 */
export function parseICal(icalText: string): ParsedCalEvent[] {
  const events: ParsedCalEvent[] = [];
  const lines = unfoldLines(icalText);

  let inEvent = false;
  let current: Partial<ParsedCalEvent> = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
    } else if (line === 'END:VEVENT') {
      inEvent = false;
      if (current.uid && current.summary && current.dtstart) {
        events.push(current as ParsedCalEvent);
      }
    } else if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      const baseKey = key.split(';')[0]; // DTSTART;VALUE=DATE → DTSTART

      switch (baseKey) {
        case 'UID':
          current.uid = value;
          break;
        case 'SUMMARY':
          current.summary = unescapeICalText(value);
          break;
        case 'DTSTART':
          current.dtstart = parseICalDate(value);
          break;
        case 'DTEND':
          current.dtend = parseICalDate(value);
          break;
        case 'DESCRIPTION':
          current.description = unescapeICalText(value);
          break;
        case 'LOCATION':
          current.location = unescapeICalText(value);
          break;
        case 'RRULE':
          current.rrule = value;
          break;
      }
    }
  }

  return events;
}

/**
 * iCal의 긴 줄 접기(unfolding) 처리
 * RFC 5545: 줄이 공백/탭으로 시작하면 이전 줄의 연속
 */
function unfoldLines(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').split('\n');
}

/**
 * iCal 날짜를 "YYYY-MM-DD" 형식으로 변환
 * 입력 예: "20260304", "20260304T090000Z", "20260304T090000"
 */
function parseICalDate(value: string): string {
  const cleaned = value.replace(/[TZ]/g, ' ').trim();
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  return value;
}

/**
 * iCal 이스케이프 문자 복원
 */
function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}
