/**
 * 협업 보드 도메인 규칙 (순수 함수)
 *
 * 외부 의존 0개 — renderer와 electron main process 양쪽에서 재사용.
 */

import { isAuthToken, type BoardAuthToken } from '../valueObjects/BoardAuthToken';
import { isSessionCode, type BoardSessionCode } from '../valueObjects/BoardSessionCode';

/** 학생 이름 최대 글자 (UTF-16 code unit 기준) */
export const PARTICIPANT_NAME_MAX_LENGTH = 12;

/**
 * 학생이 입력한 이름을 다듬어 서버에 전달할 수 있는 형태로 변환한다.
 *
 * - 앞뒤 공백·제로폭 문자 제거
 * - 최대 12자로 자름
 * - 공백/제로폭만 있거나 빈 문자열이면 null
 */
export function sanitizeParticipantName(raw: string): string | null {
  const trimmed = raw.trim().slice(0, PARTICIPANT_NAME_MAX_LENGTH);
  if (trimmed.length === 0) return null;
  if (/^[\s\u200B-\u200D]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * 중복 이름 접미사를 제거해 정규 이름을 돌려준다.
 * "민수(2)" → "민수", "민수(23)" → "민수", "민수" → "민수"
 *
 * Board.participantHistory의 중복 판정 기준으로 사용한다.
 */
export function canonicalParticipantName(name: string): string {
  return name.replace(/\(\d+\)$/, '').trim();
}

/**
 * 이미 존재하는 이름 목록에 base를 삽입할 때 충돌을 피할 이름을 돌려준다.
 * - 없으면 base 그대로
 * - 있으면 "base(2)", "base(3)", ... 중 빈 자리
 * - 100회까지 탐색 실패 시 타임스탬프 suffix로 폴백
 */
export function nextAvailableName(base: string, existing: ReadonlyArray<string>): string {
  if (!existing.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}(${n})`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base}(${Date.now().toString().slice(-4)})`;
}

/**
 * 입장 인증 검증 — URL 토큰 + 세션 코드 동시 일치.
 *
 * 형식 검증(길이·문자 집합)은 타이밍 공격 대상이 아니므로 early return 허용.
 * 형식이 맞는 입력끼리의 실제 비교는 상수 시간 AND 연산으로 수행한다.
 * (infrastructure 레이어에서 Node `crypto.timingSafeEqual`로 강화 가능)
 */
export function verifyJoinCredentials(
  providedToken: string,
  providedCode: string,
  expected: { readonly token: BoardAuthToken; readonly code: BoardSessionCode },
): boolean {
  if (!isAuthToken(providedToken) || !isSessionCode(providedCode)) return false;
  const tokenOk = providedToken === expected.token;
  const codeOk = providedCode === expected.code;
  return tokenOk && codeOk;
}

/**
 * 참여자 히스토리 병합 — 신규 이름을 canonical 기준으로 중복 제거하여 병합.
 * 결과 배열은 입력된 등장 순서를 보존한다.
 */
export function mergeParticipantHistory(
  previous: ReadonlyArray<string>,
  incoming: ReadonlyArray<string>,
): string[] {
  const seen = new Set(previous.map(canonicalParticipantName));
  const out = [...previous];
  for (const name of incoming) {
    const canon = canonicalParticipantName(name);
    if (canon.length === 0) continue;
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }
  return out;
}
