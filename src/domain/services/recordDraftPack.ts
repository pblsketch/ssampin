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

/** 꾸러미에 넣을 근거 한 건(엔티티 전체가 아니라 필요한 것만 받는다). */
export interface DraftPackEvidence {
  readonly id: string;
  /** 이미 별칭 처리·비식별을 마친 본문이어야 한다. */
  readonly content: string;
  readonly date?: string;
  /** 선생님이 "AI 에 보내지 않기"로 표시한 근거. */
  readonly excludedFromAi?: boolean;
}

export interface DraftPackInput {
  /** 학생을 가리키는 **별칭**. 실명을 넣지 않는다. */
  readonly studentAlias: string;
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
  /** 모델에게 보낼 사용자 턴 본문. */
  readonly text: string;
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

  for (const e of input.evidences) {
    if (e.excludedFromAi === true) {
      exclusions.push({ evidenceId: e.id, reason: 'teacher' });
      continue;
    }
    const content = e.content.trim();
    if (content.length === 0) {
      exclusions.push({ evidenceId: e.id, reason: 'empty' });
      continue;
    }
    const hits = detectProhibitedTerms(content);
    if (hits.length > 0) {
      exclusions.push({
        evidenceId: e.id,
        reason: 'prohibited',
        categories: hitsToCategories(hits),
      });
      continue;
    }
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
  parts.push(`학생: ${input.studentAlias}`);
  parts.push(`영역: ${input.areaLabel}`);
  if (input.threadTitle) parts.push(`주제: ${input.threadTitle}`);
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
    parts.push(input.teacherPrompt.trim());
  }

  parts.push('');
  parts.push(
    '위 근거만 보고 쓰세요. 활동을 나열하지 말고 하나의 탐구 흐름으로 이어 주세요. ' +
      '본문의 모든 서술이 근거 자료의 어느 줄에서 나왔는지 짚을 수 있어야 합니다. ' +
      '근거에 없는 내용은 쓰지 마세요.',
  );

  return { text: parts.join('\n'), includedCount: lines.length, exclusions };
}

/** "제외됨 N건" 옆에 붙일 짧은 사유 요약. 빠진 게 없으면 빈 문자열. */
export function summarizeExclusions(exclusions: readonly DraftPackExclusion[]): string {
  if (exclusions.length === 0) return '';
  const reasons = new Set<string>();
  for (const x of exclusions) reasons.add(DRAFT_PACK_EXCLUSION_LABELS[x.reason]);
  return `제외됨 ${exclusions.length}건 (${[...reasons].join(' · ')})`;
}
