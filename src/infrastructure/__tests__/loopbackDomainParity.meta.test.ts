/**
 * CT-enum 메타테스트 — loopback write 도메인 enum 3곳 정합 보장
 *
 * 설계서: docs/02-design/features/record-system-unification-phase1.design.md §4-라
 * 분석: docs/03-analysis/record-system-unification/T4 §5-5
 *
 * 근거:
 *   loopback 쓰기 도메인 union이 3곳에 수동 중복되어 있다:
 *     (a) electron/ipc/aiBridgeLiveSyncCore.ts — WriteDomain type + DOMAINS Set
 *     (b) src/usecases/aiBridge/applyLiveSyncWrite.ts — LiveSyncWriteRequest.domain union
 *
 *   한 곳만 바꾸면 silent 거부(400 또는 silently ignored)가 발생한다.
 *   이 메타테스트는 두 파일의 소스 텍스트를 정적으로 파싱하여
 *   동일한 도메인 집합을 선언하는지 확인한다.
 *
 *   브리지 레포(e:/github/ssampin-ai-bridge)는 별도 레포라 본체 내부 정합만 검사한다.
 *
 * 검증 방법:
 *   소스 파일에서 도메인 리터럴을 추출하여 두 파일의 집합이 일치하는지 단언.
 *   집합 불일치 시 즉시 실패하여 회귀를 차단한다.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

const LIVE_SYNC_CORE_PATH = resolve(ROOT, 'electron/ipc/aiBridgeLiveSyncCore.ts');
const APPLY_LIVE_SYNC_PATH = resolve(ROOT, 'src/usecases/aiBridge/applyLiveSyncWrite.ts');

/**
 * LiveSyncWriteRequest.domain union 에서 도메인 리터럴을 추출한다.
 *
 * applyLiveSyncWrite.ts 의 패턴:
 *   export interface LiveSyncWriteRequest {
 *     readonly domain:
 *       | 'todos'
 *       | 'events'
 *       ...
 *   }
 */
function extractDomainsFromApply(src: string): Set<string> {
  const found = new Set<string>();
  // LiveSyncWriteRequest 인터페이스 내부의 domain union만 정확히 파싱
  // "readonly domain:" 이후 세미콜론까지의 구간을 먼저 추출
  const domainBlockMatch = src.match(/readonly domain:\s*([\s\S]*?);/);
  if (!domainBlockMatch) return found;

  const block = domainBlockMatch[1]!;
  const pattern = /['"]([a-zA-Z][a-zA-Z0-9]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(block)) !== null) {
    found.add(m[1]!);
  }
  return found;
}

describe('CT-enum — loopback 도메인 enum 3곳 정합 메타테스트', () => {
  const coreSrc = readFileSync(LIVE_SYNC_CORE_PATH, 'utf-8');
  const applySrc = readFileSync(APPLY_LIVE_SYNC_PATH, 'utf-8');

  // 알려진 도메인 목록 — 이 목록이 바뀌려면 테스트도 의도적으로 바꿔야 한다
  const EXPECTED_DOMAINS = new Set([
    'todos',
    'events',
    'recordDrafts',
    'memos',
    'bookmarks',
    'notes',
    'attendance',
    'homeroomAttendance',
    'observations',
    'recordNote',
  ]);

  it('aiBridgeLiveSyncCore.ts WriteDomain type이 기대 도메인 10종을 모두 포함한다', () => {
    // WriteDomain type 선언 블록만 추출
    const writeDomainMatch = coreSrc.match(/export type WriteDomain\s*=([\s\S]*?);/);
    expect(
      writeDomainMatch,
      'aiBridgeLiveSyncCore.ts 에서 WriteDomain type 선언을 찾을 수 없습니다.',
    ).not.toBeNull();

    const block = writeDomainMatch![1]!;
    const found = new Set<string>();
    const pattern = /['"]([a-zA-Z][a-zA-Z0-9]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(block)) !== null) {
      found.add(m[1]!);
    }

    for (const domain of EXPECTED_DOMAINS) {
      expect(
        found.has(domain),
        `aiBridgeLiveSyncCore.ts WriteDomain에 '${domain}'이 없습니다. ` +
          `현재 발견된 도메인: [${[...found].join(', ')}]`,
      ).toBe(true);
    }
  });

  it('aiBridgeLiveSyncCore.ts DOMAINS Set이 기대 도메인 10종을 모두 포함한다', () => {
    // DOMAINS Set 선언 블록 추출
    const domainsSetMatch = coreSrc.match(/const DOMAINS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(
      domainsSetMatch,
      'aiBridgeLiveSyncCore.ts 에서 DOMAINS Set 선언을 찾을 수 없습니다.',
    ).not.toBeNull();

    const block = domainsSetMatch![1]!;
    const found = new Set<string>();
    const pattern = /['"]([a-zA-Z][a-zA-Z0-9]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(block)) !== null) {
      found.add(m[1]!);
    }

    for (const domain of EXPECTED_DOMAINS) {
      expect(
        found.has(domain),
        `aiBridgeLiveSyncCore.ts DOMAINS Set에 '${domain}'이 없습니다. ` +
          `현재 발견된 도메인: [${[...found].join(', ')}]`,
      ).toBe(true);
    }
  });

  it('applyLiveSyncWrite.ts LiveSyncWriteRequest.domain union이 기대 도메인 10종을 모두 포함한다', () => {
    const found = extractDomainsFromApply(applySrc);
    expect(
      found.size,
      `LiveSyncWriteRequest.domain union을 파싱하지 못했습니다 (추출된 도메인 ${found.size}개).`,
    ).toBeGreaterThan(0);

    for (const domain of EXPECTED_DOMAINS) {
      expect(
        found.has(domain),
        `applyLiveSyncWrite.ts LiveSyncWriteRequest.domain에 '${domain}'이 없습니다. ` +
          `현재 발견된 도메인: [${[...found].join(', ')}]`,
      ).toBe(true);
    }
  });

  it('WriteDomain type ↔ DOMAINS Set — 두 선언의 도메인 집합이 정확히 일치한다', () => {
    // WriteDomain type 블록
    const writeDomainBlock = coreSrc.match(/export type WriteDomain\s*=([\s\S]*?);/)?.[1] ?? '';
    const fromType = new Set<string>();
    let m: RegExpExecArray | null;
    const typePattern = /['"]([a-zA-Z][a-zA-Z0-9]+)['"]/g;
    while ((m = typePattern.exec(writeDomainBlock)) !== null) {
      fromType.add(m[1]!);
    }

    // DOMAINS Set 블록
    const domainsSetBlock =
      coreSrc.match(/const DOMAINS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    const fromSet = new Set<string>();
    const setPattern = /['"]([a-zA-Z][a-zA-Z0-9]+)['"]/g;
    while ((m = setPattern.exec(domainsSetBlock)) !== null) {
      fromSet.add(m[1]!);
    }

    // 두 집합의 차집합 확인
    const onlyInType = [...fromType].filter((d) => !fromSet.has(d));
    const onlyInSet = [...fromSet].filter((d) => !fromType.has(d));

    expect(
      onlyInType,
      `WriteDomain type에는 있지만 DOMAINS Set에 없는 도메인: [${onlyInType.join(', ')}]. ` +
        `두 선언의 도메인 집합이 일치해야 합니다.`,
    ).toHaveLength(0);

    expect(
      onlyInSet,
      `DOMAINS Set에는 있지만 WriteDomain type에 없는 도메인: [${onlyInSet.join(', ')}]. ` +
        `두 선언의 도메인 집합이 일치해야 합니다.`,
    ).toHaveLength(0);
  });

  it('WriteDomain type ↔ LiveSyncWriteRequest.domain — 두 파일의 도메인 집합이 정확히 일치한다', () => {
    // WriteDomain type 블록
    const writeDomainBlock = coreSrc.match(/export type WriteDomain\s*=([\s\S]*?);/)?.[1] ?? '';
    const fromCore = new Set<string>();
    let m: RegExpExecArray | null;
    const corePattern = /['"]([a-zA-Z][a-zA-Z0-9]+)['"]/g;
    while ((m = corePattern.exec(writeDomainBlock)) !== null) {
      fromCore.add(m[1]!);
    }

    // applyLiveSyncWrite.ts LiveSyncWriteRequest.domain union
    const fromApply = extractDomainsFromApply(applySrc);

    const onlyInCore = [...fromCore].filter((d) => !fromApply.has(d));
    const onlyInApply = [...fromApply].filter((d) => !fromCore.has(d));

    expect(
      onlyInCore,
      `aiBridgeLiveSyncCore.ts WriteDomain에는 있지만 applyLiveSyncWrite.ts에 없는 도메인: ` +
        `[${onlyInCore.join(', ')}]. 두 파일의 도메인 집합이 일치해야 합니다(T4 §5-5).`,
    ).toHaveLength(0);

    expect(
      onlyInApply,
      `applyLiveSyncWrite.ts에는 있지만 aiBridgeLiveSyncCore.ts WriteDomain에 없는 도메인: ` +
        `[${onlyInApply.join(', ')}]. 두 파일의 도메인 집합이 일치해야 합니다(T4 §5-5).`,
    ).toHaveLength(0);
  });
});
