/**
 * 학생 제출 파일 내려받기 포트 — 도메인이 정의하고 infrastructure(Google Drive)가 구현한다.
 *
 * ★왜 드라이브 "목록"을 쓰지 않는가: 제출물은 `Submission.driveFileId` 로 이미 하나씩 지목돼
 *   있으므로 파일 id 로 곧장 받는다. 목록 API(`files.list`)는 기본 100건에서 **조용히 잘려**
 *   있는 파일을 "없다"고 판정한 적이 있다(v2.4.7 동기화 영구 교착). 이 경로에는 그 함정이
 *   아예 없다 — 목록을 부르지 않으니 잘릴 목록도 없다.
 *
 * domain 레이어이므로 fetch·Google 타입을 import 하지 않는다(실제 호출은 구현체가 한다).
 */

/**
 * 내려받기 실패의 갈래 — **재시도 가치가 서로 다르다.**
 * 이걸 뭉뚱그리면 "인터넷이 잠깐 끊긴 것"과 "파일이 영영 사라진 것"을 같이 취급하게 되고,
 * 전자는 실패로 굳어 다시 안 하고 후자는 영원히 다시 시도한다.
 */
export type SubmissionFileErrorKind =
  /** 인터넷이 없거나 요청이 끊겼다 — 실패로 세지 않고 다음 기회에 다시 한다(대기). */
  | 'offline'
  /** 파일이 사라졌다(교사가 드라이브에서 지움) — 다시 시도해도 영영 낫지 않는다. */
  | 'missing'
  /** 권한이 없다(계정 어긋남·권한 회수) — 사람이 다시 연결해야 낫는다. */
  | 'forbidden'
  /** 그 밖의 일시 오류 — 잠시 뒤 다시 해볼 만하다. */
  | 'failed';

export class SubmissionFileError extends Error {
  constructor(
    readonly kind: SubmissionFileErrorKind,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SubmissionFileError';
  }
}

export interface ISubmissionFilePort {
  /**
   * driveFileId 로 파일 본체를 받는다.
   *
   * @param byteSize 제출 기록에 적힌 크기. 전송 제한시간을 크기에 맞춰 늘리는 데만 쓴다
   *                 (고정 상한이면 큰 파일이 정상인데도 매번 같은 자리에서 잘린다).
   * @throws SubmissionFileError 갈래(kind)로 재시도 가치를 알린다.
   */
  downloadFile(driveFileId: string, byteSize: number): Promise<Uint8Array>;
}
