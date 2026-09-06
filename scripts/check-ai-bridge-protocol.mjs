#!/usr/bin/env node
/**
 * 동봉 AI 브릿지 규격 게이트 — `electron/ai-bridge/index.mjs` 가 실제로 말이 통하는지 검사한다.
 *
 * 왜 필요한가: 이 번들은 설치된 앱에서 `resources/ai-bridge/` (app.asar **바깥**) 에 놓인다.
 * 그래서 두 가지가 조용히 깨질 수 있고, 둘 다 과거에 실제로 터졌다.
 *   1. 의존성을 external 로 빼면 상위 경로에 node_modules 가 없어 즉시 `Cannot find module` (v2.2.9).
 *      로컬 개발에서는 레포 node_modules 가 우연히 상위에 있어 드러나지 않는다.
 *   2. 브릿지 레포를 고치고 번들 재생성을 빠뜨리면 옛 도구 목록이 그대로 배포된다 (v2.2.4 때 7개만 노출).
 *
 * 그래서 이 검사는 **번들을 node_modules 가 전혀 없는 임시 폴더로 복사해서** 자식 프로세스로 띄우고,
 * 2025 계열 구규격과 2026-07-28 신규격 **양쪽**으로 도구 조회·호출·거부·종료까지 확인한다.
 * `check-bundle-isolation.mjs` 는 학생/교사 SPA 검사라 이 검사를 대신하지 못한다.
 *
 * 학생 데이터: 이 스크립트가 만든 임시 폴더만 쓴다. 실제 사용자 데이터 폴더는 절대 읽지 않으며,
 * 바깥에서 넘어온 `SSAMPIN_DATA_DIR` 는 자식에게 물려주지 않고 덮어쓴다.
 *
 * Exit codes:
 *   0 — 두 규격 모두 통과
 *   1 — 규격/도구/거부/stdout/종료 검사 실패 (실패 항목을 전부 출력)
 *   2 — 번들 파일이 없음 (`electron/ai-bridge/README.md` 의 재생성 절차 참조)
 *
 * 실행: `node scripts/check-ai-bridge-protocol.mjs`
 * CI wire: `package.json` postbuild hook.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUNDLE = path.resolve('electron/ai-bridge/index.mjs');

/**
 * 브릿지가 노출하는 도구 수. 브릿지 레포에서 도구를 늘리고 번들을 재생성하면 이 값도 함께 올린다.
 * 값이 틀리면 "번들 재생성을 빠뜨렸다" 또는 "도구가 조용히 사라졌다" 둘 중 하나다.
 */
const EXPECTED_TOOL_COUNT = 54;

/** 인자 없이 부를 수 있는 읽기 전용 도구 — 빈 데이터 폴더에서도 성공해야 한다. */
const READ_TOOL = 'list_students';

/** 실행 전에 거부되어야 하는 입력. enum 밖의 값이라 도구 본문에 닿으면 안 된다. */
const BAD_CALL = { name: 'get_schedule', arguments: { kind: '없는값' } };

const MODERN = '2026-07-28';
const LEGACY = '2025-11-25';

/** 신규격은 세션·initialize 가 없다 — 요청마다 _meta 로 규격·클라이언트를 주장하고 셋 다 필수다. */
const modernMeta = {
  _meta: {
    'io.modelcontextprotocol/protocolVersion': MODERN,
    'io.modelcontextprotocol/clientInfo': { name: 'ssampin-protocol-gate', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  },
};

const failures = [];
const check = (ok, label, detail) => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  return ok;
};

if (!fs.existsSync(BUNDLE)) {
  console.error(`[ai-bridge-protocol] 번들이 없습니다: ${BUNDLE}`);
  console.error('[ai-bridge-protocol] electron/ai-bridge/README.md 의 재생성 절차를 실행하세요.');
  process.exit(2);
}

// 번들을 node_modules 가 전혀 없는 곳으로 복사한다 — 레포 node_modules 가 상위에 있으면
// external 로 빠진 의존성이 우연히 해석돼 설치본에서만 죽는 상태를 놓친다.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-bridge-gate-'));
const dataDir = path.join(sandbox, 'data');
const entry = path.join(sandbox, 'index.mjs');
fs.mkdirSync(dataDir);
fs.copyFileSync(BUNDLE, entry);
fs.writeFileSync(
  path.join(dataDir, 'students.json'),
  JSON.stringify([{ id: 's_gate', name: '검사용학생', studentNumber: 10101 }]),
  'utf8',
);

/** 자식 프로세스로 띄워 원시 JSON-RPC 를 주고받고 stdout 순도·종료 코드까지 회수한다. */
function session(requests) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry], {
      cwd: sandbox,
      // 바깥 SSAMPIN_DATA_DIR 이 있어도 임시 폴더로 덮어쓴다 — 실사용자 데이터 접근 금지.
      env: { ...process.env, SSAMPIN_DATA_DIR: dataDir, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
    const closeTimer = setTimeout(() => child.stdin.end(), 1_500);
    const killTimer = setTimeout(() => child.kill(), 60_000);
    child.on('close', (exitCode) => {
      clearTimeout(closeTimer);
      clearTimeout(killTimer);
      const messages = [];
      const junk = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          messages.push(JSON.parse(line));
        } catch {
          junk.push(line);
        }
      }
      resolve({ messages, junk, stderr, exitCode });
    });
  });
}

const pick = (s, id) => s.messages.find((m) => m.id === id);
const toolsOf = (m) => m?.result?.tools ?? [];
const rejected = (m) => Boolean(m?.error) || m?.result?.isError === true;

async function run() {
  // ── 구규격(2025 계열) — 기존 Claude Desktop·Codex·Antigravity 가 쓰는 경로
  const legacy = await session([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY,
        capabilities: {},
        clientInfo: { name: 'ssampin-protocol-gate', version: '1.0.0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: READ_TOOL, arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: BAD_CALL },
  ]);

  const legacyTools = toolsOf(pick(legacy, 2));
  check(
    pick(legacy, 1)?.result?.protocolVersion === LEGACY,
    '구규격 initialize',
    `협상=${pick(legacy, 1)?.result?.protocolVersion ?? '응답 없음'} · stderr=${legacy.stderr.trim().slice(0, 200)}`,
  );
  check(
    legacyTools.length === EXPECTED_TOOL_COUNT,
    '구규격 도구 수',
    `${legacyTools.length}개 (기대 ${EXPECTED_TOOL_COUNT}개) — 번들 재생성을 빠뜨렸는지 확인하세요`,
  );
  check(
    !pick(legacy, 3)?.result?.isError,
    '구규격 도구 호출',
    JSON.stringify(pick(legacy, 3))?.slice(0, 200),
  );
  check(rejected(pick(legacy, 4)), '구규격 잘못된 입력 거부', '거부되지 않았습니다');
  check(
    legacy.junk.length === 0,
    '구규격 stdout 순도',
    `JSON-RPC 아닌 줄 ${legacy.junk.length}건: ${legacy.junk[0]?.slice(0, 120)}`,
  );
  check(legacy.exitCode === 0, '구규격 정상 종료', `exit=${legacy.exitCode}`);

  // ── 신규격(2026-07-28) — initialize 없이 요청마다 _meta 로 주장
  const modern = await session([
    { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { ...modernMeta } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { ...modernMeta } },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: READ_TOOL, arguments: {}, ...modernMeta },
    },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { ...BAD_CALL, ...modernMeta } },
  ]);

  const modernTools = toolsOf(pick(modern, 2));
  check(
    pick(modern, 1)?.result?.supportedVersions?.includes(MODERN),
    '신규격 server/discover',
    JSON.stringify(pick(modern, 1))?.slice(0, 220),
  );
  check(
    modernTools.length === EXPECTED_TOOL_COUNT,
    '신규격 도구 수',
    `${modernTools.length}개 (기대 ${EXPECTED_TOOL_COUNT}개)`,
  );
  check(
    !pick(modern, 3)?.result?.isError,
    '신규격 도구 호출',
    JSON.stringify(pick(modern, 3))?.slice(0, 200),
  );
  check(rejected(pick(modern, 4)), '신규격 잘못된 입력 거부', '거부되지 않았습니다');
  check(
    pick(modern, 3)?.result?.resultType === 'complete',
    '신규격 resultType',
    `resultType=${pick(modern, 3)?.result?.resultType}`,
  );
  check(modern.junk.length === 0, '신규격 stdout 순도', `JSON-RPC 아닌 줄 ${modern.junk.length}건`);
  check(modern.exitCode === 0, '신규격 정상 종료', `exit=${modern.exitCode}`);

  // ── 두 규격이 같은 도구를 준다 (규격에 따라 목록이 갈리면 클라이언트마다 다르게 보인다)
  check(
    JSON.stringify(legacyTools.map((t) => t.name)) ===
      JSON.stringify(modernTools.map((t) => t.name)),
    '두 규격 도구 목록 일치',
    '구규격과 신규격의 도구 이름·순서가 다릅니다',
  );

  if (failures.length > 0) {
    console.error(`[ai-bridge-protocol] 실패 ${failures.length}건`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error('[ai-bridge-protocol] 번들 재생성 절차: electron/ai-bridge/README.md');
    return 1;
  }

  console.log(
    `[ai-bridge-protocol] OK — 구규격(${LEGACY})·신규격(${MODERN}) 모두 도구 ${EXPECTED_TOOL_COUNT}개 조회·호출, ` +
      'node_modules 없는 폴더에서 실행, stdout 순수, 정상 종료',
  );
  return 0;
}

let code = 1;
try {
  code = await run();
} catch (err) {
  console.error(
    `[ai-bridge-protocol] 검사 중 오류: ${err instanceof Error ? err.message : String(err)}`,
  );
  code = 1;
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
process.exit(code);
