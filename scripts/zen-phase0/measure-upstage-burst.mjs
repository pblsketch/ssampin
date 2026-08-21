#!/usr/bin/env node
/**
 * 업스테이지 연속 호출 한도 실측 — Zen 무료 모델이 죽었던 지점(측정 4 §2)과 같은 조건.
 * 20건을 간격 없이 연속으로 쏘고 상태코드 분포와 남은 한도를 본다.
 * 실제 학생 데이터는 보내지 않는다. 키는 출력하지 않는다.
 */
import { readFileSync } from 'node:fs';
// 공급자 교체 가능: LLM_BASE_URL / LLM_KEY_NAME (기본값 업스테이지)
const BASE = process.env.LLM_BASE_URL || 'https://api.upstage.ai/v1';
const KEY_NAME = process.env.LLM_KEY_NAME || 'UPSTAGE_API_KEY';
const KEY = (() => {
  for (const l of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/[\r\n]+/)) {
    const eq = l.indexOf('=');
    if (eq < 0) continue;
    if (l.slice(0, eq).trim() !== KEY_NAME) continue;
    return l
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return null;
})();
if (!KEY) {
  console.error('no key');
  process.exit(2);
}

const N = Number(process.argv[2] || 20);
const MODEL = process.argv[3] || 'solar-pro3';

const one = async (i) => {
  const t = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: `${i}번 질문: 2 더하기 3은? 숫자만 답하세요.` }],
      max_tokens: 16,
      temperature: 0,
    }),
  });
  const h = {};
  for (const [k, v] of r.headers.entries()) if (/ratelimit|retry-after/i.test(k)) h[k] = v;
  const body = await r.text();
  return { i, status: r.status, ms: Date.now() - t, h, err: r.ok ? null : body.slice(0, 200) };
};

const res = await Promise.all(Array.from({ length: N }, (_, i) => one(i + 1)));
const by = {};
for (const r of res) by[r.status] = (by[r.status] || 0) + 1;
const lat = res
  .filter((r) => r.status === 200)
  .map((r) => r.ms)
  .sort((a, b) => a - b);
console.log('model:', MODEL, '| concurrent:', N);
console.log('status:', JSON.stringify(by));
console.log(
  'latency ms (200 only): min',
  lat[0],
  'median',
  lat[Math.floor(lat.length / 2)],
  'max',
  lat[lat.length - 1],
);
const last = res[res.length - 1].h;
console.log(
  'remaining req:',
  last['x-upstage-ratelimit-remaining-requests'],
  '/ limit',
  last['x-upstage-ratelimit-limit-requests'],
);
console.log(
  'remaining tok:',
  last['x-upstage-ratelimit-remaining-tokens'],
  '/ limit',
  last['x-upstage-ratelimit-limit-tokens'],
);
const fails = res.filter((r) => r.status !== 200);
if (fails.length) console.log('failures:', JSON.stringify(fails.slice(0, 3), null, 2));
