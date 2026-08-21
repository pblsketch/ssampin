/**
 * 온라인 교무실 M4(토론방·회의록·일정·업무) — 격리·설계 메타 테스트
 *
 * 049~051 과 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어 격리 장치와
 * 계획서의 결정이 실수로 무너지지 않았는지 확인한다. 진짜 DB 에 붙지 않고도
 * CI 에서 상시 도는 유일한 방어선이다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/052_staffroom_rooms.sql'),
  'utf-8',
);

const TABLES = [
  'staffroom_discussions',
  'staffroom_discussion_votes',
  'staffroom_minutes',
  'staffroom_events',
  'staffroom_tasks',
] as const;

describe('052 마이그레이션 — 표', () => {
  for (const table of TABLES) {
    it(`${table} 를 만든다`, () => {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  }

  it('부서에 배너 칸을 더한다 (§6)', () => {
    expect(SQL).toContain('banner_kind');
    expect(SQL).toContain("CHECK (banner_kind IN ('color', 'preset', 'photo'))");
  });

  it('★ 갤러리 표를 새로 만들지 않는다 — 051 의 파일 표를 함께 쓴다', () => {
    // 표를 두 벌로 만들면 올리기·용량 집계·권한 회수를 두 번 관리하게 된다.
    expect(SQL).not.toContain('CREATE TABLE IF NOT EXISTS staffroom_gallery');
    expect(SQL).not.toContain('CREATE TABLE IF NOT EXISTS staffroom_photos');
  });
});

describe('052 마이그레이션 — 부서 간 격리', () => {
  for (const table of TABLES) {
    it(`${table} 에 RLS 가 켜져 있다`, () => {
      expect(SQL).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    });
  }

  it('다섯 표 모두 service_role 전용 정책을 만든다', () => {
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

  it('집계 함수도 service_role 만 부를 수 있다', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION staffroom_discussion_tally(UUID[]) FROM PUBLIC, anon, authenticated;',
    );
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION staffroom_discussion_tally(UUID[]) TO service_role;',
    );
  });
});

describe('052 마이그레이션 — ★ 활동 포인트·랭킹을 만들지 않는다 (계획서 §8-E)', () => {
  it('사람별 누적 점수를 담는 칸이 없다', () => {
    // 쌤핀의 명시적 금지 규칙이다. 선생님 대상이면 더 부담스럽다.
    for (const banned of ['point', 'score', 'rank', 'streak', 'badge', 'stamp', 'level']) {
      expect(SQL.toLowerCase()).not.toMatch(new RegExp(`\\b\\w*${banned}\\w*\\s+(integer|bigint)`));
    }
  });

  it('집계 함수는 안건 하나의 찬반만 센다 — 사람별로 세지 않는다', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION staffroom_discussion_tally'));
    expect(fn).toContain('GROUP BY d.id');
    expect(fn).not.toContain('GROUP BY v.member_email');
  });
});

describe('052 마이그레이션 — 토론방', () => {
  it('★ 사람마다 안건당 한 줄만 둔다', () => {
    // 줄을 쌓으면 "몇 번 투표했는지"가 남는데, 그건 §8-E 가 금지한 활동 집계와 같아진다.
    expect(SQL).toContain('uq_staffroom_discussion_votes');
    expect(SQL).toMatch(
      /uq_staffroom_discussion_votes[\s\S]{0,120}\(discussion_id, member_email\)/,
    );
  });

  it('찬성·반대·기권 셋만 받는다', () => {
    expect(SQL).toContain("CHECK (stance IN ('agree', 'disagree', 'abstain'))");
  });

  it('마감 시각을 둔다 — 집계를 보고 뒤집는 걸 막는 자리', () => {
    expect(SQL).toContain('closed_at      TIMESTAMPTZ');
  });
});

describe('052 마이그레이션 — 회의록 (계획서 §8-C)', () => {
  it('안건·논의·결정사항을 따로 받는다', () => {
    expect(SQL).toContain('agenda');
    expect(SQL).toContain('discussion');
    expect(SQL).toContain('decisions');
  });

  it('★ 토론방 안건이 지워져도 회의록은 남는다', () => {
    expect(SQL).toMatch(/from_discussion_id[\s\S]{0,120}ON DELETE SET NULL/);
  });

  it('회의한 날을 만든 날과 따로 받는다 (보통 회의 뒤에 적는다)', () => {
    expect(SQL).toContain('met_on         DATE        NOT NULL');
  });
});

describe('052 마이그레이션 — 부서 일정·업무 (계획서 §8-B)', () => {
  it('★ 부서 일정은 부서가 주인이다 — 부서가 지워지면 함께 사라진다', () => {
    // 개인 일정 표에 복사해 넣으면 부서를 나간 뒤에도 남는다.
    expect(SQL).toMatch(
      /staffroom_events[\s\S]{0,400}department_id\s+UUID\s+NOT NULL REFERENCES staffroom_departments\(id\) ON DELETE CASCADE/,
    );
  });

  it('업무에 담당자가 없을 수 있다 — "누가 할까요"를 적어 둘 자리', () => {
    expect(SQL).toContain('assignee_email TEXT,');
  });

  it('끝난 시각은 있지만 사람별 완료 개수를 세는 칸은 없다', () => {
    expect(SQL).toContain('done_at        TIMESTAMPTZ');
    expect(SQL.toLowerCase()).not.toContain('done_count');
  });
});
