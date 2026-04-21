#!/usr/bin/env node
/**
 * POC 출력 PDF 에서 한글 텍스트 추출 검증.
 * pdfjs-dist 를 사용하여 실제 페이지 text content 를 파싱한다.
 *
 * 성공 기준: 입력한 한글 문자열의 최소 70% 이상이 추출되어야 함.
 *   - 100% 매칭 기대하지만 pdfme 의 줄바꿈/공백 처리로 일부 불일치 허용.
 *   - "쌤" 같은 희귀 글리프가 제대로 나오는 것이 핵심.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const PDF_PATH = join(REPO_ROOT, 'scripts/font-subset/.cache/poc-output.pdf');

// pdfjs-dist legacy build — Node 환경용
const { getDocument } = await import(
  'pdfjs-dist/legacy/build/pdf.mjs'
);

async function main() {
  console.log('=== Korean text extraction verification ===');
  console.log(`대상: ${PDF_PATH}`);

  const pdfBytes = readFileSync(PDF_PATH);
  console.log(`크기: ${(pdfBytes.length / 1024).toFixed(1)} KB`);

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  console.log(`페이지 수: ${doc.numPages}`);

  const expectedStrings = [
    '쌤핀',
    '안녕하세요',
    '홍길동',
    '국어',
    '쌤핀(SsamPin)',
    '담임',
    '수학',
    '과학',
  ];

  let allText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    console.log(`\n--- 페이지 ${i} ---`);
    console.log(pageText);
    allText += ' ' + pageText;
  }

  console.log('\n=== 한글 매칭 결과 ===');
  let matched = 0;
  const missing = [];
  for (const s of expectedStrings) {
    if (allText.includes(s)) {
      console.log(`  ✅ "${s}"`);
      matched++;
    } else {
      console.log(`  ❌ "${s}" 누락`);
      missing.push(s);
    }
  }

  const ratio = matched / expectedStrings.length;
  console.log(
    `\n매칭율: ${matched}/${expectedStrings.length} = ${(ratio * 100).toFixed(0)}%`,
  );

  if (ratio < 0.7) {
    console.error('❌ POC FAIL: 한글 텍스트 추출률 70% 미만 → Plan B 전환 검토');
    process.exit(1);
  }

  console.log('\n=== POC SUCCESS ===');
  console.log('✅ pdfme + Noto Sans KR 서브셋으로 한글 PDF 생성·텍스트 추출 성공');
  console.log('→ Day 2 진행 가능 (Plan A 유지)');
}

main().catch((err) => {
  console.error('verification 실패:', err);
  process.exit(1);
});
