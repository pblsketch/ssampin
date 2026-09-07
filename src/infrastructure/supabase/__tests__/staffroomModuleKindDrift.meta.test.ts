/**
 * 모듈 종류가 **여섯 곳**에 흩어져 있다 — 함께 견주는 메타 테스트
 *
 * `staffroomLimitsDrift.meta.test.ts` 와 같은 이유로 둔다. 그 파일 머리말이
 * 이 저장소의 결론을 이미 적어 뒀다 — *"각 파일 주석에 '두 곳을 함께 고쳐야
 * 한다'라고만 적어 두었다. 그건 지켜지지 않는다."*
 *
 * 한 곳만 고쳤을 때 무엇이 보이는가:
 *   도메인 union      타입 에러로 바로 잡힌다 (그나마 안전한 쪽)
 *   서버 MODULE_KINDS 서버가 모르는 종류라며 거부한다
 *   화면 목록          관리자가 고를 수 없다
 *   SQL CHECK          ★ 만들려는 순간 500. **검사 4종은 전부 초록이다**
 *   이름 맵            ★ 탭 이름이 "새 공간" 으로 뜬다 (`?? '새 공간'` 폴백)
 *   아이콘 맵          ★ 탭 아이콘이 톱니바퀴로 뜬다 (`?? 'widgets'` 폴백)
 *
 * 아래 셋(★)이 이 파일이 있는 진짜 이유다. 타입 검사도 린트도 못 잡는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALL_MODULE_KINDS,
  STAFFROOM_MODULE_DEFAULT_NAMES,
  STAFFROOM_MODULE_ICONS,
} from '@domain/entities/StaffRoomRooms';
import { MODULE_KINDS } from '../../../../supabase/functions/_shared/staffroomAccess';

const root = (p: string) => resolve(__dirname, '../../../../', p);
const read = (p: string) => readFileSync(root(p), 'utf-8');

const DOMAIN_ENTITY = read('src/domain/entities/StaffRoomBoard.ts');
const SQL_050 = read('supabase/migrations/050_staffroom_board.sql');
const SQL_066 = read('supabase/migrations/066_staffroom_submission.sql');
const SUBMISSIONS_SHARED = read('supabase/functions/_shared/staffroomSubmissions.ts');

const EXPECTED = [...ALL_MODULE_KINDS].sort();

/** SQL 의 `CHECK (kind IN ('a', 'b', ...))` 에서 종류를 뽑는다 */
function kindsFromCheck(sql: string): string[] | null {
  const matched = /CHECK \(kind IN \(([^)]*)\)\)/.exec(sql);
  if (!matched) return null;
  return ((matched[1] ?? '').match(/'([a-z]+)'/g) ?? []).map((s) => s.replace(/'/g, '')).sort();
}

describe('모듈 종류 — 여섯 곳이 같은 목록을 쓴다', () => {
  it('1) 도메인 정본 (ALL_MODULE_KINDS)', () => {
    expect(EXPECTED).toEqual(
      ['archive', 'board', 'discussion', 'gallery', 'minutes', 'submission'].sort(),
    );
  });

  it('2) 도메인 union (StaffRoomModuleKind)', () => {
    for (const kind of ALL_MODULE_KINDS) {
      expect(DOMAIN_ENTITY).toContain(`'${kind}'`);
    }
  });

  it('3) 서버 MODULE_KINDS', () => {
    expect([...MODULE_KINDS].sort()).toEqual(EXPECTED);
  });

  it('4) ★ 데이터베이스 CHECK 제약 — 마지막으로 적용되는 정의를 본다', () => {
    // 050 은 다섯 종류로 만들었고, 066 의 ALTER 가 여섯으로 갈아끼운다.
    // 050 만 보면 실패하므로 **나중 파일이 있으면 그것을 정본으로 삼는다.**
    const latest = kindsFromCheck(SQL_066) ?? kindsFromCheck(SQL_050);
    expect(latest).toEqual(EXPECTED);
  });

  it('5) ★ 기본 이름 맵 — 빠뜨리면 탭이 "새 공간" 으로 뜬다', () => {
    expect(Object.keys(STAFFROOM_MODULE_DEFAULT_NAMES).sort()).toEqual(EXPECTED);
  });

  it('6) ★ 아이콘 맵 — 빠뜨리면 탭이 톱니바퀴로 뜬다', () => {
    expect(Object.keys(STAFFROOM_MODULE_ICONS).sort()).toEqual(EXPECTED);
  });
});

describe('★ 제출 과제 순수 파일은 import 화이트리스트를 지킨다', () => {
  /**
   * `staffroomSubmissions.ts` 가 `staffroomDb.ts` 를 참조하면 —— 값이든
   * `import type` 이든 —— `https://esm.sh/...`(TS2307)와 `Deno`(TS2304)가
   * 딸려 와 **프로젝트 타입 검사가 깨진다.** 그러면 이 파일을 부르는 서버
   * 테스트도 함께 못 돈다.
   *
   * 산문 규칙은 지켜지지 않으므로 게이트로 고정한다.
   */
  const ALLOWED = './staffroomAccess.ts';

  /**
   * ★ 주석을 걷어내고 본다.
   *
   * 그 파일은 머리말에서 "`staffroomDb.ts` 를 참조하지 마라"고 **설명**한다.
   * 글자 그대로 훑으면 그 설명 자체가 규칙에 걸린다. 이 저장소의 회귀 검사도
   * 같은 사고를 겪고 `stripComments` 옵션을 갖게 됐다.
   */
  const code = SUBMISSIONS_SHARED.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it(`import 는 ${ALLOWED} 하나만 쓴다`, () => {
    const sources = [...code.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
    expect(sources.length).toBeGreaterThan(0); // 정규식이 헛도는 것도 잡는다
    expect([...new Set(sources)]).toEqual([ALLOWED]);
  });

  it('staffroomDb 를 값으로도 타입으로도 부르지 않는다', () => {
    expect(code).not.toContain('staffroomDb');
  });

  it('Deno 전역과 URL import 를 쓰지 않는다', () => {
    expect(code).not.toContain('Deno.');
    expect(code).not.toMatch(/from\s+'https?:\/\//);
  });
});
