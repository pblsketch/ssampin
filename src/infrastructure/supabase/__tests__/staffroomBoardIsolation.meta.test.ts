/**
 * 온라인 교무실 게시판(M2) — 격리·설계 메타 테스트
 *
 * 049 와 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어, 격리 장치와
 * 계획서 §3.5-나 의 "읽음 확인 두 갈래" 설계가 실수로 무너지지 않았는지 확인한다.
 * 진짜 DB 에 붙지 않고도 CI 에서 상시 도는 유일한 방어선이다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/050_staffroom_board.sql'),
  'utf-8',
);

const TABLES = [
  'staffroom_modules',
  'staffroom_posts',
  'staffroom_comments',
  'staffroom_module_reads',
  'staffroom_post_reads',
  'staffroom_mentions',
  'staffroom_drafts',
] as const;

describe('050 마이그레이션 — 표', () => {
  for (const table of TABLES) {
    it(`${table} 를 만든다`, () => {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  }
});

describe('050 마이그레이션 — 부서 간 격리', () => {
  for (const table of TABLES) {
    it(`${table} 에 RLS 가 켜져 있다`, () => {
      expect(SQL).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    });
  }

  it('일곱 표 모두 service_role 전용 정책을 만든다', () => {
    const policyBlock = SQL.slice(SQL.indexOf('FOREACH v_table IN ARRAY'));
    for (const table of TABLES) {
      expect(policyBlock).toContain(`'${table}'`);
    }
    expect(policyBlock).toContain("auth.role() = ''service_role''");
  });

  for (const table of TABLES) {
    it(`${table} 의 anon / authenticated 권한을 회수한다`, () => {
      expect(SQL).toMatch(
        new RegExp(`REVOKE ALL ON public\\.${table}\\s+FROM anon, authenticated;`),
      );
    });
  }

  it('anon 에게 다시 GRANT 하는 줄이 없다', () => {
    expect(SQL.match(/GRANT[^;]*\bTO\b[^;]*\banon\b/g) ?? []).toEqual([]);
  });
});

describe('050 마이그레이션 — ★ 읽음 확인 두 갈래 (계획서 §3.5-나)', () => {
  it('모듈 읽음은 사람×게시판 한 줄이다 (글 수만큼 늘지 않는다)', () => {
    const block = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_module_reads'),
      SQL.indexOf('ALTER TABLE staffroom_module_reads'),
    );
    expect(block).toContain('PRIMARY KEY (module_id, member_email)');
    expect(block).toContain('last_seen_at');
    // 글 단위 컬럼이 들어오면 설계가 무너진 것이다
    expect(block).not.toContain('post_id');
  });

  it('사람별 읽음 기록 표는 필독 글 전용임이 주석으로 못박혀 있다', () => {
    const block = SQL.slice(SQL.indexOf('COMMENT ON TABLE staffroom_post_reads'));
    expect(block.slice(0, 400)).toContain('필독 글에만');
  });

  it('필독 컬럼이 사람별 읽음과 연결되어 있음이 문서화되어 있다', () => {
    const comment = SQL.slice(SQL.indexOf('COMMENT ON COLUMN staffroom_posts.is_required'));
    expect(comment.slice(0, 300)).toContain('staffroom_post_reads');
    expect(comment.slice(0, 300)).toContain('관리자만');
  });

  it('같은 사람이 같은 필독 글을 두 번 세지 않는다', () => {
    const block = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_post_reads'),
      SQL.indexOf('COMMENT ON TABLE staffroom_post_reads'),
    );
    expect(block).toContain('PRIMARY KEY (post_id, member_email)');
  });
});

describe('050 마이그레이션 — 정리·중복 방어', () => {
  it('부서를 지우면 글·댓글·멘션이 함께 지워진다', () => {
    for (const t of ['staffroom_posts', 'staffroom_comments', 'staffroom_mentions']) {
      const block = SQL.slice(
        SQL.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`),
        SQL.indexOf(`ALTER TABLE ${t} ENABLE`),
      );
      expect(block).toMatch(
        /department_id\s+UUID\s+NOT NULL REFERENCES staffroom_departments\(id\) ON DELETE CASCADE/,
      );
    }
  });

  it('글을 지우면 댓글·읽음 기록·멘션이 함께 지워진다', () => {
    for (const t of ['staffroom_comments', 'staffroom_post_reads', 'staffroom_mentions']) {
      const block = SQL.slice(
        SQL.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`),
        SQL.indexOf(`ALTER TABLE ${t} ENABLE`),
      );
      expect(block).toContain('REFERENCES staffroom_posts(id) ON DELETE CASCADE');
    }
  });

  it('임시저장은 사람마다 게시판마다 한 벌이다', () => {
    const block = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_drafts'));
    expect(block).toContain('PRIMARY KEY (module_id, author_email)');
  });

  it('같은 사람을 한 글에서 두 번 부르지 않는다', () => {
    const block = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_mentions'));
    expect(block).toContain('UNIQUE (post_id, mentioned_email)');
  });

  it('모듈 종류는 정해진 다섯 가지뿐이다', () => {
    expect(SQL).toContain(
      "CHECK (kind IN ('board', 'archive', 'discussion', 'gallery', 'minutes'))",
    );
  });
});

describe('050 마이그레이션 — 기존 부서 보정', () => {
  it('이미 있는 부서에도 기본 게시판을 깔아 준다 (게시판 없는 부서가 남지 않게)', () => {
    const tail = SQL.slice(SQL.indexOf('INSERT INTO staffroom_modules'));
    expect(tail).toContain('FROM staffroom_departments');
    expect(tail).toContain('WHERE NOT EXISTS');
    expect(tail).toContain("'board'");
  });
});

describe('050 마이그레이션 — 멱등성', () => {
  it('표 생성이 IF NOT EXISTS 다', () => {
    expect(SQL.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? []).toEqual([]);
  });

  it('인덱스 생성이 IF NOT EXISTS 다', () => {
    expect(SQL.match(/CREATE INDEX(?! IF NOT EXISTS)/g) ?? []).toEqual([]);
  });

  it('정책 생성이 pg_policies 존재 확인 가드 안에 있다', () => {
    expect(SQL).toContain('SELECT 1 FROM pg_policies');
  });

  it('기존 부서 보정도 중복 삽입되지 않는다', () => {
    const tail = SQL.slice(SQL.indexOf('INSERT INTO staffroom_modules'));
    expect(tail).toContain('WHERE NOT EXISTS');
  });
});

describe('050 마이그레이션 — M2 범위 지키기', () => {
  it('첨부파일 표를 만들지 않는다 (M3 자료실과 함께)', () => {
    expect(SQL).not.toContain('staffroom_attachments');
    expect(SQL).not.toContain('staffroom_files');
  });

  it('활동 포인트·랭킹 같은 금지 기능이 없다', () => {
    for (const banned of ['point', 'ranking', 'score', 'badge_count', 'streak']) {
      expect(SQL.toLowerCase()).not.toContain(`staffroom_${banned}`);
    }
  });
});

describe('050 마이그레이션 — 안 읽은 개수 세기', () => {
  it('개수를 데이터베이스가 센다 (앱이 글을 통째로 받지 않는다 — §3.5-다)', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION staffroom_unread_counts');
    expect(SQL).toContain(
      'RETURNS TABLE (department_id UUID, module_id UUID, unread_count BIGINT)',
    );
  });

  it('"마지막 본 시각" 이후 글만 센다', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION staffroom_unread_counts'));
    expect(fn).toContain('r.last_seen_at IS NULL OR p.created_at > r.last_seen_at');
  });

  it('service_role 만 부를 수 있다 (멤버십 확인을 안 하므로)', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION staffroom_unread_counts(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;',
    );
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION staffroom_unread_counts(TEXT, UUID[]) TO service_role;',
    );
  });
});
