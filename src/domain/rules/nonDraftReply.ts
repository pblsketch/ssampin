/**
 * "초안이 아니라 설명(거절·되묻기)이 돌아왔는가" 판정 — 순수 함수.
 *
 * 왜 필요한가(2026-09-08 실기기 대행 QA, R-3): 분량 조절에서 모델이 "이 요청은 그대로 수행하기
 * 어렵습니다. … 추가 근거를 알려주시면 …" 하고 **거절 설명문**을 보냈는데, 앱이 그 글을 2차 조절안
 * (1,721바이트)으로 받아 [편집칸에 넣기]까지 허용했다. 설명문이 생기부 칸에 들어갈 뻔했다.
 *
 * 규정(1층 프롬프트)은 "설명이나 머리말 없이 초안 본문만 출력"을 요구하지만, 모델은 근거가
 * 모자라면 규정을 어기고 사람에게 말을 건다. 그 글은 **저장 후보가 아니라 실패 사유**다.
 *
 * 판정은 보수적이다 — 초안을 설명으로 오판하면 선생님이 결과를 잃는다. 그래서 아래 둘 중 하나일 때만
 * "설명"으로 본다:
 *   ① 모델이 **사람에게 말을 거는 표현**(드리겠습니다·알려주시면·수행하기 어렵…)이 있다.
 *   ② 글머리표·번호 목록 줄이 **2줄 이상**이다(생기부 초안은 줄글 한 문단이다).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */

/** 사람에게 말을 거는 표현 — 초안 본문에는 나올 수 없는 말들. */
const TALKING_TO_TEACHER: readonly RegExp[] = [
  /수행하기\s*어렵/,
  /어렵습니다/,
  /드리겠습니다/,
  /드릴\s*수\s*있(습니다|어요)/,
  /알려\s*주시면/,
  /주시면\s/,
  /제안(드립니다|합니다)/,
  /죄송/,
  /할\s*수\s*없습니다/,
  /지시문/,
  /원문\s*\(약/,
  /추가\s*근거/,
];

/** 글머리표·번호 목록 줄. */
const LIST_LINE = /^\s*(?:[-•*·]|\d+[.)])\s+/;

export interface NonDraftVerdict {
  readonly nonDraft: boolean;
  /** 사람이 읽을 이유. `nonDraft` 가 false 면 빈 문자열. */
  readonly reason: string;
}

/**
 * 초안이 아닌 답인지 판정한다. 표식(`[동기]` 등)을 떼기 **전** 원문에 써도 되고 뗀 뒤에 써도 된다.
 */
export function judgeNonDraftReply(text: string): NonDraftVerdict {
  const body = text.trim();
  if (body.length === 0) return { nonDraft: true, reason: '빈 답이 왔어요.' };

  const talking = TALKING_TO_TEACHER.some((re) => re.test(body));
  if (talking) {
    return { nonDraft: true, reason: 'AI가 초안 대신 설명(거절·되묻기)을 보냈어요.' };
  }

  const listLines = body.split('\n').filter((line) => LIST_LINE.test(line)).length;
  if (listLines >= 2) {
    return { nonDraft: true, reason: 'AI가 줄글 초안 대신 목록 형식의 글을 보냈어요.' };
  }

  return { nonDraft: false, reason: '' };
}

/** 짧은 판정만 필요할 때. */
export function looksLikeNonDraftReply(text: string): boolean {
  return judgeNonDraftReply(text).nonDraft;
}
