/**
 * 동기화 바이너리 키 수집 — **열거 실패 시 안전 중단**을 증명한다.
 *
 * 왜 중요한가: 동기화의 바이너리 열거 훅은 하나뿐이라 여러 저장소의 목록을 합쳐 넘긴다.
 * 그냥 이어 붙이면 **한 저장소의 열거가 실패할 때 나머지도 같이 죽는다** —
 * 학생 사진 목록 조회가 한 번 던지면 관찰 첨부 동기화까지 멈춘다.
 * 기존 코드에서 아카이브 열거만 try/catch 가 있었고 바이너리 열거는 무방비였다.
 */
import { describe, it, expect } from 'vitest';
import { collectBinarySyncKeys } from './binarySyncKeys';

function sources(attachments: () => Promise<string[]>, photos: () => Promise<string[]>) {
  return {
    observationAttachmentRepository: { listBinaryKeys: attachments },
    studentPhotoRepository: { listBinaryKeys: photos },
  };
}

const ok = (keys: string[]) => () => Promise.resolve(keys);
const boom = (message: string) => () => Promise.reject(new Error(message));

describe('collectBinarySyncKeys', () => {
  it('두 저장소의 키를 모두 모은다', async () => {
    const keys = await collectBinarySyncKeys(
      sources(ok(['obs-attachments/a.png']), ok(['student-photos/s1.jpg'])),
    );
    expect(keys).toEqual(['obs-attachments/a.png', 'student-photos/s1.jpg']);
  });

  it('학생 사진 열거가 실패하면 빈 목록으로 오인하지 않고 중단한다', async () => {
    await expect(
      collectBinarySyncKeys(sources(ok(['obs-attachments/a.png']), boom('사진 목록 실패'))),
    ).rejects.toThrow('사진 목록 실패');
  });

  it('관찰 첨부 열거가 실패하면 빈 목록으로 오인하지 않고 중단한다', async () => {
    await expect(
      collectBinarySyncKeys(sources(boom('첨부 목록 실패'), ok(['student-photos/s1.jpg']))),
    ).rejects.toThrow('첨부 목록 실패');
  });

  it('둘 다 실패해도 삭제 가능한 빈 목록을 만들지 않는다', async () => {
    await expect(collectBinarySyncKeys(sources(boom('x'), boom('y')))).rejects.toThrow();
  });

  it('둘 다 비어 있으면 빈 목록', async () => {
    expect(await collectBinarySyncKeys(sources(ok([]), ok([])))).toEqual([]);
  });
});
