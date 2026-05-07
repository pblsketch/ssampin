#!/usr/bin/env node
/**
 * release-notes.json → Threads 8타래 변환기 (Layer 3 D-09).
 *
 * Plan: docs/01-plan/features/update-notification-friendliness.plan.md
 * Design: docs/02-design/features/update-notification-friendliness.design.md §3.2
 * 카피 가이드: docs/release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md (4슬롯)
 * Threads 톤 가이드: docs/release-notes-assets/THREADS-POST-STYLE.md (락)
 *
 * 사용법:
 *   node scripts/release-notes-to-threads.mjs --version 2.0.4
 *     → docs/release-notes-assets/v2.0.4/threads-post.md 생성
 *
 *   node scripts/release-notes-to-threads.mjs --version 2.0.3 --dry-run
 *     → stdout으로 출력 (검증용)
 *
 *   node scripts/release-notes-to-threads.mjs --version 2.0.4 --out custom.md
 *
 * 매핑 규칙:
 *   Thread 1 (인트로): 버전·날짜·highlights[] 6개 풀 노출
 *   Thread 2~N (콘텐츠, 최대 6): changes[] 중 type !== 'change' 항목
 *     · 4슬롯 description (lead/bullets/how/closer) 자동 매핑
 *     · 단일 문단 폴백: 구버전 description은 lead만
 *   Thread N (아웃트로): 락된 CTA 템플릿 (THREADS-POST-STYLE.md §7)
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// ── parseDescription (src/usecases/releaseNotes/parseDescription.ts 미러) ─
//   Layer 2 SSOT 모듈을 .mjs에서 import할 수 없어 동일 로직 인라인.
//   변경 시 양쪽 동기화 필요. (DRY 부채 — 향후 .js 모듈로 추출 검토)

const BULLET_L1_RE = /^· /;
const BULLET_L2_RE = /^ {2}◦ /;

function parseInlineMarks(text) {
  const result = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match;

  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      result.push({ kind: 'text', value: text.slice(lastIdx, match.index) });
    }
    result.push({ kind: 'bold', value: match[1] ?? '' });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    result.push({ kind: 'text', value: text.slice(lastIdx) });
  }

  if (result.length === 0) {
    result.push({ kind: 'text', value: text });
  }

  return result;
}

function parseDescription(description) {
  if (!description || description.trim() === '') return [];

  // 구버전 단일 문단 폴백
  if (!description.includes('\n\n')) {
    return [{ type: 'paragraph', content: parseInlineMarks(description.trim()) }];
  }

  const slots = description
    .split('\n\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return slots.map((slot) => {
    const lines = slot.split('\n');
    const allBullets = lines.every(
      (l) => BULLET_L1_RE.test(l) || BULLET_L2_RE.test(l),
    );

    if (allBullets) {
      return {
        type: 'bulletList',
        items: lines.map((l) => {
          if (BULLET_L2_RE.test(l)) {
            return { level: 2, nodes: parseInlineMarks(l.replace(BULLET_L2_RE, '')) };
          }
          return { level: 1, nodes: parseInlineMarks(l.replace(BULLET_L1_RE, '')) };
        }),
      };
    }

    return { type: 'paragraph', content: parseInlineMarks(lines.join(' ')) };
  });
}

// ── 인라인 노드 → 평문 텍스트 (Threads는 마크다운 미지원) ─────────────────

function inlineToText(nodes) {
  return nodes.map((n) => n.value).join('');
}

// ── 슬롯 추출 ───────────────────────────────────────────────────────────────

/**
 * 4슬롯 description의 슬롯별 텍스트 추출.
 * 폴백: 단일 문단이면 lead만 채움.
 */
function extractSlots(description) {
  const nodes = parseDescription(description);
  const slots = { lead: '', bullets: [], how: '', closer: '' };
  if (nodes.length === 0) return slots;

  // 단일 문단 폴백
  if (nodes.length === 1 && nodes[0].type === 'paragraph') {
    slots.lead = inlineToText(nodes[0].content);
    return slots;
  }

  // 4슬롯 정규 패턴
  const paragraphs = [];
  let bulletList = null;

  for (const node of nodes) {
    if (node.type === 'paragraph') paragraphs.push(inlineToText(node.content));
    else if (node.type === 'bulletList' && !bulletList) {
      bulletList = node.items.map((it) => inlineToText(it.nodes));
    }
  }

  // paragraphs[0] = lead, paragraphs[1] = how, paragraphs[2] = closer (있으면)
  // bullets는 가장 첫 번째 bulletList
  slots.lead = paragraphs[0] ?? '';
  slots.bullets = bulletList ?? [];
  slots.how = paragraphs[1] ?? '';
  slots.closer = paragraphs[2] ?? paragraphs[1] ?? ''; // closer 없으면 마무리는 how가 대신
  // closer가 how와 같다면 비워서 중복 방지
  if (slots.closer === slots.how) slots.closer = '';

  return slots;
}

// ── Thread 본문 생성 ────────────────────────────────────────────────────────

function generateHeader(ver) {
  const dateFmt = ver.date.replace(/-/g, '.');
  return [
    `# 쌤핀 v${ver.version} Threads 타래 게시글`,
    '',
    `> **사용법**: 각 타래(Thread 1~8)를 순서대로 Threads에 게시하고, **각 타래에 대응하는 카드 이미지를 첨부**하세요. Thread 2~8은 Thread 1의 답글(reply)로 연결해 타래로 만듭니다.`,
    `> **첨부 이미지**: \`cards/01-intro.png\` ~ \`cards/0N-outro.png\` (카드뉴스 제작 후 첨부)`,
    `> **글자 수**: 각 포스트 500자 이내 (Threads 제한)`,
    `> **버전**: v${ver.version} (${dateFmt} 릴리즈) — ${ver.highlights?.[0]?.replace(/^[^\s]+\s/, '') ?? ''}`,
    '',
    `> ⚙️ 자동 생성: \`scripts/release-notes-to-threads.mjs\`. 매 릴리즈마다 자동 출력 → 사람 검수 → 발행 순서.`,
  ].join('\n');
}

function generateThread1(ver) {
  const dateFmt = ver.date.replace(/-/g, '.');
  // highlights[0]에서 이모지·em-dash 제거 후 컨셉 추출
  const concept = (ver.highlights?.[0] ?? '').replace(/^[^\s]+\s/, '').split('—')[0].trim();
  const conceptLine = concept ? `이번엔 '${concept}' 하는 마음으로 ${ver.changes.length}가지를 손봤어요.` : `이번 버전에서 ${ver.changes.length}가지를 정비했어요.`;

  const bullets = (ver.highlights ?? []).map((h) => `• ${h}`).join('\n');

  return [
    `## Thread 1 (메인 포스트)`,
    `**첨부 이미지**: \`cards/01-intro.png\``,
    '',
    '```',
    `쌤핀 v${ver.version} 업데이트 📌 (${dateFmt} 릴리즈)`,
    '',
    conceptLine,
    '',
    bullets,
    '',
    `아래 타래에서 하나씩 풀게요 👇`,
    '',
    `#쌤핀 #교사앱 #업데이트`,
    '```',
  ].join('\n');
}

function generateContentThread(change, index, totalThreads) {
  const slots = extractSlots(change.description);
  // 첫 줄 후킹: change.title — slot.lead의 첫 문장 (40자 이하일 때만)
  const leadFirst = slots.lead.split(/[.!?]/)[0]?.trim() ?? '';
  const isLeadShort = leadFirst.length > 0 && leadFirst.length <= 40 && leadFirst !== change.title;
  const headline = isLeadShort
    ? `${index}. ${change.title} — ${leadFirst}`
    : `${index}. ${change.title}`;

  // 본문 구성
  const body = [];
  if (slots.lead) body.push(slots.lead);
  if (slots.bullets.length > 0) {
    body.push('');
    body.push(slots.bullets.map((b) => `· ${b}`).join('\n'));
  }
  if (slots.how) {
    body.push('');
    body.push(slots.how);
  }
  if (slots.closer) {
    body.push('');
    body.push(slots.closer);
  }

  // type별 보조 강조 (fix는 ⭐ 한 번 첫 줄 끝에)
  const headlineWithEmoji = change.type === 'fix' ? `${headline} ⭐` : headline;

  return [
    `## Thread ${index + 1} (답글 ${index} / 총 ${totalThreads}장 중 ${index + 1})`,
    `**첨부 이미지**: \`cards/0${index + 1}-${slugify(change.title)}.png\``,
    '',
    '```',
    headlineWithEmoji,
    '',
    body.join('\n'),
    '```',
  ].join('\n');
}

function generateOutroThread(totalThreads) {
  return [
    `## Thread ${totalThreads} (아웃트로 / CTA)`,
    `**첨부 이미지**: \`cards/0${totalThreads}-outro.png\``,
    '',
    '```',
    `지금 바로 업데이트해 보세요 🔔`,
    '',
    `쌤핀 데스크톱 앱 · ssampin.com`,
    '',
    `업데이트는 앱 설정 > 앱 정보에서 확인하거나, 위 링크에서 최신 버전을 다운로드하실 수 있어요. 자동 업데이트 알림도 곧 표시됩니다.`,
    '',
    `수업과 업무에서 써보시고 피드백 주시면 다음 버전에 바로 반영하겠습니다. 감사합니다 🙌`,
    '',
    `#쌤핀 #SsamPin #교사도구 #교육 #EdTech`,
    '```',
  ].join('\n');
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30);
}

// ── 메인 ────────────────────────────────────────────────────────────────────

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'dry-run': { type: 'boolean' },
      out: { type: 'string' },
    },
  });

  if (!values.version) {
    console.error('Usage: node scripts/release-notes-to-threads.mjs --version <ver> [--dry-run] [--out <path>]');
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');
  const inputPath = path.join(repoRoot, 'public', 'release-notes.json');

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const ver = data.versions.find((v) => v.version === values.version);

  if (!ver) {
    console.error(`Version ${values.version} not found in ${inputPath}`);
    console.error(`Available: ${data.versions.slice(0, 5).map((v) => v.version).join(', ')}, ...`);
    process.exit(1);
  }

  // type=change는 Threads 콘텐츠 타래로 노출 안 함 (Design §3.5)
  // 콘텐츠 카드는 최대 6개
  const contentChanges = ver.changes
    .filter((c) => c.type !== 'change')
    .slice(0, 6);

  const totalThreads = 1 + contentChanges.length + 1; // intro + content + outro

  const sections = [
    generateHeader(ver),
    '',
    '---',
    '',
    generateThread1(ver),
    '',
    '---',
    '',
    ...contentChanges.flatMap((c, i) => [generateContentThread(c, i + 1, totalThreads), '', '---', '']),
    generateOutroThread(totalThreads),
    '',
  ];

  const output = sections.join('\n');

  if (values['dry-run']) {
    process.stdout.write(output);
    return;
  }

  const outPath = values.out
    ? path.resolve(values.out)
    : path.join(repoRoot, 'docs', 'release-notes-assets', `v${ver.version}`, 'threads-post.md');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, 'utf8');
  console.error(`✅ Wrote ${outPath} (${output.length} bytes, ${totalThreads} threads)`);
}

main();
