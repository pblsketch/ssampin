/**
 * 업스테이지 Solar API 연결 점검
 *
 * 사용법: node scripts/test-upstage.mjs
 *   .env 또는 .env.local 에 UPSTAGE_API_KEY 를 넣어두면 읽어옵니다.
 *   (환경변수로 직접 넘겨도 됩니다: UPSTAGE_API_KEY=... node scripts/test-upstage.mjs)
 *
 * 확인 항목 — 챗봇(_shared/chatLlm.ts)이 실제로 보내는 것과 같은 요청을 그대로 쏜다.
 *   1) 계정에서 쓸 수 있는 모델 목록
 *   2) 설정된 모델(기본 solar-pro3)로 실제 답변이 오는지
 *   3) reasoning_effort 옵션을 받아주는지 (챗봇 최종 답변이 'low' 로 보냄)
 *   4) 한국어 품질 눈으로 확인
 *
 * ⚠️ API 키는 절대 출력하지 않습니다.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── .env 로딩 (scripts/test-chatbot.ts 와 동일 방식) ──────────
for (const envPath of ['.env.local', '.env']) {
  const fullPath = path.resolve(process.cwd(), envPath);
  if (!fs.existsSync(fullPath)) continue;
  for (const line of fs.readFileSync(fullPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const API_KEY = process.env.UPSTAGE_API_KEY;
const BASE_URL = (process.env.UPSTAGE_BASE_URL ?? 'https://api.upstage.ai/v1').replace(/\/+$/, '');
const MODEL = process.env.UPSTAGE_MODEL ?? 'solar-pro3';

if (!API_KEY) {
  console.error('❌ UPSTAGE_API_KEY 가 없습니다. .env 에 UPSTAGE_API_KEY=... 를 넣어주세요.');
  process.exit(1);
}

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
};

let failed = 0;

function report(label, ok, detail) {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

// ── 1. 사용 가능한 모델 목록 ──────────────────────────────
console.log(`\n[1] 모델 목록 조회  (${BASE_URL}/models)`);
try {
  const res = await fetch(`${BASE_URL}/models`, { headers: authHeaders });
  if (!res.ok) {
    report('모델 목록', false, `HTTP ${res.status} ${await res.text()}`);
  } else {
    const json = await res.json();
    const ids = (json.data ?? []).map((m) => m.id).sort();
    report('모델 목록', true, `${ids.length}개`);
    console.log(`    ${ids.join(', ') || '(비어 있음)'}`);
    report(`'${MODEL}' 사용 가능`, ids.includes(MODEL), ids.includes(MODEL) ? '' : '목록에 없음');
  }
} catch (error) {
  report('모델 목록', false, String(error));
}

// ── 2·3. 챗봇과 동일한 요청 (reasoning_effort 포함 / 미포함) ──
async function chat(label, body) {
  console.log(`\n[${label}]`);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const elapsed = Date.now() - started;
    if (!res.ok) {
      report(label, false, `HTTP ${res.status} ${await res.text()}`);
      return null;
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    report(label, text.length > 0, `${elapsed}ms, ${text.length}자`);
    if (json.usage) console.log(`    usage: ${JSON.stringify(json.usage)}`);
    if (text) console.log(`    답변: ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`);
    return text;
  } catch (error) {
    report(label, false, String(error));
    return null;
  }
}

const QUESTION = [
  {
    role: 'system',
    content:
      "당신은 '쌤핀' 교사용 앱의 AI 도우미입니다. 한국어 존댓말로 간결하게 답하고, 이모지를 적절히 씁니다.",
  },
  { role: 'user', content: '쌤핀에서 시간표는 어디서 불러오나요? 두세 문장으로 알려주세요.' },
];

await chat('2] reasoning_effort 포함 (챗봇 최종 답변과 동일 조건)', {
  model: MODEL,
  messages: QUESTION,
  temperature: 0.3,
  max_tokens: 2048 + 1024,
  reasoning_effort: 'low',
});

await chat('3] reasoning_effort 미포함 (400 발생 시 폴백 경로)', {
  model: MODEL,
  messages: QUESTION,
  temperature: 0.3,
  max_tokens: 2048,
});

await chat("4] 'minimal' 추론 (HyDE·문서 재정렬 조건)", {
  model: MODEL,
  messages: [{ role: 'user', content: '쌤핀 교사용 앱의 출결 기능을 두 문장으로 설명하세요.' }],
  temperature: 1.0,
  max_tokens: 200 + 1024,
  reasoning_effort: 'minimal',
});

console.log(
  failed === 0
    ? '\n🎉 전부 통과 — 챗봇이 보내는 요청 형태를 업스테이지가 그대로 받아줍니다.'
    : `\n⚠️ ${failed}건 실패 — 위 오류 내용을 확인하세요.`,
);
process.exit(failed === 0 ? 0 : 1);
