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
import type { StudentPhotoOwnerKind } from '@domain/entities/StudentPhoto';

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * @param enabled 필요할 때만 읽는다 (학습 모드를 열 때만 true)
 * ## 돌려주는 열쇠는 화면이 쓰는 열쇠다
 *
 * 저장소는 사진을 `subjectKey` 로 갖고 있는데, 그 값이 명단 종류마다 다르다
 * (담임은 `Student.id`, 수업반은 `{반id}--{학년-반-번호}`).
 * 화면(좌석 격자)은 각자 자기 식별자로 조회하므로, **여기서 화면이 쓰는 열쇠로 바꿔서** 돌려준다.
 * 이 변환을 화면마다 따로 하면 한쪽만 고쳐져 "담임은 되는데 수업반은 안 되는" 상태가 된다.
 *
 * @param scope 수업반이면 그 반 사진만 골라 `학년-반-번호` 로 열쇠를 바꾼다. 없으면 담임.
 * @returns 화면 식별자 → 사진 URL
 */
export function useStudentPhotoUrls(
  enabled: boolean,
  scope?: { readonly ownerKind: StudentPhotoOwnerKind; readonly ownerKey: string },
): ReadonlyMap<string, string> {
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
        const all = await studentPhotoRepository.list();
        // 수업반이면 그 반 사진만. 담임이면 담임 사진만.
        const wantKind: StudentPhotoOwnerKind = scope?.ownerKind ?? 'homeroom';
        const wantKey = scope?.ownerKey ?? 'homeroom';
        const photos = all.filter((p) => p.ownerKind === wantKind && p.ownerKey === wantKey);
        for (const photo of photos) {
          const bytes = await studentPhotoRepository.readPhoto(photo.subjectKey);
          if (!bytes) continue;
          const url = URL.createObjectURL(
            new Blob([bytes as unknown as BlobPart], { type: photo.mimeType }),
          );
          created.push(url);
          // 수업반 키에서 반 번호 접두사를 떼어 좌석이 쓰는 `학년-반-번호` 로 맞춘다
          const viewKey =
            wantKind === 'teaching-class'
              ? photo.subjectKey.slice(`${wantKey}--`.length)
              : photo.subjectKey;
          next.set(viewKey, url);
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
  }, [enabled, scope?.ownerKind, scope?.ownerKey]);

  return urls;
}
