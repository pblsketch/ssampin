import type { ConsultationType, ConsultationMethod } from '../entities/Consultation';

/** 상담 방식 한글 라벨 */
export function consultationMethodLabel(method: ConsultationMethod): string {
  switch (method) {
    case 'face': return '대면';
    case 'phone': return '전화';
    case 'video': return '화상';
    default: return method;
  }
}

/** 상담 방식 이모지 */
function methodEmoji(method: ConsultationMethod): string {
  switch (method) {
    case 'face': return '🤝';
    case 'phone': return '📞';
    case 'video': return '💻';
    default: return '📋';
  }
}

/** 상담 예약 → 캘린더 이벤트 제목 생성 */
export function buildConsultationEventTitle(
  studentNumber: number,
  studentName: string,
  method: ConsultationMethod,
  consultationType: ConsultationType,
  bookerRelation?: string,
): string {
  const emoji = methodEmoji(method);
  const typeLabel = consultationType === 'parent' ? '학부모 상담' : '상담';
  const relation = bookerRelation ? ` ${bookerRelation}` : '';
  return `${emoji} ${typeLabel} - ${studentNumber}번 ${studentName}${relation}`;
}

/** 상담 예약 → 캘린더 이벤트 설명 생성 */
export function buildConsultationEventDescription(
  opts: {
    method?: ConsultationMethod;
    bookerName?: string;
    bookerPhone?: string;
    topic?: string;
  },
): string {
  const lines: string[] = ['[쌤핀 상담 예약]'];
  if (opts.method) lines.push(`방식: ${consultationMethodLabel(opts.method)}`);
  if (opts.bookerName) lines.push(`예약자: ${opts.bookerName}`);
  if (opts.bookerPhone) lines.push(`연락처: ${opts.bookerPhone}`);
  if (opts.topic) lines.push(`상담 주제: ${opts.topic}`);
  return lines.join('\n');
}
