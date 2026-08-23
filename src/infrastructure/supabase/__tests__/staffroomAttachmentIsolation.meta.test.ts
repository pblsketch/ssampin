/**
 * 온라인 교무실 — 글 첨부(055) 격리·설계 메타 테스트
 *
 * 049~054 와 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어, 격리 장치와
 * 설계 결정이 실수로 무너지지 않았는지 확인한다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/055_staffroom_post_attachments.sql'),
  'utf-8',
);

/** 주석을 걷어낸 SQL — 개수를 세거나 "없음"을 볼 때는 반드시 이걸 쓴다 */
const EXEC_SQL = SQL.replace(/--.*$/gm, '');

describe('055 마이그레이션 — 표', () => {
  it('staffroom_post_attachments 를 만든다', () => {
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS staffroom_post_attachments');
  });

  it('파일을 새로 담지 않고 자료실 파일을 가리킨다', () => {
    // 여기에 바이트나 드라이브 id 가 생기면 자료실과 두 벌이 된다
    expect(EXEC_SQL).toMatch(/REFERENCES staffroom_files\(id\)/);
    expect(EXEC_SQL).not.toMatch(/drive_file_id/);
    expect(EXEC_SQL).not.toMatch(/BYTEA|bytea/);
  });
});

describe('055 마이그레이션 — 지웠을 때의 파급', () => {
  it('글을 지우면 첨부 줄도 함께 지워진다', () => {
    expect(EXEC_SQL).toMatch(/REFERENCES staffroom_posts\(id\) ON DELETE CASCADE/);
  });

  it('부서를 지우면 첨부 줄도 함께 지워진다', () => {
    expect(EXEC_SQL).toMatch(/REFERENCES staffroom_departments\(id\) ON DELETE CASCADE/);
  });

  it('🔒 자료실에서 파일을 지워도 첨부 줄은 남는다 (SET NULL — CASCADE 가 아니다)', () => {
    // CASCADE 로 바뀌면 첨부가 조용히 사라져, 글쓴이도 읽는 사람도 글이 고쳐진
    // 줄 안다. "지워진 파일"이라고 알릴 수 있으려면 줄이 남아야 한다.
    expect(EXEC_SQL).toMatch(/REFERENCES staffroom_files\(id\) ON DELETE SET NULL/);
    expect(EXEC_SQL).not.toMatch(/REFERENCES staffroom_files\(id\) ON DELETE CASCADE/);
  });

  it('파일이 지워진 뒤에도 무엇이었는지 알 수 있게 이름을 따로 적어 둔다', () => {
    expect(EXEC_SQL).toMatch(/file_name\s+TEXT\s+NOT NULL/);
  });
});

describe('055 마이그레이션 — 같은 파일을 두 번 붙이지 않는다', () => {
  it('(글, 파일) 짝이 유일하다', () => {
    expect(EXEC_SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \S+\s+ON staffroom_post_attachments \(post_id, file_id\)/,
    );
  });

  it('지워진 첨부는 여럿이어도 된다 (부분 인덱스)', () => {
    // 부분 조건이 없으면 파일 둘이 지워졌을 때 (post_id, NULL) 이 겹쳐 보일 수 있다
    expect(EXEC_SQL).toMatch(/WHERE file_id IS NOT NULL/);
  });
});

describe('055 마이그레이션 — 격리 (049~054 와 같은 두 겹)', () => {
  it('RLS 가 켜져 있다', () => {
    expect(SQL).toContain('ALTER TABLE staffroom_post_attachments ENABLE ROW LEVEL SECURITY');
  });

  it('service_role 전용 정책을 건다', () => {
    expect(EXEC_SQL).toContain("auth.role() = ''service_role''");
  });

  it('anon·authenticated 의 권한을 회수한다', () => {
    expect(EXEC_SQL).toContain('REVOKE ALL ON public.%I FROM anon, authenticated');
  });

  it('anon·authenticated 에 권한을 주지 않는다', () => {
    expect(EXEC_SQL).not.toMatch(/GRANT\s/i);
  });
});

describe('055 마이그레이션 — 재실행 안전', () => {
  it('표·인덱스가 멱등이다', () => {
    expect(EXEC_SQL).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(EXEC_SQL).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
  });

  it('정책 추가가 멱등이다 (pg_policies 가드)', () => {
    expect(EXEC_SQL).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_policies/);
  });
});
