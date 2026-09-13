/**
 * 학생 한 명의 전체 근거 지도 AI 요청과 엄격한 JSON 답 파서.
 *
 * 제외·빈 내용·기재 금지·분량 제한과 이름 가리기를 기존 요청서와 같은 규칙으로 이 파일 안에서
 * 다시 적용한다. 호출자가 미리 걸렀다고 믿지 않는다. 보낼 수 있는 근거가 없으면 text도 만들지 않아
 * AI 호출을 구조적으로 막는다.
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  NARRATIVE_NOTE_MAX,
  type InquiryThread,
  type NarrativeScene,
} from '../entities/InquiryThread';
import type { RecordEvidence } from '../entities/RecordEvidence';
import { evidenceInArea } from '../entities/RecordEvidence';
import type { RecordModuleId } from '../entities/RecordWritingStyle';
import {
  RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  type RecordMapProposedScene,
  type RecordMapScaffoldPolicy,
  type RecordMapStudentContext,
  type RecordMapStudentProposal,
  type RecordMapTemporaryTopic,
  type RecordMapUnplacedEvidence,
} from '../entities/RecordMapProposal';
import { createMaskSession } from '../privacy/maskEngine';
import type { KeywordGroup, MaskMapping } from '../privacy/types';
import { detectProhibitedTerms, summarizeProhibited } from '../rules/prohibitedRecordTerms';
import { frameForArea, frameRoleLabel } from '../rules/narrativeFrames';
import type { NarrativeRole } from '../rules/narrativeParagraphs';
import { questionHasBlockingPii, restoreModelText, redactQuestion } from '../rules/redactOutbound';
import { RECORD_MODULES } from '../rules/recordStyleCatalog';
import { sortByEvidenceOrder } from '../rules/evidenceOrder';
import { DRAFT_PACK_MAX_EVIDENCE_CHARS, type DraftPackExclusion } from './recordDraftPack';

export interface RecordMapSuggestInput {
  readonly studentName: string;
  readonly roster: readonly KeywordGroup[];
  readonly context: RecordMapStudentContext;
  /** 전체 배열을 받아도 현재 학생·반·영역 것만 보낸다. */
  readonly evidences: readonly RecordEvidence[];
  /** 전체 배열을 받아도 현재 학생·수업반·학기 것만 보낸다. */
  readonly threads: readonly InquiryThread[];
  readonly scaffoldPolicy: RecordMapScaffoldPolicy;
  readonly rebuildTopics?: boolean;
  readonly instruction?: string;
}

export interface RecordMapSuggestPack {
  readonly canCallAi: boolean;
  readonly text: string;
  readonly mappings: readonly MaskMapping[];
  /** 요청서 번호(1부터) → 실제 근거 ID. */
  readonly numberedEvidenceIds: readonly string[];
  readonly includedCount: number;
  readonly exclusions: readonly DraftPackExclusion[];
  readonly tooLongCount: number;
  /** 금지 항목 때문에 근거는 살리고 메모만 보내지 않은 수. */
  readonly suppressedMemoCount: number;
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '') === (right ?? '');
}

function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : date;
}

function safeCurrentScene(
  scene: NarrativeScene,
  numbered: readonly string[],
  lockedEvidenceIds: ReadonlySet<string>,
  mask: (text: string) => string,
): string | null {
  const numbers = scene.evidenceIds
    .map((id) => numbered.indexOf(id) + 1)
    .filter((number) => number > 0);
  // 원본에서 사라진 근거가 있으면 장면을 추측해 보내지 않는다. 검증기가 적용을 막는다.
  if (numbers.length !== scene.evidenceIds.length) return null;
  const safeText = (value: string | undefined): string | null => {
    const text = value?.trim() ?? '';
    if (text.length === 0) return value === undefined ? null : '';
    if (detectProhibitedTerms(text).length > 0 || questionHasBlockingPii(text)) return null;
    return mask(text);
  };
  const lockedNumbers = scene.evidenceIds
    .filter((id) => lockedEvidenceIds.has(id))
    .map((id) => numbered.indexOf(id) + 1);
  return JSON.stringify({
    id: scene.id,
    role: scene.role,
    moduleId: scene.moduleId ?? null,
    label: safeText(scene.label),
    // 제외 근거가 섞인 장면의 해석은 원문을 우회할 수 있어 보내지 않는다. 원본 검증은 그대로라
    // 모델이 null을 돌려주면 자동 적용되지 않고 교사 확인으로 남는다.
    note: lockedNumbers.length > 0 ? null : safeText(scene.note),
    leadIn: lockedNumbers.length > 0 || scene.leadInNeedsCheck ? null : safeText(scene.leadIn),
    evidenceNumbers: numbers,
    lockedEvidenceNumbers: lockedNumbers,
  });
}

export function buildRecordMapSuggestPack(input: RecordMapSuggestInput): RecordMapSuggestPack {
  const name = input.studentName.trim();
  const roster = input.roster.some((group) => group.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mappings: MaskMapping[] = [];
  const mask = (text: string): string => {
    const result = redactQuestion(text, roster, session);
    mappings.push(...result.mappings);
    return result.masked;
  };
  mask(name);

  const eligible = input.evidences.filter(
    (evidence) =>
      evidence.studentRef === input.context.studentRef &&
      sameOptional(evidence.classId, input.context.classId) &&
      evidenceInArea(evidence, input.context.area),
  );
  const numberedEvidenceIds: string[] = [];
  const evidenceLines: string[] = [];
  const exclusions: DraftPackExclusion[] = [];
  let usedChars = 0;
  let suppressedMemoCount = 0;
  for (const evidence of sortByEvidenceOrder(eligible)) {
    if (evidence.excludedFromAi === true) {
      exclusions.push({ evidenceId: evidence.id, reason: 'teacher' });
      continue;
    }
    const raw = evidence.content.trim();
    if (raw.length === 0) {
      exclusions.push({ evidenceId: evidence.id, reason: 'empty' });
      continue;
    }
    const prohibited = detectProhibitedTerms(raw);
    if (prohibited.length > 0 || questionHasBlockingPii(raw)) {
      exclusions.push({
        evidenceId: evidence.id,
        reason: 'prohibited',
        categories: prohibited.length > 0 ? summarizeProhibited(prohibited) : ['개인정보'],
      });
      continue;
    }
    const note = evidence.note?.trim() ?? '';
    const safeNote =
      note.length > 0 && detectProhibitedTerms(note).length === 0 && !questionHasBlockingPii(note)
        ? note
        : '';
    if (note.length > 0 && safeNote.length === 0) suppressedMemoCount += 1;
    const date = evidence.date === undefined ? '' : `(${shortDate(evidence.date)}) `;
    const noteText = safeNote.length === 0 ? '' : ` (선생님 메모: ${mask(safeNote)})`;
    const line = `${numberedEvidenceIds.length + 1}. ${date}${mask(raw)}${noteText}`;
    if (usedChars + line.length > DRAFT_PACK_MAX_EVIDENCE_CHARS) {
      exclusions.push({ evidenceId: evidence.id, reason: 'too-long' });
      continue;
    }
    usedChars += line.length + 1;
    numberedEvidenceIds.push(evidence.id);
    evidenceLines.push(line);
  }

  const includedCount = numberedEvidenceIds.length;

  if (includedCount === 0) {
    return {
      canCallAi: false,
      text: '',
      mappings,
      numberedEvidenceIds,
      includedCount: 0,
      exclusions,
      tooLongCount: exclusions.filter((item) => item.reason === 'too-long').length,
      suppressedMemoCount,
    };
  }

  const frame = frameForArea(input.context.area);
  const threads = input.threads.filter(
    (thread) =>
      thread.studentRef === input.context.studentRef &&
      sameOptional(thread.classId, input.context.classId) &&
      (thread.term === undefined ||
        input.context.term === undefined ||
        thread.term === input.context.term),
  );
  // 내용은 보내지 않더라도 기존 장면에 놓인 제외 근거는 잠긴 번호로 왕복시킨다. 그래야 기존 정책에서
  // 그 근거를 삭제·이동하지 않으면서도 제외 원문과 메모는 AI에 노출하지 않는다.
  const eligibleById = new Map(
    input.evidences
      .filter(
        (evidence) =>
          evidence.studentRef === input.context.studentRef &&
          sameOptional(evidence.classId, input.context.classId),
      )
      .map((evidence) => [evidence.id, evidence]),
  );
  const lockedEvidenceIds = new Set<string>();
  for (const thread of threads) {
    for (const scene of thread.scenes ?? []) {
      for (const id of scene.evidenceIds) {
        if (!numberedEvidenceIds.includes(id) && eligibleById.has(id)) lockedEvidenceIds.add(id);
      }
    }
  }
  numberedEvidenceIds.push(...lockedEvidenceIds);
  const parts: string[] = [
    '아래 한 학생의 근거와 현재 지도를 바탕으로 검토 전 임시 지도 제안을 만드세요.',
    '실제 자료를 바꾸지 말고, 제공된 ID만 사용하세요.',
    '',
    `영역 틀: ${frame}`,
    `기존 주제 정책: ${input.rebuildTopics === true ? '주제부터 다시 제안' : '기존 주제 유지'}`,
    '',
    '근거:',
    ...evidenceLines,
  ];

  if (threads.length > 0) {
    parts.push('', '현재 주제와 장면:');
    for (const thread of threads) {
      const threadTitle = questionHasBlockingPii(thread.title)
        ? '(주제 이름 생략)'
        : mask(thread.title);
      parts.push(`주제 ${thread.id} | ${threadTitle} | ${thread.status}`);
      for (const scene of thread.scenes ?? []) {
        const safe = safeCurrentScene(scene, numberedEvidenceIds, lockedEvidenceIds, mask);
        if (safe !== null) parts.push(`장면 ${safe}`);
      }
      if (
        thread.link !== undefined &&
        threads.some((item) => item.id === thread.link?.fromThreadId)
      ) {
        const note = thread.link.note?.trim() ?? '';
        const safeNote =
          detectProhibitedTerms(note).length === 0 && !questionHasBlockingPii(note)
            ? mask(note)
            : '';
        parts.push(
          `앞 주제 ${thread.link.fromThreadId}${safeNote.length > 0 ? ` | ${safeNote}` : ''}`,
        );
      }
    }
  }

  parts.push('', '뼈대 정책:');
  if (input.scaffoldPolicy.kind === 'existing') {
    parts.push(
      '- 기존 주제의 모든 현재 장면을 빠짐없이 같은 차례로 반환하세요. 장면 ID·role·moduleId·label·note·leadIn과 기존 evidenceNumbers를 정확히 유지하고, 미분류 근거만 추가하세요.',
      '- lockedEvidenceNumbers는 내용이 비공개인 기존 근거입니다. 번호와 현재 장면 위치를 그대로 반환하고 다른 장면이나 주제로 옮기지 마세요.',
      `- 새 주제는 ${input.scaffoldPolicy.defaultScaffold.id} 뼈대를 그대로 쓰세요.`,
    );
  } else if (input.scaffoldPolicy.kind === 'fixed') {
    parts.push(`- 모든 주제에 ${input.scaffoldPolicy.scaffold.id} 뼈대를 그대로 쓰세요.`);
  } else {
    parts.push(
      '- 주제마다 아래 후보 중 하나만 고르세요. 맞는 후보가 없으면 scaffoldId를 null로 두세요.',
    );
  }
  const scaffolds =
    input.scaffoldPolicy.kind === 'existing'
      ? [input.scaffoldPolicy.defaultScaffold]
      : input.scaffoldPolicy.kind === 'fixed'
        ? [input.scaffoldPolicy.scaffold]
        : input.scaffoldPolicy.candidates;
  for (const scaffold of scaffolds) {
    const scaffoldName = questionHasBlockingPii(scaffold.name)
      ? '(이름 생략)'
      : mask(scaffold.name);
    parts.push(
      `후보 ${JSON.stringify({ id: scaffold.id, name: scaffoldName, frame: scaffold.frame })}`,
    );
    scaffold.scenes.forEach((scene, index) => {
      const label = scene.label ?? '';
      const safeLabel = questionHasBlockingPii(label) ? '' : mask(label);
      const displayName =
        scene.label ??
        (scene.moduleId === undefined
          ? frameRoleLabel(scaffold.frame, scene.role)
          : RECORD_MODULES[scene.moduleId].label);
      const safeDisplayName = questionHasBlockingPii(displayName)
        ? frameRoleLabel(scaffold.frame, scene.role)
        : mask(displayName);
      parts.push(
        `  ${JSON.stringify({ order: index + 1, role: scene.role, moduleId: scene.moduleId ?? null, label: safeLabel.length > 0 ? safeLabel : null, displayName: safeDisplayName })}`,
      );
    });
  }

  const instruction = input.instruction?.trim() ?? '';
  if (
    instruction.length > 0 &&
    detectProhibitedTerms(instruction).length === 0 &&
    !questionHasBlockingPii(instruction)
  ) {
    parts.push('', '선생님의 추가 요청:', mask(instruction));
  }
  const tooLongCount = exclusions.filter((item) => item.reason === 'too-long').length;
  if (tooLongCount > 0) {
    parts.push(
      '',
      `분량 제한으로 보내지 못한 근거: ${tooLongCount}건. 이 근거는 자리 미정으로도 추정하지 마세요.`,
    );
  }
  if (suppressedMemoCount > 0) {
    parts.push(`기재 금지 항목으로 보내지 않은 교사 메모: ${suppressedMemoCount}건.`);
  }
  parts.push(
    '',
    '규칙:',
    '- 근거 번호는 위 목록에 있는 번호만 쓰세요. 같은 근거는 한 주제에만 속합니다.',
    '- 같은 주제 안에서는 한 근거를 여러 장면에서 참조할 수 있지만 독립 근거처럼 부풀리지 마세요.',
    '- 주제 연결은 근거가 관계를 직접 뒷받침할 때만 만들고, 순환 연결은 만들지 마세요.',
    '- 날짜나 제목이 비슷하다는 이유만으로 성장·인과를 만들지 마세요.',
    `- 장면 role은 ${frameRoleLabel(frame, 'motive')}/${frameRoleLabel(frame, 'process')}/${frameRoleLabel(frame, 'result')}/${frameRoleLabel(frame, 'evaluation')}의 저장값인 motive/process/result/evaluation만 쓰세요.`,
    '- 뼈대를 골랐다면 후보 JSON의 order·role·moduleId·label을 그대로 반환하세요.',
    '- 새 주제나 교체 뼈대의 새 장면은 id를 생략해도 됩니다. 기존 구성 유지의 현재 장면은 제공된 id를 정확히 반환하세요.',
    '- 선택 필드는 생략하거나 null로 써도 됩니다. 새 주제의 existingThreadId, 없는 moduleId·note·leadIn·link·reason은 null 또는 생략하세요.',
    '- 기존 구성 유지 정책의 기존 주제는 scaffoldId가 null이어도 됩니다. 고정 뼈대와 AI가 고른 후보는 제공된 후보 ID를 쓰세요.',
    '',
    '출력은 설명이나 코드 울타리 없이 JSON 객체 하나만 쓰세요.',
    '{"schemaVersion":1,"topics":[{"id":"tmp:1","existingThreadId":null,"title":"주제","status":"open","scaffold":{"scaffoldId":"후보 ID 또는 null","reason":null},"scenes":[{"id":"tmp-scene:1","role":"motive","moduleId":null,"label":"뼈대의 장면 이름","note":null,"leadIn":null,"evidenceNumbers":[1]}],"link":null}],"unplacedEvidence":[{"evidenceNumber":2,"reason":"놓지 못한 이유"}],"warnings":[]}',
  );

  return {
    canCallAi: true,
    text: parts.join('\n'),
    mappings,
    numberedEvidenceIds,
    includedCount,
    exclusions,
    tooLongCount,
    suppressedMemoCount,
  };
}

export type RecordMapParseFailure =
  | 'empty-answer'
  | 'invalid-json'
  | 'invalid-shape'
  | 'invalid-reference';

export interface RecordMapParseBase {
  readonly runId: string;
  readonly attemptId: string;
  readonly context: RecordMapStudentContext;
  readonly sourceFingerprint: string;
  readonly numberedEvidenceIds: readonly string[];
  readonly includedEvidenceIds?: readonly string[];
  readonly excludedCounts?: NonNullable<
    RecordMapStudentProposal['requestEvidence']
  >['excludedCounts'];
  readonly suppressedMemoCount?: number;
  readonly mappings?: readonly MaskMapping[];
  readonly now: number;
}

export type RecordMapParseResult =
  | { readonly ok: true; readonly proposal: RecordMapStudentProposal }
  | { readonly ok: false; readonly failure: RecordMapParseFailure };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const INVALID_OPTIONAL_STRING = Symbol('invalid-optional-string');

function stringOrUndefined(value: unknown): string | undefined | typeof INVALID_OPTIONAL_STRING {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return INVALID_OPTIONAL_STRING;
  return value.trim().length === 0 ? undefined : value;
}

function parseStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

function parseEvidenceNumbers(
  value: unknown,
  numbered: readonly string[],
): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => Number.isInteger(item) && Number(item) >= 1 && Number(item) <= numbered.length,
    )
  ) {
    return null;
  }
  const ids: string[] = [];
  for (const valueItem of value) {
    const id = numbered[Number(valueItem) - 1];
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function parseScene(
  value: unknown,
  topicId: string,
  sceneIndex: number,
  numbered: readonly string[],
  restore: (text: string) => string,
): RecordMapProposedScene | null {
  if (!isObject(value)) return null;
  const idValue = value.id;
  if (idValue !== undefined && idValue !== null && typeof idValue !== 'string') return null;
  const explicitId = typeof idValue === 'string' ? idValue.trim() : '';
  const id = explicitId.length > 0 ? explicitId : `${topicId}:scene:${sceneIndex + 1}`;
  if (!['motive', 'process', 'result', 'evaluation'].includes(String(value.role))) return null;
  const evidenceIds = parseEvidenceNumbers(value.evidenceNumbers, numbered);
  if (evidenceIds === null) return null;
  const moduleId = stringOrUndefined(value.moduleId);
  if (
    moduleId === INVALID_OPTIONAL_STRING ||
    (moduleId !== undefined && !(moduleId in RECORD_MODULES))
  )
    return null;
  const label = stringOrUndefined(value.label);
  const note = stringOrUndefined(value.note);
  const leadIn = stringOrUndefined(value.leadIn);
  if (
    label === INVALID_OPTIONAL_STRING ||
    note === INVALID_OPTIONAL_STRING ||
    leadIn === INVALID_OPTIONAL_STRING
  )
    return null;
  return {
    id,
    role: value.role as NarrativeRole,
    ...(moduleId === undefined ? {} : { moduleId: moduleId as RecordModuleId }),
    ...(label === undefined ? {} : { label: restore(label).slice(0, NARRATIVE_NOTE_MAX) }),
    ...(note === undefined
      ? {}
      : { note: restore(note).slice(0, NARRATIVE_NOTE_MAX), noteSource: 'ai' as const }),
    ...(leadIn === undefined ? {} : { leadIn: restore(leadIn).slice(0, NARRATIVE_NOTE_MAX) }),
    evidenceIds,
  };
}

function parseTopic(
  value: unknown,
  numbered: readonly string[],
  restore: (text: string) => string,
): RecordMapTemporaryTopic | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string')
    return null;
  if (value.status !== 'open' && value.status !== 'closed') return null;
  const existingThreadId = stringOrUndefined(value.existingThreadId);
  if (existingThreadId === INVALID_OPTIONAL_STRING || !isObject(value.scaffold)) return null;
  const rawScaffoldId = value.scaffold.scaffoldId;
  if (rawScaffoldId !== null && typeof rawScaffoldId !== 'string') return null;
  const reason = stringOrUndefined(value.scaffold.reason);
  if (reason === INVALID_OPTIONAL_STRING || !Array.isArray(value.scenes)) return null;
  const scenes: RecordMapProposedScene[] = [];
  for (const [sceneIndex, rawScene] of value.scenes.entries()) {
    const scene = parseScene(rawScene, value.id, sceneIndex, numbered, restore);
    if (scene === null) return null;
    scenes.push(scene);
  }
  let link: RecordMapTemporaryTopic['link'];
  if (value.link !== undefined && value.link !== null) {
    if (!isObject(value.link) || typeof value.link.fromTopicId !== 'string') return null;
    const note = stringOrUndefined(value.link.note);
    if (note === INVALID_OPTIONAL_STRING) return null;
    link = {
      fromTopicId: value.link.fromTopicId,
      ...(note === undefined
        ? {}
        : { note: restore(note).slice(0, NARRATIVE_NOTE_MAX), noteSource: 'ai' as const }),
    };
  }
  return {
    id: value.id,
    ...(existingThreadId === undefined ? {} : { existingThreadId }),
    title: restore(value.title),
    status: value.status,
    scenes,
    scaffold: {
      scaffoldId: rawScaffoldId,
      ...(reason === undefined ? {} : { reason: restore(reason).slice(0, NARRATIVE_NOTE_MAX) }),
    },
    ...(link === undefined ? {} : { link }),
  };
}

function parseUnplaced(
  value: unknown,
  numbered: readonly string[],
  restore: (text: string) => string,
): RecordMapUnplacedEvidence | null {
  if (
    !isObject(value) ||
    !Number.isInteger(value.evidenceNumber) ||
    Number(value.evidenceNumber) < 1 ||
    Number(value.evidenceNumber) > numbered.length ||
    typeof value.reason !== 'string'
  ) {
    return null;
  }
  const evidenceId = numbered[Number(value.evidenceNumber) - 1];
  return evidenceId === undefined
    ? null
    : { evidenceId, reason: restore(value.reason).slice(0, NARRATIVE_NOTE_MAX) };
}

export function parseRecordMapSuggestion(
  answer: string,
  base: RecordMapParseBase,
): RecordMapParseResult {
  const body = answer.trim();
  if (body.length === 0) return { ok: false, failure: 'empty-answer' };
  if (!body.startsWith('{') || !body.endsWith('}')) return { ok: false, failure: 'invalid-json' };
  let decoded: unknown;
  try {
    decoded = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, failure: 'invalid-json' };
  }
  if (
    !isObject(decoded) ||
    decoded.schemaVersion !== RECORD_MAP_PROPOSAL_SCHEMA_VERSION ||
    !Array.isArray(decoded.topics) ||
    !Array.isArray(decoded.unplacedEvidence)
  ) {
    return { ok: false, failure: 'invalid-shape' };
  }
  const warnings = parseStringArray(decoded.warnings);
  if (warnings === null) return { ok: false, failure: 'invalid-shape' };
  const restore = (text: string): string =>
    base.mappings === undefined || base.mappings.length === 0
      ? text
      : restoreModelText(text, base.mappings);
  const topics: RecordMapTemporaryTopic[] = [];
  for (const rawTopic of decoded.topics) {
    const topic = parseTopic(rawTopic, base.numberedEvidenceIds, restore);
    if (topic === null) return { ok: false, failure: 'invalid-reference' };
    topics.push(topic);
  }
  const unplacedEvidence: RecordMapUnplacedEvidence[] = [];
  for (const rawUnplaced of decoded.unplacedEvidence) {
    const unplaced = parseUnplaced(rawUnplaced, base.numberedEvidenceIds, restore);
    if (unplaced === null) return { ok: false, failure: 'invalid-reference' };
    unplacedEvidence.push(unplaced);
  }
  return {
    ok: true,
    proposal: {
      schemaVersion: RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
      runId: base.runId,
      attemptId: base.attemptId,
      context: base.context,
      sourceFingerprint: base.sourceFingerprint,
      requestEvidence: {
        includedEvidenceIds: base.includedEvidenceIds ?? base.numberedEvidenceIds,
        excludedCounts: base.excludedCounts ?? {
          teacher: 0,
          empty: 0,
          prohibited: 0,
          tooLong: 0,
        },
        suppressedMemoCount: base.suppressedMemoCount ?? 0,
      },
      topics,
      unplacedEvidence,
      warnings: warnings.map((warning) => restore(warning).slice(0, NARRATIVE_NOTE_MAX)),
      runStatus: 'generated',
      reviewStatus: 'unreviewed',
      createdAt: base.now,
      updatedAt: base.now,
    },
  };
}
