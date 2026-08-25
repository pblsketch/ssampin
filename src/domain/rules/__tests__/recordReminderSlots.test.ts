import { describe, expect, it } from 'vitest';
import {
  resolvePromptText,
  resolveSlotPromptText,
  rankStalestStudents,
  SLOT_REMINDER_PROMPTS,
} from '@domain/rules/recordReminderRules';
import { emptySlots } from '@domain/rules/observationSlots';

/**
 * 슬롯 인지형 알림의 불변식.
 *
 * ★핵심: 문구만 바꾸고 **누구를 부를지는 바꾸지 않는다.** 슬롯이 비었다고 어제 기록한
 * 학생을 다시 부르면 성가시고, 그러면 알림을 꺼 버린다 — 알림이 꺼지면 기록이 안 쌓인다.
 */
describe('슬롯 문구', () => {
  it('빈 슬롯을 문구에 넣는다', () => {
    const text = resolveSlotPromptText(0, '서연', '시행착오');
    expect(text).toContain('서연');
    expect(text).toContain('시행착오');
  });

  it('슬롯을 모르면 기존 문구로 폴백한다', () => {
    expect(resolveSlotPromptText(0, '서연', undefined)).toBe(resolvePromptText(0, '서연'));
  });

  it('rotationIndex 로 문구가 순환한다(매번 같은 말이 뜨지 않게)', () => {
    const seen = new Set(
      Array.from({ length: SLOT_REMINDER_PROMPTS.length }, (_, i) =>
        resolveSlotPromptText(i, '서연', '질문'),
      ),
    );
    expect(seen.size).toBe(SLOT_REMINDER_PROMPTS.length);
  });

  it('음수 rotationIndex 에서도 터지지 않는다', () => {
    expect(() => resolveSlotPromptText(-3, '서연', '질문')).not.toThrow();
  });
});

describe('★선정 로직은 변하지 않는다', () => {
  const students = [
    { id: 'a', name: '가' },
    { id: 'b', name: '나' },
  ];
  const provider = (id: string): string | null => (id === 'a' ? '2026-08-01' : '2026-08-20');
  const now = new Date('2026-08-25T09:00:00');
  const config = { excludedStudentIds: [], focusedStudentIds: [] };

  it('슬롯 도입 전후로 순위가 같다 — 공백 오래된 순 그대로', () => {
    const ranked = rankStalestStudents(students, provider, config, now);
    // 'a' 가 더 오래 비었으므로 먼저 온다. 슬롯은 이 판정에 개입하지 않는다.
    expect(ranked.map((r) => r.student.id)).toEqual(['a', 'b']);
  });
});

describe('★교사가 추가한 슬롯은 재촉하지 않는다', () => {
  it('emptySlots 는 기본 어휘만 돌려준다', () => {
    // 알림은 이 결과에서 문구 대상을 고른다 — 커스텀이 섞이면 빈 슬롯이 항상 많아진다.
    const empty = emptySlots([], 'teaching');
    expect(empty).not.toContain('협업');
    expect(empty).toContain('질문');
  });
});
