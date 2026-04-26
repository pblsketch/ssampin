import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYNC_REGISTRY, SYNC_FILES } from '../syncRegistry';

/**
 * Google Drive 동기화 회귀 방지 메타 테스트 (registry 기반).
 *
 * 배경: 동기화 도메인 매핑이 4곳(SYNC_FILES, App.tsx subscribe, reloadStores switch,
 * 수동 FILE_TO_STORE 테이블)에 분산되어 있어 누락 시 silent bug가 발생했다
 * (2026-04-26 사용자 피드백).
 *
 * sync-registry-refactor PDCA로 SYNC_REGISTRY 단일 소스화한 이후, 본 테스트는:
 *  (a) SYNC_FILES가 SYNC_REGISTRY에서 정확히 파생되었는지
 *  (b) subscribeExcluded가 false인 모든 도메인이 App.tsx STORE_SUBSCRIBE_MAP에 등재되어 있는지
 *  (c) registry 내 fileName 중복이 없는지
 *  (d) settings 도메인이 subscribeExcluded:true인지 (무한루프 방지)
 *  (e) 모든 도메인에 reload 함수가 정의되어 있는지
 *  (f) isDynamic이면 enumerateDynamic 함수가 반드시 존재하는지
 *
 * 새 SYNC_REGISTRY 항목을 추가할 때:
 *   1. syncRegistry.ts에 SyncDomain 항목 추가
 *   2. (subscribeExcluded:false라면) App.tsx의 STORE_SUBSCRIBE_MAP에도 추가
 *   3. 본 테스트 자동 통과 확인
 */
describe('syncRegistry 구조적 정합성', () => {
  it('(a) SYNC_FILES는 SYNC_REGISTRY의 정적 도메인에서 정확히 파생되어야 한다', () => {
    const registryFileNames = SYNC_REGISTRY
      .filter(d => !d.isDynamic)
      .map(d => d.fileName);
    expect([...SYNC_FILES]).toEqual(registryFileNames);
  });

  it('(b) subscribeExcluded가 없는 도메인은 App.tsx STORE_SUBSCRIBE_MAP에 등재되어야 한다', () => {
    const appPath = resolve(__dirname, '../../../App.tsx');
    const appSource = readFileSync(appPath, 'utf8');

    const startMarker = 'STORE_SUBSCRIBE_MAP';
    const startIdx = appSource.indexOf(startMarker);
    expect(startIdx, 'App.tsx에서 STORE_SUBSCRIBE_MAP을 찾지 못함').toBeGreaterThan(-1);

    const endMarker = '};';
    const endIdx = appSource.indexOf(endMarker, startIdx);
    expect(endIdx, 'App.tsx STORE_SUBSCRIBE_MAP의 종료 지점을 찾지 못함').toBeGreaterThan(startIdx);
    const block = appSource.slice(startIdx, endIdx);

    const shouldSubscribe = SYNC_REGISTRY
      .filter(d => !d.subscribeExcluded && !d.isDynamic);

    const missing: string[] = [];
    for (const domain of shouldSubscribe) {
      if (!block.includes(`'${domain.fileName}'`)) {
        missing.push(domain.fileName);
      }
    }
    expect(
      missing,
      `다음 도메인이 App.tsx STORE_SUBSCRIBE_MAP에 없습니다: ${missing.join(', ')}\n` +
      `새 도메인을 SYNC_REGISTRY에 추가할 때 STORE_SUBSCRIBE_MAP도 함께 업데이트하세요.`,
    ).toEqual([]);
  });

  it('(c) SYNC_REGISTRY에 중복 fileName이 없어야 한다', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const d of SYNC_REGISTRY) {
      if (seen.has(d.fileName)) duplicates.push(d.fileName);
      seen.add(d.fileName);
    }
    expect(duplicates, `중복 fileName 발견: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('(d) settings 도메인은 subscribeExcluded: true이어야 한다 (무한루프 방지)', () => {
    const settings = SYNC_REGISTRY.find(d => d.fileName === 'settings');
    expect(settings, 'settings 도메인이 registry에 없음').toBeDefined();
    expect(settings!.subscribeExcluded).toBe(true);
  });

  it('(e) 모든 도메인에 reload 함수가 정의되어 있어야 한다', () => {
    const missing = SYNC_REGISTRY
      .filter(d => typeof d.reload !== 'function')
      .map(d => d.fileName);
    expect(missing, `reload 함수 미정의 도메인: ${missing.join(', ')}`).toEqual([]);
  });

  it('(f) isDynamic: true인 도메인은 enumerateDynamic 함수를 반드시 가져야 한다', () => {
    const invalid = SYNC_REGISTRY
      .filter(d => d.isDynamic && typeof d.enumerateDynamic !== 'function')
      .map(d => d.fileName);
    expect(invalid, `isDynamic이지만 enumerateDynamic이 없는 도메인: ${invalid.join(', ')}`).toEqual([]);
  });
});
