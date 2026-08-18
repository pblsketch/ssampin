#!/usr/bin/env node
/**
 * Phase 0 실측 ③ — 질문 1건당 실제 토큰·비용
 *
 * 챗봇 한 번의 왕복을 그대로 흉내 낸다: 질문 → 도구 호출 → 도구 결과 → 최종 답변.
 * 모델 호출이 2번 일어나므로 두 번의 usage 를 모두 합산해야 실제 비용이 나온다.
 *
 * 원칙: 실제 학생 데이터를 절대 보내지 않는다. 도구 결과는 전부 지어낸 값이다.
 *       API 키는 어디에도 출력하지 않는다.
 *
 * 사용법: node scripts/zen-phase0/measure-3-cost.mjs [--model gpt-5-nano]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', '03-analysis', 'opencode-zen-phase0');

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const MODEL = flag('model', 'gpt-5-nano');

// 100만 토큰당 단가 (docs/zen 요금표, 2026-08-18 확인)
const PRICES = {
  'gpt-5-nano': { in: 0.05, out: 0.4 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'minimax-m3': { in: 0.3, out: 1.2 },
  'deepseek-v4-pro': { in: 0.66, out: 1.98 },
};

function readKey() {
  for (const line of readFileSync(path.join(REPO_ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(ZEN_API_KEY|OPENCODE_API_KEY)\s*=\s*(.+?)\s*$/);
    if (m) return m[2].replace(/^["']|["']$/g, '');
  }
  console.error('.env 에 ZEN_API_KEY 가 없습니다.');
  process.exit(2);
}
const KEY = readKey();

const SYSTEM = [
  '당신은 한국 중·고등학교 교사를 돕는 쌤핀의 비서입니다.',
  '학생 개인 정보(이름·명단·개별 이력)는 조회할 수 없습니다. 집계 수치만 다룹니다.',
  '필요하면 제공된 도구를 사용해 숫자를 확인한 뒤 한국어로 간결하게 답하세요.',
].join('\n');

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
          className: { type: 'string', description: '학급 이름' },
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
      description: '학급의 학생 인원 수를 반환한다. 명단은 반환하지 않는다.',
      parameters: {
        type: 'object',
        properties: { className: { type: 'string' } },
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
        properties: { className: { type: 'string' }, period: { type: 'string' } },
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
        properties: { dueWithinDays: { type: 'number' } },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// 지어낸 도구 결과 — 1등급(집계 수치)만
const FAKE = {
  get_attendance_summary: {
    date: 'today',
    className: '3학년 2반',
    present: 26,
    absent: 1,
    late: 2,
    early: 0,
    sick: 1,
  },
  count_students: { className: '3학년 2반', count: 30 },
  list_classes: { classes: [{ name: '3학년 2반' }, { name: '1학년 4반' }, { name: '2학년 5반' }] },
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
  get_my_todos: {
    items: [
      { title: '수행평가 채점', due: '2026-08-20', done: false },
      { title: '학년 협의회 자료 준비', due: '2026-08-21', done: false },
    ],
  },
};

const QUESTIONS = [
  '오늘 3학년 2반 출결 어때요?',
  '이번 달 3학년 2반 기록 몇 건 썼나요?',
  '제가 맡은 학급 목록이랑 3학년 2반 인원 알려주세요.',
  '이번 주 마감인 할 일 정리해 주세요.',
  '어제 1학년 4반 결석 몇 명이었죠?',
];

async function chat(messages) {
  const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, max_tokens: 800 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  return { msg: body.choices?.[0]?.message, usage: body.usage ?? {} };
}

async function oneRound(question) {
  const started = Date.now();
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: question },
  ];
  let promptTokens = 0;
  let completionTokens = 0;
  let modelCalls = 0;

  const first = await chat(messages);
  modelCalls++;
  promptTokens += first.usage.prompt_tokens ?? 0;
  completionTokens += first.usage.completion_tokens ?? 0;

  const toolCalls = first.msg?.tool_calls ?? [];
  let answer = first.msg?.content ?? '';

  if (toolCalls.length) {
    messages.push(first.msg);
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(FAKE[name] ?? { error: '알 수 없는 도구' }),
      });
    }
    const second = await chat(messages);
    modelCalls++;
    promptTokens += second.usage.prompt_tokens ?? 0;
    completionTokens += second.usage.completion_tokens ?? 0;
    answer = second.msg?.content ?? '';
  }

  return {
    question,
    toolCalls: toolCalls.map((t) => t.function?.name),
    modelCalls,
    promptTokens,
    completionTokens,
    elapsedMs: Date.now() - started,
    answerPreview: String(answer).replace(/\s+/g, ' ').slice(0, 70),
  };
}

const rows = [];
console.log(`실측 ③ — 질문 1건당 토큰·비용   모델: ${MODEL}\n`);
for (const q of QUESTIONS) {
  try {
    const r = await oneRound(q);
    rows.push(r);
    console.log(
      `  ✓ 입력 ${String(r.promptTokens).padStart(5)} / 출력 ${String(r.completionTokens).padStart(4)}` +
        ` · 모델호출 ${r.modelCalls}회 · ${(r.elapsedMs / 1000).toFixed(1)}초  ${q.slice(0, 24)}`,
    );
  } catch (e) {
    console.log(`  ✗ ${q.slice(0, 24)} — ${e.message}`);
    rows.push({ question: q, error: e.message });
  }
}

const ok = rows.filter((r) => !r.error);
if (!ok.length) {
  console.error('\n성공한 왕복이 없습니다.');
  process.exit(1);
}
const avgIn = ok.reduce((s, r) => s + r.promptTokens, 0) / ok.length;
const avgOut = ok.reduce((s, r) => s + r.completionTokens, 0) / ok.length;
const p = PRICES[MODEL];
const perQ = p ? (avgIn * p.in + avgOut * p.out) / 1e6 : null;

console.log('\n── 질문 1건 평균 ──');
console.log(`  입력 ${avgIn.toFixed(0)} 토큰 / 출력 ${avgOut.toFixed(0)} 토큰`);
if (perQ !== null) {
  console.log(`  단가 $${p.in}/$${p.out} (100만 토큰당) → 질문 1건 $${perQ.toFixed(6)}`);
  console.log(`  $20 으로 약 ${Math.round(20 / perQ).toLocaleString('en-US')} 건`);
  for (const [teachers, perDay] of [
    [100, 5],
    [500, 5],
    [1000, 5],
  ]) {
    const monthly = teachers * perDay * 20 * perQ;
    console.log(`  교사 ${teachers}명 × 하루 ${perDay}건 × 월 20일 → 월 $${monthly.toFixed(2)}`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `measure-3-cost-${MODEL}.json`);
writeFileSync(
  out,
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      model: MODEL,
      price: p,
      avgPromptTokens: avgIn,
      avgCompletionTokens: avgOut,
      costPerQuestionUsd: perQ,
      rows,
    },
    null,
    2,
  ),
  'utf8',
);
console.log(`\n원자료 저장: ${path.relative(REPO_ROOT, out)}`);
