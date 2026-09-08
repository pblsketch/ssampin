/**
 * 생기부 초안 근거 꾸러미 — AI 에 보낼 것을 **여기서 한 번에** 정한다(순수).
 *
 * ★왜 프롬프트가 아니라 여기인가: 실측에서 금지 항목을 시스템 프롬프트에 전부 열거하고
 * 사용자 턴 끝에서 다시 강조해도 모델이 세특 본문에 그대로 옮겨 적었다(2/2 실패,
 * 보강 후에도 2/2 실패 — `docs/03-analysis/record-draft-solar-quality.analysis.md` §3-2).
 * **안 보내면 못 쓴다.** 그래서 조립 단계에서 걸러 낸다(ADR-072 결정 5).
 *
 * ★공급자와 무관하다. 쌤핀 AI 든 선생님 구독 CLI 든 같은 꾸러미를 받는다 — 모델이 좋아졌다고
 * 이 차단을 느슨하게 하지 않는다.
 *
 * ★성취기준은 **키워드만** 넣는다(원문 금지).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import {
  detectProhibitedTerms,
  summarizeProhibited,
  type ProhibitedHit,
} from '../rules/prohibitedRecordTerms';
import { createMaskSession } from '../privacy/maskEngine';
import type { KeywordGroup, MaskMapping } from '../privacy/types';
import { redactQuestion } from '../rules/redactOutbound';
import { NARRATIVE_MARK_INSTRUCTION } from '../rules/narrativeParagraphs';
import { neisByteLength } from '../entities/RecordDraft';
import {
  aliasByteDelta,
  modelFloorBytes,
  modelTargetBytes,
  INSUFFICIENT_MARK,
  type LengthAdjustKind,
} from '../rules/recordLengthGoal';

/** 꾸러미에 넣을 근거 한 건(엔티티 전체가 아니라 필요한 것만 받는다). */
export interface DraftPackEvidence {
  readonly id: string;
  /** 근거 원문. **여기서** 가린다 — 부르는 쪽이 가려 줄 것이라 믿지 않는다(UltraQA P0). */
  readonly content: string;
  readonly date?: string;
  /** 선생님이 "AI 에 보내지 않기"로 표시한 근거. */
  readonly excludedFromAi?: boolean;
}

export interface DraftPackInput {
  /**
   * 학생 **실명**. 꾸러미 안에서 별칭으로 바뀐다 — 이 값 자체는 절대 밖으로 나가지 않는다.
   *
   * ★예전에는 부르는 쪽이 별칭을 만들어 넘겼고 근거 본문은 그대로 실렸다. 그래서 근거에
   *   적힌 "김지훈과 박서연이 모둠에서…" 같은 **다른 학생 실명**이 그대로 나갔다(UltraQA P0).
   *   이제 이름·근거·주제·지시를 **한 세션으로 함께** 가린다 — 같은 학생은 같은 별칭이다.
   */
  readonly studentName: string;
  /** 실명·학번을 찾아 가릴 명단(`rosterFromAll`). 이 학생도 여기 들어 있어야 한다. */
  readonly roster: readonly KeywordGroup[];
  /** 영역 이름(교과 세특·행동특성 등). */
  readonly areaLabel: string;
  /** 고른 탐구 주제(없으면 전체 근거). */
  readonly threadTitle?: string;
  readonly evidences: readonly DraftPackEvidence[];
  /** 성취기준 **키워드**만. 원문을 넣지 않는다. */
  readonly standardKeywords?: readonly string[];
  /** 선생님이 따로 적어 둔 지시(2층 프롬프트). */
  readonly teacherPrompt?: string;
}

/** 왜 빠졌는지 — 화면이 "제외됨 N건"과 사유를 보여 준다. */
export type DraftPackExclusionReason = 'teacher' | 'prohibited' | 'empty' | 'too-long';

/**
 * 근거를 실을 수 있는 글자 수 상한.
 *
 * ★윈도우는 프로그램에 넘기는 명령줄 전체가 32,767자를 넘으면 **실행 자체가 실패한다.**
 * 꾸러미는 그 명령줄에 실려 가므로, 넘치면 "실행이 도중에 멈췄어요"라는 엉뚱한 안내가
 * 뜨고 다시 눌러도 똑같이 실패한다. 그래서 넘칠 근거를 미리 빼고 **뺐다고 말한다.**
 *
 * 12,000자는 한 학생분 근거로는 넉넉하고(관찰 기록 수십 건), 나머지 20,000자를
 * 작성 규정과 실행 옵션 몫으로 남긴다.
 */
export const DRAFT_PACK_MAX_EVIDENCE_CHARS = 12_000;

export interface DraftPackExclusion {
  readonly evidenceId: string;
  readonly reason: DraftPackExclusionReason;
  /** 기재 금지로 빠진 경우, 어떤 갈래였는지(한국어 라벨). */
  readonly categories?: readonly string[];
}

export interface DraftPack {
  /** 모델에게 보낼 사용자 턴 본문. 실명이 없다. */
  readonly text: string;
  /** 이 학생을 가리키는 별칭(본문 첫 줄과 같다). */
  readonly studentAlias: string;
  /**
   * 별칭 ↔ 실명. 답이 오면 되돌리는 데 쓴다.
   * ★개인정보다 — 화면 상태나 파일에 저장하지 않고, 이 실행이 끝나면 버린다.
   */
  readonly mappings: readonly MaskMapping[];
  /** 실제로 실린 근거 수. */
  readonly includedCount: number;
  readonly exclusions: readonly DraftPackExclusion[];
}

export const DRAFT_PACK_EXCLUSION_LABELS: Readonly<Record<DraftPackExclusionReason, string>> = {
  teacher: '선생님이 보내지 않기로 표시함',
  prohibited: '기재 금지 항목이 들어 있음',
  empty: '내용이 비어 있음',
  'too-long': '한 번에 보낼 수 있는 분량을 넘음',
};

function hitsToCategories(hits: readonly ProhibitedHit[]): readonly string[] {
  return summarizeProhibited(hits);
}

/**
 * 근거 꾸러미를 조립한다.
 *
 * 빠지는 순서(먼저 걸리는 것이 사유가 된다):
 * 1. 선생님이 직접 뺀 것
 * 2. 내용이 빈 것
 * 3. 기재 금지 항목이 들어 있는 것
 * 4. 앞의 근거들로 이미 분량이 차 버린 것
 *
 * 문장 마지막에 **근거로 되짚기** 지시를 붙인다 — 실측에서 이 지시를 뒤쪽에 두었을 때만
 * 모델이 얇은 근거로 지어내기를 멈췄다(같은 분석 문서 §3-1, 최신성 효과).
 */
export function buildRecordDraftPack(input: DraftPackInput): DraftPack {
  const exclusions: DraftPackExclusion[] = [];
  const lines: string[] = [];
  let usedChars = 0;
  const mappings: MaskMapping[] = [];

  // ★명단에 이 학생이 없으면(호출부 실수) 실명이 그대로 나간다 — 여기서 반드시 넣는다.
  const name = input.studentName.trim();
  const roster = input.roster.some((g) => g.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mask = (text: string): string => {
    const r = redactQuestion(text, roster, session);
    mappings.push(...r.mappings);
    return r.masked;
  };

  // 이 학생 이름을 **맨 먼저** 가린다 — 그래야 ［이름1］ 이 되고, 근거 안의 같은 이름도
  // 같은 번호를 받는다(세션이 기억한다).
  const studentAlias = mask(name);

  for (const e of input.evidences) {
    if (e.excludedFromAi === true) {
      exclusions.push({ evidenceId: e.id, reason: 'teacher' });
      continue;
    }
    const raw = e.content.trim();
    if (raw.length === 0) {
      exclusions.push({ evidenceId: e.id, reason: 'empty' });
      continue;
    }
    // 기재 금지 검사는 **원문**으로 한다 — 가린 뒤에는 단어가 바뀌어 못 잡을 수 있다.
    const hits = detectProhibitedTerms(raw);
    if (hits.length > 0) {
      exclusions.push({
        evidenceId: e.id,
        reason: 'prohibited',
        categories: hitsToCategories(hits),
      });
      continue;
    }
    const content = mask(raw);
    const line = e.date ? `- (${e.date}) ${content}` : `- ${content}`;
    if (usedChars + line.length > DRAFT_PACK_MAX_EVIDENCE_CHARS) {
      // 여기서 멈추지 않고 계속 도는 이유: 뒤에 짧은 근거가 있으면 그건 실을 수 있다.
      exclusions.push({ evidenceId: e.id, reason: 'too-long' });
      continue;
    }
    usedChars += line.length + 1; // 줄바꿈 몫
    lines.push(line);
  }

  const parts: string[] = [];
  parts.push(`학생: ${studentAlias}`);
  parts.push(`영역: ${input.areaLabel}`);
  if (input.threadTitle) parts.push(`주제: ${mask(input.threadTitle)}`);
  if (input.standardKeywords && input.standardKeywords.length > 0) {
    // 원문이 아니라 키워드만 — 성취기준 본문은 앱 밖으로 내보내지 않는다.
    parts.push(`성취기준 키워드: ${input.standardKeywords.join(', ')}`);
  }
  parts.push('');
  parts.push('근거 자료:');
  parts.push(lines.length > 0 ? lines.join('\n') : '(보낼 수 있는 근거가 없습니다)');

  if (input.teacherPrompt && input.teacherPrompt.trim().length > 0) {
    parts.push('');
    parts.push('선생님 지시:');
    parts.push(mask(input.teacherPrompt.trim()));
  }

  // 형광펜 표식(ADR-085) — 문단마다 [동기]/[과정]/[결과]/[평가]. 앱이 색으로 바꾸고 저장 본문에서는 뗀다.
  // ★근거로 되짚기 지시보다 **앞**에 둔다 — 맨 끝(최신성)은 지어내기를 막는 지시의 자리다.
  parts.push('');
  parts.push(NARRATIVE_MARK_INSTRUCTION);
  parts.push('');
  parts.push(
    '위 근거만 보고 쓰세요. 활동을 나열하지 말고 하나의 탐구 흐름으로 이어 주세요. ' +
      '본문의 모든 서술이 근거 자료의 어느 줄에서 나왔는지 짚을 수 있어야 합니다. ' +
      '근거에 없는 내용은 쓰지 마세요.',
  );

  return {
    text: parts.join('\n'),
    studentAlias,
    mappings,
    includedCount: lines.length,
    exclusions,
  };
}

/**
 * 분량 조절 꾸러미 — 조절 대상 **본문 자체**를 모델에게 보낸다.
 *
 * ★이 함수가 생기기 전까지 밖으로 나간 것은 근거뿐이었다. 근거는 기재 금지 필터를 거치지만
 *   초안 본문은 그 필터를 거친 적이 없다. 그래서 이 꾸러미는 본문의 기재 금지 항목을
 *   **자동으로 지우지 않고 세어서 돌려준다** — 문장을 조용히 지우면 선생님은 무엇이
 *   없어졌는지도 모른다(오너 결정 4). 지울지 보낼지는 화면이 선생님에게 묻는다.
 * ★가리는 일은 여기 한 곳에서 한다. 부르는 쪽이 다시 가리면 `createMaskSession()` 이 새로
 *   생겨 별칭 번호가 갈리고, 서로 다른 학생이 똑같이 ［이름1］ 이 되는 실측 사고를 재현한다.
 */
export interface LengthAdjustPackInput {
  readonly kind: LengthAdjustKind;
  /** 학생 **실명**. 여기서 별칭으로 바뀐다. */
  readonly studentName: string;
  readonly roster: readonly KeywordGroup[];
  readonly areaLabel: string;
  /** 조절 대상 판의 주제. 화면의 현재 칩이 아니라 **대상 판**의 것이어야 한다. */
  readonly threadTitle?: string;
  /** 조절할 본문(실명 그대로). */
  readonly sourceText: string;
  /** 선생님이 고른 목표 바이트(최종 저장 본문 기준). */
  readonly targetBytes: number;
  /** `expand` 일 때만 쓴다. `shrink` 는 근거를 싣지 않는다. */
  readonly evidences?: readonly DraftPackEvidence[];
}

export interface LengthAdjustPack extends DraftPack {
  /** 모델에게 실제로 적어 보낸 목표 상한(별칭 보정 반영). */
  readonly modelTargetBytes: number;
  /** 모델에게 실제로 적어 보낸 목표 하한(같은 보정). */
  readonly modelFloorBytes: number;
  /** 선생님이 고른 목표. **판정은 이 값으로 한다.** */
  readonly finalTargetBytes: number;
  /**
   * 조절 대상 본문에서 찾은 기재 금지 갈래(한국어 라벨). 비어 있지 않으면 화면이 보내기 전에 묻는다.
   * ★근거와 달리 **빼지 않는다.** 자동 삭제는 조용한 문장 소실이라 더 나쁘다.
   */
  readonly sourceProhibited: readonly string[];
}

/** NEIS 바이트를 한글 글자 수로 어림한다(한글 1자 = 3바이트). 모델에게 감을 주는 숫자일 뿐 판정에는 안 쓴다. */
function approxKoreanChars(bytes: number): number {
  return Math.max(1, Math.round(bytes / 3));
}

export function buildLengthAdjustPack(input: LengthAdjustPackInput): LengthAdjustPack {
  const exclusions: DraftPackExclusion[] = [];
  const lines: string[] = [];
  let usedChars = 0;
  const mappings: MaskMapping[] = [];

  const name = input.studentName.trim();
  const roster = input.roster.some((g) => g.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mask = (text: string): string => {
    const r = redactQuestion(text, roster, session);
    mappings.push(...r.mappings);
    return r.masked;
  };

  // 학생 이름을 맨 먼저 가린다 — 본문·근거 속 같은 이름이 같은 번호를 받는다.
  const studentAlias = mask(name);
  const rawSource = input.sourceText.trim();
  // 기재 금지 검사는 **원문**으로 한다(가린 뒤에는 단어가 바뀌어 못 잡을 수 있다).
  const sourceProhibited = hitsToCategories(detectProhibitedTerms(rawSource));
  const maskedSource = mask(rawSource);

  // 별칭 보정 — 실명본과 별칭본의 길이 차이를 목표에 미리 반영한다(어림 보정).
  const delta = aliasByteDelta(rawSource, maskedSource);
  const target = modelTargetBytes(input.targetBytes, delta);
  const floor = modelFloorBytes(input.targetBytes, delta);

  if (input.kind === 'expand') {
    for (const e of input.evidences ?? []) {
      if (e.excludedFromAi === true) {
        exclusions.push({ evidenceId: e.id, reason: 'teacher' });
        continue;
      }
      const raw = e.content.trim();
      if (raw.length === 0) {
        exclusions.push({ evidenceId: e.id, reason: 'empty' });
        continue;
      }
      const hits = detectProhibitedTerms(raw);
      if (hits.length > 0) {
        exclusions.push({
          evidenceId: e.id,
          reason: 'prohibited',
          categories: hitsToCategories(hits),
        });
        continue;
      }
      const content = mask(raw);
      const line = e.date ? `- (${e.date}) ${content}` : `- ${content}`;
      if (usedChars + line.length > DRAFT_PACK_MAX_EVIDENCE_CHARS) {
        exclusions.push({ evidenceId: e.id, reason: 'too-long' });
        continue;
      }
      usedChars += line.length + 1;
      lines.push(line);
    }
  }

  const parts: string[] = [];
  parts.push(`학생: ${studentAlias}`);
  parts.push(`영역: ${input.areaLabel}`);
  if (input.threadTitle) parts.push(`주제: ${mask(input.threadTitle)}`);
  parts.push('');
  parts.push(input.kind === 'shrink' ? '줄일 글:' : '채울 글:');
  parts.push(maskedSource);

  // ★`shrink` 에는 근거 블록을 아예 붙이지 않는다. 붙이면 "(보낼 수 있는 근거가 없습니다)" 와
  //   "근거만 보고 쓰세요" 가 함께 나가 자기모순 프롬프트가 된다.
  if (input.kind === 'expand') {
    parts.push('');
    parts.push('근거 자료:');
    parts.push(lines.length > 0 ? lines.join('\n') : '(보낼 수 있는 근거가 없습니다)');
  }

  parts.push('');
  const sourceBytes = neisByteLength(maskedSource);
  // ★모델은 바이트를 못 센다 — 한글 기준 글자 수(1자 = 3바이트)를 함께 준다. 실측(2026-09-08):
  //   바이트만 주면 1,719 → 1,689 로 겨우 줄이고 목표(1,500)를 두 번 다 넘겼다.
  parts.push(
    `현재 분량: 약 ${sourceBytes.toLocaleString()}바이트 (한글 약 ${approxKoreanChars(sourceBytes)}자)`,
  );
  parts.push(
    `목표 분량: ${floor.toLocaleString()} ~ ${target.toLocaleString()}바이트 (한글 약 ${approxKoreanChars(floor)}~${approxKoreanChars(target)}자, 가능한 한 위쪽에 가깝게)`,
  );
  if (input.kind === 'shrink' && sourceBytes > target) {
    const cut = sourceBytes - target;
    parts.push(
      `반드시 ${target.toLocaleString()}바이트 이하여야 합니다. 지금 글에서 최소 ${cut.toLocaleString()}바이트(한글 약 ${approxKoreanChars(cut)}자)를 빼야 합니다.`,
    );
  }
  parts.push('');
  parts.push('지켜야 할 것:');
  if (input.kind === 'shrink') {
    parts.push('1. 위 글에 있는 사실, 활동, 결과, 교사의 평가를 그대로 남기세요.');
    parts.push(
      '2. 먼저 덜 중요한 문장을 통째로 지우고, 그다음 중복된 표현과 늘어지는 설명을 줄이세요. 표현만 다듬어서는 목표에 못 미칩니다.',
    );
    parts.push('3. 문장을 중간에서 끊지 말고, 완결된 하나의 글로 돌려주세요.');
    parts.push('4. 다 쓴 뒤 글자 수를 세어 목표 위쪽 숫자를 넘으면 문장을 더 지우세요.');
    parts.push('5. 설명이나 인사말 없이 줄인 글만 돌려주세요.');
  } else {
    parts.push(
      '1. 위 글의 문장과 순서를 최대한 지키고, 빠진 과정과 결과를 근거 자료에서 가져와 채우세요.',
    );
    parts.push('2. 목표를 채우려고 일반적인 칭찬이나 추측을 넣지 마세요.');
    parts.push('3. 설명이나 인사말 없이 완성된 글만 돌려주세요.');
  }

  // 형광펜 표식 지시는 **앞**에, 지어내기를 막는 지시는 **맨 끝**에 둔다.
  // 실측에서 지어내기 금지를 뒤쪽에 두었을 때만 모델이 얇은 근거로 지어내기를 멈췄다(최신성 효과).
  parts.push('');
  parts.push(NARRATIVE_MARK_INSTRUCTION);
  parts.push('');
  if (input.kind === 'shrink') {
    parts.push('위 글에 있는 내용만 쓰세요. 새로운 활동이나 성과를 덧붙이지 마세요.');
  } else {
    parts.push(
      '근거 자료에 있는 내용만 쓰세요. 근거 자료에 없는 내용은 한 문장도 쓰지 마세요. ' +
        `채울 근거가 모자라면 목표보다 짧아도 됩니다. 그럴 때는 맨 마지막 줄에 ${INSUFFICIENT_MARK} 이라고만 적으세요.`,
    );
  }

  return {
    text: parts.join('\n'),
    studentAlias,
    mappings,
    includedCount: lines.length,
    exclusions,
    modelTargetBytes: target,
    modelFloorBytes: floor,
    finalTargetBytes: input.targetBytes,
    sourceProhibited,
  };
}

/** "제외됨 N건" 옆에 붙일 짧은 사유 요약. 빠진 게 없으면 빈 문자열. */
export function summarizeExclusions(exclusions: readonly DraftPackExclusion[]): string {
  if (exclusions.length === 0) return '';
  const reasons = new Set<string>();
  for (const x of exclusions) reasons.add(DRAFT_PACK_EXCLUSION_LABELS[x.reason]);
  return `제외됨 ${exclusions.length}건 (${[...reasons].join(' · ')})`;
}

/**
 * [다시 표시] 꾸러미 — 선생님이 고친 초안에 **표식만** 다시 붙여 달라는 짧은 요청(ADR-085 §7-3).
 *
 * 근거는 싣지 않는다(본문을 바꾸는 요청이 아니다). 실명·학번은 초안 꾸러미와 같은 명단으로 가리고,
 * 답이 오면 `mappings` 로 되돌린다. 답의 본문이 원문과 다르면 화면이 버린다(`sameNarrativeBody`).
 */
export interface NarrativeRemarkPack {
  readonly text: string;
  readonly mappings: readonly MaskMapping[];
}

export function buildNarrativeRemarkPack(input: {
  readonly content: string;
  readonly roster: readonly KeywordGroup[];
}): NarrativeRemarkPack {
  const session = createMaskSession();
  const r = redactQuestion(input.content.trim(), input.roster, session);
  const text = [
    '아래 글의 **문장은 한 글자도 바꾸지 말고**, 문단마다 첫머리에 역할 표식만 붙여서 그대로 돌려주세요.',
    NARRATIVE_MARK_INSTRUCTION,
    '설명이나 다른 말은 덧붙이지 마세요.',
    '',
    '글:',
    r.masked,
  ].join('\n');
  return { text, mappings: r.mappings };
}
