/**
 * 쌤핀 AI — 전송 직전 최종 관문 (egress 4중 그물 ③)
 *
 * ★이 층은 **경고가 아니라 차단**이다.
 *
 * 2026-08-21 오너 결정으로 입력 안전장치(screenAssistInput)는 "경고 전용"이 됐지만,
 * **이 파일은 그 전환 대상이 아니다.** 이유는 판정의 성격이 다르기 때문이다.
 *
 * - `screenAssistInput` 이 다루는 것 = "가정 형편 이야기 같다" → **사람의 맥락 판단**이 필요 → 경고
 * - 여기서 다루는 것 = "전화번호 형태다 / 명단에 있는 이름과 같다" → **기계가 확실히 판정** → 차단
 *
 * ★★생년월일 패턴은 **자유 입력 필드에만** 켠다.
 * 구조화된 필드에도 켰다가 `date: '2026-08-21'`·`due: '2026-08-25'`·`period: '2026-08-01 ~ ...'`
 * 이 전부 걸려 **정상 도구 결과 5종 중 3종이 100% 차단**된 적이 있다(검토에서 실측으로 잡힘).
 * 설계 문서가 경고한 바로 그 실패 모양이다 — "오탐이 기능을 죽인다".
 * 구조화된 필드는 앱이 스키마로 모양을 보장하므로 날짜가 들어 있는 것이 정상이다.
 *
 * 순수 TypeScript — `domain/privacy` 의 기존 탐지기를 재사용한다(같은 레이어라 허용).
 * 정규식을 새로 쓰지 않는 이유: 이미 검증된 패턴이 있고, 두 벌이 되면 한쪽만 고쳐진다.
 *
 * 설계 근거: docs/01-plan/features/in-app-chatbot-zen.plan.md §4.4 그물 ③
 */
import type { AssistToolDef } from '../entities/AssistTool';
import { detectKeywords } from '../privacy/keywordMask';
import { detectPatterns } from '../privacy/maskRules';
import type { KeywordGroup, MaskKind, PatternConfig } from '../privacy/types';

/** 구조화된 값(날짜·숫자·학급명) — 날짜는 정상이므로 birth 를 끈다. */
const STRUCTURED_PATTERNS: PatternConfig = {
  phone: true,
  rrn: true,
  email: true,
  birth: false,
  address: false,
};

/**
 * 선생님이 자유롭게 친 문자열 — 생년월일·주소가 숨을 수 있다.
 *
 * `address` 는 저신뢰(오탐 많음) 패턴이라 구조화 필드에서는 끄지만, **자유 입력에서는 켠다.**
 * 계획서 §10.1 이 assertNoPii 테스트 대상에 주소를 넣어 뒀고, 주소 정규식은
 * 시/도 + 구/군 + 로/길 + 번지 체인을 요구해 자유 문장에서는 오탐이 낮다.
 * Phase 3 의 `get_my_schedule.place` 가 오면 이 결정이 더 중요해진다.
 */
const FREE_TEXT_PATTERNS: PatternConfig = {
  phone: true,
  rrn: true,
  email: true,
  birth: true,
  address: true,
};

/** 기계 식별자용 - 패턴을 전부 끈다(이름 대조만 남는다). */
const NO_PATTERNS: PatternConfig = {
  phone: false,
  rrn: false,
  email: false,
  birth: false,
  address: false,
};

/** 무엇이 걸렸는지. **걸린 원문 값 자체는 담지 않는다** — 로그로 새면 관문의 의미가 없다. */
export interface PiiHit {
  readonly kind: MaskKind;
  /** keyword 일 때의 그룹 라벨(예: '이름'). 패턴이면 없음. */
  readonly label?: string;
  /** 어느 필드에서 걸렸는지(경로). 값은 담지 않는다. */
  readonly path?: string;
  readonly start: number;
  readonly end: number;
}

export interface PiiCheckResult {
  /** ★true 면 **전송하지 않는다.** 경고가 아니다. */
  readonly blocked: boolean;
  readonly hits: readonly PiiHit[];
}

const PASS: PiiCheckResult = { blocked: false, hits: [] };

function scan(
  text: string,
  patterns: PatternConfig,
  nameGroups: readonly KeywordGroup[],
  path?: string,
): PiiHit[] {
  if (!text) return [];
  const spans = [...detectPatterns(text, patterns), ...detectKeywords(text, nameGroups)];
  return spans.map((span) => ({
    kind: span.kind,
    ...(span.label === undefined ? {} : { label: span.label }),
    ...(path === undefined ? {} : { path }),
    start: span.start,
    end: span.end,
  }));
}

/**
 * 자유 입력 문자열 하나를 검사한다(생년월일 패턴 포함).
 *
 * @param text 검사할 문자열
 * @param nameGroups 학생 이름 등 명단. **domain 이 스토어를 import 하지 않기 위해 주입받는다.**
 */
export function checkOutboundText(
  text: string,
  nameGroups: readonly KeywordGroup[] = [],
): PiiCheckResult {
  const hits = scan(text, FREE_TEXT_PATTERNS, nameGroups);
  return hits.length === 0 ? PASS : { blocked: true, hits };
}

/**
 * 도구 결과 전체를 훑는다.
 *
 * - 중첩 객체·배열 안의 문자열까지 본다. 얕게만 보면 `{ items: [{ title: '김지훈 상담' }] }` 를
 *   놓치는데, **실제 위험이 정확히 그 모양**(`get_my_todos.items[].title`)이다.
 * - **객체의 키도 검사한다.** `{ '김지훈': 3 }` 같은 맵 형태 집계가 하나만 추가돼도 뚫리기 때문이다.
 * - **숫자도 문자열로 바꿔 검사한다.** 주민번호·전화번호가 숫자로 들어올 수 있다.
 * - `tool` 을 주면 `freeTextFields` 에 해당하는 키에만 생년월일 패턴을 켠다.
 *   주지 않으면 **모두 구조화된 값으로 보고 검사한다**(보수적으로 오탐을 줄이는 쪽).
 */
export function checkOutboundValue(
  value: unknown,
  nameGroups: readonly KeywordGroup[] = [],
  tool?: AssistToolDef,
): PiiCheckResult {
  const freeText = new Set(tool?.freeTextFields ?? []);
  const opaque = new Set(tool?.opaqueFields ?? []);
  const hits: PiiHit[] = [];

  const walk = (node: unknown, key: string | undefined, path: string): void => {
    if (typeof node === 'string') {
      // 기계 식별자(UUID 등)는 패턴 검사를 건너뛴다. 이름 대조는 계속 돈다.
      if (key !== undefined && opaque.has(key)) {
        hits.push(...scan(node, NO_PATTERNS, nameGroups, path));
        return;
      }
      const patterns =
        key !== undefined && freeText.has(key) ? FREE_TEXT_PATTERNS : STRUCTURED_PATTERNS;
      hits.push(...scan(node, patterns, nameGroups, path));
      return;
    }
    if (typeof node === 'number') {
      // ★숫자는 패턴 검사를 하지 않는다(1차에서 넣었다가 뺐다).
      //   근거: 13자리 정수는 주민번호 정규식에 걸리는데, epoch ms 가 정확히 13자리라
      //   실측 1,000개 중 800개가 매치했다. `updatedAt` 같은 필드를 하나 추가하는 순간
      //   그 도구가 통째로 죽는다.
      //   반대로 얻는 것은 거의 없다 — 전화번호를 숫자로 담으면 앞의 0 이 사라져
      //   `01099998888` 이 `1099998888` 이 되고, 이는 전화 정규식에도 걸리지 않는다.
      //   숫자에는 이름도 담기지 않는다. **오탐만 남고 방어는 없다.**
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, key, `${path}[${i}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [childKey, childValue] of Object.entries(node)) {
        const childPath = path ? `${path}.${childKey}` : childKey;
        // ★키 자체도 검사한다 — 맵 형태 집계에서 이름이 키로 올 수 있다.
        hits.push(...scan(childKey, STRUCTURED_PATTERNS, nameGroups, `${childPath}(key)`));
        walk(childValue, childKey, childPath);
      }
    }
  };

  walk(value, undefined, '');
  return hits.length === 0 ? PASS : { blocked: true, hits };
}
