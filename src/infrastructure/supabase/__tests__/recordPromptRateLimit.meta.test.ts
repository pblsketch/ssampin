/**
 * 생기부 1층 프롬프트 배급 — 한도 계약 가드 (ADR-089)
 *
 * ## 왜 글자로 읽는가
 *
 * `vitest.config.ts` 의 include 는 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래 테스트는 **CI 에서 돌지 않는다.** 게다가
 * `tsconfig.json` 의 `include` 도 `["src"]` 라 **`npx tsc --noEmit` 도 이 파일을 안 본다.**
 * 즉 게이트 4종 중 셋이 이 함수를 통과시켜 준다 — 실제로 이 함수에는
 * `internalErrorResponse(e)` 를 인자 1개로 부르는 버그가 오래 살아 있었다.
 *
 * 그래서 배포 전에 깨지면 안 되는 계약만 **소스 문자열로** 고정한다.
 * (`staffroomLimitsDrift.meta.test.ts` 와 같은 방식이다.)
 *
 * ★REGRESSION 규칙(`scripts/regression-grep-check.mjs`)에 넣지 않는 이유: 그 파일을
 *   다른 세션이 수정 중이다. 파일이 풀리면 후속으로 옮긴다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../../../../supabase/functions/ssampin-record-prompt/index.ts'),
  'utf8',
);

/** 숫자 구분자(`60_000`)를 지운 사본 — 표기가 달라도 값으로 견주기 위해. */
const PLAIN = SRC.replace(/(\d)_(?=\d)/g, '$1');

/**
 * 주석을 뺀 사본. "두지 않는다" 류 단언은 반드시 이걸로 해야 한다 —
 * 왜 안 두는지 설명하는 주석에 그 낱말이 들어 있어서, 원문으로 재면 **주석 때문에** 실패한다.
 */
const CODE = SRC.split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
  .join('\n');

describe('한도가 실제로 걸려 있다', () => {
  it('공용 헬퍼를 쓴다 — 자체 구현하지 않는다', () => {
    expect(SRC).toContain("from '../_shared/rateLimit.ts'");
    // import 1 + 분당 1 + 일간 1 + 차단 기록 1
    expect(SRC.match(/checkRateLimit/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('★한도가 규정을 읽기 **전에** 지난다 — 순서가 계약이다', () => {
    const gate = SRC.indexOf('checkRateLimit(');
    const read = SRC.indexOf("Deno.env.get('RECORD_PROMPT_L1')");
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(-1);
    // ★`'RECORD_PROMPT_L1'` 만 찾으면 머리 주석에 걸려 이 단언이 **항상 실패**한다.
    expect(read).toBeGreaterThan(gate);
  });

  it('숫자가 계획대로다 — 분당 10/60, 일간 200', () => {
    expect(PLAIN).toContain('windowMs: 60000, max: 10');
    expect(PLAIN).toContain('windowMs: 60000, max: 60');
    expect(PLAIN).toContain('windowMs: 86400000, max: 200');
  });

  it('★일간 IP 한도(dayip:)를 두지 않는다 — 학교 하나를 종일 막는다', () => {
    expect(CODE).not.toContain('dayip');
  });

  it("★전역 상한(identifier: 'global')을 두지 않는다 — 전국 차단 스위치가 된다", () => {
    expect(CODE).not.toContain("identifier: 'global'");
  });
});

describe('사유를 나눈다 — 안내가 달라야 하므로', () => {
  it('분당·일간을 두 번에 나눠 검사한다', () => {
    // 한 호출로 합치면 429 가 한 종류가 되어 "1분 뒤"와 "오늘 다 씀"을 구분할 수 없다.
    expect(SRC.match(/await checkRateLimit\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(SRC).toContain('retryAfterKind');
  });

  it('★차단 기록이 두 갈래 **모두**에서 불린다', () => {
    // 한쪽에만 넣으면 일간 초과가 관측에서 통째로 빠지는데, 분당 12연발 실호출로는
    // 초록이 나와 아무도 눈치채지 못한다.
    expect(SRC).toContain("recordBlocked('minute')");
    expect(SRC).toContain("recordBlocked('day')");
    expect(SRC).toContain("'record-prompt-blocked'");
  });
});

describe('스위치가 값까지 검증한다', () => {
  it('세 값을 명시 비교한다 — 오타가 조용히 통과하면 킬 스위치가 안 먹는다', () => {
    expect(SRC).toContain('RECORD_PROMPT_RATELIMIT');
    expect(SRC).toContain("raw === 'enforce'");
    expect(SRC).toContain("raw === 'observe'");
    expect(SRC).toContain("raw === 'off'");
    // 세 값이 아니면 소리를 내고 안전한 쪽(observe)으로 간다.
    expect(SRC).toContain('console.error');
  });

  it('현재 모드를 부팅 시 남긴다 — 차단이 없으면 로그에 흔적이 없다', () => {
    expect(SRC).toContain('mode=${MODE}');
  });

  it('off 는 한도 블록을 통째로 건너뛴다 — DB 왕복까지 멈춰야 진짜 킬 스위치다', () => {
    expect(SRC).toContain("MODE !== 'off'");
  });
});

describe('배포 후 진단이 가능하다', () => {
  it('내부 오류 로그에 함수 이름이 붙는다', () => {
    // 인자 1개로 부르면 함수 이름 없이 오류가 undefined 로 찍힌다(옛 버그).
    expect(SRC).toContain("internalErrorResponse('ssampin-record-prompt'");
    expect(SRC).not.toContain('internalErrorResponse(e)');
  });
});
