/* global console */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const contentPath = path.join(root, 'src/content/docs.ts');
const content = readFileSync(contentPath, 'utf8');
const releaseNotesPath = path.join(root, '..', 'public/release-notes.json');
const releaseNotesContent = existsSync(releaseNotesPath)
  ? readFileSync(releaseNotesPath, 'utf8')
  : '';
const publicSurfaceContent = `${content}\n${releaseNotesContent}`;

const failures = [];

function fail(message) {
  failures.push(message);
}

const slugMatches = [...content.matchAll(/slug:\s*'([^']+)'/g)].map((match) => match[1]);
const slugs = new Set(slugMatches);

if (slugMatches.length === 0) {
  fail('문서 slug를 찾지 못했습니다.');
}

for (const slug of slugMatches) {
  if (slugMatches.filter((item) => item === slug).length > 1) {
    fail(`중복 slug: ${slug}`);
  }
}

const navMatches = [...content.matchAll(/items:\s*\[([\s\S]*?)\]/g)]
  .flatMap((match) => [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))
  .filter((item) => item.includes('/') || /^[a-z]/.test(item));

for (const item of navMatches) {
  if (!slugs.has(item)) {
    fail(`문서 내비게이션에 없는 slug가 있습니다: ${item}`);
  }
}

const hrefMatches = [...content.matchAll(/href:\s*'\/docs(?:\/([^']+))?'/g)].map(
  (match) => match[1] ?? '',
);

for (const hrefSlug of hrefMatches) {
  if (hrefSlug !== '' && !slugs.has(hrefSlug)) {
    fail(`깨진 문서 링크: /docs/${hrefSlug}`);
  }
}

const imageMatches = [...content.matchAll(/src:\s*'\/docs\/screenshots\/([^']+)'/g)].map(
  (match) => match[1],
);

for (const imageName of imageMatches) {
  const imagePath = path.join(root, 'public/docs/screenshots', imageName);
  if (!existsSync(imagePath)) {
    fail(`없는 문서 이미지: ${imageName}`);
  }
}

const requiredSearchTerms = [
  '보안 경고',
  'V3',
  '시간표',
  'Google Drive',
  'Google Tasks',
  'AI 브릿지',
  '자료 첨부',
  '좌석배치',
];

for (const term of requiredSearchTerms) {
  if (!content.includes(term)) {
    fail(`필수 검색어가 문서 콘텐츠에 없습니다: ${term}`);
  }
}

if (content.includes('1.7.6')) {
  fail('공개 문서 콘텐츠에 오래된 버전 표기 1.7.6이 남아 있습니다.');
}

if (publicSurfaceContent.includes('supsori.notion.site/SsamPin')) {
  fail('공개 문서 콘텐츠에 기존 Notion 사용자 가이드 링크가 남아 있습니다.');
}

const bannedPublicPhrases = [
  '오래된 문서',
  '이전 가이드',
  '새 문서',
  '현재 코드 기준',
  '15가지, 17가지',
  '문서 근거',
  'sourceRefs',
  'Notion 1장',
  '노션 사용 가이드',
];

for (const phrase of bannedPublicPhrases) {
  if (publicSurfaceContent.includes(phrase)) {
    fail(`사용자에게 노출하지 않을 내부 문구가 남아 있습니다: ${phrase}`);
  }
}

if (failures.length > 0) {
  console.error('docs:check 실패');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `docs:check 통과 — 문서 ${slugs.size}개, 내부 링크 ${hrefMatches.length}개, 이미지 ${imageMatches.length}개 확인`,
);
