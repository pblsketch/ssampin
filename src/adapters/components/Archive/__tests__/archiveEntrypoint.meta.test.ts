/**
 * P2·P3 묶음 메타테스트 (S3.1 AC-3, plan §10.1 P2 출시 조건 2).
 *
 * "라이브를 리셋하는 기능(P2 전환)은 열람 경로(P3 뷰어) 없이 출시하면 사용자 입장에서
 * 데이터 삭제와 구분되지 않는다"(사전 부검 시나리오 C) — 문장이 아니라 테스트로 강제한다.
 * ExecuteYearTransition이 존재하는 한 보관함 뷰어 진입점이 함께 존재해야 한다.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..', '..', '..', '..');

describe('P2·P3 강제 묶음 (메타 테스트)', () => {
  it('전환 실행이 존재하면 보관함 뷰어 진입점도 존재해야 한다', () => {
    const transition = resolve(SRC, 'usecases/schoolYear/ExecuteYearTransition.ts');
    const viewer = resolve(SRC, 'adapters/components/Archive/ArchiveViewer.tsx');
    const deleteGate = resolve(SRC, 'adapters/components/Archive/ArchiveDeleteGate.tsx');

    if (!existsSync(transition)) return; // 전환이 없으면 요구도 없음

    expect(
      existsSync(viewer),
      'ExecuteYearTransition은 있는데 ArchiveViewer가 없습니다 — P2(전환)는 P3(열람) 없이 출시할 수 없습니다(plan §10.1).',
    ).toBe(true);
    expect(
      existsSync(deleteGate),
      '보관함 삭제 2단계 게이트(ArchiveDeleteGate)가 없습니다 — 삭제는 보관함에서만, 게이트를 거쳐야 합니다(ADR-032).',
    ).toBe(true);
  });
});
