/**
 * 정규식 기반 개인정보 패턴 탐지(순수 함수).
 *
 * 신뢰도 정책:
 * - high: 전화·주민등록번호·이메일·생년월일 — 생김새가 일정해 거의 확실.
 * - low : 집주소 — 자유문장이라 오탐·미탐 가능성이 높다. 반드시 사람이 검토해야 한다.
 *
 * 숫자 인접 오탐을 줄이기 위해 lookbehind/lookahead 를 사용한다(Node 18+ 지원).
 */
import type { DetectedSpan, PatternConfig, PatternKind } from './types';

interface PatternDef {
  readonly kind: PatternKind;
  readonly confidence: 'high' | 'low';
  readonly source: string;
}

const PATTERN_DEFS: readonly PatternDef[] = [
  // 주민등록번호(고신뢰): 6자리 - 성별숫자(1~8) + 6자리
  { kind: 'rrn', confidence: 'high', source: String.raw`(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)` },
  // 이메일(고신뢰)
  {
    kind: 'email',
    confidence: 'high',
    source: String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`,
  },
  // 전화번호(고신뢰): 휴대폰(01X) / 지역번호(0XX)
  {
    kind: 'phone',
    confidence: 'high',
    source: String.raw`(?<![\d-])(01[016-9]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}(?![\d-])`,
  },
  // 생년월일(고신뢰): YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  {
    kind: 'birth',
    confidence: 'high',
    source: String.raw`(?<!\d)\d{4}[-./]\d{1,2}[-./]\d{1,2}(?!\d)`,
  },
  // 생년월일(고신뢰): YYYY년 M월 D일
  {
    kind: 'birth',
    confidence: 'high',
    source: String.raw`\d{4}\s?년\s?\d{1,2}\s?월\s?\d{1,2}\s?일`,
  },
  // 생년월일(고신뢰): YYMMDD 6자리 — 월(01-12)·일(01-31) 검증으로 학번 등 오탐 최소화.
  // 주민번호(6자리-7자리)와 겹치면 overlap 해소에서 주민번호(더 긴 매치)가 우선된다.
  {
    kind: 'birth',
    confidence: 'high',
    source: String.raw`(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)`,
  },
  // 집주소(저신뢰): 시/도 + 구/군/시 + 도로/동 + 번지 + 건물·동·호·층 체인 — 휴리스틱, 반드시 검토
  {
    kind: 'address',
    confidence: 'low',
    source: String.raw`(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주특별자치도|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:\s+[가-힣]+(?:시|군|구))+\s+[가-힣0-9]+(?:로|길|동|읍|면|리)\s*\d+(?:-\d+)?(?:\s+[가-힣0-9]+(?:동|호|층|가|아파트|빌라|빌|타워|오피스텔|빌딩|마을|단지|차))*`,
  },
];

const PATTERN_KEYS: Record<PatternKind, keyof PatternConfig> = {
  phone: 'phone',
  rrn: 'rrn',
  email: 'email',
  birth: 'birth',
  address: 'address',
};

/** 활성화된 패턴만 탐지해 구간 목록을 반환한다(겹침 해소는 maskEngine 책임). */
export function detectPatterns(text: string, config: PatternConfig): DetectedSpan[] {
  const spans: DetectedSpan[] = [];
  for (const def of PATTERN_DEFS) {
    if (!config[PATTERN_KEYS[def.kind]]) continue;
    const re = new RegExp(def.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        kind: def.kind,
        confidence: def.confidence,
      });
    }
  }
  return spans;
}
