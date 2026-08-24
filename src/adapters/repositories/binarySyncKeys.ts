/**
 * 동기화 대상 바이너리 파일 키를 한곳에서 모은다.
 *
 * ## 왜 따로 뺐는가 — 열거 실패를 삭제로 오인하지 않기 위해
 *
 * 동기화의 바이너리 열거 훅은 **하나뿐**이라(`getBinaryDynamicSyncFiles`),
 * 여러 저장소의 목록을 합쳐서 넘겨야 한다. 한 저장소의 실패를 빈 목록으로 바꾸면
 * 기존 매니페스트의 모든 파일이 삭제된 것으로 해석될 수 있다. 따라서 어느 한쪽이라도
 * 읽지 못하면 오류를 그대로 전파해 그 동기화 회차 전체를 안전하게 중단한다.
 */

import type { IObservationAttachmentRepository } from '@domain/repositories/IObservationAttachmentRepository';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';

interface BinaryKeySources {
  readonly observationAttachmentRepository: Pick<
    IObservationAttachmentRepository,
    'listBinaryKeys'
  >;
  readonly studentPhotoRepository: Pick<IStudentPhotoRepository, 'listBinaryKeys'>;
}

/** 관찰 첨부 + 학생 사진의 바이너리 키를 합친다. */
export async function collectBinarySyncKeys(sources: BinaryKeySources): Promise<string[]> {
  const [attachments, photos] = await Promise.all([
    sources.observationAttachmentRepository.listBinaryKeys(),
    sources.studentPhotoRepository.listBinaryKeys(),
  ]);
  return [...attachments, ...photos];
}
