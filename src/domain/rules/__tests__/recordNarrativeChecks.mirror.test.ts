import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { narrativeLexiconFingerprint } from '@domain/rules/recordNarrativeChecks';

/**
 * 브릿지 미러 **실제 대조** — 두 저장소가 모두 있는 개발 PC 에서만 도는 기회적 검사.
 *
 * ★왜 따로 두는가: 지문(`narrativeLexiconFingerprint`)만으로는 "양쪽을 같이 고쳤다"를 못 잡는다.
 * 본체에서 어휘를 고치면 본체 테스트가 깨지는데, 개발자가 **상수만 갱신하면 다시 초록**이 되고
 * 브릿지는 별도 레포·별도 CI 라 영영 모른다. 그래서 브릿지 테스트가 못 박은 상수를 **파일에서
 * 직접 읽어** 본체 지문과 맞춰 본다. 한쪽만 갱신하면 여기서 걸린다.
 *
 * ⚠️ **CI 에서는 아예 돌지 않는다** — 브릿지 레포가 체크아웃에 없어 skip 된다. 이 검사가 진짜로
 * 지키는 곳은 두 저장소를 나란히 둔 개발 PC 뿐이다. 그 한계를 알고 쓴다(브릿지를 본체에 서브모듈로
 * 넣거나 사례 코퍼스를 벤더링하는 것이 진짜 해법이고, 그건 T6·별도 결정 영역이다).
 */
const BRIDGE_MIRROR_TEST = resolve(
  process.cwd(),
  '../ssampin-ai-bridge/packages/core/test/recordNarrative.test.ts',
);
const bridgeAvailable = existsSync(BRIDGE_MIRROR_TEST);

describe.skipIf(!bridgeAvailable)('브릿지 미러 실제 대조 (두 저장소가 다 있을 때만)', () => {
  it('브릿지가 못 박은 지문이 본체 지문과 같다', () => {
    const source = readFileSync(BRIDGE_MIRROR_TEST, 'utf-8');
    const matched = /NARRATIVE_LEXICON_FINGERPRINT\s*=\s*'([0-9a-f]{8})'/.exec(source);
    expect(
      matched,
      `브릿지 테스트(${BRIDGE_MIRROR_TEST})에서 지문 상수를 찾지 못했습니다. ` +
        '미러 대조가 조용히 무력화되지 않도록, 상수 이름이 바뀌었으면 이 정규식도 같이 고치세요.',
    ).not.toBeNull();
    expect(
      matched?.[1],
      '본체와 브릿지의 서사 점검 어휘·임계값·라벨이 어긋났습니다. ' +
        '한쪽만 고쳤거나, 양쪽을 고치고 한쪽 상수만 갱신했습니다.',
    ).toBe(narrativeLexiconFingerprint());
  });
});
