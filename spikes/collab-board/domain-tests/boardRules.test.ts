/**
 * Domain rule 단위 테스트 (Step 1 검증용)
 *
 * 실행: `npx tsx spikes/collab-board/domain-tests/boardRules.test.ts`
 * 의존성: 없음 (domain은 순수 TypeScript)
 */
import {
  sanitizeParticipantName,
  canonicalParticipantName,
  nextAvailableName,
  verifyJoinCredentials,
  mergeParticipantHistory,
  PARTICIPANT_NAME_MAX_LENGTH,
} from '../../../src/domain/rules/boardRules';
import {
  generateSessionCode,
  isSessionCode,
  type BoardSessionCode,
} from '../../../src/domain/valueObjects/BoardSessionCode';
import {
  isAuthToken,
  type BoardAuthToken,
} from '../../../src/domain/valueObjects/BoardAuthToken';
import { isBoardId } from '../../../src/domain/valueObjects/BoardId';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  PASS: ${msg}`);
}

function testSanitize() {
  console.log('\n[sanitizeParticipantName]');
  assert(sanitizeParticipantName('민수') === '민수', '일반 이름 통과');
  assert(sanitizeParticipantName('  민수  ') === '민수', '앞뒤 공백 제거');
  assert(sanitizeParticipantName('') === null, '빈 문자열 거부');
  assert(sanitizeParticipantName('   ') === null, '공백만 거부');
  assert(sanitizeParticipantName('\u200B\u200C') === null, '제로폭만 거부');
  const long = '가'.repeat(20);
  assert(sanitizeParticipantName(long)?.length === PARTICIPANT_NAME_MAX_LENGTH, '12자로 자름');
  assert(sanitizeParticipantName('😀민수') === '😀민수', '이모지 허용');
}

function testCanonical() {
  console.log('\n[canonicalParticipantName]');
  assert(canonicalParticipantName('민수') === '민수', '접미사 없으면 그대로');
  assert(canonicalParticipantName('민수(2)') === '민수', '(2) 제거');
  assert(canonicalParticipantName('민수(23)') === '민수', '(23) 제거');
  assert(canonicalParticipantName('민수 (2)') === '민수', '공백+괄호 모두 제거 (trim)');
  assert(canonicalParticipantName('민수(1)더') === '민수(1)더', '중간 괄호는 유지');
}

function testNextAvailable() {
  console.log('\n[nextAvailableName]');
  assert(nextAvailableName('민수', []) === '민수', '빈 목록은 base 그대로');
  assert(nextAvailableName('민수', ['민수']) === '민수(2)', '1건 중복 시 (2)');
  assert(nextAvailableName('민수', ['민수', '민수(2)']) === '민수(3)', '2건 중복 시 (3)');
  assert(nextAvailableName('지우', ['민수', '민수(2)']) === '지우', '다른 이름은 그대로');
}

function testVerify() {
  console.log('\n[verifyJoinCredentials]');
  const validToken = 'a'.repeat(32) as BoardAuthToken;
  const validCode = 'ABCDEF' as BoardSessionCode;
  assert(verifyJoinCredentials(validToken, validCode, { token: validToken, code: validCode }) === true, '일치 시 true');
  assert(verifyJoinCredentials('a'.repeat(32), 'ABCDEZ', { token: validToken, code: validCode }) === false, '코드 불일치 false');
  assert(verifyJoinCredentials('b'.repeat(32), 'ABCDEF', { token: validToken, code: validCode }) === false, '토큰 불일치 false');
  assert(verifyJoinCredentials('xxx', validCode, { token: validToken, code: validCode }) === false, '토큰 형식 불량 false');
  assert(verifyJoinCredentials(validToken, 'xxx', { token: validToken, code: validCode }) === false, '코드 형식 불량 false');
  assert(verifyJoinCredentials('ZZZZ'.repeat(8), validCode, { token: validToken, code: validCode }) === false, '대문자 hex는 비허용 (소문자만)');
}

function testMergeHistory() {
  console.log('\n[mergeParticipantHistory]');
  assert(
    JSON.stringify(mergeParticipantHistory([], ['민수'])) === JSON.stringify(['민수']),
    '빈 목록에 추가',
  );
  assert(
    JSON.stringify(mergeParticipantHistory(['민수'], ['민수(2)'])) === JSON.stringify(['민수']),
    'canonical 중복 제거 (민수(2) → 민수 무시)',
  );
  assert(
    JSON.stringify(mergeParticipantHistory(['민수'], ['서연', '지우'])) ===
      JSON.stringify(['민수', '서연', '지우']),
    '신규 이름 순서 보존',
  );
  assert(
    JSON.stringify(mergeParticipantHistory(['민수'], ['서연', '서연(2)'])) ===
      JSON.stringify(['민수', '서연']),
    'incoming 내부 중복도 제거',
  );
  assert(
    JSON.stringify(mergeParticipantHistory([], [''])) === JSON.stringify([]),
    '빈 이름 입력 무시',
  );
}

function testValueObjectGuards() {
  console.log('\n[value object type guards]');
  assert(isBoardId('bd-abc123_XYZ-000') === true, 'BoardId 14자 url-safe 통과');
  assert(isBoardId('bd-short') === false, 'BoardId 짧으면 거부');
  assert(isBoardId('no-prefix') === false, 'BoardId prefix 없으면 거부');

  assert(isSessionCode('ABCDEF') === true, '6자 영숫자 세션 코드 통과');
  assert(isSessionCode('ABCDE2') === true, '숫자(2~9) 포함 통과');
  assert(isSessionCode('ABCD00') === false, '0은 alphabet 제외 → 거부');
  assert(isSessionCode('ABCD1E') === false, '1은 alphabet 제외 → 거부');
  assert(isSessionCode('ABCDE2F') === false, '7자는 거부');

  assert(isAuthToken('a'.repeat(32)) === true, '32자 소문자 hex 통과');
  assert(isAuthToken('A'.repeat(32)) === false, '대문자는 거부 (소문자 hex만)');
  assert(isAuthToken('a'.repeat(31)) === false, '31자는 거부');
}

function testSessionCodeGenerator() {
  console.log('\n[generateSessionCode]');
  let prng = 0.5;
  const code = generateSessionCode(() => prng);
  assert(isSessionCode(code), '생성된 코드는 형식 검증 통과');
  assert(code.length === 6, '6자리');
  // 0.9에서도 alphabet 범위 내
  const code2 = generateSessionCode(() => 0.9);
  assert(isSessionCode(code2), '0.9 rand도 유효 코드');
}

(() => {
  try {
    testSanitize();
    testCanonical();
    testNextAvailable();
    testVerify();
    testMergeHistory();
    testValueObjectGuards();
    testSessionCodeGenerator();
    console.log('\n========================================');
    console.log('  domain/ Step 1 단위 테스트 전부 통과');
    console.log('========================================');
    process.exit(0);
  } catch (err) {
    console.error('\n실패:', err);
    process.exit(1);
  }
})();
