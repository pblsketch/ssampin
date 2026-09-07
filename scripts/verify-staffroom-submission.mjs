#!/usr/bin/env node
/**
 * 배포된 제출 과제 엣지 함수를 **실제로 불러** 확인한다.
 *
 * 왜 필요한가 — 이 저장소는 "엣지 함수를 만들어 놓고 배포를 안 해서 테스트만
 * 초록이고 실기기에서만 터진" 사고를 이미 겪었다. 그리고 `supabase/functions/**`
 * 는 vitest 도 ESLint 도 안 돈다. 그래서 **배포된 것을 진짜로 부르는** 이
 * 스크립트가 이 기능의 유일한 통합 검증이다.
 *
 * 무엇을 보는가:
 *   ① 명단 권한이 없는 계정으로 `submissionTargets` · `unsubmitted` → 403
 *   ② 같은 계정으로 `submissions`(목록) → 200 이고, 응답 본문에
 *      **그 과제의 만든이를 뺀** 부서 멤버의 지메일·이름이 하나도 없다
 *
 * 만든이 지메일이 예외인 이유: 화면이 "내가 만든 과제인가"를 판정해
 * "안 낸 분 보기" 단추를 그릴지 정해야 한다. 그 한 명 말고는 아무도 안 나간다.
 *
 * ── 쓰는 법 ────────────────────────────────────────────────────────
 *   1) 앱에서 두 계정으로 각각 로그인한 뒤 개발자 도구에서 구글 액세스 토큰을 복사한다
 *   2) 환경변수에 넣는다
 *        SUPABASE_URL                     프로젝트 주소
 *        SUPABASE_ANON_KEY                anon 키
 *        SSAMPIN_VERIFY_ID_TOKEN_ADMIN    부서 관리자 계정의 구글 액세스 토큰
 *        SSAMPIN_VERIFY_ID_TOKEN_MEMBER   명단 권한이 **없는** 일반 멤버의 토큰
 *        SSAMPIN_VERIFY_DEPARTMENT_ID     확인할 부서 id
 *        SSAMPIN_VERIFY_MODULE_ID         그 부서의 제출 과제 공간 id
 *   3) node scripts/verify-staffroom-submission.mjs
 *
 * ★ 환경변수가 없으면 **종료 코드 1 로 실패한다.** 조용히 건너뛰면
 *   "확인했다"는 말만 남고 아무것도 확인되지 않는다.
 */

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SSAMPIN_VERIFY_ID_TOKEN_ADMIN',
  'SSAMPIN_VERIFY_ID_TOKEN_MEMBER',
  'SSAMPIN_VERIFY_DEPARTMENT_ID',
  'SSAMPIN_VERIFY_MODULE_ID',
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error('X 환경변수가 없어 확인할 수 없습니다:', missing.join(', '));
  console.error('  파일 머리말의 "쓰는 법"을 보고 채운 뒤 다시 실행하세요.');
  console.error('  (건너뛰지 않습니다 — 확인 안 된 것을 확인했다고 적으면 안 됩니다)');
  process.exit(1);
}

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SSAMPIN_VERIFY_ID_TOKEN_ADMIN,
  SSAMPIN_VERIFY_ID_TOKEN_MEMBER,
  SSAMPIN_VERIFY_DEPARTMENT_ID,
  SSAMPIN_VERIFY_MODULE_ID,
} = process.env;

let failed = 0;
const ok = (msg) => console.log(`OK ${msg}`);
const bad = (msg) => {
  console.error(`X  ${msg}`);
  failed += 1;
};

async function call(fn, payload, token) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...payload, googleAccessToken: token }),
  });
  return { status: res.status, text: await res.text() };
}

const asAdmin = (p) => call('staffroom-rooms', p, SSAMPIN_VERIFY_ID_TOKEN_ADMIN);
const asMember = (p) => call('staffroom-rooms', p, SSAMPIN_VERIFY_ID_TOKEN_MEMBER);

async function main() {
  const departmentId = SSAMPIN_VERIFY_DEPARTMENT_ID;
  const moduleId = SSAMPIN_VERIFY_MODULE_ID;

  // 부서 멤버 명단을 관리자 토큰으로 받아 온다 — 응답에 새면 안 되는 값들이다
  const membersRes = await call(
    'staffroom-members',
    { action: 'list', departmentId },
    SSAMPIN_VERIFY_ID_TOKEN_ADMIN,
  );
  if (membersRes.status !== 200) {
    bad(`멤버 명단을 못 받았습니다 (status ${membersRes.status}). 부서 id·토큰을 확인하세요.`);
    return;
  }
  const members = JSON.parse(membersRes.text).members ?? [];
  ok(`부서 멤버 ${members.length}명 확인`);

  // 관리자로 목록을 받아 확인할 과제를 하나 고른다
  const listRes = await asAdmin({ action: 'submissions', departmentId, moduleId });
  if (listRes.status !== 200) {
    bad(`제출 과제 목록을 못 받았습니다 (status ${listRes.status}).`);
    return;
  }
  const submissions = JSON.parse(listRes.text).submissions ?? [];
  if (submissions.length === 0) {
    bad('확인할 제출 과제가 없습니다. 관리자 계정으로 하나 만든 뒤 다시 실행하세요.');
    return;
  }
  const target = submissions[0];
  ok(`확인 대상 과제: "${target.title}" (만든이 ${target.authorEmail})`);

  // ── ① 명단 권한 없는 계정은 403 ─────────────────────────────────
  for (const action of ['submissionTargets', 'unsubmitted']) {
    const res = await asMember({ action, departmentId, submissionId: target.id });
    if (res.status === 403) ok(`${action}: 권한 없는 계정에 403`);
    else bad(`${action}: 403 이어야 하는데 ${res.status} 입니다 — 명단이 새고 있습니다`);
  }

  // ── ② 목록은 200 이고 만든이 말고는 아무 신원도 없다 ────────────
  const memberList = await asMember({ action: 'submissions', departmentId, moduleId });
  if (memberList.status !== 200) {
    bad(`일반 멤버의 목록 조회가 ${memberList.status} 입니다 — 200 이어야 합니다`);
    return;
  }
  ok('일반 멤버도 목록은 볼 수 있다 (200)');

  const body = memberList.text;
  let leaks = 0;
  let checked = 0;
  for (const m of members) {
    const email = String(m.email ?? '');
    // 만든이 지메일은 의도된 유일한 예외다
    if (email.toLowerCase() === String(target.authorEmail ?? '').toLowerCase()) continue;
    checked += 1;
    if (email && body.includes(email)) {
      bad(`응답에 다른 멤버의 지메일이 들어 있습니다: ${email}`);
      leaks += 1;
    }
    const name = m.displayName;
    if (name && body.includes(name)) {
      bad(`응답에 다른 멤버의 이름이 들어 있습니다: ${name}`);
      leaks += 1;
    }
  }
  if (leaks === 0) ok(`응답에 만든이 외 신원 없음 (멤버 ${checked}명 검사)`);
}

main()
  .catch((e) => {
    bad(`실행 중 오류: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(() => {
    console.log(failed === 0 ? '\n모든 확인을 통과했습니다.' : `\n${failed}건 실패했습니다.`);
    process.exit(failed === 0 ? 0 : 1);
  });
