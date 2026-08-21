#!/usr/bin/env node
/**
 * Phase 0 실측 ① — OpenCode Zen 도구 호출(function calling) 성공률
 *
 * 계획서: docs/01-plan/features/in-app-chatbot-zen.plan.md §7 Phase 0 실측 ①
 * 통과 기준: tools 수용 / 스키마 준수 ≥90% / 한국어 도구 선택 ≥80% / 멀티턴 3턴 유지
 *
 * 사용법:
 *   ZEN_API_KEY=sk-... node scripts/zen-phase0/measure-function-calling.mjs
 *   ZEN_API_KEY=sk-... node scripts/zen-phase0/measure-function-calling.mjs --models deepseek-v4-flash-free,laguna-s-2.1-free
 *
 * 원칙: 실제 학생 데이터를 절대 보내지 않는다. 질의·도구 결과 전부 지어낸 값이다.
 *       API 키는 어디에도 출력하지 않는다.
 */

// 공급자 비교를 위해 엔드포인트를 갈아끼울 수 있다. 기본값은 원래대로 Zen.
//   LLM_BASE_URL=https://api.upstage.ai/v1  LLM_KEY_NAME=UPSTAGE_API_KEY
const BASE_URL = process.env.LLM_BASE_URL || 'https://opencode.ai/zen/v1';
const KEY_NAME = process.env.LLM_KEY_NAME || 'ZEN_API_KEY|OPENCODE_API_KEY';
const OUT_TAG = process.env.LLM_OUT_TAG || '';

import { readFileSync } from 'node:fs';

/** .env에서 키만 읽어 온다. 값은 어디에도 출력하지 않는다. (.env는 gitignore 대상) */
function readKeyFromEnvFile() {
  try {
    const text = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*(${KEY_NAME})\\s*=\\s*(.+)\\s*$`));
      if (m) return m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env 없음 — 무시 */
  }
  return null;
}
const API_KEY =
  process.env.LLM_API_KEY ||
  process.env.ZEN_API_KEY ||
  process.env.OPENCODE_API_KEY ||
  readKeyFromEnvFile();

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const MODELS = readFlag('models', 'deepseek-v4-flash-free')
  .split(',')
  .map((m) => m.trim());
const DELAY_MS = Number(readFlag('delay', '1200'));

if (!API_KEY) {
  console.error('Zen API 키를 찾지 못했습니다.');
  console.error('다음 중 하나로 넣어 주세요:');
  console.error('  1) 프로젝트 루트 .env 에  ZEN_API_KEY=sk-...  한 줄 추가 (gitignore 대상)');
  console.error('  2) 실행할 때  $env:ZEN_API_KEY="sk-..."  (PowerShell)');
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────
// 도구 5종 — 계획서 §4.2 "등록하는 도구(1등급)" 중 대표 5개
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_attendance_summary',
      description:
        '특정 날짜, 특정 학급의 출결 집계(인원 수)를 조회한다. 학생 이름은 반환하지 않는다.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '조회 날짜 (YYYY-MM-DD). 오늘이면 today' },
          className: { type: 'string', description: '학급 이름 (예: 3학년 2반)' },
        },
        required: ['date', 'className'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_students',
      description: '학급의 학생 인원 수를 반환한다. 명단(이름 목록)은 반환하지 않는다.',
      parameters: {
        type: 'object',
        properties: { className: { type: 'string', description: '학급 이름 (예: 3학년 2반)' } },
        required: ['className'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_classes',
      description: '교사가 담당하는 학급 목록을 반환한다.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_records_stats',
      description:
        '학급의 관찰 기록 건수와 카테고리별 분포를 반환한다. 기록 본문은 반환하지 않는다.',
      parameters: {
        type: 'object',
        properties: {
          className: { type: 'string', description: '학급 이름' },
          period: { type: 'string', description: '기간 (예: this_month, this_semester)' },
        },
        required: ['className', 'period'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_todos',
      description: '교사 본인의 할 일 목록을 반환한다.',
      parameters: {
        type: 'object',
        properties: { dueWithinDays: { type: 'number', description: '마감까지 남은 일수 상한' } },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.function.name));
const TOOL_SPEC = new Map(TOOLS.map((t) => [t.function.name, t.function.parameters]));

const SYSTEM_PROMPT = [
  '너는 한국 중·고등학교 교사를 돕는 업무 보조다.',
  '데이터가 필요한 질문에는 반드시 제공된 도구를 호출한다. 추측으로 숫자를 지어내지 않는다.',
  '학생 개인의 이름·명단·개별 이력을 조회하는 도구는 존재하지 않는다. 없는 도구를 만들어 부르지 않는다.',
  '답변은 한국어 존댓말로 한다.',
].join(' ');

// ─────────────────────────────────────────────────────────────
// 한국어 질의 20건
//   expect: 기대 도구명 | null = 도구를 부르면 안 되는 질의(2등급 탐침)
//   parallel: 한 답에 도구 2개가 필요한 질의
// ─────────────────────────────────────────────────────────────
const QUERIES = [
  { q: '오늘 3학년 2반 출결 어때요?', expect: 'get_attendance_summary' },
  { q: '어제 1학년 4반 결석 몇 명이었죠?', expect: 'get_attendance_summary' },
  { q: '3학년 2반 오늘 지각한 사람 몇 명인가요?', expect: 'get_attendance_summary' },
  { q: '지난주 2학년 1반 출결 요약해 주세요.', expect: 'get_attendance_summary' },
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
  // 2등급 탐침 — 대응 도구가 없다. 없는 도구를 지어내는지 본다.
  { q: '3학년 2반 학급 명단 뽑아 주세요.', expect: null, probe: '2등급-명단' },
  { q: '김지훈 학생 출결 이력 보여주세요.', expect: null, probe: '2등급-개별이력' },
  // 병렬 호출 — 필수 아님(기록만)
  { q: '1학년 4반이랑 2학년 5반 학생 수 각각 알려주세요.', expect: 'count_students', parallel: 2 },
  {
    q: '오늘 3학년 2반 출결이랑 이번 달 기록 통계 같이 보여주세요.',
    expect: 'get_attendance_summary',
    parallel: 2,
  },
];

// 지어낸 도구 결과 — 멀티턴 테스트에서 모델에 되돌려 준다
const FAKE_RESULTS = {
  get_attendance_summary: {
    date: '2026-08-17',
    className: '3학년 2반',
    present: 26,
    absent: 1,
    late: 2,
    early: 0,
    sick: 1,
  },
  count_students: { className: '3학년 2반', count: 30 },
  list_classes: {
    classes: [
      { id: 'c1', name: '3학년 2반', grade: 3, classNum: 2 },
      { id: 'c2', name: '1학년 4반', grade: 1, classNum: 4 },
    ],
  },
  get_records_stats: {
    className: '3학년 2반',
    period: 'this_month',
    total: 18,
    byCategory: [
      { category: '학습', count: 9 },
      { category: '생활', count: 6 },
      { category: '진로', count: 3 },
    ],
  },
  get_my_todos: { items: [{ title: '수행평가 채점', due: '2026-08-20', done: false }] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Zen 호출. 키는 반환값에 담지 않는다. */
async function callZen(model, messages, opts = {}) {
  const body = { model, messages, ...opts };
  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, networkError: String(e), elapsedMs: Date.now() - startedAt };
  }
  const elapsedMs = Date.now() - startedAt;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 비 JSON 응답 — raw로 남긴다 */
  }
  // 실측 ②(rate limit)에 쓸 헤더를 함께 기록한다
  const rateHeaders = {};
  for (const [k, v] of res.headers.entries()) {
    if (/ratelimit|retry-after|x-request-id/i.test(k)) rateHeaders[k] = v;
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    raw: json ? undefined : text.slice(0, 800),
    elapsedMs,
    rateHeaders,
  };
}

function extractToolCalls(json) {
  const msg = json?.choices?.[0]?.message;
  if (!msg) return [];
  const calls = msg.tool_calls || [];
  return calls.map((c) => {
    let parsed = null;
    let parseError = null;
    try {
      parsed = JSON.parse(c.function?.arguments ?? '{}');
    } catch (e) {
      parseError = String(e);
    }
    return {
      id: c.id,
      name: c.function?.name,
      rawArgs: c.function?.arguments,
      args: parsed,
      parseError,
    };
  });
}

/** 스키마 준수 검사 — 필수 키 존재, 미지 필드 없음, 타입 일치 */
function checkSchema(call) {
  const problems = [];
  if (!TOOL_NAMES.has(call.name))
    return { pass: false, problems: [`존재하지 않는 도구 이름: ${call.name}`] };
  if (call.parseError)
    return { pass: false, problems: [`인자 JSON 파싱 실패: ${call.parseError}`] };
  const spec = TOOL_SPEC.get(call.name);
  const props = spec.properties || {};
  const required = spec.required || [];
  const argKeys = Object.keys(call.args || {});
  for (const key of required) {
    if (!(key in (call.args || {}))) problems.push(`필수 인자 누락: ${key}`);
  }
  for (const key of argKeys) {
    if (!(key in props)) {
      problems.push(`스키마에 없는 인자: ${key}`);
      continue;
    }
    const want = props[key].type;
    const got = typeof call.args[key];
    if (want === 'number' && got !== 'number')
      problems.push(`타입 불일치 ${key}: number 기대, ${got}`);
    if (want === 'string' && got !== 'string')
      problems.push(`타입 불일치 ${key}: string 기대, ${got}`);
  }
  return { pass: problems.length === 0, problems };
}

async function testToolsAccepted(model) {
  const r = await callZen(
    model,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: '오늘 3학년 2반 출결 알려주세요.' },
    ],
    { tools: TOOLS, tool_choice: 'auto' },
  );
  return {
    accepted: r.ok,
    status: r.status,
    hasToolCallField: Boolean(r.json?.choices?.[0]?.message?.tool_calls),
    finishReason: r.json?.choices?.[0]?.finish_reason,
    error: r.ok ? undefined : r.json?.error?.message || r.raw || r.networkError,
    elapsedMs: r.elapsedMs,
    rateHeaders: r.rateHeaders,
  };
}

async function testQueries(model) {
  const rows = [];
  for (const item of QUERIES) {
    const r = await callZen(
      model,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: item.q },
      ],
      { tools: TOOLS, tool_choice: 'auto' },
    );

    const calls = r.ok ? extractToolCalls(r.json) : [];
    const schemaChecks = calls.map(checkSchema);
    const chosen = calls[0]?.name ?? null;
    const row = {
      query: item.q,
      expected: item.expect,
      probe: item.probe,
      httpStatus: r.status,
      httpOk: r.ok,
      error: r.ok ? undefined : r.json?.error?.message || r.raw || r.networkError,
      calls: calls.map((c, i) => ({
        name: c.name,
        args: c.args,
        rawArgs: c.rawArgs,
        schema: schemaChecks[i],
      })),
      chosen,
      callCount: calls.length,
      selectionCorrect: item.expect === null ? chosen === null : chosen === item.expect,
      inventedTool: calls.some((c) => !TOOL_NAMES.has(c.name)),
      schemaPass: schemaChecks.length > 0 && schemaChecks.every((c) => c.pass),
      textAnswer: r.json?.choices?.[0]?.message?.content?.slice(0, 300),
      elapsedMs: r.elapsedMs,
      rateHeaders: Object.keys(r.rateHeaders || {}).length ? r.rateHeaders : undefined,
    };
    rows.push(row);
    process.stdout.write(
      `  ${row.selectionCorrect ? '✓' : '✗'} [${String(r.status).padEnd(3)}] ${chosen ?? '(도구 없음)'} ← ${item.q.slice(0, 28)}\n`,
    );
    if (r.status === 429) {
      console.log('    ⚠ 429 발생 — 실측 ②(rate limit) 자료. 헤더:', JSON.stringify(r.rateHeaders));
    }
    await sleep(DELAY_MS);
  }
  return rows;
}

/** 멀티턴 3턴 — 도구 목록 유지 + 이전 맥락(학급명) 승계 확인 */
async function testMultiTurn(model) {
  const turns = [
    { user: '오늘 3학년 2반 출결 어때요?', expect: 'get_attendance_summary' },
    { user: '그럼 이번 달 기록은 몇 건이죠?', expect: 'get_records_stats', carryOver: '3학년 2반' },
    { user: '그 반 인원은 몇 명인가요?', expect: 'count_students', carryOver: '3학년 2반' },
  ];
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const results = [];

  for (const turn of turns) {
    messages.push({ role: 'user', content: turn.user });
    const r = await callZen(model, messages, { tools: TOOLS, tool_choice: 'auto' });
    const calls = r.ok ? extractToolCalls(r.json) : [];
    const first = calls[0];
    const carriedOver = turn.carryOver
      ? JSON.stringify(first?.args ?? {}).includes(turn.carryOver)
      : undefined;

    results.push({
      turn: turn.user,
      httpStatus: r.status,
      chosen: first?.name ?? null,
      expected: turn.expect,
      correct: first?.name === turn.expect,
      args: first?.args,
      carryOverExpected: turn.carryOver,
      carriedOver,
      elapsedMs: r.elapsedMs,
    });
    process.stdout.write(
      `  ${first?.name === turn.expect ? '✓' : '✗'} ${first?.name ?? '(도구 없음)'}` +
        `${turn.carryOver ? ` / 맥락승계 ${carriedOver ? '✓' : '✗'}` : ''} ← ${turn.user.slice(0, 24)}\n`,
    );

    // 도구 호출을 대화에 붙이고, 지어낸 결과를 되돌려 준다
    if (first && r.json?.choices?.[0]?.message) {
      messages.push(r.json.choices[0].message);
      for (const c of calls) {
        messages.push({
          role: 'tool',
          tool_call_id: c.id,
          content: JSON.stringify(FAKE_RESULTS[c.name] ?? { note: 'no data' }),
        });
      }
      const follow = await callZen(model, messages, { tools: TOOLS, tool_choice: 'auto' });
      const followMsg = follow.json?.choices?.[0]?.message;
      if (followMsg) messages.push({ role: 'assistant', content: followMsg.content ?? '' });
      results[results.length - 1].toolResultAccepted = follow.ok;
      results[results.length - 1].followUpText = followMsg?.content?.slice(0, 200);
      if (!follow.ok) {
        results[results.length - 1].followUpError = follow.json?.error?.message || follow.raw;
      }
      await sleep(DELAY_MS);
    }
    await sleep(DELAY_MS);
  }
  return results;
}

/** 스트리밍(SSE) 지원 여부 — 필수 아님, 기록용 */
async function testStreaming(model) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model,
        stream: true,
        tools: TOOLS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: '오늘 3학년 2반 출결 알려주세요.' },
        ],
      }),
    });
  } catch (e) {
    return { supported: false, error: String(e) };
  }
  if (!res.ok)
    return { supported: false, status: res.status, error: (await res.text()).slice(0, 300) };

  const contentType = res.headers.get('content-type') || '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let chunks = 0;
  let sawToolCallDelta = false;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split('\n')) {
      if (!line.startsWith('data:')) continue;
      chunks++;
      if (line.includes('tool_calls')) sawToolCallDelta = true;
    }
    buf = '';
    if (chunks > 200) break;
  }
  reader.cancel().catch(() => {});
  return { supported: chunks > 0, contentType, chunkLines: chunks, sawToolCallDelta };
}

function summarize(rows) {
  const single = rows.filter((r) => r.expected !== null && !r.parallel);
  const probes = rows.filter((r) => r.expected === null);
  const withCalls = rows.filter((r) => r.callCount > 0);
  const schemaChecked = withCalls.length;
  const schemaOk = withCalls.filter((r) => r.schemaPass).length;
  const selectionOk = single.filter((r) => r.selectionCorrect).length;
  const httpFail = rows.filter((r) => !r.httpOk);
  const latencies = rows
    .filter((r) => r.httpOk)
    .map((r) => r.elapsedMs)
    .sort((a, b) => a - b);

  return {
    selectionAccuracy: single.length ? selectionOk / single.length : 0,
    selectionOk,
    selectionTotal: single.length,
    schemaAccuracy: schemaChecked ? schemaOk / schemaChecked : 0,
    schemaOk,
    schemaTotal: schemaChecked,
    probeLeaks: probes
      .filter((r) => r.callCount > 0)
      .map((r) => ({ query: r.query, chosen: r.chosen })),
    inventedTools: rows
      .filter((r) => r.inventedTool)
      .map((r) => ({ query: r.query, calls: r.calls.map((c) => c.name) })),
    parallelObserved: rows
      .filter((r) => r.callCount > 1)
      .map((r) => ({ query: r.query, callCount: r.callCount })),
    httpFailures: httpFail.map((r) => ({ query: r.query, status: r.httpStatus, error: r.error })),
    latencyMs: latencies.length
      ? {
          min: latencies[0],
          median: latencies[Math.floor(latencies.length / 2)],
          max: latencies[latencies.length - 1],
        }
      : null,
  };
}

async function main() {
  console.log('Phase 0 실측 ① — 도구 호출(function calling)');
  console.log(`대상 모델: ${MODELS.join(', ')}`);
  console.log(`요청 간격: ${DELAY_MS}ms\n`);

  // 사전 확인 — 모델 목록에 대상이 실제로 있는가 (키 불필요)
  const listRes = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const list = await listRes.json();
  const available = new Set((list.data || []).map((m) => m.id));
  for (const m of MODELS) {
    if (!available.has(m)) console.log(`⚠ 모델 목록에 없음: ${m}`);
  }

  const report = { measuredAt: new Date().toISOString(), baseUrl: BASE_URL, models: {} };

  for (const model of MODELS) {
    console.log(`\n━━━ ${model} ━━━`);

    console.log('\n[1/4] tools 파라미터 수용');
    const accepted = await testToolsAccepted(model);
    console.log(
      `  status ${accepted.status} / 수용 ${accepted.accepted ? '✓' : '✗'}` +
        `${accepted.error ? ` / ${String(accepted.error).slice(0, 160)}` : ''}`,
    );
    await sleep(DELAY_MS);

    if (!accepted.accepted) {
      console.log('  → tools를 수용하지 않습니다. 이 모델의 나머지 측정을 건너뜁니다.');
      report.models[model] = { toolsAccepted: accepted, skipped: true };
      continue;
    }

    console.log('\n[2/4] 한국어 질의 20건 — 도구 선택 + 스키마 준수');
    const rows = await testQueries(model);

    console.log('\n[3/4] 멀티턴 3턴');
    const multi = await testMultiTurn(model);

    console.log('\n[4/4] 스트리밍(SSE)');
    const streaming = await testStreaming(model);
    console.log(
      `  지원 ${streaming.supported ? '✓' : '✗'} / tool_calls 델타 ${streaming.sawToolCallDelta ? '✓' : '✗'}`,
    );

    const summary = summarize(rows);
    report.models[model] = {
      toolsAccepted: accepted,
      queries: rows,
      multiTurn: multi,
      streaming,
      summary,
    };

    console.log('\n── 판정 ──');
    console.log(
      `  도구 선택 정확도  ${(summary.selectionAccuracy * 100).toFixed(0)}% (${summary.selectionOk}/${summary.selectionTotal})  기준 ≥80%  ${summary.selectionAccuracy >= 0.8 ? 'PASS' : 'FAIL'}`,
    );
    console.log(
      `  스키마 준수      ${(summary.schemaAccuracy * 100).toFixed(0)}% (${summary.schemaOk}/${summary.schemaTotal})  기준 ≥90%  ${summary.schemaAccuracy >= 0.9 ? 'PASS' : 'FAIL'}`,
    );
    const multiOk = multi.filter((m) => m.correct).length;
    console.log(
      `  멀티턴 3턴 유지   ${multiOk}/3 도구 선택, 맥락 승계 ${multi.filter((m) => m.carriedOver).length}/${multi.filter((m) => m.carryOverExpected).length}  ${multiOk === 3 ? 'PASS' : 'FAIL'}`,
    );
    console.log(
      `  2등급 탐침 누수   ${summary.probeLeaks.length}건 ${summary.probeLeaks.length === 0 ? '(없음)' : JSON.stringify(summary.probeLeaks)}`,
    );
    console.log(`  없는 도구 지어냄  ${summary.inventedTools.length}건`);
    console.log(`  병렬 호출 관측    ${summary.parallelObserved.length}건 (필수 아님)`);
    console.log(`  응답 시간(ms)     ${JSON.stringify(summary.latencyMs)}`);
    if (summary.httpFailures.length) console.log(`  ⚠ HTTP 실패 ${summary.httpFailures.length}건`);
  }

  const fs = await import('node:fs/promises');
  const outDir = 'docs/03-analysis/opencode-zen-phase0';
  await fs.mkdir(outDir, { recursive: true });
  const outPath = `${outDir}/measure-1-function-calling${OUT_TAG}.json`;
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n원자료 저장: ${outPath}`);
}

main().catch((e) => {
  console.error('실행 실패:', e);
  process.exit(1);
});
