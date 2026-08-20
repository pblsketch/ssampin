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
  photoSubjectKey,
  subjectKeyFromStorageRef,
  studentPhotoStorageRef,
} from '@domain/rules/studentPhotoRules';

describe('studentPhotoStorageRef', () => {
  it('키로 경로를 만든다', () => {
    expect(studentPhotoStorageRef('stu-abc-123')).toBe('student-photos/stu-abc-123.jpg');
  });

  it('경로에서 키를 되돌린다 (고아 파일 청소용)', () => {
    expect(subjectKeyFromStorageRef('student-photos/stu-abc-123.jpg')).toBe('stu-abc-123');
    expect(subjectKeyFromStorageRef('obs-attachments/x.png')).toBeNull();
    expect(subjectKeyFromStorageRef('student-photos/x.png')).toBeNull();
  });

  it('왕복이 성립한다', () => {
    const id = 'a1b2-c3d4';
    expect(subjectKeyFromStorageRef(studentPhotoStorageRef(id))).toBe(id);
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

describe('photoSubjectKey — 명단 종류마다 다른 키', () => {
  it('담임은 불변 Student.id 를 그대로 쓴다', () => {
    expect(photoSubjectKey('homeroom', 'homeroom', 'stu-abc-123')).toBe('stu-abc-123');
  });

  it('★수업반은 반 id 를 앞에 붙인다 — 한 반을 지울 때 다른 반이 안 지워지게', () => {
    expect(photoSubjectKey('teaching-class', 'tc-1', '3-1-2')).toBe('tc-1--3-1-2');
  });

  it('★같은 학생이 두 수업반에 있어도 키가 갈린다', () => {
    const a = photoSubjectKey('teaching-class', 'tc-1', '3-1-2');
    const b = photoSubjectKey('teaching-class', 'tc-2', '3-1-2');
    expect(a).not.toBe(b);
  });
});

describe('studentPhotoStorageRef — 파일명 안전성', () => {
  it('★파일명에 못 쓰는 글자를 걸러 낸다 (윈도우에서 저장이 조용히 실패한다)', () => {
    expect(studentPhotoStorageRef('tc:1/3-1-2')).toBe('student-photos/tc_1_3-1-2.jpg');
  });

  it('안전한 글자는 그대로 둔다', () => {
    expect(studentPhotoStorageRef('tc-1--3-1-2')).toBe('student-photos/tc-1--3-1-2.jpg');
  });
});

describe('photoOwnerId', () => {
  it('담임과 수업반이 섞이지 않는다', () => {
    expect(photoOwnerId('homeroom', 'homeroom')).toBe('homeroom:homeroom');
    expect(photoOwnerId('teaching-class', 'tc-1')).toBe('teaching-class:tc-1');
    expect(photoOwnerId('homeroom', 'tc-1')).not.toBe(photoOwnerId('teaching-class', 'tc-1'));
  });
});
