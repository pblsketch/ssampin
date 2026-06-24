#!/usr/bin/env node
/**
 * AI 브릿지 쓰기 계약 코드 생성기.
 *
 * 단일 정의(scripts/contract/aiBridgeWriteContract.def.mjs) → 빌드 트리별 3산출:
 *   ⓐ src/domain/contracts/aiBridgeWriteContract.ts    (renderer 트리)
 *   ⓑ electron/ipc/_generated/aiBridgeWriteContract.ts (electron main 트리, rootDir:electron 준수)
 *   ⓒ contracts/aiBridgeWriteContract.json             (크로스레포 스냅샷; 브릿지 레포가 참조)
 *
 * 실행: `npm run gen:contract`  ·  정합 검사: `npm run check:contract-sync`
 *
 * 산출 내용은 `buildOutputs()` 한 곳에서만 만든다 → 생성기와 체크 스크립트가 동일 렌더러를 공유,
 * 바이트 단위 비교로 "def 만 고치고 재생성 안 함" 류의 drift 를 빌드에서 잡는다.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AI_BRIDGE_WRITE_CONTRACT } from './contract/aiBridgeWriteContract.def.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const RENDERER_TS = resolve(ROOT, 'src/domain/contracts/aiBridgeWriteContract.ts');
const ELECTRON_TS = resolve(ROOT, 'electron/ipc/_generated/aiBridgeWriteContract.ts');
const JSON_OUT = resolve(ROOT, 'contracts/aiBridgeWriteContract.json');

/** 문자열 배열을 안정적인 멀티라인 `as const` 리터럴로 렌더(결정적 — def 값에만 의존). */
function arrLiteral(values) {
  return `[\n${values.map((v) => `  ${JSON.stringify(v)},`).join('\n')}\n]`;
}

/** 생성될 TypeScript 본문(ⓐ·ⓑ 동일). */
function renderTs() {
  const c = AI_BRIDGE_WRITE_CONTRACT;
  return `/* eslint-disable */
/**
 * 생성 파일 — 직접 수정 금지.
 * 원천: scripts/contract/aiBridgeWriteContract.def.mjs
 * 재생성: npm run gen:contract  ·  정합 검사: npm run check:contract-sync
 */

export const WRITE_DOMAINS = ${arrLiteral(c.WRITE_DOMAINS)} as const;
export type WriteDomain = (typeof WRITE_DOMAINS)[number];

export const WRITE_OPS = ${arrLiteral(c.WRITE_OPS)} as const;
export type WriteOp = (typeof WRITE_OPS)[number];

export const OBSERVATION_FIELDS = ${arrLiteral(c.OBSERVATION_FIELDS)} as const;
export const OBSERVATION_CONTENT_MAX = ${c.OBSERVATION_CONTENT_MAX};

export const RECORD_NOTE_FIELDS = ${arrLiteral(c.RECORD_NOTE_FIELDS)} as const;
export const RECORD_NOTE_CONTENT_MAX = ${c.RECORD_NOTE_CONTENT_MAX};

export const ATTENDANCE_STATUSES = ${arrLiteral(c.ATTENDANCE_STATUSES)} as const;
export const ATTENDANCE_REASONS = ${arrLiteral(c.ATTENDANCE_REASONS)} as const;

/** 식별키 형식 계약(고정 — 회귀 가드 대상). */
export const IDENTITY_KEY_CONTRACT = {
  homeroomStudentId: ${JSON.stringify(c.IDENTITY_KEY_CONTRACT.homeroomStudentId)},
  classObservationStudentKey: ${JSON.stringify(c.IDENTITY_KEY_CONTRACT.classObservationStudentKey)},
  attendanceMatch: ${JSON.stringify(c.IDENTITY_KEY_CONTRACT.attendanceMatch)},
} as const;
`;
}

/** 생성될 JSON 본문(ⓒ). */
function renderJson() {
  return JSON.stringify(AI_BRIDGE_WRITE_CONTRACT, null, 2) + '\n';
}

/** 3산출의 (경로, 내용) 목록 — 생성기·체크가 공유하는 단일 렌더러. */
export function buildOutputs() {
  const ts = renderTs();
  return [
    { path: RENDERER_TS, content: ts },
    { path: ELECTRON_TS, content: ts },
    { path: JSON_OUT, content: renderJson() },
  ];
}

function writeOutputs() {
  for (const { path, content } of buildOutputs()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf-8');
    console.log(`✓ generated ${path}`);
  }
}

// 직접 실행(`node scripts/gen-bridge-contract.mjs`)일 때만 파일을 쓴다 — import 시엔 부작용 없음.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  writeOutputs();
}
