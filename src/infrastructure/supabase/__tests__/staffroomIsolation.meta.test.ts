/**
 * 온라인 교무실 — 부서 간 격리(RLS) 메타 테스트
 *
 * 계획서 §11: "부서 간 격리를 코드보다 먼저 설계한다. 쌤핀 최초의 다중 테넌트 기능이다.
 * 남의 부서 글·멤버·초대 코드가 보이지 않아야 한다."
 *
 * 이 테스트는 049 마이그레이션 SQL 을 **글자 그대로 읽어** 격리 장치가
 * 실수로 빠지지 않았는지 확인한다. 진짜 DB 에 붙지 않고도 CI 에서 상시 돌아가는
 * 유일한 방어선이라, 나중에 누가 정책을 지우면 여기서 먼저 빨간불이 켜진다.
 *
 * (044_revoke_secret_columns_from_anon.sql 이 남긴 교훈 — RLS 는 행 단위라
 *  열을 가리지 못한다. 그래서 GRANT 회수까지 함께 확인한다.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/049_staffroom_core.sql'),
  'utf-8',
);

const TABLES = [
  'staffroom_departments',
  'staffroom_members',
  'staffroom_invites',
  'staffroom_admin_tokens',
] as const;

describe('049 마이그레이션 — 테이블', () => {
  for (const table of TABLES) {
    it(`${table} 를 만든다`, () => {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  }
});

describe('049 마이그레이션 — 부서 간 격리', () => {
  for (const table of TABLES) {
    it(`${table} 에 RLS 가 켜져 있다`, () => {
      expect(SQL).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    });
  }

  it('네 테이블 모두 service_role 전용 정책 이름이 준비되어 있다', () => {
    // 정책은 DO 블록에서 테이블 배열을 돌며 만든다 — 배열에 네 개가 다 있어야 한다
    const policyBlock = SQL.slice(SQL.indexOf('FOREACH v_table IN ARRAY'));
    for (const table of TABLES) {
      expect(policyBlock).toContain(`'${table}'`);
    }
    expect(policyBlock).toContain('_service_all');
    expect(policyBlock).toContain("auth.role() = ''service_role''");
  });

  for (const table of TABLES) {
    it(`${table} 의 anon / authenticated 권한을 회수한다`, () => {
      const pattern = new RegExp(`REVOKE ALL ON public\\.${table}\\s+FROM anon, authenticated;`);
      expect(SQL).toMatch(pattern);
    });
  }

  it('anon 에게 다시 GRANT 하는 줄이 없다 (회수를 되돌리지 않았다)', () => {
    const grantsToAnon = SQL.match(/GRANT[^;]*\bTO\b[^;]*\banon\b/g) ?? [];
    expect(grantsToAnon).toEqual([]);
  });

  it('초대 수락 함수는 service_role 만 실행할 수 있다', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION staffroom_accept_invite(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;',
    );
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION staffroom_accept_invite(TEXT, TEXT, TEXT) TO service_role;',
    );
  });
});

describe('049 마이그레이션 — 중복·정원 방어', () => {
  it('같은 사람이 한 부서에 두 번 들어오지 못한다', () => {
    expect(SQL).toContain('UNIQUE (department_id, member_email)');
  });

  it('초대 코드는 유일하다', () => {
    expect(SQL).toMatch(/code\s+TEXT\s+NOT NULL UNIQUE/);
  });

  it('초대 코드는 31자 알파벳 6자리만 허용한다 (숫자 6자리 금지)', () => {
    expect(SQL).toContain("code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'");
  });

  it('초대 수락은 초대 행을 잠그고 처리한다 (정원 초과 경합 방지)', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION staffroom_accept_invite'));
    expect(fn).toContain('FOR UPDATE');
  });

  it('권한은 admin / member 2단계뿐이다', () => {
    expect(SQL).toContain("CHECK (role IN ('admin', 'member'))");
  });
});

describe('049 마이그레이션 — 관리자 토큰 분리', () => {
  it('teacher_tokens 를 건드리지 않는다', () => {
    expect(SQL).not.toContain('teacher_tokens (');
    expect(SQL).not.toMatch(
      /INSERT INTO teacher_tokens|UPDATE teacher_tokens|ALTER TABLE teacher_tokens/,
    );
  });

  it('부서 단위(department_id)로 토큰을 보관한다', () => {
    const block = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_admin_tokens'));
    expect(block).toContain('department_id            UUID        PRIMARY KEY');
  });
});

describe('049 마이그레이션 — 멱등성', () => {
  it('테이블 생성이 IF NOT EXISTS 다', () => {
    const creates = SQL.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? [];
    expect(creates).toEqual([]);
  });

  it('인덱스 생성이 IF NOT EXISTS 다', () => {
    const creates = SQL.match(/CREATE INDEX(?! IF NOT EXISTS)/g) ?? [];
    expect(creates).toEqual([]);
  });

  it('정책 생성이 pg_policies 존재 확인 가드 안에 있다', () => {
    expect(SQL).toContain('SELECT 1 FROM pg_policies');
  });
});
