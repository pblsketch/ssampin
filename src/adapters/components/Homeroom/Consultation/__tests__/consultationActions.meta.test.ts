/**
 * 메타 테스트 — 상담 예약 수정/취소/일정 수정 진입점 회귀 차단.
 *
 * 회귀 시나리오 (2026-05-19 사용자 신고):
 *   "상담예약이 변경이 안 됨. 담임이 변경하려고 해도 안 되고
 *    신청자가 변경하려고 해도 상담예약 내역에서는 수정 버튼이 아예 없어서 너무 불편함."
 *   "담임 업무 > 상담 예약 탭에서 기존 예약 설정(시간/유형 등)을 즉시 수정 불가."
 *
 * 검증 방식 (실제 렌더링 없이 소스 정적 검사):
 *   ConsultationDetail.tsx 의 예약 카드 액션 영역에 다음 testId 가 존재해야 한다.
 *     - data-testid={`booking-${booking.id}-reschedule`}
 *     - data-testid={`booking-${booking.id}-cancel`}
 *   ConsultationTab.tsx 의 ConsultationCard 액션 영역에는 다음이 존재해야 한다.
 *     - data-testid={`schedule-${schedule.id}-edit`}
 *
 * 누군가 실수로 액션 영역에서 이 버튼을 제거하면 빌드/테스트가 깨져 회귀를 차단한다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../../..');

function readSource(relative: string): string {
  return readFileSync(resolve(ROOT, relative), 'utf-8');
}

describe('ConsultationDetail 예약 카드 액션', () => {
  const src = readSource('src/adapters/components/Homeroom/Consultation/ConsultationDetail.tsx');

  it('예약 카드에 "변경" 버튼(reschedule testid)이 존재한다', () => {
    expect(src).toMatch(/data-testid=\{`booking-\$\{[^}]+\}-reschedule`\}/);
  });

  it('예약 카드에 "취소" 버튼(cancel testid)이 존재한다', () => {
    expect(src).toMatch(/data-testid=\{`booking-\$\{[^}]+\}-cancel`\}/);
  });

  it('RescheduleBookingModal · CancelBookingConfirmDialog 가 import 되어 있다', () => {
    expect(src).toMatch(/from\s+['"]\.\/RescheduleBookingModal['"]/);
    expect(src).toMatch(/from\s+['"]\.\/CancelBookingConfirmDialog['"]/);
  });
});

describe('ConsultationTab 일정 카드 액션', () => {
  const src = readSource('src/adapters/components/Homeroom/Consultation/ConsultationTab.tsx');

  it('ConsultationCard 에 "수정" 버튼(edit testid)이 존재한다', () => {
    expect(src).toMatch(/data-testid=\{`schedule-\$\{[^}]+\}-edit`\}/);
  });

  it('ConsultationEditModal 이 import 되어 있다', () => {
    expect(src).toMatch(/from\s+['"]\.\/ConsultationEditModal['"]/);
  });
});
