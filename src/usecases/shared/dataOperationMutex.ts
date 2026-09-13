let operationTail: Promise<void> = Promise.resolve();
let recordMapRecoveryBarrier = false;

export function setDataOperationRecoveryBarrier(active: boolean): void {
  recordMapRecoveryBarrier = active;
}

export function assertDataOperationRecoveryClear(): void {
  if (recordMapRecoveryBarrier) {
    throw new Error('근거 지도 저장 복구가 끝나기 전에는 동기화할 수 없습니다.');
  }
}

/**
 * 동기화·학년도 전환처럼 여러 파일과 장부를 함께 바꾸는 작업을 한 번에 하나만 실행한다.
 * 앞 작업이 실패해도 다음 작업은 반드시 이어서 실행된다.
 */
export async function withDataOperationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = operationTail;
  let release: () => void = () => undefined;
  operationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}
