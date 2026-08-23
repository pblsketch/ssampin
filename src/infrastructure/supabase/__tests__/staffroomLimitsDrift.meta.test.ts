/**
 * 온라인 교무실 — 앱·서버·DB 의 기준값이 어긋나지 않는다 (드리프트 가드)
 *
 * ## 왜 필요한가
 *
 * 같은 규칙이 **세 곳**에 적혀 있다. 서버가 앱을 믿지 않으므로 어쩔 수 없이
 * 겹쳐 쓴 것이다:
 *
 *   앱      `domain/rules/staffRoomTaxonomy.ts` · `domain/entities/StaffRoomBoard.ts`
 *   서버    `supabase/functions/_shared/staffroomDb.ts` · `staffroom-categories/index.ts`
 *   DB      `supabase/migrations/053·054·055`
 *
 * 지금까지는 각 파일 주석에 "두 곳을 함께 고쳐야 한다"라고만 적어 두었다.
 * **그건 지켜지지 않는다.** 한쪽만 고치면 이런 일이 벌어진다:
 *
 *   - 앱 상한만 늘림 → 선생님은 30자를 다 치는데 저장할 때 서버가 거부한다.
 *     화면에는 아무 표시가 없다가 "글이 안 올라간다"로 돌아온다.
 *   - 서버 상한만 늘림 → 앱이 먼저 막아서 늘린 값이 영영 쓰이지 않는다.
 *   - 본문 형식 값이 어긋남 → 저장은 되는데 DB CHECK 에 걸리거나, 저장된 글을
 *     화면이 그릴 줄 몰라 "내용을 불러오지 못했습니다"만 뜬다.
 *
 * 그래서 **글자 그대로 읽어 견준다.** 실행하지 않고 파일을 읽는 방식이라
 * Deno 서버 코드와 SQL 까지 한 자리에서 볼 수 있다.
 *
 * 값을 바꿀 때는 세 곳을 함께 고치면 이 테스트가 다시 통과한다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../../..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf-8');

const APP_TAXONOMY = read('src/domain/rules/staffRoomTaxonomy.ts');
const APP_BOARD = read('src/domain/entities/StaffRoomBoard.ts');
const SERVER_DB = read('supabase/functions/_shared/staffroomDb.ts');
const SERVER_CATEGORIES = read('supabase/functions/staffroom-categories/index.ts');
const SQL_053 = read('supabase/migrations/053_staffroom_body_format.sql');

/** `이름 = 숫자` 를 읽는다. 못 찾으면 null — 이름이 바뀐 것도 잡아야 해서다 */
function numberOf(source: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*([0-9_]+)`).exec(source);
  return match === null ? null : Number(match[1]!.replace(/_/g, ''));
}

describe('기준값 — 앱과 서버가 같은 숫자를 쓴다', () => {
  const pairs: {
    what: string;
    app: number | null;
    server: number | null;
    /** 어긋나면 선생님에게 무엇으로 보이는가 */
    symptom: string;
  }[] = [
    {
      what: '해시태그 한 개 길이',
      app: numberOf(APP_TAXONOMY, 'STAFFROOM_TAG_MAX_LENGTH'),
      server: numberOf(SERVER_DB, 'TAG_MAX_LENGTH'),
      symptom: '앱에서는 쳐지는데 저장하면 그 태그만 조용히 빠진다',
    },
    {
      what: '글 하나의 해시태그 수',
      app: numberOf(APP_TAXONOMY, 'STAFFROOM_POST_MAX_TAGS'),
      server: numberOf(SERVER_DB, 'POST_MAX_TAGS'),
      symptom: '앱에서 붙인 태그가 저장 뒤에 줄어 있다',
    },
    {
      what: '글 하나의 첨부 수',
      app: numberOf(APP_BOARD, 'STAFFROOM_POST_MAX_ATTACHMENTS'),
      server: numberOf(SERVER_DB, 'POST_MAX_ATTACHMENTS'),
      symptom: '붙인 파일이 저장 뒤에 사라진다',
    },
    {
      what: '말머리 이름 길이',
      app: numberOf(APP_TAXONOMY, 'STAFFROOM_CATEGORY_NAME_MAX_LENGTH'),
      server: numberOf(SERVER_CATEGORIES, 'CATEGORY_NAME_MAX_LENGTH'),
      symptom: '이름을 다 쳤는데 "1~N자로 적어주세요" 가 뜬다',
    },
    {
      what: '부서의 말머리 개수',
      app: numberOf(APP_TAXONOMY, 'STAFFROOM_CATEGORY_MAX_COUNT'),
      server: numberOf(SERVER_CATEGORIES, 'CATEGORY_MAX_COUNT'),
      symptom: '"추가" 가 눌리는데 서버가 거부한다',
    },
  ];

  for (const pair of pairs) {
    it(`${pair.what} — 어긋나면: ${pair.symptom}`, () => {
      expect(pair.app, `앱에서 값을 못 찾음 (이름이 바뀌었나?)`).not.toBeNull();
      expect(pair.server, `서버에서 값을 못 찾음 (이름이 바뀌었나?)`).not.toBeNull();
      expect(pair.server).toBe(pair.app);
    });
  }
});

describe('본문 형식 — 앱·서버·DB 세 곳이 같은 값만 안다', () => {
  /**
   * 세 곳이 어긋나면 글이 저장되지 못하거나(DB CHECK), 저장된 글을 화면이 그릴
   * 줄 몰라 "내용을 불러오지 못했습니다" 만 뜬다. 둘 다 되돌리기 어렵다.
   */
  it('앱이 아는 값', () => {
    expect(APP_BOARD).toContain("export type StaffRoomBodyFormat = 'plain' | 'lexical';");
  });

  it('서버가 아는 값', () => {
    expect(SERVER_DB).toContain("STAFFROOM_BODY_FORMATS = ['plain', 'lexical']");
  });

  it('DB 가 받아들이는 값', () => {
    expect(SQL_053).toContain("body_format IN (''plain'', ''lexical'')");
  });

  it('세 곳 어디에도 html 이 없다 — 소독 없이 남의 글을 그리지 않는다', () => {
    for (const [name, source] of [
      ['앱', APP_BOARD],
      ['서버', SERVER_DB],
      ['DB', SQL_053.replace(/--.*$/gm, '')],
    ] as const) {
      expect(source, name).not.toMatch(/'html'|''html''/);
    }
  });
});

describe('태그 다듬는 규칙 — 앱과 서버가 같은 방식으로 깎는다', () => {
  /**
   * 규칙이 갈리면 `#체육대회` 와 `체육대회` 가 다른 태그로 저장되고, 걸러 보기가
   * 쓸모없어진다. 쌓인 뒤에는 되돌리기 어렵다.
   */
  const steps = [
    { what: '앞의 # 떼기', pattern: /replace\(\/\^#\+\/, ''\)/ },
    { what: '공백 없애기', pattern: /replace\(\/\\s\+\/g, ''\)/ },
    { what: '쉼표 없애기', pattern: /replace\(\/,\/g, ''\)/ },
  ];

  for (const step of steps) {
    it(`${step.what} — 앱에 있다`, () => {
      expect(APP_TAXONOMY).toMatch(step.pattern);
    });
    it(`${step.what} — 서버에도 있다`, () => {
      expect(SERVER_DB).toMatch(step.pattern);
    });
  }
});

describe('말머리 이름 다듬는 규칙 — 앱과 서버가 같다', () => {
  const steps = [
    { what: '감싼 대괄호 한 겹 벗기기', pattern: /startsWith\('\['\) && name\.endsWith\('\]'\)/ },
    { what: '줄바꿈·탭을 공백 하나로', pattern: /replace\(\/\\s\+\/g, ' '\)/ },
  ];

  for (const step of steps) {
    it(`${step.what} — 앱에 있다`, () => {
      expect(APP_TAXONOMY).toMatch(step.pattern);
    });
    it(`${step.what} — 서버에도 있다`, () => {
      expect(SERVER_CATEGORIES).toMatch(step.pattern);
    });
  }
});
