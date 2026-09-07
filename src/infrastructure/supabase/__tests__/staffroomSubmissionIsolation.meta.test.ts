/**
 * 온라인 교무실 제출 과제(066) — 격리·설계 메타 테스트
 *
 * 049~055 와 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어 격리 장치와
 * 계획서의 결정이 실수로 무너지지 않았는지 확인한다. 진짜 DB 에 붙지 않고도
 * CI 에서 상시 도는 유일한 방어선이다.
 *
 * ★ 이 파일이 막지 못하는 것 — **운영 DB 에 실제로 적용했는가**.
 *   여기는 파일 글자만 본다. 적용 확인은 계획서 AC-P4 대로
 *   `SELECT pg_get_constraintdef(...)` 를 직접 돌려 진행 기록에 붙인다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/066_staffroom_submission.sql'),
  'utf-8',
);

const TABLES = [
  'staffroom_submissions',
  'staffroom_submission_targets',
  'staffroom_task_forms',
] as const;

describe('066 마이그레이션 — 표', () => {
  for (const table of TABLES) {
    it(`${table} 를 만든다`, () => {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  }

  it('★ 모듈 종류 CHECK 에 submission 을 더한다', () => {
    // 050_staffroom_board.sql 의 CHECK 은 다섯 종류뿐이다. 이 줄이 없으면
    // 관리자가 제출 과제 모듈을 만드는 순간 Postgres 가 거부하는데,
    // 앱의 검사 4종은 전부 초록이라 원인 없는 오류로만 보인다.
    expect(SQL).toContain('DROP CONSTRAINT IF EXISTS staffroom_modules_kind_check');
    expect(SQL).toMatch(
      /CHECK \(kind IN \('board', 'archive', 'discussion', 'gallery', 'minutes', 'submission'\)\)/,
    );
  });

  it('업무에 인수인계 지식 세 칸을 더하고, 기존 업무를 건드리지 않는다', () => {
    for (const column of ['routines', 'howto', 'handover_notes']) {
      expect(SQL).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\s+JSONB NOT NULL DEFAULT '\\[\\]'::jsonb`),
      );
    }
  });
});

describe('066 마이그레이션 — 진행률이 부풀지 않게', () => {
  it('★ 같은 사람을 한 과제에 두 번 걸 수 없다', () => {
    // 두 번 걸리면 분모가 부푼다 — 11/11 로 끝나야 할 것이 11/12 가 된다.
    expect(SQL).toContain('UNIQUE (submission_id, member_email)');
  });

  it('★ 제출 주체를 staffroom_members 로 묶지 않는다', () => {
    // 049 의 멤버 표에는 "나갔다"를 표시하는 칸이 없고 내보내기가 행을 지운다.
    // FK 를 걸면 CASCADE 로 제출 이력까지 함께 사라진다.
    const targets = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_submission_targets'),
    );
    expect(targets.slice(0, targets.indexOf(');'))).not.toContain('REFERENCES staffroom_members');
  });

  it('★ 나간 사람의 이름을 복원할 자리를 둔다', () => {
    // 스냅샷이 없으면 "안 낸 분" 명단에 생 지메일만 남는다.
    expect(SQL).toContain('display_name_snapshot');
  });
});

describe('066 마이그레이션 — 서식이 조용히 사라지지 않게', () => {
  it('자료실 파일이 지워지면 줄은 남고 파일만 떨어진다', () => {
    // 055 와 같은 판단이다. CASCADE 로 지우면 업무가 고쳐진 줄 안다.
    expect(SQL).toMatch(/file_id\s+UUID\s+REFERENCES staffroom_files\(id\) ON DELETE SET NULL/);
  });

  it('지워진 뒤에도 무엇이었는지 알 수 있게 이름을 적어 둔다', () => {
    const forms = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS staffroom_task_forms'));
    expect(forms).toContain('file_name      TEXT        NOT NULL');
  });
});

describe('066 마이그레이션 — 부서 간 격리', () => {
  for (const table of TABLES) {
    it(`${table} 에 RLS 가 켜져 있다`, () => {
      expect(SQL).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    });
  }

  it('세 표 모두 service_role 전용 정책을 만든다', () => {
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

describe('066 마이그레이션 — ★ 활동 포인트·랭킹을 만들지 않는다 (계획서 §8-E)', () => {
  it('사람별 누적 점수를 담는 칸이 없다', () => {
    // 쌤핀의 명시적 금지 규칙이다. 선생님 대상이면 더 부담스럽다.
    for (const banned of ['point', 'score', 'rank', 'streak', 'badge', 'stamp', 'level']) {
      expect(SQL.toLowerCase()).not.toMatch(new RegExp(`\\b\\w*${banned}\\w*\\s+(integer|bigint)`));
    }
  });

  it('사람별로 묶어 세는 집계 함수를 만들지 않는다', () => {
    // done_at 은 "그 일이 끝났는지"를 말할 뿐 사람에게 붙는 점수가 아니다.
    expect(SQL).not.toMatch(/GROUP BY\s+\w*\.?member_email/i);
    expect(SQL).not.toContain('CREATE OR REPLACE FUNCTION');
  });
});
