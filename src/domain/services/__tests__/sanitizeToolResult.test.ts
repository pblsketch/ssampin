/**
 * 쌤핀 AI — 화이트리스트 재구성 (egress 4중 그물 ②)
 *
 * ★함정 픽스처: 원본에 개인정보 필드를 **일부러 심어** 두고 결과에 안 나오는지 본다.
 * 그물은 "있다"가 아니라 "잡는다"를 증명해야 한다.
 */
import { describe, expect, it } from 'vitest';

import type { AssistToolDef } from '@domain/entities/AssistTool';
import { findDisallowedFields, sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import { findAssistTool } from '@domain/services/assistToolRegistry';

const attendanceTool = findAssistTool('get_attendance_summary') as AssistToolDef;

describe('sanitizeToolResult — 재구성', () => {
  it('허용 필드만 남기고 나머지는 키 자체가 사라진다', () => {
    const raw = {
      date: '2026-08-21',
      className: '3학년 2반',
      present: 27,
      absent: 1,
      late: 2,
      early: 0,
      classAbsence: 0,
      // 함정 — 실제로는 이런 필드가 원본에 섞여 들어올 수 있다
      studentName: '김지훈',
      studentId: '30215',
      absentReason: '아버지 실직으로 결석',
      phone: '010-9999-8888',
    };

    const safe = sanitizeToolResult(attendanceTool, raw);

    expect(Object.keys(safe).sort()).toEqual(
      ['absent', 'classAbsence', 'className', 'date', 'early', 'late', 'present'].sort(),
    );
    expect('studentName' in safe).toBe(false);
    expect('studentId' in safe).toBe(false);
    expect('absentReason' in safe).toBe(false);
    expect('phone' in safe).toBe(false);
  });

  it('★원본에 새 필드가 나중에 추가돼도 새어 나가지 않는다', () => {
    // 이것이 "빼는 방식" 대신 "새로 만드는 방식"을 쓴 이유다.
    const raw = {
      date: '2026-08-21',
      className: '3학년 2반',
      present: 27,
      absent: 0,
      late: 0,
      early: 0,
      classAbsence: 0,
      아직없는_미래필드: '언젠가 누가 추가할 값',
      guardianContact: '010-1111-2222',
    };

    const safe = sanitizeToolResult(attendanceTool, raw);

    expect(findDisallowedFields(attendanceTool, safe)).toEqual([]);
    expect(Object.keys(safe)).not.toContain('아직없는_미래필드');
    expect(Object.keys(safe)).not.toContain('guardianContact');
  });

  it('허용 필드가 원본에 없으면 그냥 빠진다 — 전체를 실패시키지 않는다', () => {
    // 실패시키면 숫자 카드가 통째로 사라져 P5(모델이 죽어도 숫자는 남는다)가 깨진다.
    const safe = sanitizeToolResult(attendanceTool, { className: '1학년 4반', present: 30 });

    expect(Object.keys(safe).sort()).toEqual(['className', 'present']);
    expect('absent' in safe).toBe(false);
  });

  it('중첩 값도 허용 필드로 재구성한다 (nestedFields)', () => {
    const todos = findAssistTool('get_my_todos') as AssistToolDef;
    const safe = sanitizeToolResult(todos, {
      items: [{ title: '수행평가 채점', due: '2026-08-25', done: false }],
      ownerEmail: 'teacher@example.com',
    });

    expect(Object.keys(safe)).toEqual(['items']);
    // ⚠️ items 안의 자유 문자열은 여기서 걸러지지 않는다 — 그물 ③(assertNoPii) 소관이다.
    expect(Array.isArray(safe.items)).toBe(true);
  });

  it('findDisallowedFields 가 허용 목록 밖 키를 잡아낸다', () => {
    const leaked = { className: '3학년 2반', count: 30, studentName: '김지훈' };
    const countTool = findAssistTool('count_students') as AssistToolDef;

    expect(findDisallowedFields(countTool, leaked)).toEqual(['studentName']);
  });
});
