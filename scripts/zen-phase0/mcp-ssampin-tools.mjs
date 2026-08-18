#!/usr/bin/env node
/**
 * Phase 0 실측용 가짜 도구 서버 (MCP, stdio)
 *
 * 계획서 §4.2의 1등급 도구 5종을 그대로 흉내 낸다. 실제 데이터는 없고 전부 지어낸 값이다.
 * opencode CLI가 이 서버를 물고 돌면서 어떤 도구를 골랐는지 기록만 남긴다.
 *
 * 기록: MCP_LOG 환경변수가 가리키는 파일에 JSONL 한 줄씩.
 * 의존성 없음 — JSON-RPC를 직접 처리한다.
 */

import { appendFileSync } from 'node:fs';

const LOG = process.env.MCP_LOG;
const TAG = process.env.MCP_TAG || '';

const TOOLS = [
  {
    name: 'get_attendance_summary',
    description:
      '특정 날짜, 특정 학급의 출결 집계(인원 수)를 조회한다. 학생 이름은 반환하지 않는다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '조회 날짜 (YYYY-MM-DD). 오늘이면 today' },
        className: { type: 'string', description: '학급 이름 (예: 3학년 2반)' },
      },
      required: ['date', 'className'],
      additionalProperties: false,
    },
  },
  {
    name: 'count_students',
    description: '학급의 학생 인원 수를 반환한다. 명단(이름 목록)은 반환하지 않는다.',
    inputSchema: {
      type: 'object',
      properties: { className: { type: 'string', description: '학급 이름 (예: 3학년 2반)' } },
      required: ['className'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_classes',
    description: '교사가 담당하는 학급 목록을 반환한다.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_records_stats',
    description: '학급의 관찰 기록 건수와 카테고리별 분포를 반환한다. 기록 본문은 반환하지 않는다.',
    inputSchema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: '학급 이름' },
        period: { type: 'string', description: '기간 (this_month, this_semester 중 하나)' },
      },
      required: ['className', 'period'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_todos',
    description: '교사 본인의 할 일 목록을 반환한다.',
    inputSchema: {
      type: 'object',
      properties: { dueWithinDays: { type: 'number', description: '마감까지 남은 일수 상한' } },
      required: [],
      additionalProperties: false,
    },
  },
];

// 지어낸 반환값 — 계획서 §4.2의 화이트리스트 필드만 담는다
const RESULTS = {
  get_attendance_summary: (a) => ({
    date: a?.date ?? 'today',
    className: a?.className ?? '3학년 2반',
    present: 26,
    absent: 1,
    late: 2,
    early: 0,
    sick: 1,
  }),
  count_students: (a) => ({ className: a?.className ?? '3학년 2반', count: 30 }),
  list_classes: () => ({
    classes: [
      { id: 'c1', name: '3학년 2반', grade: 3, classNum: 2 },
      { id: 'c2', name: '1학년 4반', grade: 1, classNum: 4 },
      { id: 'c3', name: '2학년 5반', grade: 2, classNum: 5 },
    ],
  }),
  get_records_stats: (a) => ({
    className: a?.className ?? '3학년 2반',
    period: a?.period ?? 'this_month',
    total: 18,
    byCategory: [
      { category: '학습', count: 9 },
      { category: '생활', count: 6 },
      { category: '진로', count: 3 },
    ],
  }),
  get_my_todos: () => ({
    items: [
      { title: '수행평가 채점', due: '2026-08-20', done: false },
      { title: '학년 협의회 자료 준비', due: '2026-08-21', done: false },
    ],
  }),
};

function log(entry) {
  if (!LOG) return;
  try {
    appendFileSync(
      LOG,
      JSON.stringify({ tag: TAG, at: new Date().toISOString(), ...entry }) + '\n',
      'utf8',
    );
  } catch {
    /* 기록 실패는 측정을 막지 않는다 */
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ssampin-phase0-tools', version: '0.1.0' },
      },
    };
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const known = TOOLS.some((t) => t.name === name);
    log({ event: 'tool_call', name, args, known });

    if (!known) {
      return {
        jsonrpc: '2.0',
        id,
        result: { isError: true, content: [{ type: 'text', text: `알 수 없는 도구: ${name}` }] },
      };
    }
    const payload = RESULTS[name](args);
    return {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
    };
  }

  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
  if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };

  if (id === undefined) return null; // 알림(notification)은 응답하지 않는다
  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `지원하지 않는 메서드: ${method}` },
  };
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      continue;
    }
    const res = handle(req);
    if (res) send(res);
  }
});
