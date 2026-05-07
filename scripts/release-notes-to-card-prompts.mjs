#!/usr/bin/env node
/**
 * release-notes.json → 카드뉴스 8장 프롬프트 자동 생성기 (Layer 3 D-10).
 *
 * Plan: docs/01-plan/features/update-notification-friendliness.plan.md
 * Design: docs/02-design/features/update-notification-friendliness.design.md §3.3
 * 카드 스타일: docs/release-notes-assets/CARD-NEWS-STYLE.md (락)
 * 카피 가이드: docs/release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md (4슬롯)
 *
 * 사용법:
 *   node scripts/release-notes-to-card-prompts.mjs --version 2.0.4
 *     → docs/release-notes-assets/v2.0.4/cards/prompts/01~08-*.md 생성
 *
 *   node scripts/release-notes-to-card-prompts.mjs --version 2.0.3 --dry-run
 *     → stdout으로 모든 파일 내용 출력 (검증용)
 *
 *   --force : 기존 파일 덮어쓰기 (기본 false, 충돌 시 abort)
 *
 * 카드 분배 (Design §3.3.1)
 *   01 (인트로) sparse — version + date + highlights[0]
 *   02~07 (콘텐츠 6) sparse — changes[] 6개 (type !== 'change' 우선)
 *   08 (아웃트로) sparse — locked CTA 템플릿
 *
 * 자동 생성된 prompt는 운영자 수동 후편집으로 일러스트 구체화 필요 (Design §3.3.2).
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// ── parseDescription (D6와 동일 미러) ─────────────────────────────────────

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

function inlineToText(nodes) {
  return nodes.map((n) => n.value).join('');
}

function extractSlots(description) {
  const nodes = parseDescription(description);
  const slots = { lead: '', bullets: [], how: '', closer: '' };
  if (nodes.length === 0) return slots;

  if (nodes.length === 1 && nodes[0].type === 'paragraph') {
    slots.lead = inlineToText(nodes[0].content);
    return slots;
  }

  const paragraphs = [];
  let bulletList = null;
  for (const node of nodes) {
    if (node.type === 'paragraph') paragraphs.push(inlineToText(node.content));
    else if (node.type === 'bulletList' && !bulletList) {
      bulletList = node.items.map((it) => inlineToText(it.nodes));
    }
  }
  slots.lead = paragraphs[0] ?? '';
  slots.bullets = bulletList ?? [];
  slots.how = paragraphs[1] ?? '';
  slots.closer = paragraphs[2] ?? '';
  return slots;
}

// ── 일러스트 모티프 사전 (Design §3.3.2) ─────────────────────────────────

const ILLUSTRATION_HINTS = {
  new: [
    '신규 도구·새 화면·새 패턴을 상징하는 monoline 일러스트',
    '예: 새 패널·토글 스위치·플래그·박스',
  ],
  fix: [
    '안전·차단·shield monoline 모티프',
    '예: 방패 + 체크마크·차단 표시·자물쇠',
  ],
  improve: [
    '향상·세련됨·다듬어진 monoline 모티프',
    '예: 가위·붓·샤프닝 스파클·업그레이드 화살표',
  ],
  change: [
    '전환·이전·다른 길 monoline 모티프',
    '예: 화살표·교차로·되돌아오는 곡선',
  ],
};

const TYPE_LABEL = {
  new: '신규',
  fix: '수정',
  improve: '개선',
  change: '변경',
};

const TYPE_COLOR = {
  new: 'amber #F59E0B',
  fix: 'green #10B981',
  improve: 'brand blue #3B82F6',
  change: 'gray #64748B',
};

// ── 슬러그 ────────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30);
}

// ── 프롬프트 생성 ───────────────────────────────────────────────────────────

function frontmatter(version, cardNumber, totalCards, layout = 'sparse') {
  return [
    '---',
    `slug: ssampin-v${version.replace(/\./g, '')}-card-${String(cardNumber).padStart(2, '0')}`,
    `type: image-card`,
    `series: ssampin-v${version.replace(/\./g, '')}`,
    `card_number: ${cardNumber}`,
    `total_cards: ${totalCards}`,
    `aspect: "1:1"`,
    `language: ko`,
    `style: notion`,
    `layout: ${layout}`,
    '---',
    '',
  ].join('\n');
}

const VISUAL_STYLE_BLOCK = [
  '## Visual style (LOCKED — match `cards/01-intro.png` palette and CARD-NEWS-STYLE.md §4)',
  '- **Outer frame**: solid dark navy (#1F2937) ~15–20% border',
  '- **Inner card**: warm off-white canvas (#FAFAF7) large rounded-corner (48–64px radius)',
  '- **Line art**: minimalist hand-drawn monoline, 2pt strokes, deep navy (#1F2937)',
  '- **Color accents**: brand blue (#3B82F6) + amber (#F59E0B) only — no other fills',
  '- Typography: Noto Sans KR',
  '- No gradients, shadows, 3D, photography, realistic humans, emoji',
].join('\n');

function generateIntroCard(ver, totalCards) {
  // 컨셉: highlights[0]에서 이모지 제거 + em-dash 앞 부분
  const concept = (ver.highlights?.[0] ?? '')
    .replace(/^[^\s]+\s/, '')
    .split('—')[0]
    .trim();

  const dateFmt = ver.date.replace(/-/g, '.');

  return [
    frontmatter(ver.version, 1, totalCards),
    `A 1:1 square Instagram/카카오채널/Threads carousel card — **Card 1 of ${totalCards}** — intro/cover card establishing the visual style for all subsequent cards in this SsamPin v${ver.version} release-note series.`,
    '',
    VISUAL_STYLE_BLOCK,
    '',
    '## Content',
    `- **Date pill** at top (soft blue tint #EEF2FF, deep-navy text): "${dateFmt} 릴리즈"`,
    `- **Centered headline** (Noto Sans KR ExtraBold, deep navy #1F2937): "쌤핀 v${ver.version}"`,
    `- **Below headline** (muted #64748B, regular): "${concept}"`,
    `- **Visual anchor** (centered, below subtitle): hand-drawn minimal pushpin (핀) character — friendly small pin with simple smiling face dots-and-curve. Pin head = solid amber (#F59E0B) circle with two tiny navy dot eyes and a thin curved navy smile, body = thin navy monoline with sharp tip pointing down.`,
    `  - Around the pin character, draw a soft dashed-line circular orbit/halo (very faint, monoline) — implying "floating" / "always visible" presence.`,
    `  - Optional: 2~3 tiny sparkle marks (small 4-point stars in monoline, varied sizes) scattered around to suggest "live / 살아있는 신호".`,
    `- **Bottom-left corner**: page indicator "1 / ${totalCards}" in muted slate (#64748B)`,
    '',
    '## Constraints (must match v1.10.x / v2.0.0+ intro cards exactly)',
    '- Dark navy frame + cream inner card',
    '- Pure monoline line-art; no fills except specified color accents (amber pin head)',
    '- Korean text must render crisp (Noto Sans KR)',
    '- 1:1 aspect, sRGB',
    '- No emoji, no photographic elements, no 3D',
    '- Pin character should feel cute and personable but still minimalist line-art',
    '',
    '> ⚙️ 자동 생성: `scripts/release-notes-to-card-prompts.mjs`. 일러스트 디테일은 운영자가 수동 후편집으로 구체화하세요.',
    '',
  ].join('\n');
}

function generateContentCard(ver, change, cardNumber, totalCards) {
  const slots = extractSlots(change.description);
  const tagLabel = TYPE_LABEL[change.type] ?? '변경';
  const tagColor = TYPE_COLOR[change.type] ?? 'gray';
  const motif = ILLUSTRATION_HINTS[change.type] ?? ILLUSTRATION_HINTS.new;

  // sub-copy: lead의 첫 문장 (50자 이하)
  const leadFirst = slots.lead.split(/[.!?]/)[0]?.trim() ?? '';
  const subCopy = leadFirst.length > 0 && leadFirst.length <= 50
    ? leadFirst
    : (slots.lead.slice(0, 50) + (slots.lead.length > 50 ? '...' : ''));

  // body text: bullets[0] + closer (둘 다 50자 이하 권장)
  const bodyLine1 = slots.bullets[0] ?? slots.how ?? '';
  const bodyLine2 = slots.closer || slots.bullets[1] || '';

  return [
    frontmatter(ver.version, cardNumber, totalCards),
    `A 1:1 square card — **Card ${cardNumber} of ${totalCards}** — featuring **${change.title}**.`,
    '',
    VISUAL_STYLE_BLOCK,
    '',
    '## Content',
    `- **Top-center tag pill** (~28px height, rounded): "${tagLabel}" pill (white bold text on ${tagColor} background)`,
    `- **Headline** (ExtraBold, deep navy): "${change.title}"`,
    subCopy ? `- **Sub-copy** (muted slate #64748B, regular): "${subCopy}"` : null,
    `- **Central illustration** (monoline, ~50% card height):`,
    `  - 모티프: ${motif[0]}`,
    `  - ${motif[1]}`,
    `  - One small accent stroke in ${tagColor === 'amber #F59E0B' ? 'brand blue' : 'amber'} (single element only — visual emphasis)`,
    `  - **⚠️ 운영자 수동 후편집 필요**: 위 모티프 가이드를 \`${change.title}\`에 어울리는 구체 비주얼로 다듬어주세요. (예: v2.0.3 02-card-native-desktop.md의 desktop frame + widget panel 같은 구체 비주얼)`,
    bodyLine1 ? `- **Body text below illustration** (muted slate, 1~2 lines centered):` : null,
    bodyLine1 ? `  "${bodyLine1}"` : null,
    bodyLine2 && bodyLine2 !== bodyLine1 ? `  "${bodyLine2}"` : null,
    `- **Bottom-left**: "${cardNumber} / ${totalCards}" (muted slate)`,
    '',
    '## Constraints',
    '- Pure notion minimalist style',
    '- Korean text crisp',
    '- The pin character (from Card 1) must remain visually consistent if reused',
    '- No realistic humans, no photographs, no 3D, no real brand logos',
    `- Tag pill color must match release-notes.json type=${change.type} mapping`,
    '',
    '> ⚙️ 자동 생성: `scripts/release-notes-to-card-prompts.mjs`. 일러스트 구체화는 수동 후편집.',
    '',
  ].filter((l) => l !== null).join('\n');
}

function generateOutroCard(ver, totalCards, recapChange) {
  const recap = recapChange
    ? [
        `- **Top section** — small recap (one extra change not in main ${totalCards - 2} cards):`,
        `  - "${TYPE_LABEL[recapChange.type] ?? '변경'}" tag pill (white text on ${TYPE_COLOR[recapChange.type] ?? 'gray'} background)`,
        `  - Short copy: "${recapChange.title}"`,
        '- **Horizontal divider** (thin deep navy, ~80% width)',
      ].join('\n')
    : '';

  return [
    frontmatter(ver.version, totalCards, totalCards),
    `A 1:1 square card — **Card ${totalCards} of ${totalCards}** — outro / CTA card.`,
    '',
    VISUAL_STYLE_BLOCK,
    '',
    '## Content',
    recap,
    `- **Centered headline** (ExtraBold, deep navy): "지금 바로 업데이트해 보세요"`,
    `- **Sub-copy** (muted slate, regular): "쌤핀 데스크톱 앱 · ssampin.com"`,
    `- **Visual anchor** (centered, below subtitle, ~30% card height):`,
    `  - The v2.0.x amber pin mascot (continuity from intro card and series) — same friendly amber head with smiling face dots, navy monoline body with sharp tip pointing down.`,
    `  - Around the pin, a small dashed circular orbit (monoline, faint).`,
    `  - 2–3 tiny sparkle marks scattered around (small 4-point stars in monoline) for warmth.`,
    `- **Bottom-left**: "${totalCards} / ${totalCards}" (muted slate)`,
    `- **Bottom-right**: "made by 쌤핀 team" (very tiny, muted slate)`,
    '',
    '## Constraints',
    '- Pure notion minimalist style',
    '- The pin mascot must be identical to Card 1 (same proportions, same expression, same color)',
    '- The CTA headline must be clear and friendly, not pushy',
    '- No realistic humans, no photographs, no 3D, no emoji',
    '- The card should feel like a calm closing — empty space is okay, don\'t overfill',
    '',
    '> ⚙️ 자동 생성: `scripts/release-notes-to-card-prompts.mjs`. CTA 카피는 락된 템플릿이라 수정 비권장.',
    '',
  ].join('\n');
}

// ── 메인 ────────────────────────────────────────────────────────────────────

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'dry-run': { type: 'boolean' },
      force: { type: 'boolean' },
    },
  });

  if (!values.version) {
    console.error('Usage: node scripts/release-notes-to-card-prompts.mjs --version <ver> [--dry-run] [--force]');
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');
  const inputPath = path.join(repoRoot, 'public', 'release-notes.json');

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const ver = data.versions.find((v) => v.version === values.version);

  if (!ver) {
    console.error(`Version ${values.version} not found`);
    process.exit(1);
  }

  // 콘텐츠는 type !== 'change' 우선, 최대 6개
  const contentChanges = ver.changes
    .filter((c) => c.type !== 'change')
    .slice(0, 6);

  // recap: 콘텐츠에 안 들어간 첫 fix 항목 (있으면)
  const recapChange = ver.changes
    .filter((c) => !contentChanges.includes(c))
    .find((c) => c.type === 'fix') ?? null;

  const totalCards = 1 + contentChanges.length + 1; // intro + content + outro

  // 카드 1: 인트로
  const cards = [
    {
      filename: '01-card-intro.md',
      content: generateIntroCard(ver, totalCards),
    },
  ];

  // 카드 2~N-1: 콘텐츠
  contentChanges.forEach((change, i) => {
    const cardNumber = i + 2;
    const slug = slugify(change.title);
    cards.push({
      filename: `${String(cardNumber).padStart(2, '0')}-card-${slug}.md`,
      content: generateContentCard(ver, change, cardNumber, totalCards),
    });
  });

  // 카드 N: 아웃트로
  cards.push({
    filename: `${String(totalCards).padStart(2, '0')}-card-outro.md`,
    content: generateOutroCard(ver, totalCards, recapChange),
  });

  if (values['dry-run']) {
    cards.forEach(({ filename, content }) => {
      console.log(`\n========== ${filename} ==========\n`);
      console.log(content);
    });
    return;
  }

  const outDir = path.join(repoRoot, 'docs', 'release-notes-assets', `v${ver.version}`, 'cards', 'prompts');
  fs.mkdirSync(outDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const { filename, content } of cards) {
    const outPath = path.join(outDir, filename);
    if (fs.existsSync(outPath) && !values.force) {
      console.error(`⚠️  Skip (exists): ${outPath} (use --force to overwrite)`);
      skipped++;
      continue;
    }
    fs.writeFileSync(outPath, content, 'utf8');
    written++;
  }

  console.error(`✅ Wrote ${written} prompt files in ${outDir} (skipped ${skipped})`);
}

main();
