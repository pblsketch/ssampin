/**
 * 학생 제출 파일 내려받기 — `ISubmissionFilePort` 구현.
 *
 * 파일은 서버가 **교사 계정의 드라이브**에 올려 둔 것이라, 교사 토큰으로 곧장 받을 수 있다
 * (서버도 데스크톱과 같은 구글 클라이언트로 토큰을 갱신하므로 같은 앱이 만든 파일이다).
 *
 * 재시도 정책은 새로 만들지 않고 동기화가 쓰는 `driveRetry` 를 그대로 쓴다 — 한 학급 분량을
 * 한꺼번에 받으면 429(너무 잦은 요청)가 나는데, 지연 없는 재시도는 그걸 더 키운다.
 */
import type { ISubmissionFilePort } from '@domain/ports/ISubmissionFilePort';
import { SubmissionFileError } from '@domain/ports/ISubmissionFilePort';
import {
  fetchWithTimeout,
  readBodyWithTimeout,
  transferTimeoutForBytes,
  GoogleFetchTimeoutError,
} from './fetchWithTimeout';
import { MAX_DRIVE_RETRIES, isRetryableDriveStatus, computeDriveRetryDelayMs } from './driveRetry';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';

export class SubmissionFileClient implements ISubmissionFilePort {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  async downloadFile(driveFileId: string, byteSize: number): Promise<Uint8Array> {
    const url = `${DRIVE_API_URL}/files/${encodeURIComponent(driveFileId)}?alt=media`;
    const timeoutMs = transferTimeoutForBytes(byteSize);

    // 401 은 토큰을 새로 받아 한 번만 다시 해 본다(그 이상은 사람이 다시 연결해야 낫는다).
    for (let authAttempt = 0; authAttempt <= 1; authAttempt += 1) {
      const token = await this.readToken();
      const res = await this.fetchWithRetry(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        timeoutMs,
      );

      if (res.ok) {
        const buffer = await readBodyWithTimeout(() => res.arrayBuffer(), url, timeoutMs);
        return new Uint8Array(buffer);
      }

      if (res.status === 401 && authAttempt === 0) continue;

      throw this.errorForStatus(res.status);
    }

    // 위 반복문은 반드시 반환하거나 던진다. 타입을 위해 남기는 방어선.
    throw new SubmissionFileError('failed', '제출 파일을 받지 못했습니다.');
  }

  /**
   * 토큰 읽기 실패는 **대기**로 본다.
   * 인터넷이 없을 때도 토큰 갱신이 실패하는데, 이걸 권한 문제로 확정해 버리면
   * 오프라인 한 번에 "추출 실패"가 굳어 온라인으로 돌아와도 다시 하지 않는다.
   */
  private async readToken(): Promise<string> {
    try {
      return await this.getAccessToken();
    } catch (err) {
      throw new SubmissionFileError('offline', '구글 연결을 확인하지 못했습니다.', err);
    }
  }

  /** 429·5xx 는 driveRetry 정책(Retry-After 존중 + 지수 백오프)으로 다시 시도한다. */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await fetchWithTimeout(url, init, timeoutMs);
      } catch (err) {
        // 제한시간 초과는 몇 번 더 해 볼 가치가 있고, 그 밖의 fetch 실패는 회선이 끊긴 것이다.
        if (err instanceof GoogleFetchTimeoutError && attempt < MAX_DRIVE_RETRIES) {
          await delay(computeDriveRetryDelayMs(attempt, null));
          attempt += 1;
          continue;
        }
        if (err instanceof GoogleFetchTimeoutError) {
          throw new SubmissionFileError('failed', '제출 파일 내려받기가 시간을 넘겼습니다.', err);
        }
        throw new SubmissionFileError('offline', '인터넷 연결을 확인해주세요.', err);
      }

      if (res.ok || !isRetryableDriveStatus(res.status) || attempt >= MAX_DRIVE_RETRIES) {
        return res;
      }
      await delay(computeDriveRetryDelayMs(attempt, res.headers.get('Retry-After')));
      attempt += 1;
    }
  }

  private errorForStatus(status: number): SubmissionFileError {
    if (status === 404 || status === 410) {
      return new SubmissionFileError('missing', '드라이브에 파일이 없습니다.');
    }
    if (status === 401 || status === 403) {
      return new SubmissionFileError(
        'forbidden',
        '제출 파일을 볼 권한이 없습니다. 설정 → Google 계정에서 다시 연결해주세요.',
      );
    }
    return new SubmissionFileError('failed', `제출 파일 내려받기 실패 (${status})`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
