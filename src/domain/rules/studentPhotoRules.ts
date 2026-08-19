/**
 * 학생 사진 저장 규칙 (순수 계산).
 *
 * 크기 상한을 두는 이유는 두 가지다.
 * 1. **용량** — 담임 22명 + 수업반 8개 × 25명이면 220장이 상시 존재한다.
 *    원본(장당 100~180KB)을 그대로 두면 담당 반이 많은 교사는 수십 MB가 된다.
 * 2. **유출 표면** — 얼굴 사진은 작을수록 낫다. 이름을 익히는 데 원본 해상도가 필요하지 않다.
 */

import type { StudentPhotoOwnerKind } from '@domain/entities/StudentPhoto';

export const STUDENT_PHOTO_LIMITS = {
  /** 긴 변 최대 길이 (px). 카드에 얼굴을 알아볼 수 있으면 충분하다. */
  MAX_DIMENSION: 320,
  /** 저장 후 장당 상한 (bytes) */
  MAX_STORED_BYTES: 80 * 1024,
  /** 가져오기 단계에서 받아들일 원본 상한 (bytes) */
  MAX_SOURCE_BYTES: 8 * 1024 * 1024,
  /** JPEG 재압축 품질 */
  JPEG_QUALITY: 0.8,
  ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const;

export type AllowedStudentPhotoMime = (typeof STUDENT_PHOTO_LIMITS.ALLOWED_MIME)[number];

export function isAllowedStudentPhotoMime(mime: string): mime is AllowedStudentPhotoMime {
  return (STUDENT_PHOTO_LIMITS.ALLOWED_MIME as readonly string[]).includes(mime);
}

/** 바이너리 저장 경로. 키는 **불변 studentId** 다 (학번 금지 — 학번은 다른 학생을 가리키게 된다). */
export function studentPhotoStorageRef(studentId: string): string {
  return `student-photos/${studentId}.jpg`;
}

/** `student-photos/` 아래 파일명에서 studentId 를 되돌린다 (고아 파일 청소용) */
export function studentIdFromStorageRef(storageRef: string): string | null {
  const matched = /^student-photos\/(.+)\.jpg$/.exec(storageRef);
  return matched ? matched[1]! : null;
}

/**
 * 리사이즈 목표 크기.
 *
 * ⚠️ **키우지 않는다.** 나이스 명렬표 사진은 원본이 320px보다 작은 경우가 흔한데,
 * 확대하면 용량만 늘고 화질은 오히려 나빠진다.
 */
export function computePhotoResizeTarget(
  width: number,
  height: number,
  maxDimension: number = STUDENT_PHOTO_LIMITS.MAX_DIMENSION,
): { readonly width: number; readonly height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** 반별 일괄 삭제·묶음 동기화의 단위 키 */
export function photoOwnerId(ownerKind: StudentPhotoOwnerKind, ownerKey: string): string {
  return `${ownerKind}:${ownerKey}`;
}
