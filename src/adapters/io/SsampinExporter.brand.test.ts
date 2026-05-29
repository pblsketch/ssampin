import { describe, it, expect, expectTypeOf } from 'vitest';
import { createNoPiiDto, createNoPiiDtos, type StudentNoPiiDto } from './createNoPiiDto';
import type { Student } from '@domain/entities/Student';
import type { NoPii } from '@shared/types/Brand';

/**
 * SsampinExporter.brand.test — Decision 6 + Critic C#7
 *
 * Acceptance:
 * - 'raw Student rejected via tsc compile error' (Brand 타입 검증)
 * - 'createNoPiiDto strips Student PII-adjacent fields'
 */

describe('createNoPiiDto factory (P8 Brand 강제)', () => {
  it('strips phone, parentPhone, birthDate, status notes', () => {
    const raw: Student = {
      id: 's1',
      name: '홍길동',
      studentNumber: 1,
      phone: '010-0000-0000',
      parentPhone: '010-1111-1111',
      parentPhoneLabel: '엄마',
      parentPhone2: '010-2222-2222',
      parentPhone2Label: '아빠',
      birthDate: '2010-01-01',
      isVacant: false,
      status: 'active',
      statusNote: '재학 중',
      statusChangedAt: '2024-03-02',
    };
    const dto = createNoPiiDto(raw);
    expect(dto.id).toBe('s1');
    expect(dto.name).toBe('홍길동');
    expect(dto.studentNumber).toBe(1);
    expect(dto.isVacant).toBe(false);
    expect(dto.status).toBe('active');

    // PII-인접 필드 부재 (런타임 검증)
    // @ts-expect-error — StudentNoPiiDto 인터페이스에 phone 필드 없음
    expect(dto.phone).toBeUndefined();
    // @ts-expect-error — parentPhone 필드 없음
    expect(dto.parentPhone).toBeUndefined();
    // @ts-expect-error — birthDate 필드 없음
    expect(dto.birthDate).toBeUndefined();
    // @ts-expect-error — statusNote 필드 없음
    expect(dto.statusNote).toBeUndefined();
  });

  it('Brand 타입 마커 부착: dto는 NoPii 브랜드 보유', () => {
    const raw: Student = { id: 's2', name: 'A' };
    const dto = createNoPiiDto(raw);
    // 타입 레벨: dto는 StudentNoPiiDto & NoPii
    expectTypeOf(dto).toMatchTypeOf<StudentNoPiiDto & NoPii>();
  });

  it('raw Student는 StudentNoPiiDto & NoPii로 직접 할당 불가 (compile-time guarantee)', () => {
    const raw: Student = { id: 's3', name: 'B' };
    // @ts-expect-error — raw Student는 NoPii 브랜드 미보유. createNoPiiDto만 합법 경로.
    const illegal: StudentNoPiiDto & NoPii = raw;
    expect(illegal.id).toBe('s3');
  });

  it('createNoPiiDtos: 배열 일괄 처리', () => {
    const raws: Student[] = [
      { id: 's1', name: 'a', phone: '010' },
      { id: 's2', name: 'b', birthDate: '2010-01-01' },
    ];
    const dtos = createNoPiiDtos(raws);
    expect(dtos).toHaveLength(2);
    for (const dto of dtos) {
      // @ts-expect-error — phone 없음
      expect(dto.phone).toBeUndefined();
    }
  });

  it('vacant 학생도 정상 처리 (옵셔널 필드 보존)', () => {
    const raw: Student = { id: 's4', name: '결번', isVacant: true };
    const dto = createNoPiiDto(raw);
    expect(dto.isVacant).toBe(true);
    expect(dto.name).toBe('결번');
  });
});
