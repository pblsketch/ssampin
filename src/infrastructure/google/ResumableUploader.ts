/**
 * 구글 드라이브 재개 가능 업로드 — 파일을 **구글에 곧장** 올린다
 *
 * 계획서 §3.4 · ADR-065
 *
 * ★ 이 파일이 존재하는 이유가 곧 M3 의 설계다.
 *
 * 쌤핀 서버(Supabase)는 무료 등급이라 한 달 전송량이 5GB 고, 그마저 챗봇·상담·과제·
 * 서명·실시간 게시판이 이미 나눠 쓰고 있다. 자료실 파일이 서버를 지나가면
 * **200MB 파일 25번이면 한 달치가 끝난다.**
 *
 * 그래서 서버는 구글에서 받은 **업로드 세션 주소만** 건네주고 빠지고, 실제 바이트는
 * 이 파일이 그 주소로 곧장 보낸다. 세션 주소는 관리자 권한으로 발급됐으므로
 * 올라간 파일의 주인은 관리자가 된다 — `drive.file` 권한 안에서 동작한다(§3.2).
 *
 * 세션 주소 자체가 열쇠라서, 서버는 발급할 때 **부서 폴더 안에만** 쓰이도록 못박고
 * 올린 뒤에는 이름·크기·폴더를 드라이브에 되물어 대조한다.
 */

/** 올리는 동안 얼마나 갔는지 */
export interface UploadProgress {
  readonly sentBytes: number;
  readonly totalBytes: number;
  /** 0~1 */
  readonly ratio: number;
}

/** 업로드가 끝나면 구글이 돌려주는 것 */
export interface UploadedDriveFile {
  readonly id: string;
}

/** 올리기가 실패한 이유를 한국어로 */
export class ResumableUploadError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ResumableUploadError';
    this.status = status;
  }
}

/**
 * 세션 주소로 파일을 통째로 올린다.
 *
 * `XMLHttpRequest` 를 쓰는 이유는 하나뿐이다 — `fetch` 는 **올리는 진행률을 알려주지
 * 않는다.** 200MB 파일을 올리는 동안 화면이 멈춘 것처럼 보이면 선생님은 앱이 죽은 줄 안다.
 *
 * 끊긴 자리부터 이어 올리는 기능은 넣지 않았다. 세션 주소는 살아 있으므로 나중에
 * 얹을 수 있지만, 지금은 실패하면 처음부터 다시 올린다 — 학교 파일은 대부분
 * 몇 MB 라 다시 올리는 편이 코드를 늘리는 것보다 낫다.
 */
export function uploadToSession(
  uploadUrl: string,
  file: Blob,
  options: {
    readonly mimeType: string;
    readonly onProgress?: (progress: UploadProgress) => void;
    readonly signal?: AbortSignal;
  },
): Promise<UploadedDriveFile> {
  return new Promise<UploadedDriveFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', options.mimeType);

    const total = file.size;

    xhr.upload.onprogress = (event) => {
      if (!options.onProgress) return;
      const sent = event.lengthComputable ? event.loaded : 0;
      options.onProgress({
        sentBytes: sent,
        totalBytes: total,
        ratio: total > 0 ? Math.min(1, sent / total) : 0,
      });
    };

    xhr.onload = () => {
      // 구글은 업로드가 끝나면 200/201 과 함께 파일 정보를 준다
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const parsed = JSON.parse(xhr.responseText) as { id?: string };
          if (!parsed.id) {
            reject(new ResumableUploadError('구글이 파일 정보를 주지 않았습니다.', xhr.status));
            return;
          }
          resolve({ id: parsed.id });
        } catch {
          reject(new ResumableUploadError('구글 응답을 읽지 못했습니다.', xhr.status));
        }
        return;
      }

      if (xhr.status === 403 || xhr.status === 401) {
        reject(
          new ResumableUploadError(
            '올릴 권한이 없습니다. 관리자 선생님의 구글 연결이 끊어졌을 수 있습니다.',
            xhr.status,
          ),
        );
        return;
      }

      if (xhr.status === 404) {
        reject(new ResumableUploadError('올리기 시간이 지났습니다. 다시 올려주세요.', xhr.status));
        return;
      }

      reject(
        new ResumableUploadError(`파일을 올리지 못했습니다. (구글 응답 ${xhr.status})`, xhr.status),
      );
    };

    xhr.onerror = () => {
      reject(new ResumableUploadError('인터넷 연결을 확인해주세요.', 0));
    };

    xhr.onabort = () => {
      reject(new ResumableUploadError('올리기를 멈췄습니다.', 0));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });
}
