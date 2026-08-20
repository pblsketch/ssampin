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

/**
 * 사진 한 장을 가리키는 키를 만든다.
 *
 * 명단 종류마다 학생을 구분하는 방식이 다르다.
 *
 * | 종류 | 앱이 학생을 구분하는 방식 | 사진 키 |
 * |---|---|---|
 * | 담임 | 불변 `Student.id` | 그대로 사용 |
 * | 수업반 | `학년-반-번호`(`studentKey`) | `{수업반 id}--{학년-반-번호}` |
 *
 * ⚠️ **수업반 키에 수업반 id 를 앞에 붙이는 이유**: 한 학생이 여러 수업반에 들어갈 수 있는데,
 * 키를 공유하면 **한 수업반의 사진을 지울 때 다른 수업반 것까지 사라진다.**
 * 반별로 따로 두면 용량이 조금 늘지만(반당 1MB 남짓) 삭제가 예측대로 동작한다.
 *
 * ⚠️ 수업반 키는 **학년-반-번호라 바뀔 수 있다.** 다만 수업반의 출결·좌석·수업 기록이
 * 이미 같은 키를 쓰므로, 사진만 더 엄격한 식별을 요구할 이유가 없다(오너 확정).
 * 어긋나면 사진 명렬표를 다시 넣는 것으로 바로잡힌다.
 */
export function photoSubjectKey(
  ownerKind: StudentPhotoOwnerKind,
  ownerKey: string,
  studentRef: string,
): string {
  return ownerKind === 'homeroom' ? studentRef : `${ownerKey}--${studentRef}`;
}

/**
 * 바이너리 저장 경로.
 *
 * ⚠️ 파일명에 쓸 수 없는 글자를 걸러 낸다. 윈도우는 `:` 같은 글자를 파일명에 못 쓰는데,
 * 그대로 두면 저장이 조용히 실패해 사진이 사라진다.
 */
export function studentPhotoStorageRef(subjectKey: string): string {
  return `student-photos/${subjectKey.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
}

/** `student-photos/` 아래 파일명에서 키를 되돌린다 (고아 파일 청소용) */
export function subjectKeyFromStorageRef(storageRef: string): string | null {
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
