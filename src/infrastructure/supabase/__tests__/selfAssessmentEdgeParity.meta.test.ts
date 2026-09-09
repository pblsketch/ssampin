/**
 * 메타 테스트 — 자기평가 상한·자르기 방식이 **앱·엣지 함수·학생 화면·마이그레이션 네 곳에서
 * 같은 값**인지 지킨다(회귀 #77 의 이름과 같은 범위다).
 *
 * ★자리: `src/infrastructure/supabase/__tests__/`. 도메인 폴더가 아니라 여기 두는 이유는
 *   이 파일이 `supabase/` 를 상대 경로로 가리키기 때문이다 — 같은 방식의 선례가 이 폴더에
 *   이미 여럿 있고(`staffroomLimitsDrift`·`rateLimitBehavior` 등), `domain/` 안에 상대 경로
 *   탈출 모양을 심으면 다음 사람이 프로덕션 도메인 파일에 복사할 수 있다(순수성 게이트가
 *   점으로 시작하는 경로는 무조건 허용하므로 아무도 못 잡는다).
 *
 * 배경: 학생 답변 검사는 두 벌 있다. 앱(`src/domain/entities/SelfAssessment.ts`)과 엣지 함수
 * (`supabase/functions/_shared/selfAssessment.ts`)다. 엣지 함수는 Deno 라 앱 파일을 import 할 수
 * 없어 규칙을 옮겨 적었다. 두 값이 어긋나면 **앱에서는 되는데 서버가 거절하는**(또는 그 반대의)
 * 상태가 되고, 학생은 다 쓴 글을 잃는다.
 *
 * ★엣지 함수 테스트는 Deno.test 라 `npm run test`(vitest)가 **안 돌린다.** 그래서 게이트 4종이
 *   전부 초록인 채로 두 벌이 갈라질 수 있다. 이 파일이 그 구멍을 메운다 — 값을 실행이 아니라
 *   **소스 글자로** 견준다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SELF_ASSESSMENT_MAX_ANSWER_LENGTH,
  SELF_ASSESSMENT_MAX_PROMPT_LENGTH,
  SELF_ASSESSMENT_MAX_QUESTIONS,
} from '@domain/entities/SelfAssessment';

const EDGE_FILE = resolve(__dirname, '../../../../supabase/functions/_shared/selfAssessment.ts');

function edgeConst(name: string, source: string): number {
  const m = new RegExp(`export const ${name} = (\\d+);`).exec(source);
  if (!m) throw new Error(`엣지 함수에서 ${name} 를 찾지 못했습니다. 이름이 바뀌었나요?`);
  return Number(m[1]);
}

/** 070 에서 이름 붙은 CHECK 제약 한 덩어리만 떼어 온다. 두 제약을 섞어 보지 않기 위해서다. */
function migrationBlock(constraintName: string): string {
  const sql = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/070_assignment_self_assessment.sql'),
    'utf-8',
  );
  const start = sql.indexOf(`ADD CONSTRAINT ${constraintName}`);
  if (start < 0)
    throw new Error(`070 에서 ${constraintName} 를 찾지 못했습니다. 이름이 바뀌었나요?`);
  const end = sql.indexOf(';', start);
  return sql.slice(start, end);
}

function limitIn(block: string): number {
  const m = /jsonb_array_length\([a-z_]+\) <= (\d+)/.exec(block);
  if (!m) throw new Error('CHECK 안에서 개수 상한을 찾지 못했습니다.');
  return Number(m[1]);
}

describe('자기평가 상한 — 앱과 엣지 함수가 같아야 한다', () => {
  const source = readFileSync(EDGE_FILE, 'utf-8');

  it('문항 수 상한이 같다', () => {
    expect(edgeConst('MAX_QUESTIONS', source)).toBe(SELF_ASSESSMENT_MAX_QUESTIONS);
  });

  it('답변 길이 상한이 같다', () => {
    expect(edgeConst('MAX_ANSWER_LENGTH', source)).toBe(SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
  });

  it('문항 길이 상한이 같다', () => {
    expect(edgeConst('MAX_PROMPT_LENGTH', source)).toBe(SELF_ASSESSMENT_MAX_PROMPT_LENGTH);
  });

  it('★엣지 함수의 **실제 자르기**가 코드 포인트 기준이다', () => {
    // ★검사 대상은 반드시 `clip` — 실제로 답변을 자르는 함수다. 예전에는 아무도 안 부르는
    //   `textLength` 의 본문에 걸려 있어서, `clip` 을 String.slice 로 바꿔도 이 검사가 통과했다.
    //   "실제로 안 지켜지는 계약"의 표본이라 리뷰에서 잡혔다.
    expect(source).toMatch(/function clip\([\s\S]{0,120}?Array\.from\(text\)\.slice\(/);
    expect(source).not.toMatch(/function clip\([\s\S]{0,120}?text\.slice\(/);
  });

  it('★앱도 문항을 String.slice 로 자르지 않는다 — 자르는 자리가 이모지 한복판이면 반쪽 글자가 남는다', () => {
    const app = readFileSync(
      resolve(__dirname, '../../../domain/entities/SelfAssessment.ts'),
      'utf-8',
    );
    expect(app).toMatch(/function clipText\([\s\S]{0,120}?Array\.from\(text\)\.slice\(/);
    expect(app).not.toMatch(/prompt\.slice\(/);
  });

  it('★학생 화면(landing)의 답변 길이 상한도 같다 — 여기만 갈리면 "1200자까지"라 해 놓고 서버가 1000에서 자른다', () => {
    const landing = readFileSync(
      resolve(__dirname, '../../../../landing/src/components/submit/submitApi.ts'),
      'utf-8',
    );
    const m = /export const SELF_ASSESSMENT_MAX_ANSWER_LENGTH = (\d+);/.exec(landing);
    expect(m, 'landing 에서 답변 길이 상한을 찾지 못했습니다').not.toBeNull();
    expect(Number(m![1])).toBe(SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
  });

  it('★학생 화면도 글자를 코드 포인트로 센다 — text.length 로 바뀌면 잔여 글자 수가 서버 자르기와 어긋난다', () => {
    const landing = readFileSync(
      resolve(__dirname, '../../../../landing/src/components/submit/submitApi.ts'),
      'utf-8',
    );
    expect(landing).toMatch(/function answerLength\([\s\S]{0,120}?Array\.from\(text\)\.length/);
    expect(landing).not.toMatch(/function answerLength\([\s\S]{0,120}?text\.length/);
  });

  it('마이그레이션의 **문항** 수 상한이 앱과 같다 (assignments 쪽)', () => {
    // ★두 제약을 한 값으로 묶어 보던 예전 판본이 이번 혼선의 뿌리였다(코드 리뷰가 지적).
    //   assignments = 교사가 정하는 문항 수(6). submissions = 답이 쌓이는 칸(12). 성격이 다르다.
    const block = migrationBlock('assignments_self_assessment_shape');
    expect(limitIn(block)).toBe(SELF_ASSESSMENT_MAX_QUESTIONS);
  });

  it('★마이그레이션의 **저장 가능한 답** 상한이 엣지 함수의 자르기 값과 같다 (submissions 쪽)', () => {
    // 여기가 어긋나면 교사가 문항을 갈아 끼운 뒤 재제출이 CHECK 위반으로 500 이 되고,
    // 학생이 방금 쓴 글을 통째로 잃는다. 자르기 값(엣지)과 표의 값이 반드시 같아야 한다.
    const block = migrationBlock('submissions_self_assessment_shape');
    expect(limitIn(block)).toBe(edgeConst('MAX_STORED_ANSWERS', source));
  });

  it('저장 가능한 답 상한은 문항 상한보다 넉넉해야 한다', () => {
    expect(edgeConst('MAX_STORED_ANSWERS', source)).toBeGreaterThan(SELF_ASSESSMENT_MAX_QUESTIONS);
  });
});
