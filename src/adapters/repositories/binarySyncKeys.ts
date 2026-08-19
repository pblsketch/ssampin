/**
 * 동기화 대상 바이너리 파일 키를 한곳에서 모은다.
 *
 * ## 왜 따로 뺐는가 — 열거 실패 격리
 *
 * 동기화의 바이너리 열거 훅은 **하나뿐**이라(`getBinaryDynamicSyncFiles`),
 * 여러 저장소의 목록을 합쳐서 넘겨야 한다. 그런데 그냥 이어 붙이면
 * **한 저장소의 열거가 실패할 때 나머지도 같이 죽는다** —
 * 학생 사진 목록 조회가 한 번 던지면 관찰 첨부 동기화까지 멈춘다는 뜻이다.
 *
 * 기존 코드에서 아카이브 열거는 이미 try/catch 로 감싸져 있었는데
 * 바이너리 열거만 무방비였다. 여기서 **저장소별로 따로 감싼다.**
 * 한쪽이 실패해도 다른 쪽은 정상 동기화되고, 실패한 쪽은 이번 회차만 건너뛴다.
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

async function safeKeys(label: string, load: () => Promise<string[]>): Promise<string[]> {
  try {
    return await load();
  } catch (err) {
    // 이번 회차만 건너뛴다 — 다른 도메인의 동기화를 막지 않는다
    console.warn(`[binarySyncKeys] ${label} 열거 실패 — 이번 동기화에서 제외:`, err);
    return [];
  }
}

/** 관찰 첨부 + 학생 사진의 바이너리 키를 합친다 (저장소별로 실패를 격리) */
export async function collectBinarySyncKeys(sources: BinaryKeySources): Promise<string[]> {
  const [attachments, photos] = await Promise.all([
    safeKeys('관찰 첨부', () => sources.observationAttachmentRepository.listBinaryKeys()),
    safeKeys('학생 사진', () => sources.studentPhotoRepository.listBinaryKeys()),
  ]);
  return [...attachments, ...photos];
}
