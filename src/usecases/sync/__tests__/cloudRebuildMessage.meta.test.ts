/**
 * cloudRebuildMessage.meta.test.ts — "복구 안내 문구"의 단일 출처 가드
 *
 * 화면의 [클라우드 백업 다시 만들기] 단추는 오류 **문자열**을 보고 뜬다
 * (오류가 store 를 지나며 message 로 납작해지기 때문). 그래서 던지는 쪽에서 문구를
 * 손으로 적기 시작하면, 한 글자만 어긋나도 단추가 조용히 사라진다 — 화면은 여전히
 * "클라우드 데이터를 다시 구성해 주세요"라고 말하면서 그 방법은 안 알려주는,
 * 이번에 고친 바로 그 상태로 되돌아간다.
 *
 * 그래서 문구는 domain/rules/driveSyncRecovery 의 생성기만 만든다.
 * 되돌리고 싶다면 단언을 지우지 말고, 문구가 어긋나도 단추가 살아 있음을 먼저 증명할 것.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLOUD_REBUILD_HINT,
  buildDuplicateFileMessage,
  buildManifestMismatchMessage,
  isCloudRebuildRequiredError,
} from '@domain/rules/driveSyncRecovery';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SOURCE_PATH = 'src/usecases/sync/SyncToCloud.ts';
const source = readFileSync(resolve(REPO_ROOT, SOURCE_PATH), 'utf-8');

/** 안내 문구가 손으로 적힌 줄들 */
const hintLines = source.split('\n').filter((line) => line.includes(CLOUD_REBUILD_HINT));

describe('클라우드 복구 안내 문구는 도메인 생성기만 만든다', () => {
  it('SyncToCloud 가 생성기를 실제로 쓴다', () => {
    expect(source).toContain('buildManifestMismatchMessage(');
    expect(source).toContain('buildDuplicateFileMessage(');
  });

  it('직접 적은 안내 문구가 남아 있다면 "원본 기기에서" 계열뿐이다', () => {
    // 이 계열은 일부러 생성기 밖에 둔다 — 이 기기에서 복구하면 원본 기기 자료가 사라진다.
    const strays = hintLines.filter((line) => !line.includes('원본 기기에서'));
    expect(strays).toEqual([]);
  });

  it('남아 있는 "원본 기기에서" 문구는 이 기기의 복구 대상으로 분류되지 않는다', () => {
    // 문구가 두 벌로 갈린 채 살아 있으므로, 분류기가 실제 소스 문구를 보고도
    // 헷갈리지 않는지를 소스에서 직접 뽑아 확인한다.
    expect(hintLines.length).toBeGreaterThan(0);
    for (const line of hintLines) {
      expect(isCloudRebuildRequiredError(line)).toBe(false);
    }
  });

  it('생성기가 만든 문구는 복구 대상으로 분류된다 (왕복 확인)', () => {
    expect(isCloudRebuildRequiredError(buildManifestMismatchMessage('events'))).toBe(true);
    expect(isCloudRebuildRequiredError(buildManifestMismatchMessage('아카이브'))).toBe(true);
    expect(isCloudRebuildRequiredError(buildDuplicateFileMessage('todos'))).toBe(true);
  });
});
