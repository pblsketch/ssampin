/**
 * 온라인 교무실 — 말머리·해시태그(054) 격리·설계 메타 테스트
 *
 * 049·050 과 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어, 격리 장치와
 * 설계 결정이 실수로 무너지지 않았는지 확인한다. 진짜 DB 에 붙지 않고도 CI 에서
 * 상시 도는 유일한 방어선이다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/054_staffroom_post_taxonomy.sql'),
  'utf-8',
);

/** 주석을 걷어낸 SQL — 개수를 세거나 "없음"을 볼 때는 반드시 이걸 쓴다 */
const EXEC_SQL = SQL.replace(/--.*$/gm, '');

const NEW_TABLES = ['staffroom_categories', 'staffroom_post_tags'] as const;

describe('054 마이그레이션 — 표', () => {
  for (const table of NEW_TABLES) {
    it(`${table} 를 만든다`, () => {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  }

  it('글에 말머리 칸을 더한다', () => {
    expect(EXEC_SQL).toMatch(/ALTER TABLE staffroom_posts\s+ADD COLUMN IF NOT EXISTS category_id/);
  });
});

describe('054 마이그레이션 — 부서 간 격리 (049·050 과 같은 두 겹)', () => {
  for (const table of NEW_TABLES) {
    it(`${table} 에 RLS 가 켜져 있다`, () => {
      expect(SQL).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    });
  }

  it('service_role 전용 정책을 건다', () => {
    expect(EXEC_SQL).toContain("auth.role() = ''service_role''");
  });

  it('anon·authenticated 의 권한을 회수한다 — 정책이 느슨해져도 닿지 못하게', () => {
    expect(EXEC_SQL).toContain('REVOKE ALL ON public.%I FROM anon, authenticated');
  });

  it('anon·authenticated 에 권한을 주지 않는다', () => {
    expect(EXEC_SQL).not.toMatch(/GRANT\s/i);
  });
});

describe('054 마이그레이션 — 지웠을 때의 파급', () => {
  it('부서를 지우면 말머리·태그가 함께 지워진다', () => {
    const cascades = EXEC_SQL.match(/REFERENCES staffroom_departments\(id\) ON DELETE CASCADE/g);
    expect(cascades?.length).toBe(2);
  });

  it('글을 지우면 그 글의 태그도 함께 지워진다', () => {
    expect(EXEC_SQL).toMatch(/REFERENCES staffroom_posts\(id\) ON DELETE CASCADE/);
  });

  it('🔒 말머리를 지워도 글은 남는다 (SET NULL — CASCADE 가 아니다)', () => {
    // 여기가 CASCADE 로 바뀌면 말머리 하나 지웠다가 그 말머리를 쓰던 글이
    // 전부 사라진다. 되돌릴 수 없는 사고라 테스트로 못박는다.
    expect(EXEC_SQL).toMatch(/REFERENCES staffroom_categories\(id\) ON DELETE SET NULL/);
    expect(EXEC_SQL).not.toMatch(/REFERENCES staffroom_categories\(id\) ON DELETE CASCADE/);
  });

  it('말머리 칸은 비어 있을 수 있다 (말머리 없는 글)', () => {
    // NOT NULL 이면 이미 쓰인 글을 전부 어딘가에 밀어 넣어야 한다
    expect(EXEC_SQL).not.toMatch(/ADD COLUMN IF NOT EXISTS category_id UUID\s+NOT NULL/);
  });
});

describe('054 마이그레이션 — 같은 값이 갈리지 않게', () => {
  it('한 부서 안에서 말머리 이름이 겹치지 않는다', () => {
    expect(EXEC_SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \S+\s+ON staffroom_categories \(department_id, name\)/,
    );
  });

  it('같은 글에 같은 태그가 두 번 붙지 않는다 (기본키)', () => {
    expect(EXEC_SQL).toMatch(/PRIMARY KEY \(post_id, tag\)/);
  });

  it('태그로 찾는 길이 있다', () => {
    expect(EXEC_SQL).toMatch(/ON staffroom_post_tags \(department_id, tag\)/);
  });
});

describe('054 마이그레이션 — 재실행 안전', () => {
  it('표·칸·인덱스가 전부 멱등이다', () => {
    expect(EXEC_SQL).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(EXEC_SQL).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(EXEC_SQL).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
  });

  it('정책 추가가 멱등이다 (pg_policies 가드)', () => {
    expect(EXEC_SQL).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_policies/);
  });
});
