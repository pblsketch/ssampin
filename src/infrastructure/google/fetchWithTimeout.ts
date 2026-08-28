/**
 * Google API 호출 공용 타임아웃 래퍼.
 *
 * 왜 필요한가 — 브라우저 `fetch`는 응답이 영영 오지 않아도 스스로 끊지 않는다.
 * 모바일 PWA는 화면을 끄는 순간 업로드를 시작하는데(useSyncTrigger), 그때 요청이
 * 얼어붙으면 동기화 promise가 끝나지도 실패하지도 않는다. 그러면 스토어는
 * `state='syncing'`에 갇히고 이후 모든 재시도가 조용히 무시돼 "동기화 중 0%"가
 * 영구히 남는다(2026-08-28 신고). 제한시간을 걸어야 실패로 떨어지고 다시 시도된다.
 *
 * 데스크톱(GoogleOAuthClient)에만 있던 장치를 모바일·Drive 경로까지 넓힌 것이다.
 */

/** 목록·매니페스트 조회처럼 본문이 작은 메타 요청 */
export const GOOGLE_META_TIMEOUT_MS = 30_000;

/**
 * 파일 본문 업·다운로드의 최소 상한.
 * 메타와 같은 30초를 쓰면 느린 회선에서 큰 첨부·사진 업로드가 정상인데도 잘린다
 * (이 어댑터는 데스크톱과 공용이고 데스크톱은 관찰 첨부·아카이브까지 올린다).
 *
 * ⚠️ 큰 본문에는 이 값을 그대로 쓰지 말고 transferTimeoutForBytes 를 쓸 것.
 */
export const GOOGLE_TRANSFER_TIMEOUT_MS = 120_000;

/**
 * 본문 크기에 비례한 전송 제한시간.
 *
 * 고정 상한을 쓰면 큰 첨부가 "정상인데도" 매번 같은 자리에서 잘려 영구 실패가 된다.
 * 데스크톱 관찰 첨부는 최대 20MB(observationAttachmentRules)이고 base64 래핑 후
 * 약 26.7MB 단일 요청이 되는데, 여기에 120초를 걸면 상향 1.8Mbps 가 꾸준히 나와야만
 * 성공한다 — 학교 와이파이에서는 재시도해도 처음부터 다시라 끝내 못 올린다.
 * fetch 는 요청 본문을 다 올린 뒤에야 헤더를 받으므로 이 시간에 전송 시간이 포함된다.
 *
 * 최소 보장 상향 20KB/s 를 가정한다. 무제한은 아니지만 정상 전송을 자르지 않는다.
 */
export function transferTimeoutForBytes(bytes: number): number {
  return Math.max(GOOGLE_TRANSFER_TIMEOUT_MS, Math.ceil(bytes / 20_000) * 1_000);
}

/**
 * 제한시간 초과로 끊긴 요청.
 * 상태 코드 기반 재시도(429/5xx)와 구분해야 해서 전용 타입으로 둔다 — 응답 자체가
 * 없었으므로 같은 요청을 즉시 다시 던져봐야 같은 자리에서 또 늘어질 뿐이다.
 */
export class GoogleFetchTimeoutError extends Error {
  constructor(target: string, timeoutMs: number, cause?: unknown) {
    super(`Google API 응답 시간 초과 (${Math.round(timeoutMs / 1000)}초): ${target}`, { cause });
    this.name = 'GoogleFetchTimeoutError';
  }
}

/**
 * 오류 메시지에 실을 주소 요약 — 쿼리스트링을 버린다.
 *
 * 토큰 폐기(revoke) 요청은 `?token=<액세스 토큰>` 형태라 주소를 그대로 찍으면
 * 토큰이 오류 메시지와 로그로 새어 나간다. 경로까지만 남겨도 어디서 멈췄는지는 안다.
 */
export function describeFetchTarget(input: string): string {
  try {
    const url = new URL(input);
    return `${url.origin}${url.pathname}`;
  } catch {
    return input.split('?')[0] ?? input;
  }
}

/**
 * 일정 시간 응답이 없으면 끊는 fetch.
 *
 * ⚠️ 보장 범위는 **응답 헤더 도착까지**다. 그 뒤의 `res.json()` / `res.text()` 는 이
 * 타이머가 이미 해제된 뒤라 보호받지 못한다 — 헤더만 오고 본문 스트림이 멈추는
 * 반열림 연결(학교 프록시·캡티브 포털의 전형)에서는 본문 읽기가 영영 안 끝난다.
 * 본문까지 지키려면 readBodyWithTimeout 으로 감쌀 것.
 *
 * 호출자가 준 `signal`도 그대로 존중한다. 그 경로로 끊긴 것은 제한시간 초과가 아니므로
 * 원래 오류를 그대로 올려보낸다 — 사용자가 취소한 것과 서버가 늘어진 것은 다른 사건이다.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = GOOGLE_META_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const external = init.signal ?? null;
  const forwardAbort = (): void => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new GoogleFetchTimeoutError(describeFetchTarget(input), timeoutMs, err);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * 응답 본문 읽기에 제한시간을 건다.
 *
 * fetchWithTimeout 은 헤더까지만 지킨다. 다운로드는 본문이 대부분이므로 이걸 안 감싸면
 * 사실상 제한시간이 없는 것과 같다. 데스크톱에는 워치독 같은 그물이 없어서 그대로 굳는다.
 *
 * 멈춘 스트림 자체는 백그라운드에 남지만, 이 promise 는 확실히 끝나므로 화면 정지는 풀린다.
 */
export async function readBodyWithTimeout<T>(
  read: () => Promise<T>,
  target: string,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new GoogleFetchTimeoutError(describeFetchTarget(target), timeoutMs)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([read(), guard]);
  } finally {
    clearTimeout(timer);
  }
}
