#!/usr/bin/env node
/**
 * build.mjs — 카드 PNG와 영상 슬라이드 MP4를 만든다.
 *
 *   node build.mjs config.json                 카드 + 클립 전부
 *   node build.mjs config.json --cards         카드만
 *   node build.mjs config.json --clips         클립만
 *   node build.mjs config.json --review        전 카드를 한 장에 모아 _review.jpg
 *   node build.mjs config.json --review-clips  클립에서 프레임을 뽑아 _clip*.jpg
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ff, dims, ensure, shoot, even, ASSETS } from './lib.mjs';

const W = 1080,
  H = 1350; // 4:5
const STAGE_TOP = 84,
  STAGE_H = 620; // card.html 과 반드시 일치
const MAX_SHOT_W = 926;

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error('사용법: node build.mjs <config.json> [--cards|--clips|--review|--review-clips]');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const flags = process.argv.slice(3);
const has = (f) => flags.includes(f);
// --review 류는 모드가 아니라 부가 플래그다. 단독으로 줘도 카드를 먼저 만든다.
const modePicked = has('--cards') || has('--clips');
const doCards = !modePicked || has('--cards');
const doClips = !modePicked || has('--clips');

const out = resolve(cfg.out);
const cropsDir = join(out, 'crops');
const srcDir = ensure(join(out, 'src'));
const cardsDir = ensure(join(out, 'cards'));
const clipsDir = ensure(join(out, 'clips'));
const htmlPath = join(srcDir, 'card.html');

/* ── 템플릿·폰트·마스코트를 산출 폴더로 복사 (그 폴더만 있어도 다시 만들 수 있게) ── */
function stage() {
  copyFileSync(join(ASSETS, 'card.html'), htmlPath);
  const fonts = ensure(join(srcDir, 'fonts'));
  for (const f of readdirSync(join(ASSETS, 'fonts')))
    copyFileSync(join(ASSETS, 'fonts', f), join(fonts, f));
  if (cfg.brand?.mascot) {
    const m = join(ASSETS, cfg.brand.mascot);
    if (existsSync(m)) copyFileSync(m, join(srcDir, cfg.brand.mascot));
    else console.warn(`! 마스코트 없음: ${m}`);
  }
  // 크롭 실측 크기를 넘겨 준다 — 높이를 손으로 계산하다 틀린 적이 있다.
  const sizes = {};
  for (const f of readdirSync(cropsDir).filter((f) => f.endsWith('.png'))) {
    sizes[f.replace(/\.png$/, '')] = dims(join(cropsDir, f));
  }
  writeFileSync(
    join(srcDir, 'cards.data.js'),
    'window.CARD_DATA = ' +
      JSON.stringify({ brand: cfg.brand, cards: cfg.cards, sizes }, null, 2) +
      ';\n',
    'utf8',
  );
  return sizes;
}

/* ── 카드 ── */
if (doCards) {
  const sizes = stage();
  cfg.cards.forEach((c, idx) => {
    const i = idx + 1;
    const png = join(cardsDir, `card-${String(i).padStart(2, '0')}.png`);
    shoot(htmlPath, `i=${i}`, png, W, H);
    // 화면이 영역을 넘치지 않는지 미리 알려 준다
    const items = (c.stage?.items || []).filter((it) => it.type !== 'mascot');
    const hs = items.map((it) => Math.round((sizes[it.img][1] * it.w) / sizes[it.img][0]));
    const used =
      c.stage?.layout === 'row'
        ? Math.max(0, ...hs) + (items.some((it) => it.label) ? 35 : 0)
        : hs.reduce((a, b) => a + b, 0) +
          30 * Math.max(0, items.length - 1) +
          items.filter((it) => it.label).length * 35;
    const warn = used > STAGE_H ? `  ⚠ 화면영역 ${STAGE_H}px 초과` : '';
    console.log(
      `  card-${String(i).padStart(2, '0')}  ${c.eyebrow}  [높이 ${hs.join(' + ') || '-'} = ${used}]${warn}`,
    );
  });
  console.log(`\n카드 ${cfg.cards.length}장 → ${cardsDir}`);
}

/* ── 영상 슬라이드 ── */
function buildClip(clip) {
  const [cw, ch] = clip.crop.split(':').map(Number);
  // 화면 영역 안에 들어가도록 축소 — 가로 926 또는 세로 616 중 먼저 닿는 쪽
  const scale = Math.min(MAX_SHOT_W / cw, (STAGE_H - 4) / ch);
  const vw = even(Math.round(cw * scale));
  const vh = even(Math.round(ch * scale));
  const slotW = vw + 4,
    slotH = vh + 4;
  const x = Math.round((W - slotW) / 2) + 2;
  const y = STAGE_TOP + Math.round((STAGE_H - slotH) / 2) + 2;

  // 둥근 모서리 마스크
  const maskHtml = join(srcDir, `mask_${vw}x${vh}.html`);
  const maskPng = join(srcDir, `mask_${vw}x${vh}.png`);
  writeFileSync(
    maskHtml,
    `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}` +
      `html,body{width:${vw}px;height:${vh}px;background:transparent}` +
      `.m{width:${vw}px;height:${vh}px;border-radius:15px;background:#fff}</style><div class="m"></div>`,
    'utf8',
  );
  shoot(maskHtml, '', maskPng, vw, vh, { transparent: true });

  // 화면 자리를 비운 바탕 프레임
  const base = join(srcDir, `base-${String(clip.card).padStart(2, '0')}.png`);
  shoot(htmlPath, `i=${clip.card}&bare=1&vw=${slotW}&vh=${slotH}`, base, W, H);

  // 가릴 영역(크롭 좌표계 기준) — 사진에 박힌 이름 등
  let chain = `[1:v]crop=${clip.crop}`;
  const blurs = clip.blur || [];
  if (blurs.length) {
    chain +=
      ',split=' + (blurs.length + 1) + '[b0]' + blurs.map((_, i) => `[s${i}]`).join('') + ';';
    chain += blurs
      .map(
        (b, i) => `[s${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},boxblur=${b.strength || 14}:2[bl${i}];`,
      )
      .join('');
    let prev = 'b0';
    blurs.forEach((b, i) => {
      const next = i === blurs.length - 1 ? 'mx' : `m${i}`;
      const en = b.from != null && b.to != null ? `:enable='between(t,${b.from},${b.to})'` : '';
      chain += `[${prev}][bl${i}]overlay=${b.x}:${b.y}${en}[${next}];`;
      prev = next;
    });
    chain += `[mx]scale=${vw}:${vh},setsar=1,fps=30[v];`;
  } else {
    chain += `,scale=${vw}:${vh},setsar=1,fps=30[v];`;
  }
  chain +=
    `[2:v]alphaextract[m];[v][m]alphamerge[va];` +
    `[0:v][va]overlay=${x}:${y}:format=auto,format=yuv420p[o]`;

  const name = `clip-${String(clip.card).padStart(2, '0')}${clip.name ? '-' + clip.name : ''}.mp4`;
  const dst = join(clipsDir, name);
  ff([
    '-loop',
    '1',
    '-i',
    base,
    '-ss',
    String(clip.start),
    '-t',
    String(clip.dur),
    '-i',
    cfg.source,
    '-i',
    maskPng,
    '-filter_complex',
    chain,
    '-map',
    '[o]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-r',
    '30',
    '-t',
    String(clip.dur),
    '-movflags',
    '+faststart',
    '-an',
    dst,
    '-y',
  ]);
  console.log(
    `  ${name}  ${clip.dur}초  영상 ${vw}×${vh}  (${clip.start}~${clip.start + clip.dur}초)`,
  );
  return dst;
}

if (doClips && (cfg.clips || []).length) {
  if (!doCards) stage();
  console.log('');
  for (const clip of cfg.clips) buildClip(clip);
  console.log(`\n클립 ${cfg.clips.length}개 → ${clipsDir}`);
}

/* ── 검수용 ── */
if (has('--review')) {
  const n = cfg.cards.length;
  const cols = Math.min(3, n);
  ff([
    '-start_number',
    '1',
    '-i',
    join(cardsDir, 'card-%02d.png'),
    '-vf',
    `scale=440:-1,tile=${cols}x${Math.ceil(n / cols)}:margin=8:padding=8:color=#222222`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(srcDir, '_review.jpg'),
    '-y',
  ]);
  console.log(`\n검수 시트 → ${join(srcDir, '_review.jpg')}   (Read 로 직접 볼 것)`);
}

if (has('--review-clips')) {
  for (const f of readdirSync(clipsDir).filter((f) => f.endsWith('.mp4'))) {
    const p = join(clipsDir, f);
    const dur =
      cfg.clips.find((c) => f.includes(`clip-${String(c.card).padStart(2, '0')}`))?.dur || 10;
    const picks = [0.05, 0.35, 0.65, 0.95].map((r) => Math.round(r * dur * 30));
    ff([
      '-i',
      p,
      '-vf',
      `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=430:-1,tile=${picks.length}x1:margin=6:padding=6:color=#333333`,
      '-frames:v',
      '1',
      '-vsync',
      '0',
      '-q:v',
      '3',
      join(srcDir, `_${f.replace(/\.mp4$/, '')}.jpg`),
      '-y',
    ]);
    console.log(`  ${join(srcDir, `_${f.replace(/\.mp4$/, '')}.jpg`)}`);
  }
  console.log('→ Read 로 보고 흐름·가림 처리를 확인한다.');
}
