/**
 * AI **서사 초안** 꾸러미 — 한 주제의 근거를 "어떤 차례로 놓을까"까지만 묻는다(ADR-103 §5-5).
 *
 * 지키는 선(분류 제안 꾸러미와 같다):
 *  - 제안은 화면에 점선으로만 뜨고, [적용] 전에는 **아무것도 저장되지 않는다.** 이 파일은 저장을 모른다.
 *  - 근거 본문이 밖으로 나가므로 초안 꾸러미와 **같은 규칙을 같은 순서로** 쓴다: 선생님 제외 → 빈 내용
 *    → 기재 금지 → 분량 초과. 실명·학번은 한 세션으로 가린다(같은 학생 = 같은 별칭).
 *  - 자리 이름은 **그 틀의 화면 이름**으로 보낸다(생활 틀이면 특성·장면·성장·평가). 대신 답을 읽는 쪽이
 *    저장값 4종으로 되돌린다 — 파서가 모르는 낱말이 저장·요청서로 들어가지 않는다.
 *  - 카테고리는 **그 자리에 실제로 있는 것만** 목록으로 준다. 없는 이름을 지어내면 파서가 버린다.
 *  - 이유 문장을 함께 받는다. [적용] 때 장면 메모로 저장하기 때문이다(오너 결정 2026-09-10).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import { detectProhibitedTerms, summarizeProhibited } from '../rules/prohibitedRecordTerms';
import { createMaskSession } from '../privacy/maskEngine';
import type { KeywordGroup, MaskMapping } from '../privacy/types';
import { redactQuestion } from '../rules/redactOutbound';
import { NARRATIVE_NOTE_MAX } from '../entities/InquiryThread';
import {
  FRAME_SLOTS,
  NARRATIVE_FRAME_ROLES,
  frameRoleLabel,
  type NarrativeFrameId,
} from '../rules/narrativeFrames';
import { RECORD_MODULES } from '../rules/recordStyleCatalog';
import { NARRATIVE_SUGGEST_NONE_WORD } from '../rules/narrativeSuggestionParser';
import { sortByEvidenceOrder } from '../rules/evidenceOrder';
import {
  DRAFT_PACK_MAX_EVIDENCE_CHARS,
  type DraftPackEvidence,
  type DraftPackExclusion,
} from './recordDraftPack';

export interface NarrativeSuggestInput {
  /** 학생 **실명**. 꾸러미 안에서 별칭으로 바뀐다 — 이 값 자체는 절대 밖으로 나가지 않는다. */
  readonly studentName: string;
  readonly roster: readonly KeywordGroup[];
  /** 어느 틀로 세울 것인가. 영역이 정한다. */
  readonly frame: NarrativeFrameId;
  /** 이 주제의 이름. 가려서 나간다. */
  readonly threadTitle: string;
  /** 이 주제에 묶인 근거(부르는 쪽이 거른다). 날짜순으로 실린다. */
  readonly evidences: readonly DraftPackEvidence[];
  /** 앞 주제 이름 — 있으면 이음말도 함께 묻는다. */
  readonly previousThreadTitle?: string;
  /** 선생님의 추가 요청(자유 글, 선택). 가려서 나간다. 비어 있으면 줄 자체를 만들지 않는다. */
  readonly instruction?: string;
}

export interface NarrativeSuggestPack {
  readonly text: string;
  readonly mappings: readonly MaskMapping[];
  readonly numbered: readonly string[];
  readonly includedCount: number;
  readonly exclusions: readonly DraftPackExclusion[];
}

function shortDate(date: string): string {
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}

export function buildNarrativeSuggestPack(input: NarrativeSuggestInput): NarrativeSuggestPack {
  const name = input.studentName.trim();
  const roster = input.roster.some((g) => g.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mappings: MaskMapping[] = [];
  const mask = (text: string): string => {
    const r = redactQuestion(text, roster, session);
    mappings.push(...r.mappings);
    return r.masked;
  };
  // 이 학생 이름을 맨 먼저 가린다 — 그래야 근거 안의 같은 이름이 같은 번호를 받는다.
  mask(name);

  const numbered: string[] = [];
  const lines: string[] = [];
  const exclusions: DraftPackExclusion[] = [];
  let usedChars = 0;
  // ★화면과 같은 차례로 보낸다(날짜순). 파일 저장 순서로 보내면 모델이 활동 나열로 읽는다(ADR-083).
  for (const e of sortByEvidenceOrder(input.evidences)) {
    if (e.excludedFromAi === true) {
      exclusions.push({ evidenceId: e.id, reason: 'teacher' });
      continue;
    }
    const raw = e.content.trim();
    if (raw.length === 0) {
      exclusions.push({ evidenceId: e.id, reason: 'empty' });
      continue;
    }
    // 기재 금지 검사는 **원문**으로 한다 — 가린 뒤에는 낱말이 바뀌어 못 잡을 수 있다.
    const hits = detectProhibitedTerms(raw);
    if (hits.length > 0) {
      exclusions.push({
        evidenceId: e.id,
        reason: 'prohibited',
        categories: summarizeProhibited(hits),
      });
      continue;
    }
    const head = e.date === undefined ? '' : `(${shortDate(e.date)}) `;
    const note = e.note?.trim();
    const tail = note === undefined || note.length === 0 ? '' : ` (선생님 메모: ${mask(note)})`;
    const line = `${numbered.length + 1}. ${head}${mask(raw)}${tail}`;
    if (usedChars + line.length > DRAFT_PACK_MAX_EVIDENCE_CHARS) {
      // 여기서 멈추지 않는다 — 뒤에 짧은 근거가 있으면 그건 실을 수 있다.
      exclusions.push({ evidenceId: e.id, reason: 'too-long' });
      continue;
    }
    usedChars += line.length + 1;
    numbered.push(e.id);
    lines.push(line);
  }

  const parts: string[] = [];
  parts.push(
    `아래는 한 학생의 「${mask(input.threadTitle)}」 주제에 묶인 기록입니다. 이 기록들을 하나의 이야기로 세워 주세요.`,
  );
  parts.push('각 기록을 아래 자리 가운데 하나에 놓고, 왜 그 자리인지 이유를 한 문장으로 적으세요.');
  parts.push('');
  parts.push('자리(이 순서로 쓸 필요는 없습니다. 이야기에 맞게 차례를 정하세요):');
  for (const role of NARRATIVE_FRAME_ROLES) {
    const cats = FRAME_SLOTS[input.frame][role].map((id) => RECORD_MODULES[id].label).join(' / ');
    parts.push(`- ${frameRoleLabel(input.frame, role)}: ${cats}`);
  }
  parts.push('');
  parts.push('규칙:');
  // ★평가 자리(ADR-109): 선생님이 평가 근거를 따로 적어 두는 일은 드물다. 이 학생을 종합해 판단한 기록이
  //   있을 때만 넣고, 없으면 비운다 — 비운 평가는 초안을 쓸 때 근거 전체를 종합해 채운다(`recordDraftPack`).
  //   활동 기록까지 끌어오면 과정·결과 자리가 비므로 그것은 막는다.
  parts.push(
    `- ${frameRoleLabel(input.frame, 'evaluation')} 자리는 **한 번만** 씁니다. 선생님이 이 학생을 종합해 판단한 기록이 있을 때만 넣고, ` +
      '없으면 기록번호 칸을 비워 두세요. 비워 둔 자리는 초안을 쓸 때 기록 전체를 종합해 채웁니다. ' +
      '활동 장면을 적은 기록은 이 자리에 넣지 않습니다.',
  );
  parts.push('- 기록 하나는 한 자리에만 넣습니다. 넣을 자리가 없는 기록은 빼도 됩니다.');
  parts.push('- 카테고리는 위 목록에 있는 이름만 씁니다. 없으면 자리 이름만 쓰세요.');
  parts.push(
    `- 이유는 기록에 적힌 것만 근거로 씁니다. 기록에 없는 사실을 지어내지 마세요. ${NARRATIVE_NOTE_MAX}자 안으로.`,
  );
  const instruction = input.instruction?.trim() ?? '';
  if (instruction.length > 0) {
    parts.push('');
    parts.push('선생님의 추가 요청(차례를 세울 때 이 말을 우선합니다):');
    parts.push(mask(instruction));
  }
  parts.push('');
  parts.push('기록:');
  parts.push(lines.length > 0 ? lines.join('\n') : '(보낼 수 있는 기록이 없습니다)');
  parts.push('');

  const linkLine =
    input.previousThreadTitle === undefined
      ? ''
      : `\n앞 주제 「${mask(input.previousThreadTitle)}」와 어떻게 이어지는지도 한 줄 적어 주세요: \`이음 | 문장\``;

  parts.push(
    '출력 형식: 줄마다 `자리 | 카테고리 | 기록번호,기록번호 | 이유 한 문장` 만 쓰세요.\n' +
      `예) ${frameRoleLabel(input.frame, 'motive')} | ${RECORD_MODULES[FRAME_SLOTS[input.frame].motive[0] ?? 'teacherJudgement'].label} | 1,2 | 쿠폰 문구에 대한 물음에서 시작했습니다\n` +
      `세울 흐름이 없으면 \`${NARRATIVE_SUGGEST_NONE_WORD} | 이유 한 문장\` 한 줄만 쓰세요.\n` +
      '설명·머리말·다른 말은 쓰지 마세요.' +
      linkLine,
  );

  return { text: parts.join('\n'), mappings, numbered, includedCount: numbered.length, exclusions };
}
