/**
 * 학생 사진 저장 규칙.
 *
 * 여기서 지키는 두 가지:
 * 1. 저장 키는 **불변 studentId** — 학번을 쓰면 전학·번호 재부여 때 다른 학생을 가리킨다
 * 2. 리사이즈는 **줄이기만** — 원본이 작은데 키우면 용량만 늘고 화질은 나빠진다
 */
import { describe, it, expect } from 'vitest';
import {
  STUDENT_PHOTO_LIMITS,
  computePhotoResizeTarget,
  isAllowedStudentPhotoMime,
  photoOwnerId,
  studentIdFromStorageRef,
  studentPhotoStorageRef,
} from '@domain/rules/studentPhotoRules';

describe('studentPhotoStorageRef', () => {
  it('불변 studentId 로 경로를 만든다', () => {
    expect(studentPhotoStorageRef('stu-abc-123')).toBe('student-photos/stu-abc-123.jpg');
  });

  it('경로에서 studentId 를 되돌린다 (고아 파일 청소용)', () => {
    expect(studentIdFromStorageRef('student-photos/stu-abc-123.jpg')).toBe('stu-abc-123');
    expect(studentIdFromStorageRef('obs-attachments/x.png')).toBeNull();
    expect(studentIdFromStorageRef('student-photos/x.png')).toBeNull();
  });

  it('왕복이 성립한다', () => {
    const id = 'a1b2-c3d4';
    expect(studentIdFromStorageRef(studentPhotoStorageRef(id))).toBe(id);
  });
});

describe('computePhotoResizeTarget', () => {
  it('긴 변을 320px 로 줄이고 비율을 지킨다', () => {
    expect(computePhotoResizeTarget(1200, 1600)).toEqual({ width: 240, height: 320 });
    expect(computePhotoResizeTarget(1600, 1200)).toEqual({ width: 320, height: 240 });
  });

  it('★원본이 상한보다 작으면 그대로 둔다 (업스케일 금지)', () => {
    expect(computePhotoResizeTarget(180, 240)).toEqual({ width: 180, height: 240 });
    expect(computePhotoResizeTarget(320, 320)).toEqual({ width: 320, height: 320 });
  });

  it('아주 납작한 사진도 최소 1px 은 남긴다', () => {
    const target = computePhotoResizeTarget(4000, 3);
    expect(target.width).toBe(320);
    expect(target.height).toBeGreaterThanOrEqual(1);
  });

  it('말이 안 되는 값은 0으로 막는다', () => {
    expect(computePhotoResizeTarget(0, 100)).toEqual({ width: 0, height: 0 });
    expect(computePhotoResizeTarget(-10, -10)).toEqual({ width: 0, height: 0 });
  });

  it('상한을 바꿔서도 쓸 수 있다', () => {
    expect(computePhotoResizeTarget(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });
});

describe('허용 형식과 상한', () => {
  it('jpeg·png·webp 만 받는다', () => {
    expect(isAllowedStudentPhotoMime('image/jpeg')).toBe(true);
    expect(isAllowedStudentPhotoMime('image/png')).toBe(true);
    expect(isAllowedStudentPhotoMime('image/webp')).toBe(true);
    expect(isAllowedStudentPhotoMime('image/gif')).toBe(false);
    expect(isAllowedStudentPhotoMime('application/pdf')).toBe(false);
  });

  it('상한 값이 계획대로다 (바뀌면 용량 추정이 어긋나므로 고정한다)', () => {
    expect(STUDENT_PHOTO_LIMITS.MAX_DIMENSION).toBe(320);
    expect(STUDENT_PHOTO_LIMITS.MAX_STORED_BYTES).toBe(80 * 1024);
  });
});

describe('photoOwnerId', () => {
  it('담임과 수업반이 섞이지 않는다', () => {
    expect(photoOwnerId('homeroom', 'homeroom')).toBe('homeroom:homeroom');
    expect(photoOwnerId('teaching-class', 'tc-1')).toBe('teaching-class:tc-1');
    expect(photoOwnerId('homeroom', 'tc-1')).not.toBe(photoOwnerId('teaching-class', 'tc-1'));
  });
});
