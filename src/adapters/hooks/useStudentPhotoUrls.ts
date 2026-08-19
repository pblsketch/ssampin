/**
 * 학생 얼굴 사진을 화면에서 쓸 수 있는 URL 로 바꿔 주는 훅.
 *
 * ## 이 훅이 유일한 관문이다
 *
 * 사진 바이트가 화면으로 들어오는 경로를 **여기 하나로 좁혀 둔다.**
 * 학습 카드 컴포넌트는 저장소를 직접 부르지 않고 `photoUrls` 를 props 로만 받는다.
 * 관문이 하나면 "학생 화면·위젯·옆핀에 사진이 뜨지 않는다"를 관문 한 곳만 보고 보장할 수 있다.
 * (빌드 게이트 `scripts/check-bundle-isolation.mjs` 가 학생용 번들에 사진 저장 경로가
 *  섞이지 않았는지 검사한다 — 관문이 여러 개면 그 검사가 헛돈다.)
 *
 * ## objectURL 은 반드시 해제한다
 *
 * `URL.createObjectURL` 로 만든 주소는 브라우저가 사진 데이터를 붙들고 있게 만든다.
 * 해제하지 않으면 화면을 열고 닫을 때마다 메모리가 쌓인다 — 22장 × 반복이면 금방 커진다.
 */

import { useEffect, useState } from 'react';
import { studentPhotoRepository } from '@adapters/di/container';

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * @param enabled 필요할 때만 읽는다 (학습 모드를 열 때만 true)
 * @returns studentId → 사진 URL
 */
export function useStudentPhotoUrls(enabled: boolean): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setUrls(EMPTY);
      return;
    }

    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      const next = new Map<string, string>();
      try {
        const photos = await studentPhotoRepository.list();
        for (const photo of photos) {
          const bytes = await studentPhotoRepository.readPhoto(photo.studentId);
          if (!bytes) continue;
          const url = URL.createObjectURL(
            new Blob([bytes as unknown as BlobPart], { type: photo.mimeType }),
          );
          created.push(url);
          next.set(photo.studentId, url);
        }
      } catch {
        // 사진을 못 읽어도 이름 학습 자체는 되어야 한다 — 사진 없이 진행한다
      }
      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url);
        return;
      }
      setUrls(next);
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [enabled]);

  return urls;
}
