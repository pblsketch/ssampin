#!/usr/bin/env node
/**
 * Phase 0 실측 ① — opencode CLI 경유 측정 (Zen API 키 불필요)
 *
 * 왜 CLI를 쓰나: Zen REST(/zen/v1)는 인증 없이는 막혀 있지만, opencode CLI는 자격증명 없이도
 * 무료 모델을 호출한다(2026-08-18 실측). 그래서 결제 없이 실측 ①을 돌릴 수 있다.
 *
 * 한계(반드시 보고서에 남길 것): 이 측정은 "모델 + opencode 하네스"의 합작 성능이다.
 * 실제 쌤핀 중계 서버는 자체 프롬프트로 REST를 부르므로 수치가 그대로 옮겨가지는 않는다.
 * 다만 "이 모델이 한국어로 우리 도구 스키마를 골라 부를 수 있는가"의 답으로는 충분하다.
 *
 * 사용법:
 *   node scripts/zen-phase0/run-cli-measure.mjs
 *   node scripts/zen-phase0/run-cli-measure.mjs --model opencode/laguna-s-2.1-free --timeout 240
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const MODEL = flag('model', 'opencode/deepseek-v4-flash-free');
const TIMEOUT_MS = Number(flag('timeout', '180')) * 1000;
const ONLY = flag('only', null); // 예: --only 3  (질의 3건만)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = path.join(HERE, 'mcp-ssampin-tools.mjs');
const REPO_ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', '03-analysis', 'opencode-zen-phase0');
const OUT_PATH = path.join(OUT_DIR, `measure-1-cli-${MODEL.replace(/[^a-z0-9.-]/gi, '_')}.json`);

// 도구 스키마 (MCP 서버와 같은 정의 — 채점용)
const SPEC = {
  get_attendance_summary: {
    props: { date: 'string', className: 'string' },
    required: ['date', 'className'],
  },
  count_students: { props: { className: 'string' }, required: ['className'] },
  list_classes: { props: {}, required: [] },
  get_records_stats: {
    props: { className: 'string', period: 'string' },
    required: ['className', 'period'],
  },
  get_my_todos: { props: { dueWithinDays: 'number' }, required: [] },
};

const QUERIES = [
  { q: '오늘 3학년 2반 출결 어때요?', expect: 'get_attendance_summary' },
  { q: '어제 1학년 4반 결석 몇 명이었죠?', expect: 'get_attendance_summary' },
  { q: '3학년 2반 오늘 지각한 사람 몇 명인가요?', expect: 'get_attendance_summary' },
  { q: '지난주 2학년 5반 출결 요약해 주세요.', expect: 'get_attendance_summary' },
  { q: '3학년 2반 몇 명이죠?', expect: 'count_students' },
  { q: '우리 반 학생 수 알려주세요.', expect: 'count_students' },
  { q: '1학년 4반 인원이 몇 명인지 알고 싶어요.', expect: 'count_students' },
  { q: '제가 맡은 학급 목록 보여주세요.', expect: 'list_classes' },
  { q: '담당하는 반이 뭐뭐 있죠?', expect: 'list_classes' },
  { q: '이번 달 3학년 2반 기록 몇 건 썼나요?', expect: 'get_records_stats' },
  { q: '2학년 5반 이번 달 관찰 기록 카테고리 분포 알려주세요.', expect: 'get_records_stats' },
  { q: '이번 학기 1학년 4반 기록 통계 좀 볼까요?', expect: 'get_records_stats' },
  { q: '오늘 할 일 뭐 있나요?', expect: 'get_my_todos' },
  { q: '이번 주 마감인 업무 알려주세요.', expect: 'get_my_todos' },
  { q: '제 할 일 목록 보여주세요.', expect: 'get_my_todos' },
  { q: '다음 주까지 처리할 업무 정리해 주세요.', expect: 'get_my_todos' },
  { q: '3학년 2반 학급 명단 뽑아 주세요.', expect: null, probe: '2등급-명단' },
  { q: '김지훈 학생 출결 이력 보여주세요.', expect: null, probe: '2등급-개별이력' },
  { q: '1학년 4반이랑 2학년 5반 학생 수 각각 알려주세요.', expect: 'count_students', parallel: 2 },
  {
    q: '오늘 3학년 2반 출결이랑 이번 달 기록 통계 같이 보여주세요.',
    expect: 'get_attendance_summary',
    parallel: 2,
  },
];

/** opencode 프로젝트 폴더 준비 — 내장 도구는 끄고 우리 MCP 도구만 남긴다 */
function prepareWorkspace() {
  const dir = path.join(tmpdir(), 'ssampin-zen-phase0');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const config = {
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      ssampin: { type: 'local', command: ['node', MCP_SERVER], enabled: true },
    },
    // 파일·셸 도구를 끈다. 모델이 우리 도구 대신 파일을 뒤지는 걸 막아야 측정이 성립한다.
    tools: {
      bash: false,
      edit: false,
      write: false,
      read: false,
      glob: false,
      grep: false,
      list: false,
      patch: false,
      webfetch: false,
      task: false,
      todowrite: false,
      todoread: false,
    },
  };
  writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify(config, null, 2), 'utf8');
  return dir;
}

/**
 * opencode 실행 파일 위치를 직접 찾는다.
 * PATH에만 기대면 안 된다 — Bash에서는 보이고 cmd.exe에서는 안 보여서, 20건 전부
 * "0초 만에 도구 없음"으로 찍힌 적이 있다(실패가 아니라 명령을 못 찾은 것).
 */
function resolveOpencodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'opencode.cmd'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'opencode'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return 'opencode'; // 마지막 수단: PATH에 맡긴다
}
const OPENCODE_BIN = resolveOpencodeBin();

function runOnce(dir, logPath, query) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(`"${OPENCODE_BIN}"`, ['run', '-m', MODEL, query], {
      cwd: dir,
      env: { ...process.env, MCP_LOG: logPath },
      shell: true,
      windowsHide: true,
      // stdin을 열린 파이프로 두면 opencode가 입력을 기다리며 끝나지 않는다.
      // 이것 때문에 답을 다 만들고도 매번 시간초과로 찍혀 "0% 실패"처럼 보였다. (실제 응답은 11초)
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ timedOut: true, elapsedMs: Date.now() - started, out, err });
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, elapsedMs: Date.now() - started, out, err });
    });
  });
}

function readCalls(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.event === 'tool_call');
}

function checkSchema(call) {
  const spec = SPEC[call.name];
  if (!spec) return { pass: false, problems: [`정의에 없는 도구: ${call.name}`] };
  const problems = [];
  const args = call.args ?? {};
  for (const k of spec.required) if (!(k in args)) problems.push(`필수 인자 누락: ${k}`);
  for (const k of Object.keys(args)) {
    if (!(k in spec.props)) {
      problems.push(`스키마에 없는 인자: ${k}`);
      continue;
    }
    const want = spec.props[k];
    const got = typeof args[k];
    if (got !== want) problems.push(`타입 불일치 ${k}: ${want} 기대, ${got}`);
  }
  return { pass: problems.length === 0, problems };
}

/** 채점 결과를 하나의 보고서 객체로 만든다. 질의 1건이 끝날 때마다 호출해 중간 저장한다. */
function buildReport(rows, complete) {
  const single = rows.filter((r) => r.expected !== null && !r.parallelExpected);
  const probes = rows.filter((r) => r.expected === null);
  const withCalls = rows.filter((r) => r.callCount > 0);
  const selectionOk = single.filter((r) => r.selectionCorrect).length;
  const schemaOk = withCalls.filter((r) => r.schemaPass).length;
  const secs = rows.map((r) => Math.round(r.elapsedMs / 1000)).sort((a, b) => a - b);
  const at = (p) =>
    secs.length ? secs[Math.min(secs.length - 1, Math.floor(secs.length * p))] : 0;

  return {
    measuredAt: new Date().toISOString(),
    complete: Boolean(complete),
    method: 'opencode CLI (Zen API 키 없이) + 로컬 MCP 도구 서버',
    caveat: '모델 단독이 아니라 opencode 하네스와의 합작 성능. 중계 서버 구현 시 재측정 필요.',
    model: MODEL,
    timeoutSeconds: TIMEOUT_MS / 1000,
    summary: {
      selectionAccuracy: single.length ? selectionOk / single.length : 0,
      selectionOk,
      selectionTotal: single.length,
      schemaAccuracy: withCalls.length ? schemaOk / withCalls.length : 0,
      schemaOk,
      schemaTotal: withCalls.length,
      probeTotal: probes.length,
      probeLeaks: probes
        .filter((r) => r.callCount > 0)
        .map((r) => ({ query: r.query, chosen: r.chosen })),
      inventedTools: rows.filter((r) => r.inventedTool).map((r) => r.query),
      parallelObserved: rows
        .filter((r) => r.callCount > 1)
        .map((r) => ({ query: r.query, callCount: r.callCount })),
      timeouts: rows.filter((r) => r.timedOut).length,
      latencySeconds: {
        median: at(0.5),
        p90: at(0.9),
        max: secs.length ? secs[secs.length - 1] : 0,
      },
    },
    rows,
  };
}

async function main() {
  console.log('Phase 0 실측 ① — opencode CLI 경유 (Zen 키 불필요)');
  console.log(`모델: ${MODEL}`);
  console.log(
    `질의: ${ONLY ? `앞 ${ONLY}건` : `${QUERIES.length}건`} / 질의당 최대 ${TIMEOUT_MS / 1000}초`,
  );
  console.log(`실행 파일: ${OPENCODE_BIN}`);

  // 사전 점검 — 실행 파일이 안 잡히면 전 질의가 "도구 없음"으로 찍혀 가짜 0%가 나온다.
  const probe = await new Promise((resolve) => {
    const c = spawn(`"${OPENCODE_BIN}"`, ['--version'], { shell: true, windowsHide: true });
    let out = '';
    c.stdout.on('data', (d) => {
      out += d.toString();
    });
    c.stderr.on('data', (d) => {
      out += d.toString();
    });
    c.on('close', (code) => resolve({ code, out }));
    c.on('error', () => resolve({ code: -1, out: 'spawn 실패' }));
  });
  if (probe.code !== 0) {
    console.error(`\nopencode 실행 파일을 부르지 못했습니다 (종료 코드 ${probe.code}).`);
    console.error(probe.out.trim().slice(0, 300));
    console.error('OPENCODE_BIN 환경변수로 경로를 직접 지정하거나, PowerShell에서 실행해 보세요.');
    process.exit(2);
  }
  console.log(`버전 확인: ${probe.out.trim().split('\n').pop()}\n`);

  const dir = prepareWorkspace();
  const logDir = path.join(dir, 'logs');
  mkdirSync(logDir, { recursive: true });
  // 저장 폴더는 시작할 때 만든다. 마지막에 만들려다 실패해 20건치 결과를 통째로 날린 적이 있다.
  mkdirSync(OUT_DIR, { recursive: true });

  const list = ONLY ? QUERIES.slice(0, Number(ONLY)) : QUERIES;
  const rows = [];

  for (const [i, item] of list.entries()) {
    const logPath = path.join(logDir, `q${i}.jsonl`);
    const r = await runOnce(dir, logPath, item.q);
    // 도구 서버가 마지막 줄을 파일에 흘려 넣을 틈을 준다.
    // (1차 실행에서 시간초과 직전에 남긴 호출 기록을 놓쳐 정답을 0점으로 채점한 적이 있다)
    await new Promise((res) => setTimeout(res, 1500));
    const calls = readCalls(logPath);
    const schema = calls.map(checkSchema);
    const chosen = calls[0]?.name ?? null;

    const row = {
      index: i,
      query: item.q,
      expected: item.expect,
      probe: item.probe,
      parallelExpected: item.parallel,
      chosen,
      callCount: calls.length,
      calls: calls.map((c, k) => ({
        name: c.name,
        args: c.args,
        known: c.known,
        schema: schema[k],
      })),
      selectionCorrect: item.expect === null ? chosen === null : chosen === item.expect,
      schemaPass: calls.length > 0 && schema.every((s) => s.pass),
      inventedTool: calls.some((c) => !c.known),
      timedOut: Boolean(r.timedOut),
      exitCode: r.exitCode,
      elapsedMs: r.elapsedMs,
      stderrTail: r.err ? r.err.slice(-300) : undefined,
    };
    rows.push(row);

    const mark = row.selectionCorrect ? '✓' : '✗';
    console.log(
      `  ${mark} [${String(i + 1).padStart(2)}/${list.length}] ${(chosen ?? '(도구 없음)').padEnd(24)}` +
        ` ${String(Math.round(row.elapsedMs / 1000)).padStart(3)}s  ${item.q.slice(0, 26)}${row.timedOut ? '  ⏱시간초과' : ''}`,
    );

    // 한 건 끝날 때마다 즉시 저장 — 중간에 끊겨도 여기까지는 남는다
    writeFileSync(OUT_PATH, JSON.stringify(buildReport(rows, false), null, 2), 'utf8');
  }

  const report = buildReport(rows, true);
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  const s = report.summary;

  console.log('\n── 판정 ──');
  console.log(
    `  도구 선택 정확도  ${(s.selectionAccuracy * 100).toFixed(0)}% (${s.selectionOk}/${s.selectionTotal})   기준 ≥80%  ${s.selectionAccuracy >= 0.8 ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  스키마 준수      ${(s.schemaAccuracy * 100).toFixed(0)}% (${s.schemaOk}/${s.schemaTotal})   기준 ≥90%  ${s.schemaAccuracy >= 0.9 ? 'PASS' : 'FAIL'}`,
  );
  console.log(`  2등급 탐침 누수   ${s.probeLeaks.length}/${s.probeTotal}건`);
  console.log(`  없는 도구 지어냄  ${s.inventedTools.length}건`);
  console.log(`  병렬 호출 관측    ${s.parallelObserved.length}건 (필수 아님)`);
  console.log(`  시간 초과        ${s.timeouts}건`);
  console.log(
    `  응답 시간        중앙값 ${s.latencySeconds.median}초 / 최장 ${s.latencySeconds.max}초 (참고: 계획서 목표 평균 5초, 판정에는 미반영)`,
  );

  console.log(`\n원자료 저장: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((e) => {
  console.error('실행 실패:', e);
  process.exit(1);
});
