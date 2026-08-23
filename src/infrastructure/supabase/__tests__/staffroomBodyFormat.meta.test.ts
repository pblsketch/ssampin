/**
 * 온라인 교무실 — 본문 형식 칸(053) 메타 테스트
 *
 * 049·050 과 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어, 설계가
 * 실수로 무너지지 않았는지 확인한다. 진짜 DB 에 붙지 않고도 CI 에서 상시 도는
 * 유일한 방어선이다.
 *
 * 여기서 지키는 것은 두 가지다.
 *  1) 기본값이 'plain' 이라는 것 — markdown 이 기본이 되면 옛 글에 우연히 든
 *     `*` `_` `#` 이 어느 날 갑자기 서식으로 해석돼 글이 다르게 보인다.
 *  2) 'html' 과 'markdown' 이 허용값에 없다는 것.
 *     - html: 교무실은 남이 쓴 글을 내 화면에 그리는 기능이라, 소독 도구 없이
 *       html 을 그리면 위험하다(회귀 #7 과 같은 이유).
 *     - markdown: 글자색·글자크기를 적을 방법이 없어 오너 결정으로 뺐다(ADR-069).
 *       화면이 그릴 줄 모르는 형식을 허용값에 남기지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/053_staffroom_body_format.sql'),
  'utf-8',
);

/**
 * 주석을 걷어낸 SQL — **개수를 세거나 "없음"을 확인할 때는 반드시 이걸 쓴다.**
 *
 * 이 파일 머리말에 설계 근거를 길게 적어 두었는데, 거기 쓰인 "GRANT",
 * "ADD COLUMN IF NOT EXISTS" 같은 낱말까지 함께 세면 실제로 실행되는 SQL 이
 * 아니라 설명문을 채점하게 된다. (실제로 이 테스트를 처음 붙였을 때 그 이유로
 * 2건이 헛되이 실패했다.)
 */
const EXEC_SQL = SQL.replace(/--.*$/gm, '');

/** 본문을 저장했다가 나중에 다시 펼치는 자리 — 세 곳 모두 형식을 알아야 한다 */
const TABLES = ['staffroom_posts', 'staffroom_comments', 'staffroom_drafts'] as const;

describe('053 마이그레이션 — 본문 형식 칸', () => {
  for (const table of TABLES) {
    it(`${table} 에 body_format 을 더한다`, () => {
      expect(SQL).toMatch(
        new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN IF NOT EXISTS body_format`),
      );
    });
  }

  it('기본값은 plain 이다 — 편집기가 붙기 전 글은 전부 맨글이다', () => {
    const defaults = EXEC_SQL.match(/DEFAULT 'plain'/g) ?? [];
    expect(defaults).toHaveLength(TABLES.length);
  });

  it("NOT NULL 이라 '형식을 모르는 글'이 생기지 않는다", () => {
    const notNulls = EXEC_SQL.match(/body_format TEXT NOT NULL/g) ?? [];
    expect(notNulls).toHaveLength(TABLES.length);
  });
});

describe('053 마이그레이션 — 값 제한', () => {
  it('plain 과 lexical 만 허용한다', () => {
    expect(SQL).toContain("CHECK (body_format IN (''plain'', ''lexical''))");
  });

  it('html 은 허용값이 아니다 — 소독 없이 남의 글을 그리지 않는다', () => {
    expect(EXEC_SQL).not.toMatch(/''html''/);
  });

  it('markdown 은 허용값이 아니다 — 글자색·글자크기를 적을 수 없어 뺐다', () => {
    // 화면이 그릴 줄 모르는 형식이 저장되면 그 글은 영영 제대로 안 보인다.
    expect(EXEC_SQL).not.toMatch(/''markdown''/);
  });

  it('세 표 모두에 제약 이름을 따로 붙인다', () => {
    expect(SQL).toContain("v_check := v_table || '_body_format_check'");
    for (const table of TABLES) {
      expect(SQL).toContain(`'${table}'`);
    }
  });
});

describe('053 마이그레이션 — 재실행 안전', () => {
  it('칸 추가가 멱등이다 (ADD COLUMN IF NOT EXISTS)', () => {
    const guarded = EXEC_SQL.match(/ADD COLUMN IF NOT EXISTS/g) ?? [];
    expect(guarded).toHaveLength(TABLES.length);
  });

  it('제약 추가가 멱등이다 (pg_constraint 가드)', () => {
    expect(SQL).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = v_check/);
  });
});

describe('053 마이그레이션 — 격리를 건드리지 않는다', () => {
  it('anon/authenticated 에 권한을 주지 않는다', () => {
    // 049·050 이 잠가 둔 것을 칸 추가하면서 실수로 열지 않았는지 확인한다.
    expect(EXEC_SQL).not.toMatch(/GRANT/i);
  });

  it('RLS 를 끄지 않는다', () => {
    expect(EXEC_SQL).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});
