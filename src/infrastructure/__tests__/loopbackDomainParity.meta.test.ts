/**
 * CT-enum 메타테스트 — loopback write 도메인 계약 단일 소스화 회귀 가드(WS1 이후).
 *
 * 설계서: docs/02-design/features/record-system-unification-phase1.design.md §4-라
 * 분석: docs/03-analysis/record-system-unification/T4 §5-5
 * 계획: docs/01-plan/features/ai-bridge-contract-and-todo-enhance.plan.md (WS1)
 *
 * 배경(변경 전):
 *   loopback 쓰기 도메인 union 이 3곳에 수동 중복되어, 한 곳만 바꾸면 silent 거부가 발생했다.
 *   이 메타테스트는 두 소스의 도메인 리터럴을 정적 파싱해 정합을 확인했다.
 *
 * 배경(WS1 이후 — 현재):
 *   도메인/연산 enum 은 단일 정의(scripts/contract/aiBridgeWriteContract.def.mjs)에서 생성된 산출물
 *   (src/domain/contracts/aiBridgeWriteContract.ts · electron/ipc/_generated/...)에서만 파생한다.
 *   따라서 "수동 중복"이 구조적으로 제거됐다. 이 파일은 그 단일화가 회귀로 되돌려지지 않도록
 *   — 즉 누군가 다시 수기 enum 을 선언하지 않도록 — 가드한다. (값 정합은 aiBridgeWriteContract.contract.test.ts 가,
 *   생성물 byte 정합은 scripts/check-contract-sync.mjs 가 본다.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

const LIVE_SYNC_CORE_PATH = resolve(ROOT, 'electron/ipc/aiBridgeLiveSyncCore.ts');
const APPLY_LIVE_SYNC_PATH = resolve(ROOT, 'src/usecases/aiBridge/applyLiveSyncWrite.ts');

describe('CT-enum — loopback 도메인 계약 단일 소스화 회귀 가드', () => {
  const coreSrc = readFileSync(LIVE_SYNC_CORE_PATH, 'utf-8');
  const applySrc = readFileSync(APPLY_LIVE_SYNC_PATH, 'utf-8');

  it('aiBridgeLiveSyncCore.ts 는 생성된 계약(_generated)에서 enum 을 파생한다', () => {
    expect(
      coreSrc.includes("from './_generated/aiBridgeWriteContract'"),
      'aiBridgeLiveSyncCore.ts 가 생성 계약(_generated/aiBridgeWriteContract)을 import 하지 않습니다. ' +
        'WS1 단일 소스화가 회귀했을 수 있습니다.',
    ).toBe(true);
    // 런타임 Set 은 계약 상수에서 파생되어야 한다(수기 리터럴 재도입 방지).
    expect(coreSrc).toMatch(/const DOMAINS:\s*ReadonlySet<string>\s*=\s*new Set\(WRITE_DOMAINS\)/);
    expect(coreSrc).toMatch(/const OPS:\s*ReadonlySet<string>\s*=\s*new Set\(WRITE_OPS\)/);
  });

  it('aiBridgeLiveSyncCore.ts 에 수기 WriteDomain 도메인 union 선언이 없다(중복 재도입 차단)', () => {
    // `export type WriteDomain = | 'todos' | ...` 형태의 인라인 리터럴 선언이 다시 생기면 실패.
    const inlineUnion = /export type WriteDomain\s*=\s*\r?\n?\s*\|\s*['"]todos['"]/;
    expect(
      inlineUnion.test(coreSrc),
      'aiBridgeLiveSyncCore.ts 에 수기 WriteDomain 리터럴 union 이 재도입됐습니다(생성물에서 파생해야 함).',
    ).toBe(false);
  });

  it('applyLiveSyncWrite.ts 는 생성된 계약에서 WriteDomain/WriteOp 타입을 import 한다', () => {
    expect(
      applySrc.includes("from '@domain/contracts/aiBridgeWriteContract'"),
      'applyLiveSyncWrite.ts 가 생성 계약(@domain/contracts/aiBridgeWriteContract)을 import 하지 않습니다.',
    ).toBe(true);
    // LiveSyncWriteRequest.domain 이 다시 인라인 리터럴 union 으로 회귀하지 않았는지 확인.
    const inlineDomainUnion = /readonly domain:\s*\r?\n?\s*\|\s*['"]todos['"]/;
    expect(
      inlineDomainUnion.test(applySrc),
      'applyLiveSyncWrite.ts 의 domain 이 인라인 리터럴 union 으로 회귀했습니다(WriteDomain 타입을 써야 함).',
    ).toBe(false);
  });

  it('applyLiveSyncWrite.ts 는 satisfies Record<WriteDomain, …> 로 디스패치 exhaustiveness 를 강제한다', () => {
    expect(
      /satisfies Record<WriteDomain,\s*LiveSyncHandler>/.test(applySrc),
      'applyLiveSyncWrite.ts 디스패치가 satisfies Record<WriteDomain, …> 로 고정돼 있지 않습니다.',
    ).toBe(true);
  });
});
