/**
 * 쿨메신저 쪽지 전용 개인정보 탐지기.
 *
 * ## 이건 "필터"가 아니라 "형광펜"이다
 * 탐지 결과를 **자동으로 지우지 않는다.** 빨간 표시만 하고, 지울지는 미리보기에서
 * 선생님이 정한다. 원본(`coolm-helper`) README의 판단을 그대로 따른다 —
 * *"사람 눈이 마지막 방어선입니다."*
 *
 * ## 기존 `maskEngine`과 무엇이 다른가
 * `maskEngine`은 글을 **별칭으로 치환**(`［이름1］`)하고 나중에 되돌리는 용도다.
 * 여기는 치환이 아니라 **위치(span)를 돌려주는 것**이 목적이다.
 * 전화·주민번호·이메일 탐지는 이미 검증된 `detectPatterns`를 그대로 재사용하고,
 * 쪽지에만 필요한 **호칭·명렬 대조** 두 가지를 더한다.
 *
 * ## ★ 생년월일(`birth`)·집주소(`address`) 패턴은 일부러 끈다
 * 쪽지 본문은 날짜투성이다. `birth` 를 켜면 `2026-09-01` 같은 **일정 날짜를 전부
 * 생년월일로 잡는다.** 이 기능의 존재 이유(날짜 찾기)와 정면으로 충돌한다.
 * `address` 는 저신뢰(휴리스틱)라 쪽지에서 오탐이 심하다.
 *
 * ## 원본
 * `coolm-helper`의 `parser/pii_detector.py` 규칙을 옮긴 것.
 *
 *   Copyright (c) 2026 dacisosl · MIT License
 *   https://github.com/dacisosl/coolm-helper
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */
import { detectPatterns } from './maskRules';
import type { PatternConfig } from './types';

/** 가릴 때 들어갈 문자 */
export const COOL_MASK = '○○○';

/** 쪽지에서 찾는 개인정보 종류 */
export type CoolPiiKind = 'phone' | 'rrn' | 'email' | 'honorific' | 'roster';

/** 쪽지 본문에서 탐지된 한 구간 */
export interface CoolPiiSpan {
  /** 원문 내 시작 인덱스 */
  readonly start: number;
  /** 원문 내 끝 인덱스(exclusive) */
  readonly end: number;
  readonly kind: CoolPiiKind;
  /** 매칭된 원문 조각 */
  readonly text: string;
}

/**
 * 쪽지에서 켜는 자동 패턴.
 * `birth`·`address`를 끄는 이유는 파일 맨 위 설명 참고.
 */
const COOL_PATTERN_CONFIG: PatternConfig = {
  phone: true,
  rrn: true,
  email: true,
  birth: false,
  address: false,
};

/**
 * 기존 패턴이 못 잡는 **쪽지 특유의 표기** 보강 2종.
 *
 * 기존 `maskRules`는 다른 화면에서도 쓰이는 공용 파일이라 건드리지 않고, 여기서만 더한다.
 */
const EXTRA_PATTERNS: ReadonlyArray<{ readonly kind: CoolPiiKind; readonly source: string }> = [
  // 교무실 번호의 괄호 표기: 031)123-4567 — 학교 쪽지에서 흔하다
  { kind: 'phone', source: String.raw`(?<![\d-])0\d{1,2}\)\s?\d{3,4}[-.\s]?\d{4}(?![\d-])` },
  // 일부만 가려진 주민등록번호: 990101-1****** — 가려져 있어도 앞 7자리는 개인정보다
  { kind: 'rrn', source: String.raw`(?<!\d)\d{6}[-\s]?[1-8]\*{4,6}(?!\d)` },
];

/**
 * 호칭: 이름(한글 2~4자) + 학생/님/선생님/학부모 등.
 *
 * 호칭 뒤에는 비한글, 문장 끝, 또는 조사(께/은/는/이…)만 허용해 오탐을 줄인다.
 * `name` 그룹이 패턴 맨 앞이므로 매치 시작 위치가 곧 이름 시작 위치다.
 */
const HONORIFIC_RE =
  /(?<name>[가-힣]{2,4})\s*(?:학부모님|보호자님|선생님|어머님|아버님|학생|쌤|군|양|님)(?=$|[^가-힣]|[께은는이의과와에들도])/g;

/**
 * 호칭 앞에 오지만 이름이 **아닌** 흔한 낱말들.
 *
 * ★ `위기학생`·`전입학생` 같은 합성어의 앞부분이 여기 들어 있다.
 * 이게 없으면 "위기학생 명단"의 '위기'를 사람 이름으로 잡는다.
 */
const NAME_STOPWORDS: ReadonlySet<string> = new Set([
  '선생',
  '선생님',
  '부모',
  '학부모',
  '여러분',
  '회원',
  '고객',
  '구성원',
  '교장',
  '교감',
  '교사',
  '담임',
  '관리자',
  '사용자',
  '담당자',
  '학년',
  '우리',
  '저희',
  '모든',
  '해당',
  '신청자',
  '대상자',
  '참가자',
  '지원자',
  // '~학생' 합성어의 앞부분 (위기학생, 전입학생 등 — 이름이 아니다)
  '위기',
  '다문화',
  '배려',
  '전입',
  '전출',
  '신입',
  '재학',
  '졸업',
  '대상',
  '전체',
  '일부',
  '미인정',
  '미등교',
  '부적응',
]);

/** 이름으로 보기 어려운 꼬리 */
const NAME_BAD_SUFFIXES = ['학년', '학기', '번째'] as const;

/** 정규식 특수문자 이스케이프 (명렬 이름을 패턴에 넣기 위해) */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 겹치는 구간은 **먼저 시작하는(같으면 더 넓은)** 쪽을 남긴다.
 *
 * 예: 주민등록번호와 그 안의 생년월일이 겹치면 더 넓은 주민번호가 이긴다.
 */
function mergeSpans(spans: CoolPiiSpan[]): CoolPiiSpan[] {
  const sorted = [...spans].sort(
    // 시작 위치 오름차순 → 같으면 긴 구간이 먼저(넓은 쪽이 이긴다)
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const out: CoolPiiSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) continue;
    out.push(s);
  }
  return out;
}

/**
 * 쪽지 본문에서 개인정보 구간을 찾는다.
 *
 * @param text 쪽지 본문
 * @param roster 학생 명렬 + 쿨메신저 교직원 명단. 있으면 이름 대조 정확도가 크게 오른다.
 */
export function detectCoolPii(text: string, roster?: ReadonlySet<string>): CoolPiiSpan[] {
  const spans: CoolPiiSpan[] = [];

  // 1) 전화·주민번호·이메일 — 기존 검증된 패턴 재사용
  for (const found of detectPatterns(text, COOL_PATTERN_CONFIG)) {
    // 설정에서 껐으므로 birth/address 는 안 오지만, 타입을 좁히려면 명시해야 한다.
    if (found.kind !== 'phone' && found.kind !== 'rrn' && found.kind !== 'email') continue;
    spans.push({ start: found.start, end: found.end, kind: found.kind, text: found.text });
  }

  // 1-2) 쪽지 특유의 표기 보강 (괄호 전화번호 · 일부 가려진 주민번호)
  for (const def of EXTRA_PATTERNS) {
    for (const m of text.matchAll(new RegExp(def.source, 'g'))) {
      spans.push({ start: m.index, end: m.index + m[0].length, kind: def.kind, text: m[0] });
    }
  }

  // 2) 호칭 패턴 — 이름 부분만 잡고 호칭은 남긴다 ('김철수 학생' → '○○○ 학생')
  for (const m of text.matchAll(HONORIFIC_RE)) {
    const name = m.groups?.name;
    if (!name) continue;
    if (NAME_STOPWORDS.has(name)) continue;
    if (NAME_BAD_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;
    spans.push({ start: m.index, end: m.index + name.length, kind: 'honorific', text: name });
  }

  // 3) 명렬 대조 — 단어 경계를 둬서 다른 낱말 속에 우연히 든 경우를 뺀다
  //    (명렬의 '이수'가 '이수 기준'의 일부로 잡히는 것 방지)
  for (const name of roster ?? []) {
    if (name.length < 2) continue;
    const re = new RegExp(`(?<![가-힣])${escapeRegExp(name)}(?![가-힣])`, 'g');
    for (const m of text.matchAll(re)) {
      spans.push({ start: m.index, end: m.index + name.length, kind: 'roster', text: name });
    }
  }

  return mergeSpans(spans);
}

/**
 * 탐지 구간을 가린 글을 돌려준다.
 *
 * **자동으로 쓰지 않는다.** 선생님이 미리보기에서 "가리기"를 눌렀을 때,
 * 또는 구글 캘린더처럼 밖으로 나가는 경로에서만 쓴다.
 */
export function maskCoolPii(
  text: string,
  spans?: readonly CoolPiiSpan[],
  roster?: ReadonlySet<string>,
): string {
  const target = spans ?? detectCoolPii(text, roster);
  let out = text;
  for (const s of [...target].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + COOL_MASK + out.slice(s.end);
  }
  return out;
}
