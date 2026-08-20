/**
 * 명렬표에서 읽어 낸 사진을 줄여서 저장한다.
 *
 * ## 한 장이 실패해도 나머지는 저장한다
 *
 * 사진 한 장이 깨졌다고 반 전체를 못 가져오면 교사는 원인을 알 수 없다.
 * 실패한 학생만 건너뛰고 **누가 왜 빠졌는지 돌려준다** — 화면은 그걸 그대로 안내하면 된다.
 *
 * ## 저장 키는 반드시 확정된 `Student.id` 다
 *
 * ⚠️ 이 유즈케이스는 **명단 병합이 끝난 뒤에** 불러야 한다.
 * 명단 가져오기에서 새 학생이 생기면 그때 새 `Student.id` 가 발급되는데,
 * 그 전에 저장하면 사진이 존재하지 않는 학생을 가리키게 된다.
 */

import type { IImageResizerPort } from '@domain/ports/IImageResizerPort';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { StudentPhoto, StudentPhotoOwnerKind } from '@domain/entities/StudentPhoto';
import {
  STUDENT_PHOTO_LIMITS,
  isAllowedStudentPhotoMime,
  studentPhotoStorageRef,
} from '@domain/rules/studentPhotoRules';

/** 사진을 저장하지 못한 이유 — 사용자 안내와 진단에 그대로 쓴다 */
export type SkipReason =
  /** 허용하지 않는 이미지 형식 */
  | 'UNSUPPORTED_MIME'
  /** 원본이 너무 큼 */
  | 'SOURCE_TOO_LARGE'
  /** 축소 자체가 실패 (깨진 이미지 등) */
  | 'RESIZE_FAILED'
  /** 최대한 줄여도 상한을 넘음 */
  | 'STILL_TOO_LARGE';

export const SKIP_REASON_MESSAGES: Record<SkipReason, string> = {
  UNSUPPORTED_MIME: '지원하지 않는 이미지 형식이에요.',
  SOURCE_TOO_LARGE: '사진 파일이 너무 커요.',
  RESIZE_FAILED: '사진을 읽지 못했어요.',
  STILL_TOO_LARGE: '사진을 줄여도 용량이 너무 커요.',
};

export interface RosterPhotoToSave {
  /** 명단 병합이 끝난 뒤 확정된 불변 id */
  readonly subjectKey: string;
  readonly studentNumber?: number;
  readonly studentName?: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface SaveRosterPhotosInput {
  readonly ownerKind: StudentPhotoOwnerKind;
  readonly ownerKey: string;
  readonly photos: readonly RosterPhotoToSave[];
  /** ISO 8601 — 시계를 주입해 시험이 흔들리지 않게 한다 */
  readonly now: string;
}

export interface SaveRosterPhotosResult {
  readonly savedCount: number;
  readonly skipped: ReadonlyArray<{
    readonly subjectKey: string;
    readonly studentName?: string;
    readonly reason: SkipReason;
  }>;
}

/** 상한을 넘으면 품질을 한 단계 낮춰 한 번 더 줄여 본다 */
const RETRY_QUALITY = 0.6;

export async function saveRosterPhotos(
  deps: { readonly repository: IStudentPhotoRepository; readonly resizer: IImageResizerPort },
  input: SaveRosterPhotosInput,
): Promise<SaveRosterPhotosResult> {
  const entries: Array<{ photo: StudentPhoto; bytes: Uint8Array }> = [];
  const skipped: Array<{ subjectKey: string; studentName?: string; reason: SkipReason }> = [];

  for (const candidate of input.photos) {
    const skip = (reason: SkipReason): void => {
      skipped.push({
        subjectKey: candidate.subjectKey,
        ...(candidate.studentName !== undefined ? { studentName: candidate.studentName } : {}),
        reason,
      });
    };

    if (!isAllowedStudentPhotoMime(candidate.mimeType)) {
      skip('UNSUPPORTED_MIME');
      continue;
    }
    if (candidate.bytes.byteLength > STUDENT_PHOTO_LIMITS.MAX_SOURCE_BYTES) {
      skip('SOURCE_TOO_LARGE');
      continue;
    }

    let resized;
    try {
      resized = await deps.resizer.resize(
        candidate.bytes,
        candidate.mimeType,
        STUDENT_PHOTO_LIMITS.MAX_DIMENSION,
        STUDENT_PHOTO_LIMITS.JPEG_QUALITY,
      );
      if (resized.bytes.byteLength > STUDENT_PHOTO_LIMITS.MAX_STORED_BYTES) {
        // ⚠️ forceReencode=true 가 없으면, 원본이 이미 320px 이하인 사진은
        //    축소기가 "줄일 필요 없음"으로 원본을 그대로 돌려줘 재시도가 무의미해진다.
        //    그러면 용량만 큰 작은 사진이 통째로 버려진다.
        resized = await deps.resizer.resize(
          candidate.bytes,
          candidate.mimeType,
          STUDENT_PHOTO_LIMITS.MAX_DIMENSION,
          RETRY_QUALITY,
          true,
        );
      }
    } catch {
      skip('RESIZE_FAILED');
      continue;
    }

    if (resized.bytes.byteLength > STUDENT_PHOTO_LIMITS.MAX_STORED_BYTES) {
      skip('STILL_TOO_LARGE');
      continue;
    }

    entries.push({
      photo: {
        subjectKey: candidate.subjectKey,
        ownerKind: input.ownerKind,
        ownerKey: input.ownerKey,
        storageRef: studentPhotoStorageRef(candidate.subjectKey),
        mimeType: resized.mimeType,
        byteSize: resized.bytes.byteLength,
        width: resized.width,
        height: resized.height,
        ...(candidate.studentNumber !== undefined
          ? { studentNumber: candidate.studentNumber }
          : {}),
        ...(candidate.studentName !== undefined ? { studentName: candidate.studentName } : {}),
        updatedAt: input.now,
      },
      bytes: resized.bytes,
    });
  }

  await deps.repository.saveMany(entries);
  return { savedCount: entries.length, skipped };
}
