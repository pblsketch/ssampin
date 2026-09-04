/**
 * 쓰기 제안 카드에 적을 한국어 — "무엇을 저장하려는가"를 한 줄로.
 *
 * 카드에는 **선생님이 판단할 수 있을 만큼**만 적는다. 저장될 내용을 전부 늘어놓기보다,
 * 무엇을 어디에 하려는지와 눈에 띄는 값 몇 개를 보여 준다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { WriteDomain, WriteOp } from '../contracts/aiBridgeWriteContract';

const DOMAIN_LABELS: Readonly<Record<WriteDomain, string>> = {
  todos: '할 일',
  events: '일정',
  recordDrafts: '생기부 초안',
  memos: '메모',
  bookmarks: '즐겨찾기',
  notes: '노트',
  attendance: '수업반 출결',
  homeroomAttendance: '담임 출결',
  observations: '관찰 기록',
  recordNote: '기록 메모',
  progress: '진도',
};

const OP_LABELS: Readonly<Record<WriteOp, string>> = {
  create: '추가',
  update: '수정',
  complete: '완료 처리',
  delete: '삭제',
};

export function proposalTitle(domain: WriteDomain, op: WriteOp): string {
  return `${DOMAIN_LABELS[domain]} ${OP_LABELS[op]}`;
}

/** 카드에 보여 줄 값 후보 — 있는 것만, 순서대로. */
const PREVIEW_KEYS: readonly string[] = [
  'text',
  'title',
  'content',
  'date',
  'dueDate',
  'status',
  'period',
  'className',
  'studentNumber',
];

/**
 * 저장될 내용에서 사람이 알아볼 값 몇 개를 뽑는다.
 *
 * ★값을 통째로 늘어놓지 않는다 — 카드가 길어지면 선생님이 읽지 않고 누른다.
 * 길면 잘라서 보여 주고, 원문은 그대로 저장된다.
 */
export function proposalPreview(
  data: Record<string, unknown>,
  maxItems = 3,
  maxLen = 40,
): readonly string[] {
  const out: string[] = [];
  for (const key of PREVIEW_KEYS) {
    if (out.length >= maxItems) break;
    const v = data[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      out.push(v.length > maxLen ? `${v.slice(0, maxLen)}…` : v);
    } else if (typeof v === 'number') {
      out.push(String(v));
    }
  }
  return out;
}

/**
 * 어디서 온 요청인지 아직 못 가른다.
 *
 * 구독 실행이 켜져 있는 동안에는 설정에 등록된 **다른 AI 앱**(Claude Desktop 등)의 저장
 * 요청도 이 카드로 온다. 그래서 카드에 그 사실을 적어 둔다 — 선생님이 "내가 방금 부탁한 게
 * 아닌데?" 하고 취소할 수 있게.
 */
export const OWN_AI_PROPOSAL_SOURCE_NOTE = '다른 AI 앱에서 온 요청일 수 있어요.';
