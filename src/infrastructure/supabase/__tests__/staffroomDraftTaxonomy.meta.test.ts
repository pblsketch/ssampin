/**
 * 온라인 교무실 — 임시저장 말머리·태그·첨부 칸(056) 메타 테스트
 *
 * 053 과 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어, 설계가
 * 실수로 무너지지 않았는지 확인한다. 진짜 DB 에 붙지 않고도 CI 에서 상시 도는
 * 유일한 방어선이다.
 *
 * 여기서 지키는 것은 세 가지다.
 *  1) category_id 가 SET NULL 이라는 것 — CASCADE 로 바뀌면 관리자가 말머리를
 *     지우는 순간 쓰다 만 글(제목·본문)이 통째로 사라진다. 054 의 글과 같은 사고다.
 *  2) tags·file_ids 가 NOT NULL 기본 빈 배열이라는 것 — NULL 을 허용하면
 *     "빈 것"과 "모르는 것"이 갈려 서버·앱 양쪽에 ?? 가 늘고, 어느 날 하나가
 *     빠져 임시저장 복원이 터진다.
 *  3) 050 이 잠근 격리를 칸 추가하면서 실수로 열지 않았다는 것.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/056_staffroom_draft_taxonomy.sql'),
  'utf-8',
);

/**
 * 주석을 걷어낸 SQL — **개수를 세거나 "없음"을 확인할 때는 반드시 이걸 쓴다.**
 * 머리말 설명문에 쓰인 낱말까지 세면 실행 SQL 이 아니라 설명문을 채점하게 된다
 * (053 메타 테스트에서 실제로 그 이유로 2건이 헛되이 실패했다).
 */
const EXEC_SQL = SQL.replace(/--.*$/gm, '');

describe('056 마이그레이션 — 임시저장에 세 칸을 더한다', () => {
  it('category_id 를 더한다 (staffroom_categories FK)', () => {
    expect(EXEC_SQL).toMatch(
      /ALTER TABLE staffroom_drafts\s+ADD COLUMN IF NOT EXISTS category_id UUID\s+REFERENCES staffroom_categories\(id\)/,
    );
  });

  it('tags 를 더한다 (TEXT[], 기본 빈 배열)', () => {
    expect(EXEC_SQL).toMatch(/ADD COLUMN IF NOT EXISTS tags TEXT\[\] NOT NULL DEFAULT '\{\}'/);
  });

  it('file_ids 를 더한다 (UUID[], 기본 빈 배열)', () => {
    expect(EXEC_SQL).toMatch(/ADD COLUMN IF NOT EXISTS file_ids UUID\[\] NOT NULL DEFAULT '\{\}'/);
  });
});

describe('056 마이그레이션 — 말머리를 지워도 쓰다 만 글은 남는다', () => {
  it('category_id 는 ON DELETE SET NULL 이다', () => {
    expect(EXEC_SQL).toMatch(
      /category_id UUID\s+REFERENCES staffroom_categories\(id\) ON DELETE SET NULL/,
    );
  });

  it('CASCADE 가 아니다 — 말머리 삭제가 임시저장 행을 지우면 안 된다', () => {
    expect(EXEC_SQL).not.toMatch(/CASCADE/i);
  });
});

describe('056 마이그레이션 — 재실행 안전', () => {
  it('칸 추가가 전부 멱등이다 (ADD COLUMN IF NOT EXISTS)', () => {
    const guarded = EXEC_SQL.match(/ADD COLUMN IF NOT EXISTS/g) ?? [];
    expect(guarded).toHaveLength(3);
  });
});

describe('056 마이그레이션 — 격리를 건드리지 않는다', () => {
  it('anon/authenticated 에 권한을 주지 않는다', () => {
    // 050 이 잠가 둔 것을 칸 추가하면서 실수로 열지 않았는지 확인한다.
    expect(EXEC_SQL).not.toMatch(/GRANT/i);
  });

  it('RLS 를 끄지 않는다', () => {
    expect(EXEC_SQL).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});
