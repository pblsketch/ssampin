#!/usr/bin/env node
/**
 * 2022 개정 교육과정 성취기준 번들 만들기 (앱에 실을 JSON 생성기).
 *
 * 만드는 것:
 *   src/domain/data/curriculumStandards.elementary.json   (초등 620건 · ~130KB)
 *   src/domain/data/curriculumStandards.secondary.json    (중·고 3,838건 · ~800KB)
 *
 * 왜 이 스크립트가 있는가
 * ─────────────────────────
 * 쌤핀은 **오프라인 완전 동작**이 원칙이라 앱이 실행 중에 MCP 서버나 네트워크를 부를 수 없다.
 * 그래서 성취기준을 미리 뽑아 앱에 넣어 둔다. 이 스크립트는 **개발자가 가끔 손으로 돌리는
 * 도구**이고, 앱 실행 경로에는 들어가지 않는다.
 *
 * ⚠️ 성취기준 **원문(text)은 AI 에 보내지 않는다.** 원문은 (1) 화면에 보여 주기와
 *    (2) "성취기준을 그대로 옮겨 적었는지" 검사(T4)에만 쓴다. AI 에게는 `keywords` 만 간다.
 *    원문을 근거와 함께 실으면 모델이 그대로 베껴 써서 천편일률 세특이 나온다(실측 확인).
 *
 * 자료 출처와 라이선스
 * ─────────────────────
 *  - korean-elementary-learning-map-mcp (MIT, © DECK — github.com/DECK6)
 *  - korean-secondary-learning-map-mcp  (MIT)
 *    두 패키지의 **가공물**(코드 목록·과목·영역 매핑)은 MIT 다.
 *  - 성취기준 **본문**은 교육부 고시 제2022-33호 / 국가교육위원회 고시 제2024-3호의 별책에서
 *    추출한 것으로, 저작권법 제7조 제2호(고시·공고 등)에 따라 저작권 보호 대상이 아니다.
 *    정확성·추적성을 위해 별책·PDF 쪽·SHA-256 을 `sources` 에 남긴다.
 *  - 키워드 추출에 쓰는 Kiwi(kiwi-nlp)는 LGPL-2.1-or-later 이지만 **번들 시점 도구**일 뿐
 *    앱에 실리지 않는다. 그래서 package.json 의존성에 넣지 않고 작업 폴더에만 설치한다.
 *
 * 넣지 않는 것 (의도적)
 * ──────────────────────
 *  - topics(주제) 의 `evidence`·`assessmentPrompts` — 기계 생성 틀 문장이다
 *    (`summaryKind: "mechanical-derivative"`). 세특 재료로 쓰면 바로 티가 난다.
 *  - curriculum-standards.json 의 `summary` — 같은 이유로 쓰지 않는다. 원문은 standard-texts.json 쪽이다.
 *  - dependencies(선수관계) · clusters(묶음) · transitions(중→고) · course-relations(이수경로)
 *  - 특성화고(korean-vocational-learning-map-mcp) — 47,625건, 필요한 칸만 뽑아도 4.6MB 라
 *    기본 번들에서 뺀다. `--measure-vocational` 로 용량만 다시 잴 수 있다.
 *
 * 쓰는 법
 * ────────
 *   node scripts/fetch-curriculum-standards.mjs                 # 내려받기 + 생성
 *   node scripts/fetch-curriculum-standards.mjs --sample=20     # 키워드 20건 눈으로 확인
 *   node scripts/fetch-curriculum-standards.mjs --measure-vocational
 *   node scripts/fetch-curriculum-standards.mjs --work=E:/tmp/curr --offline
 *
 * `--offline` 은 작업 폴더에 이미 내려받아 둔 것만 쓴다(네트워크 안 씀).
 * 작업 폴더 기본값은 os.tmpdir()/ssampin-curriculum-standards 이며 **저장소 밖**이다.
 * 저장소에는 위 JSON 2개 말고 아무것도 쓰지 않는다.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'domain', 'data');

/** 성취기준 패키지 — 버전을 고정한다(같은 입력 → 같은 출력). */
const PACKAGES = {
  elementary: { name: 'korean-elementary-learning-map-mcp', version: '0.5.1' },
  secondary: { name: 'korean-secondary-learning-map-mcp', version: '0.3.0' },
  vocational: { name: 'korean-vocational-learning-map-mcp', version: '0.4.0' },
};

/** Kiwi — 형태소 분석기. 44MB 구성(knlm, multi/skipbigram 제외)이 105MB 구성보다 오탐이 적다(실측). */
const KIWI_PKG = 'kiwi-nlp@0.21.0';
const KIWI_MODEL_URL =
  'https://github.com/bab2min/Kiwi/releases/download/v0.21.0/kiwi_model_v0.21.0_base.tgz';
const KIWI_MODEL_FILES = [
  'combiningRule.txt',
  'default.dict',
  'extract.mdl',
  'sj.knlm',
  'sj.morph',
  'typo.dict',
];

/* ──────────────────────────── 인자 ──────────────────────────── */

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const WORK = path.resolve(value('work', path.join(os.tmpdir(), 'ssampin-curriculum-standards')));
const OFFLINE = flag('offline');
const SAMPLE = Number(value('sample', '0')) || 0;

const log = (msg) => console.log(msg);

/* ──────────────────────── 내려받기 ──────────────────────── */

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/** npm 패키지를 tarball 로 받아 풀고, 풀린 `package/` 경로를 준다. */
function fetchPackage({ name, version }) {
  const dir = path.join(WORK, name);
  const pkgRoot = path.join(dir, 'package');
  if (fs.existsSync(path.join(pkgRoot, 'package.json'))) {
    log(`  · ${name}@${version} — 이미 받아 둔 것 사용`);
    return pkgRoot;
  }
  if (OFFLINE) throw new Error(`--offline 인데 ${name} 이 작업 폴더에 없다: ${dir}`);
  ensureDir(dir);
  log(`  · ${name}@${version} 내려받는 중…`);
  const out = execFileSync('npm', ['pack', `${name}@${version}`, '--silent'], {
    cwd: dir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const tgz = out.trim().split('\n').pop().trim();
  execFileSync('tar', ['-xzf', tgz, '-C', dir], { stdio: 'ignore' });
  return pkgRoot;
}

/** Kiwi 형태소 분석기(패키지 + 모델)를 작업 폴더에 준비한다. */
function fetchKiwi() {
  const dir = path.join(WORK, 'kiwi');
  ensureDir(dir);
  const modulePath = path.join(dir, 'node_modules', 'kiwi-nlp');
  if (!fs.existsSync(modulePath)) {
    if (OFFLINE) throw new Error(`--offline 인데 kiwi-nlp 가 없다: ${modulePath}`);
    log(`  · ${KIWI_PKG} 설치 중… (저장소 package.json 은 건드리지 않는다)`);
    execFileSync('npm', ['install', '--no-save', '--prefix', dir, KIWI_PKG], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
  }
  const modelDir = path.join(dir, 'model', 'base');
  if (!fs.existsSync(path.join(modelDir, 'sj.knlm'))) {
    if (OFFLINE) throw new Error(`--offline 인데 Kiwi 모델이 없다: ${modelDir}`);
    log('  · Kiwi 모델 내려받는 중… (35MB, 한 번만)');
    const tgz = path.join(dir, 'kiwi_model.tgz');
    execFileSync('curl', ['-sL', '-o', tgz, KIWI_MODEL_URL], { stdio: 'ignore' });
    ensureDir(path.join(dir, 'model'));
    execFileSync('tar', ['-xzf', tgz, '-C', path.join(dir, 'model')], { stdio: 'ignore' });
  }
  return { modulePath, modelDir };
}

/* ──────────────────────── 키워드 뽑기 ──────────────────────── */

/**
 * 명사 계열 태그. NNG(일반명사)·NNP(고유명사)·SL(외국어)·SN(숫자)·SH(한자).
 * NNB(의존명사 — '수', '것', '바')는 **일부러 뺀다** — "그릴 수 있다"의 '수'가 그것이다.
 */
const NOUN_TAGS = new Set(['NNG', 'NNP', 'SL', 'SN', 'SH']);

/**
 * 서술어 파생 접미사. `이해/NNG + 하/XSV` 처럼 **명사 태그를 달고 있어도 실제로는 서술어**인
 * 것들을 잡아내는 열쇠다. 이 규칙이 없으면 "이해·설명·활용·고려"가 전부 키워드로 남는다
 * — 그게 바로 "성취기준 복사형" 세특의 몸통이다.
 */
const DERIVATION = /^(XSV|XSA)/;

/** `타당/XR + 성/XSN` → '타당성'. 어근+접미사로만 성립하는 명사를 살린다. */
const ROOT_TAG = 'XR';
const NOUN_SUFFIX_TAG = 'XSN';

/**
 * 내용이 비어 있는 낱말 — 어떤 성취기준에나 붙어서 "이것도 이 주제?" 제안을 오염시킨다.
 * 교과 내용을 가리키는 낱말(탐구·관찰·실험·자료·함수…)은 **일부러 넣지 않았다.**
 */
const STOPWORDS = new Set([
  '것',
  '등',
  '수',
  '때',
  '바',
  '중',
  '통',
  '점',
  '경우',
  '때문',
  '정도',
  '이상',
  '이하',
  '여러',
  '다양',
  '자신',
  '우리',
  '사람',
  '모습',
  '내용',
  '의미',
  '특징',
  '상황',
  '부분',
  '측면',
  '종류',
  '개념',
  '관련',
  '대상',
  '결과',
  '이유',
  '필요',
  '중요',
  '다음',
  '방식',
  '과정',
  '방법',
  '활동',
  '전체',
  '기본',
  '실제',
  '주요',
  '각각',
  '서로',
  '모두',
  '자체',
]);

/**
 * 한 글자여도 교과에서 실제 내용을 가리키는 낱말. 평소에는 두 글자 미만을 버리지만,
 * 그렇게 하면 "표현하는 몸을 이해하고 춤추는 몸을…" 같은 성취기준이 키워드 0개가 된다.
 * 그래서 **키워드가 부족할 때만** 이 목록을 되살린다.
 */
const SHORT_ALLOW = new Set([
  '몸',
  '물',
  '힘',
  '빛',
  '열',
  '흙',
  '별',
  '글',
  '말',
  '춤',
  '옷',
  '집',
  '땅',
  '강',
  '산',
  '불',
  '돌',
  '알',
  '꽃',
  '눈',
  '비',
  '해',
  '달',
  '색',
  '음',
  '선',
  '면',
  '각',
  '식',
  '수',
]);

/**
 * 성취기준 원문에서 **명사 핵심어만** 뽑는다.
 *
 * 규칙 넷:
 *  ① 명사 계열만 취한다.
 *  ② 바로 뒤가 `하/XSV`·`하/XSA` 면 버린다 → 이해하고·설명할·활용하여 (= 서술어)
 *  ③ 원문에서 **붙어 있는** 연속 명사는 합친다 → 일차+함수 = '일차함수' (띄어 쓴 것은 안 합친다)
 *  ④ 두 글자 미만·불용어는 버린다. 그 결과 2개 미만이면 한 글자 허용 목록으로 한 번 더 시도한다.
 */
function extractKeywords(kiwi, text) {
  const run = (allowShort) => {
    const tokens = kiwi.tokenize(text);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const next = tokens[i + 1];

      // 어근 + 명사파생접미사 ('타당' + '성')
      if (tok.tag === ROOT_TAG && next && next.tag === NOUN_SUFFIX_TAG) {
        const form = tok.str + next.str;
        i += 1;
        if (form.length >= 2 && !STOPWORDS.has(form) && !seen.has(form)) {
          seen.add(form);
          out.push(form);
        }
        continue;
      }

      if (!NOUN_TAGS.has(tok.tag)) continue;
      if (next && DERIVATION.test(next.tag)) continue; // ② 서술어다

      // ③ 원문에서 공백 없이 이어지는 명사끼리 합친다
      let form = tok.str;
      let end = tok.position + tok.length;
      let j = i + 1;
      while (j < tokens.length && NOUN_TAGS.has(tokens[j].tag) && tokens[j].position === end) {
        const after = tokens[j + 1];
        if (after && DERIVATION.test(after.tag)) break;
        form += tokens[j].str;
        end = tokens[j].position + tokens[j].length;
        j += 1;
      }
      i = j - 1;

      const short = form.length < 2;
      if (short && !(allowShort && SHORT_ALLOW.has(form))) continue;
      if (STOPWORDS.has(form)) continue;
      if (seen.has(form)) continue;
      seen.add(form);
      out.push(form);
    }
    return out;
  };

  const first = run(false);
  return first.length >= 2 ? first : run(true);
}

/* ──────────────────────── 원문 손질 ──────────────────────── */

/**
 * 문장 뒤에 딸려 온 **쪽 글**을 잘라낸다.
 *
 * 초등 자료에는 PDF 에서 성취기준 문장 **뒤**에 다음 절 제목이나 쪽 번호가 붙어 온 것이 92건 있다.
 *   "…자료를 그래프로 나타내면 편리한 점을 말할 수 있다. 15 수학과 교육과정"
 *   "…협력적으로 소통할 수 있다. <탐구 활동> • 식물 분류 기준 정하기 14 공통 교육과정"
 * 첫 문장이 끝난 뒤(`…다.`)에 남은 꼬리가 **그 자체로 온전한 문장이 아니면** 쪽 글로 보고 버린다.
 *
 * 안전한가: 중·고 3,838건에 이 함수를 돌렸을 때 **바뀐 것이 0건**이다(실측). 즉 멀쩡한 문장은
 * 건드리지 않는다. 두 문장짜리 성취기준은 꼬리도 `…다.` 로 끝나므로 그대로 둔다.
 */
function trimTrailingJunk(text) {
  const t = text.trim();
  const m = /^([\s\S]*?[다임함음됨])[.]\s+(\S[\s\S]*)$/.exec(t);
  if (!m) return t;
  if (/[다임함음됨][.]?\s*$/.test(m[2])) return t; // 꼬리도 온전한 문장이면 손대지 않는다
  return m[1] + '.';
}

/**
 * 다단(多段) PDF 에서 **열이 뒤섞여** 추출된 자료. 문장 안쪽이 깨져 있어 손질로도 못 살린다.
 *   "나의 몸을 긍정적으로 지속적인 신체 활동은 인식하고 건강 증진을 위한 신체 활 건강한 …"
 * 옆 칸의 '내용 체계'(지식·이해 / 과정·기능 / 가치·태도)가 문장 사이에 끼어 들어왔다.
 *
 * 길이나 기호로 어림하지 않고 **출처로 못 박는다** — 실측 결과 이 출처(초등 별책15, 2026-1 고시로
 * 새로 들어온 '건강/움직임' 교과) 9건은 **전부** 깨졌고, **이 출처 밖에는 깨진 것이 하나도 없다.**
 * 길이 기준(>120자)을 쓰면 중·고의 멀쩡한 긴 성취기준 2건이 억울하게 걸린다(그래서 안 쓴다).
 */
const BROKEN_SOURCES = new Set(['kr-ncic-2026-1-annex15-pdf']);

/**
 * 원문을 그대로 믿을 수 없는 자료인지. 이런 것은 **버리지 않고 표시만 한다** —
 * 코드·과목·영역은 멀쩡하므로 목록에는 나오되, 화면이 원문 대신 "원문 추출이 불완전합니다"를
 * 보여 주고 키워드도 뽑지 않는다.
 *
 * 두 번째 조건(∙·내용체계 열 이름)은 **보호막**이다. 패키지가 새 판으로 올라가면서 다른 출처가
 * 같은 식으로 깨져 들어와도 조용히 지나가지 않게 한다.
 */
function isBrokenText(text, sourceId) {
  if (sourceId && BROKEN_SOURCES.has(sourceId)) return true;
  if (text.includes('∙')) return true;
  return /지식·이해|과정·기능|가치·태도/.test(text);
}

/* ──────────────────────── 출처 표 ──────────────────────── */

/**
 * 'kr-moe-2022-33-annex8' → '[별책8] 교육과정'.
 *
 * ⚠️ 별책 번호에 **과목 이름을 붙이지 않는다.** "별책8 = 수학과 교육과정" 같은 대응은 고시 원문을
 * 봐야 확정할 수 있는데 이 저장소에는 그 근거가 없다. 근거 없이 규정 문서 이름을 지어내면
 * 화면에 그대로 틀린 사실이 박힌다. 번호는 패키지가 준 id 에 그대로 들어 있으니 그것만 쓰고,
 * 어떤 교과가 이 별책을 쓰는지는 **자료에서 뽑아** `groups` 로 따로 담는다(아래 collectSources).
 */
function sourceLabel(sourceId) {
  const m = /annex(\d{1,2})/.exec(sourceId);
  if (m) return `[별책${m[1]}] 교육과정`;
  return '국가교육과정정보센터(NCIC) 공개 PDF';
}

/** 고시 이름 — nec(국가교육위원회) / moe(교육부) 구분이 id 에 들어 있다. */
function sourceNotice(sourceId) {
  if (sourceId.includes('nec-2024-3')) return '국가교육위원회 고시 제2024-3호';
  if (sourceId.includes('2026-1')) return '국가교육위원회 고시 제2026-1호';
  return '교육부 고시 제2022-33호';
}

/* ──────────────────────── 자료 읽기 ──────────────────────── */

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 중·고 — curriculum-standards.json 과 standard-texts.json 을 `key` 로 잇는다. */
function buildSecondary(pkgRoot) {
  const dataDir = path.join(pkgRoot, 'data', 'kr');
  const cs = readJson(path.join(dataDir, 'curriculum-standards.json'));
  const st = readJson(path.join(dataDir, 'standard-texts.json'));
  const manifest = readJson(path.join(dataDir, 'manifest.json'));

  const textByKey = new Map(st.texts.map((t) => [t.key, t.text]));
  const sources = {};
  const records = [];

  for (const course of cs.curricula) {
    for (const s of course.standards) {
      const sourceId = s.sourceRefs?.[0] ?? null;
      if (sourceId && !sources[sourceId]) {
        sources[sourceId] = {
          label: sourceLabel(sourceId),
          notice: sourceNotice(sourceId),
          ...(s.sourceLocator?.attachmentNo ? { ncicSeq: s.sourceLocator.attachmentNo } : {}),
          ...(s.sourceLocator?.sha256 ? { sha256: s.sourceLocator.sha256 } : {}),
        };
      }
      const raw = textByKey.get(s.key) ?? '';
      records.push({
        code: s.code,
        text: raw.length > 0 ? trimTrailingJunk(raw) : '',
        subject: course.subjectKorean,
        subjectGroup: course.subjectGroupKorean ?? course.subjectKorean,
        domain: s.domainKorean ?? '',
        gradeBand: s.gradeBand ?? course.gradeBand ?? '',
        schoolLevel: s.schoolLevel ?? course.schoolLevel,
        ...(sourceId ? { source: sourceId } : {}),
        ...(s.sourceLocator?.pdfPage ? { page: s.sourceLocator.pdfPage } : {}),
      });
    }
  }
  return { records, sources, datasetGeneratedAt: manifest.generatedAt ?? null };
}

/** 초등 — standard-texts.json 이 `code` 로만 이어진다(중·고와 키가 다르다). */
function buildElementary(pkgRoot) {
  const dataDir = path.join(pkgRoot, 'data', 'kr');
  const cs = readJson(path.join(dataDir, 'curriculum-standards.json'));
  const st = readJson(path.join(dataDir, 'standard-texts.json'));

  const textByCode = new Map();
  const sourceByCode = new Map();
  for (const t of st.texts) {
    textByCode.set(t.code, t.text);
    if (t.sourceId) sourceByCode.set(t.code, t.sourceId);
  }

  const sources = {};
  const records = [];
  for (const course of cs.curricula) {
    for (const s of course.standards) {
      const sourceId = sourceByCode.get(s.code) ?? null;
      if (sourceId && !sources[sourceId]) {
        sources[sourceId] = { label: sourceLabel(sourceId), notice: sourceNotice(sourceId) };
      }
      const raw = textByCode.get(s.code) ?? '';
      records.push({
        code: s.code,
        text: raw.length > 0 ? trimTrailingJunk(raw) : '',
        subject: course.subjectKorean,
        subjectGroup: course.subjectKorean,
        domain: s.domainKorean ?? '',
        gradeBand: s.gradeBand ?? '',
        schoolLevel: 'elementary',
        ...(sourceId ? { source: sourceId } : {}),
      });
    }
  }
  return { records, sources, datasetGeneratedAt: st.generatedAt ?? null };
}

/* ──────────────────────── 특성화고 용량 재기 ──────────────────────── */

function measureVocational() {
  const pkgRoot = fetchPackage(PACKAGES.vocational);
  const fieldsDir = path.join(pkgRoot, 'data', 'kr', 'fields');
  let count = 0;
  const slim = [];
  for (const field of fs.readdirSync(fieldsDir)) {
    const csPath = path.join(fieldsDir, field, 'curriculum-standards.json');
    const stPath = path.join(fieldsDir, field, 'standard-texts.json');
    if (!fs.existsSync(csPath)) continue;
    const cs = readJson(csPath);
    const st = fs.existsSync(stPath) ? readJson(stPath) : { texts: [] };
    const byKey = new Map((st.texts ?? []).map((t) => [t.key ?? t.code, t.text]));
    for (const course of cs.curricula ?? cs) {
      for (const s of course.standards ?? []) {
        count += 1;
        slim.push({
          code: s.code,
          text: byKey.get(s.key) ?? byKey.get(s.code) ?? '',
          subject: course.subjectKorean ?? s.subjectKorean ?? '',
          domain: s.domainKorean ?? '',
        });
      }
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(slim), 'utf8');
  log('');
  log('── 특성화고(전문교과) 용량 측정 ──');
  log(`  성취기준 ${count.toLocaleString()}건`);
  log(`  꼭 필요한 칸만 남겨도 ${(bytes / 1048576).toFixed(1)}MB (키워드까지 넣으면 ~7MB)`);
  log('  → 기본 번들에서 제외한다. 넣으려면 "필요할 때 내려받기"가 따로 필요하다.');
}

/* ──────────────────────── 쓰기 ──────────────────────── */

/**
 * 각 출처가 실제로 어떤 **교과군**에 쓰였는지 자료에서 뽑아 붙인다.
 * 별책 번호만으로는 "[별책8] 교육과정"이라 무슨 과목인지 알 수 없다. 규정을 추측하는 대신
 * 자료가 말해 주는 것만 채워, 화면이 "[별책8] 교육과정 (수학)"처럼 보여 줄 수 있게 한다.
 */
function collectSourceGroups(records, sources) {
  const groups = new Map();
  for (const r of records) {
    if (!r.source) continue;
    if (!groups.has(r.source)) groups.set(r.source, new Set());
    groups.get(r.source).add(r.subjectGroup || r.subject);
  }
  for (const [id, set] of groups) {
    if (sources[id]) sources[id].groups = [...set].sort();
  }
}

/**
 * JSON 을 **한 줄로**(최소화해) 쓴다.
 *
 * lint-staged 가 `*.json` 에 `prettier --write` 를 돌리므로 예쁘게 찍어 두면 커밋할 때마다
 * 줄 수가 몇 배로 불어난다. 그래서 최소화해 쓰고 `.prettierignore` 에 등록해 둔다.
 * 줄바꿈은 LF 로 고정한다(저장소 core.autocrlf=false).
 */
function writeBundle(file, payload) {
  const target = path.join(OUT_DIR, file);
  fs.writeFileSync(target, JSON.stringify(payload) + '\n', { encoding: 'utf8' });
  const kb = (fs.statSync(target).size / 1024).toFixed(0);
  log(`  ✓ ${path.relative(ROOT, target)} — ${payload.standards.length}건 · ${kb}KB`);
}

/* ──────────────────────── 본체 ──────────────────────── */

async function main() {
  ensureDir(WORK);
  ensureDir(OUT_DIR);
  log(`작업 폴더: ${WORK}`);
  log('');

  if (flag('measure-vocational')) {
    measureVocational();
    if (args.length === 1) return;
  }

  log('① 자료 내려받기');
  const elePkg = fetchPackage(PACKAGES.elementary);
  const secPkg = fetchPackage(PACKAGES.secondary);
  const kiwiPaths = fetchKiwi();

  log('');
  log('② 형태소 분석기 준비');
  // 작업 폴더(저장소 밖)에 깐 모듈이라 경로로 직접 가져온다. 윈도우에서는 file:// URL 이어야 한다.
  const { KiwiBuilder } = await import(
    pathToFileURL(path.join(kiwiPaths.modulePath, 'dist', 'index.js')).href
  );
  const modelFiles = {};
  for (const f of KIWI_MODEL_FILES) {
    modelFiles[f] = new Uint8Array(fs.readFileSync(path.join(kiwiPaths.modelDir, f)));
  }
  const builder = await KiwiBuilder.create(
    path.join(kiwiPaths.modulePath, 'dist', 'kiwi-wasm.wasm'),
  );
  const kiwi = await builder.build({
    modelFiles,
    // knlm(가벼운 쪽)이 큰 모델보다 오탐이 적다는 것이 실측으로 확인됐다.
    modelType: 'knlm',
    loadMultiDict: false,
    loadTypoDict: false,
  });
  log(`  ✓ Kiwi ${builder.version()} 준비됨`);

  log('');
  log('③ 뽑고 키워드 달기');
  const built = [
    [
      'elementary',
      'curriculumStandards.elementary.json',
      PACKAGES.elementary,
      buildElementary(elePkg),
    ],
    ['secondary', 'curriculumStandards.secondary.json', PACKAGES.secondary, buildSecondary(secPkg)],
  ];

  const samples = [];
  for (const [scope, file, pkg, { records, sources, datasetGeneratedAt }] of built) {
    let broken = 0;
    let empty = 0;
    for (const r of records) {
      if (r.text.length === 0) {
        r.keywords = [];
        empty += 1;
        continue;
      }
      if (isBrokenText(r.text, r.source)) {
        r.textBroken = true;
        r.keywords = [];
        broken += 1;
        continue;
      }
      r.keywords = extractKeywords(kiwi, r.text);
      if (r.keywords.length === 0) empty += 1;
    }
    collectSourceGroups(records, sources);
    samples.push(...records.filter((r) => !r.textBroken && r.keywords.length > 0));

    writeBundle(file, {
      schema: 1,
      generatedAt: new Date().toISOString(),
      revision: '2022',
      scope,
      package: {
        name: pkg.name,
        version: pkg.version,
        license: 'MIT',
        datasetGeneratedAt,
      },
      notice:
        '성취기준 본문은 교육부 고시 제2022-33호·국가교육위원회 고시 제2024-3호의 별책에서 추출한 것으로, ' +
        '저작권법 제7조 제2호에 따라 저작권 보호 대상이 아니다. 정확성·추적성을 위해 출처를 표기한다. ' +
        '코드·과목·영역 매핑 등 가공물은 MIT. 원문(text)은 화면 표시와 복사 검사에만 쓰고 AI 로 보내지 않는다.',
      keywordTool: 'kiwi-nlp 0.21.0 (knlm) — 명사만, 서술어 파생(하다/되다) 제외',
      sources,
      standards: records,
    });
    if (broken > 0) log(`    · 원문 추출이 불완전한 것 ${broken}건 (textBroken 표시, 키워드 없음)`);
    if (empty > 0) log(`    · 키워드가 안 나온 것 ${empty}건`);
  }

  if (SAMPLE > 0) {
    log('');
    log(`④ 키워드 표본 ${SAMPLE}건 (눈으로 확인)`);
    const step = Math.max(1, Math.floor(samples.length / SAMPLE));
    for (let i = 0, shown = 0; i < samples.length && shown < SAMPLE; i += step, shown += 1) {
      const r = samples[i];
      log(`  ${r.code} ${r.text.slice(0, 60)}${r.text.length > 60 ? '…' : ''}`);
      log(`     → ${r.keywords.join(' · ')}`);
    }
  }

  log('');
  log('끝. 성취기준 원문은 이 JSON 안에만 있고, AI 로 나가는 경로에는 키워드만 실린다.');
}

main().catch((err) => {
  console.error(`✗ 실패: ${err.message}`);
  process.exit(1);
});
