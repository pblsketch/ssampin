/**
 * 바이너리 파일의 로컬 경로 → 구글 드라이브 파일명 규칙.
 *
 * 드라이브 동기화 폴더는 평평해서 `/` 를 파일명에 쓸 수 없다.
 * 그래서 `student-photos/s1.jpg` 를 `student-photos__s1.jpg.json` 으로 평탄화한다
 * (본체는 base64 로 감싼 JSON 이라 확장자가 `.json` 이다).
 *
 * ⚠️ **이 규칙은 반드시 한 곳에만 있어야 한다.**
 * 올릴 때와 지울 때가 다른 규칙을 쓰면, 지우기가 엉뚱한 이름을 찾아
 * **아무것도 못 지우면서 "지웠습니다"라고 안내하게 된다.**
 * 학생 얼굴 사진에서 그건 단순 버그가 아니라 개인정보 파기 실패다.
 */
export function toBinaryDriveFilename(relPath: string): string {
  return `${relPath.replace(/\//g, '__')}.json`;
}
