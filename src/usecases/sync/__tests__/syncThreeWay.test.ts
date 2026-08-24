import { describe, expect, it } from 'vitest';

import { classifySyncThreeWay, type SyncThreeWayDecision } from '../syncThreeWay';

describe('classifySyncThreeWay', () => {
  it.each<{
    baseline: string | null;
    local: string | null;
    remote: string;
    expected: SyncThreeWayDecision;
  }>([
    { baseline: null, local: null, remote: 'R', expected: 'first-download' },
    { baseline: null, local: 'R', remote: 'R', expected: 'recovered' },
    { baseline: null, local: 'L', remote: 'R', expected: 'unknown-concurrent' },
    { baseline: 'B', local: null, remote: 'R', expected: 'remote-only' },
    { baseline: 'B', local: 'B', remote: 'B', expected: 'unchanged' },
    { baseline: 'B', local: 'L', remote: 'B', expected: 'local-only' },
    { baseline: 'B', local: 'B', remote: 'R', expected: 'remote-only' },
    { baseline: 'B', local: 'R', remote: 'R', expected: 'converged' },
    { baseline: 'B', local: 'L', remote: 'R', expected: 'concurrent' },
  ])('$expected: B=$baseline, L=$local, R=$remote', ({ baseline, local, remote, expected }) => {
    expect(
      classifySyncThreeWay({
        baselineChecksum: baseline,
        localChecksum: local,
        remoteChecksum: remote,
      }),
    ).toBe(expected);
  });
});
