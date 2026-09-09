/**
 * 작성 방식 실제 생성 비교 하네스 (ADR-099 S4).
 *
 * 같은 **가상 근거**를 여러 초점으로 실제 모델에 보내 사실 보존과 구성 차이를 본다.
 * 앱과 **같은 도메인 함수**로 요청서를 만든다 — 흉내 낸 프롬프트로 재면 아무것도 증명하지 못한다.
 *
 * ★학생 실명·실제 근거를 넣지 않는다. 아래 묶음은 전부 지어낸 것이다.
 * ★1층 규정 본문은 저장소에 없다. `--l1 <경로>` 로 비공개 작업본을 가리킨다(기본값도 그 폴더).
 * ★결과는 `tmp/record-style-qa/`(gitignored)에 쓴다. 규정 본문은 결과 파일에 쓰지 않는다.
 *
 * 실행: npx tsx scripts/record-style-qa.mts [--only 1,2] [--l1 <path>] [--dry]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildRecordDraftPack } from '../src/domain/services/recordDraftPack';
import { rosterFromAll } from '../src/domain/rules/redactOutbound';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordWritingStyle,
} from '../src/domain/entities/RecordWritingStyle';
import type { DraftPackEvidence } from '../src/domain/services/recordDraftPack';

const args = process.argv.slice(2);
const argOf = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = args.includes('--dry');
const L1_PATH = argOf('--l1') ?? 'E:/test/ssampin-prompts/record-prompt-l1.v3.draft.txt';
const ONLY = (argOf('--only') ?? '').split(',').filter((x) => x.length > 0);
const OUT_DIR = resolve('tmp/record-style-qa');
/** 어느 구독 AI 로 돌릴지. 앱과 **같은 방식**으로 부른다(claude: --append-system-prompt / codex: stdin 합본). */
const PROVIDER = (argOf('--provider') ?? 'claude') as 'claude' | 'codex';
const MODEL = argOf('--model') ?? '';
/** 결과 파일 접미사 — 공급자·모델을 바꿔 돌린 것을 덮어쓰지 않는다. */
const SUFFIX = argOf('--suffix') ?? '';
const CODEX_JS =
  argOf('--codex-js') ??
  (process.platform === 'win32'
    ? resolve(process.env.APPDATA ?? '', 'npm/node_modules/@openai/codex/bin/codex.js')
    : '');
const CLAUDE_BIN =
  argOf('--bin') ??
  (process.platform === 'win32'
    ? resolve(
        process.env.APPDATA ?? '',
        'npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe',
      )
    : 'claude');

/** 가상 학생. 실제 명단이 아니다. */
const ROSTER = rosterFromAll(
  [
    { name: '한서우', studentNumber: 7 },
    { name: '노윤재', studentNumber: 12 },
  ],
  [],
);

interface Bundle {
  readonly id: string;
  readonly title: string;
  readonly areaLabel: string;
  readonly area: string;
  readonly evidences: readonly DraftPackEvidence[];
}

const style = (over: Partial<RecordWritingStyle>): RecordWritingStyle => ({
  ...DEFAULT_RECORD_WRITING_STYLE,
  ...over,
});

const SUBJ = { areaLabel: '과목별 세부능력 및 특기사항', area: 'subject' } as const;

const BUNDLES: readonly Bundle[] = [
  {
    id: 'B1',
    title: '두 작품 비교 읽기 메모와 비평문',
    ...SUBJ,
    evidences: [
      {
        id: 'b1e1',
        date: '2026-04-14',
        content:
          '소설 원작과 각색된 영상의 같은 장면을 나란히 놓고, 인물의 속마음이 원작에서는 서술자의 설명으로, 영상에서는 인물의 침묵과 카메라 거리로 드러난다고 메모함.',
      },
      {
        id: 'b1e2',
        date: '2026-04-21',
        content:
          '비평문에서 "매체가 바뀌면 독자가 채워야 할 빈자리도 바뀐다"는 기준을 세우고, 원작 3장 마지막 문단과 영상 27분 장면을 각각 근거로 들어 두 매체의 효과를 견줌.',
      },
      {
        id: 'b1e3',
        date: '2026-04-28',
        content:
          '합평에서 "영상이 더 뛰어나다"는 동료 의견에 대해, 우열이 아니라 매체가 감당하는 몫이 다른 것이라고 답하며 자기 기준을 다시 설명함.',
      },
    ],
  },
  {
    id: 'B2',
    title: '주장하는 글 초안과 피드백, 수정본',
    ...SUBJ,
    evidences: [
      {
        id: 'b2e1',
        date: '2026-05-06',
        content:
          '교내 급식 잔반 문제를 다룬 초안을 냄. 주장은 분명하나 근거가 "많은 학생이 그렇게 느낀다"는 인상에 머물렀고 반대 의견을 다루지 않음.',
      },
      {
        id: 'b2e2',
        date: '2026-05-11',
        content:
          '교사 의견: 근거의 출처를 밝히고 예상 반론을 하나 다룰 것. 동료 의견: 결론이 서론과 같은 말을 반복한다는 지적.',
      },
      {
        id: 'b2e3',
        date: '2026-05-18',
        content:
          '수정본에서 학교 급식실 주간 잔반량 게시자료를 근거로 바꾸고, "잔반은 개인 습관 문제"라는 반론을 배식량 선택권 문제로 되받는 문단을 새로 씀. 결론은 실행 가능한 제안 한 가지로 바꿈.',
      },
    ],
  },
  {
    id: 'B3',
    title: '시점을 바꾼 작품 재구성과 창작 설명',
    ...SUBJ,
    evidences: [
      {
        id: 'b3e1',
        date: '2026-06-02',
        content:
          '단편의 한 장면을 주변 인물 시점으로 다시 씀. 원작에서 한 문장으로 지나간 장면을 이 인물이 무엇을 못 보았는지 중심으로 늘려 씀.',
      },
      {
        id: 'b3e2',
        date: '2026-06-09',
        content:
          '창작 설명에서 "이 인물은 사건의 절반만 알고 있으므로 문장을 짧게 끊고 추측하는 말투를 썼다"고 자기 선택의 이유를 적음.',
      },
    ],
  },
  {
    id: 'B4',
    title: '개념으로 현상을 설명하고 실제로 검토함',
    ...SUBJ,
    evidences: [
      {
        id: 'b4e1',
        date: '2026-09-01',
        content:
          '학교 계단에서 공을 굴려 촬영하고, 구간별 시간을 재어 속도가 일정하게 늘어나는지 표로 정리함.',
      },
      {
        id: 'b4e2',
        date: '2026-09-03',
        content:
          '측정값이 이론값보다 작게 나오자 굴림 마찰과 촬영 프레임 간격을 원인 후보로 적고, 두 번째 촬영에서는 프레임 수를 올려 다시 잼.',
      },
      {
        id: 'b4e3',
        date: '2026-09-05',
        content:
          '두 번째 측정에서도 차이가 남자 "이 조건에서는 마찰을 무시할 수 없다"고 적고, 남은 차이의 크기까지는 설명하지 못했다고 스스로 밝힘.',
      },
    ],
  },
];

const RISK_BUNDLES: readonly Bundle[] = [
  {
    id: 'B5a',
    title: '모둠 산출물만 있는 기록',
    areaLabel: '동아리활동',
    area: 'club',
    evidences: [
      {
        id: 'b5a1',
        date: '2026-07-02',
        content: '모둠이 교내 분리배출 안내 포스터를 제작해 급식실 앞에 게시함.',
      },
      { id: 'b5a2', date: '2026-07-09', content: '모둠 발표에서 포스터 제작 과정을 소개함.' },
    ],
  },
  {
    id: 'B5b',
    title: '개인 기여가 확인되는 모둠 기록',
    areaLabel: '동아리활동',
    area: 'club',
    evidences: [
      {
        id: 'b5b1',
        date: '2026-07-02',
        content: '모둠이 교내 분리배출 안내 포스터를 제작함.',
      },
      {
        id: 'b5b2',
        date: '2026-07-05',
        content:
          '문구가 길다는 의견과 그림이 작다는 의견이 갈리자, 게시 위치에서 3미터 떨어져 읽어 보자고 제안해 두 의견을 같은 기준으로 견주게 함.',
      },
      {
        id: 'b5b3',
        date: '2026-07-09',
        content: '자료 조사 담당이 결석한 날 대신 배출 요일표를 확인해 채워 넣음.',
      },
    ],
  },
  {
    id: 'B6a',
    title: '진로 변경 전후의 탐색',
    areaLabel: '진로활동',
    area: 'career',
    evidences: [
      {
        id: 'b6a1',
        date: '2026-03-20',
        content: '수의사에 관심이 있다며 동물 행동 관련 도서를 찾아 읽음.',
      },
      {
        id: 'b6a2',
        date: '2026-06-11',
        content:
          '직업 탐색 활동에서 동물 복지 정책을 다루는 일이 있다는 것을 알게 되었다고 적고, 진료보다 제도 쪽을 더 알아보고 싶다고 말함.',
      },
      {
        id: 'b6a3',
        date: '2026-09-02',
        content: '지역 조례 사례를 찾아 정리하며 관심의 초점이 바뀐 경위를 스스로 설명함.',
      },
    ],
  },
  {
    id: 'B6b',
    title: '희망 직업명만 있는 기록',
    areaLabel: '진로활동',
    area: 'career',
    evidences: [{ id: 'b6b1', date: '2026-03-20', content: '진로 희망 조사에서 건축가라고 적음.' }],
  },
  {
    id: 'B7',
    title: '생활 관찰과 단일 사건',
    areaLabel: '행동특성 및 종합의견',
    area: 'behavior',
    evidences: [
      {
        id: 'b7e1',
        date: '2026-04-02',
        content: '청소 당번이 아닌 날에도 칠판 앞 분필 가루를 치우고 감. 여러 차례 확인됨.',
      },
      {
        id: 'b7e2',
        date: '2026-05-30',
        content: '체육대회 준비물이 부족하자 자기 것을 먼저 빌려주고 마지막에 챙김.',
      },
      {
        id: 'b7e3',
        date: '2026-06-18',
        content: '한 번, 모둠 과제 제출이 하루 늦어 다시 제출함.',
      },
    ],
  },
  {
    id: 'B8',
    title: '서로 무관한 두 과제',
    ...SUBJ,
    evidences: [
      {
        id: 'b8e1',
        date: '2026-04-10',
        content: '설명하는 글 쓰기 평가에서 자전거 변속기의 작동을 단계로 나누어 설명함.',
      },
      {
        id: 'b8e2',
        date: '2026-06-25',
        content: '시 낭송 평가에서 행의 끊김을 살려 읽고, 왜 그 자리에서 쉬었는지 설명함.',
      },
    ],
  },
  {
    id: 'B9',
    title: '경계: 관찰 한 줄과 학생 진술만',
    ...SUBJ,
    evidences: [
      { id: 'b9e1', date: '2026-05-04', content: '수업 중 발표에 참여함.' },
      {
        id: 'b9e2',
        date: '2026-05-04',
        content: '자기평가서에 "자료를 스스로 찾아 정리했고 많이 성장했다"고 적음.',
      },
    ],
  },
];

interface RunCase {
  readonly id: string;
  readonly bundle: Bundle;
  readonly label: string;
  readonly style: RecordWritingStyle;
}

const ALL: Bundle[] = [...BUNDLES, ...RISK_BUNDLES];
const byId = (id: string): Bundle => {
  const b = ALL.find((x) => x.id === id);
  if (!b) throw new Error(`no bundle ${id}`);
  return b;
};

const CASES: readonly RunCase[] = [
  // 1~4: 같은 근거를 세 초점으로. 사실 보존과 구성 차이를 본다.
  { id: 'B1-legacy', bundle: byId('B1'), label: '기존형(대조)', style: style({}) },
  {
    id: 'B1-T3',
    bundle: byId('B1'),
    label: 'T3 근거 비교·판단',
    style: style({ focus: 'compareJudge', opening: 'performance' }),
  },
  {
    id: 'B1-T1',
    bundle: byId('B1'),
    label: 'T1 성취·수행',
    style: style({ focus: 'legacyInquiry' }),
  },
  {
    id: 'B1-T5',
    bundle: byId('B1'),
    label: 'T5 피드백·수정(전후 없음)',
    style: style({ focus: 'feedbackRevise' }),
  },

  { id: 'B2-legacy', bundle: byId('B2'), label: '기존형(대조)', style: style({}) },
  { id: 'B3-legacy', bundle: byId('B3'), label: '기존형(대조)', style: style({}) },
  { id: 'B4-legacy', bundle: byId('B4'), label: '기존형(대조)', style: style({}) },
  {
    id: 'B2-T5',
    bundle: byId('B2'),
    label: 'T5 피드백·수정',
    style: style({ focus: 'feedbackRevise' }),
  },
  {
    id: 'B2-T3',
    bundle: byId('B2'),
    label: 'T3 근거 비교·판단',
    style: style({ focus: 'compareJudge' }),
  },
  {
    id: 'B2-T1',
    bundle: byId('B2'),
    label: 'T1 성취·수행',
    style: style({ focus: 'legacyInquiry', opening: 'performance' }),
  },

  {
    id: 'B3-T6',
    bundle: byId('B3'),
    label: 'T6 설계·창작',
    style: style({ focus: 'designCreate', opening: 'performance', grouping: 'single' }),
  },
  {
    id: 'B3-T3',
    bundle: byId('B3'),
    label: 'T3 근거 비교·판단',
    style: style({ focus: 'compareJudge' }),
  },
  {
    id: 'B3-T1',
    bundle: byId('B3'),
    label: 'T1 성취·수행',
    style: style({ focus: 'legacyInquiry' }),
  },

  {
    id: 'B4-T2',
    bundle: byId('B4'),
    label: 'T2 개념 적용·전이',
    style: style({ focus: 'legacyInquiry', extraModules: ['conceptUsed', 'applyLimit'] }),
  },
  {
    id: 'B4-T4',
    bundle: byId('B4'),
    label: 'T4 질문·검증(질문 먼저)',
    style: style({ focus: 'legacyInquiry', opening: 'question', extraModules: ['limitNext'] }),
  },
  {
    id: 'B4-T1',
    bundle: byId('B4'),
    label: 'T1 성취·수행',
    style: style({ focus: 'legacyInquiry' }),
  },

  // 5~9: 위험 조건.
  {
    id: 'B5a-T7',
    bundle: byId('B5a'),
    label: 'T7 협업(모둠 결과만)',
    style: style({ focus: 'collaborate' }),
  },
  {
    id: 'B5b-T7',
    bundle: byId('B5b'),
    label: 'T7 협업(개인 기여 있음)',
    style: style({ focus: 'collaborate' }),
  },
  {
    id: 'B6a-T8',
    bundle: byId('B6a'),
    label: 'T8 관심 탐색(진로 변경)',
    style: style({ focus: 'interestExplore' }),
  },
  {
    id: 'B6b-T8',
    bundle: byId('B6b'),
    label: 'T8 관심 탐색(직업명만)',
    style: style({ focus: 'interestExplore' }),
  },
  {
    id: 'B7-life',
    bundle: byId('B7'),
    label: '생활·관계 종합',
    style: style({ focus: 'lifeRelation' }),
  },
  {
    id: 'B8-T1by',
    bundle: byId('B8'),
    label: 'T1 + 성취별 묶기',
    style: style({ focus: 'legacyInquiry', grouping: 'byAchievement' }),
  },
  {
    id: 'B9-T4q',
    bundle: byId('B9'),
    label: 'T4 질문 먼저(근거 얇음)',
    style: style({ focus: 'legacyInquiry', opening: 'question' }),
  },
];

/**
 * codex 는 `--append-system-prompt` 에 해당하는 옵션이 없다. 앱(`buildCodexStdinText`)과 같이
 * 규정과 요청서를 stdin 한 덩어리로 합쳐 넘긴다. 본문은 명령줄에 실리지 않는다.
 */
function runCodex(systemPrompt: string, prompt: string): Promise<string> {
  return new Promise((res, rej) => {
    const argv = [
      'exec',
      '--skip-git-repo-check',
      '-C',
      process.cwd(),
      '-s',
      'read-only',
      '--ignore-user-config',
      ...(MODEL ? ['-m', MODEL] : []),
      '-',
    ];
    // codex 는 node 스크립트다(`codex.js`). `.cmd` 는 Node 20+ 에서 EINVAL 이므로 node 로 직접 부른다.
    const child = CODEX_JS
      ? spawn(process.execPath, [CODEX_JS, ...argv], { windowsHide: true })
      : spawn('codex', argv, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += String(d)));
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('error', rej);
    child.on('close', (code) =>
      code === 0 ? res(out) : rej(new Error(`exit ${code}: ${err.slice(0, 400)}`)),
    );
    child.stdin.write(`${systemPrompt}

---

${prompt}`);
    child.stdin.end();
  });
}

/** codex exec 는 앞뒤로 진행 로그를 찍는다. 표식이 붙은 문단만 남긴다. */
function extractCodexDraft(raw: string): string {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, ''));
  const keep: string[] = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^\[(평가|동기|과정|결과)\]/.test(t)) {
      started = true;
      keep.push(t);
      continue;
    }
    if (!started) continue;
    if (t.length === 0) {
      keep.push('');
      continue;
    }
    if (/^\[\d{4}-\d{2}-\d{2}T/.test(t) || /^tokens used/i.test(t)) break;
    keep.push(t);
  }
  return keep.join('\n').trim() || raw.trim();
}

function runClaude(systemPrompt: string, prompt: string): Promise<string> {
  return new Promise((res, rej) => {
    const argv = [
      '-p',
      prompt,
      '--tools',
      '',
      '--restricted',
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--append-system-prompt',
      systemPrompt,
    ];
    // ★윈도우: `claude` 는 셸 스크립트라 ENOENT, `.cmd` 는 Node 20+ 에서 EINVAL 이다.
    //   `.cmd` 가 실제로 부르는 실행 파일(claude.exe)을 직접 부른다. 경로는 --bin 으로 덮을 수 있다.
    const child = spawn(CLAUDE_BIN, argv, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += String(d)));
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('error', rej);
    child.on('close', (code) =>
      code === 0 ? res(out.trim()) : rej(new Error(`exit ${code}: ${err.slice(0, 400)}`)),
    );
  });
}

async function main(): Promise<void> {
  const l1 = readFileSync(L1_PATH, 'utf-8').trim();
  mkdirSync(OUT_DIR, { recursive: true });
  const cases = ONLY.length > 0 ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;
  const index: string[] = [
    `# 실제 생성 결과 (${new Date().toISOString()}) - ${PROVIDER}${MODEL ? ` / ${MODEL}` : ''}`,
    '',
  ];
  for (const c of cases) {
    const pack = buildRecordDraftPack({
      studentName: '한서우',
      roster: ROSTER,
      areaLabel: c.bundle.areaLabel,
      evidences: c.bundle.evidences,
      style: c.style,
    });
    writeFileSync(resolve(OUT_DIR, `${c.id}${SUFFIX}.request.txt`), pack.text, 'utf-8');
    if (DRY) {
      console.log(`[dry] ${c.id} (${c.label}) request ${pack.text.length}자`);
      continue;
    }
    const started = Date.now();
    try {
      const answer =
        PROVIDER === 'codex'
          ? extractCodexDraft(await runCodex(l1, pack.text))
          : await runClaude(l1, pack.text);
      writeFileSync(resolve(OUT_DIR, `${c.id}${SUFFIX}.answer.txt`), answer, 'utf-8');
      index.push(
        `- ${c.id} · ${c.bundle.title} · ${c.label} · ${Math.round((Date.now() - started) / 1000)}초 · ${answer.length}자`,
      );
      console.log(`OK  ${c.id} (${c.label}) ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (e) {
      index.push(`- ${c.id} · 실패: ${String(e).slice(0, 200)}`);
      console.log(`FAIL ${c.id}: ${String(e).slice(0, 200)}`);
    }
  }
  writeFileSync(resolve(OUT_DIR, 'index.md'), index.join('\n'), 'utf-8');
  console.log(`\n결과: ${OUT_DIR}`);
}

void main();
