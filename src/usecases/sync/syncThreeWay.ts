export type SyncThreeWayDecision =
  | 'unchanged'
  | 'local-only'
  | 'remote-only'
  | 'converged'
  | 'concurrent'
  | 'first-download'
  | 'recovered'
  | 'unknown-concurrent';

interface SyncThreeWayInput {
  readonly baselineChecksum: string | null;
  readonly localChecksum: string | null;
  readonly remoteChecksum: string;
}

/** 마지막 공통 기준점(B), 현재 로컬(L), 원격(R)의 관계만으로 안전한 동작을 정한다. */
export function classifySyncThreeWay({
  baselineChecksum,
  localChecksum,
  remoteChecksum,
}: SyncThreeWayInput): SyncThreeWayDecision {
  if (baselineChecksum === null) {
    if (localChecksum === null) return 'first-download';
    return localChecksum === remoteChecksum ? 'recovered' : 'unknown-concurrent';
  }

  if (localChecksum === null) return 'remote-only';
  if (localChecksum === baselineChecksum && remoteChecksum === baselineChecksum) {
    return 'unchanged';
  }
  if (remoteChecksum === baselineChecksum && localChecksum !== baselineChecksum) {
    return 'local-only';
  }
  if (localChecksum === baselineChecksum && remoteChecksum !== baselineChecksum) {
    return 'remote-only';
  }
  if (localChecksum === remoteChecksum) return 'converged';
  return 'concurrent';
}
