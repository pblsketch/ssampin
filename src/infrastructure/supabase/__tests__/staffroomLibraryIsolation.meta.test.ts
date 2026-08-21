/**
 * 온라인 교무실 자료실(M3) — 격리·설계 메타 테스트
 *
 * 049·050 과 같은 이유로 둔다: 마이그레이션 SQL 을 글자 그대로 읽어, 격리 장치와
 * 계획서 §3.4 의 "서버는 바이트를 나르지 않는다" 설계가 실수로 무너지지 않았는지 확인한다.
 * 진짜 DB 에 붙지 않고도 CI 에서 상시 도는 유일한 방어선이다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/051_staffroom_library.sql'),
  'utf-8',
);

const TABLES = [
  'staffroom_files',
  'staffroom_file_versions',
  'staffroom_upload_tickets',
  'staffroom_file_grants',
] as const;

describe('051 마이그레이션 — 표', () => {
  for (const table of TABLES) {
    it(`${table} 를 만든다`, () => {
      expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  }

  it('부서에 드라이브 폴더 칸을 더한다', () => {
    expect(SQL).toMatch(
      /ALTER TABLE staffroom_departments\s+ADD COLUMN IF NOT EXISTS drive_folder_id/,
    );
  });

  it('이미 있는 부서에도 자료실 모듈을 채워 넣는다', () => {
    expect(SQL).toContain("'archive'");
    expect(SQL).toContain('INSERT INTO staffroom_modules');
  });
});

describe('051 마이그레이션 — 부서 간 격리', () => {
  for (const table of TABLES) {
    it(`${table} 에 RLS 가 켜져 있다`, () => {
      expect(SQL).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    });
  }

  it('네 표 모두 service_role 전용 정책을 만든다', () => {
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

  it('용량 집계 함수도 service_role 만 부를 수 있다', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION staffroom_storage_usage(UUID[]) FROM PUBLIC, anon, authenticated;',
    );
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION staffroom_storage_usage(UUID[]) TO service_role;',
    );
  });
});

describe('051 마이그레이션 — ★ 파일 내용이 서버에 쌓이지 않는다 (계획서 §3.4)', () => {
  it('파일 바이트를 담을 칸이 없다', () => {
    // BYTEA 나 base64 본문 칸이 생기면 전송량·개인정보 설계가 한꺼번에 무너진다.
    expect(SQL).not.toMatch(/\bBYTEA\b/i);
  });

  it('미리보기 글자도 드라이브 파일 id 로만 가리킨다', () => {
    // preview_file_id 는 드라이브 id(TEXT) 다. 글자 본문을 담는 칸이 아니다.
    expect(SQL).toContain('preview_file_id TEXT');
    expect(SQL).not.toMatch(/preview_text\s+TEXT/i);
  });

  it('파일 표찰에 드라이브 파일 id 가 있다', () => {
    expect(SQL).toContain('drive_file_id   TEXT        NOT NULL');
  });
});

describe('051 마이그레이션 — 올리기 표 (ADR-065)', () => {
  it('허락한 폴더를 표에 적어 둔다 — 엉뚱한 곳에 올린 파일을 거를 근거', () => {
    expect(SQL).toContain('folder_id         TEXT        NOT NULL');
  });

  it('한 표를 두 번 쓰지 못하게 소비 시각을 남긴다', () => {
    expect(SQL).toContain('consumed_at       TIMESTAMPTZ');
  });

  it('원본과 미리보기 글자가 같은 길을 쓴다', () => {
    expect(SQL).toContain("CHECK (kind IN ('file', 'preview'))");
  });
});

describe('051 마이그레이션 — 내준 권한을 회수할 수 있다 (계획서 §3.4-나 · §10.6)', () => {
  it('권한 id 를 남긴다 — 없으면 회수할 방법이 없다', () => {
    expect(SQL).toContain('permission_id  TEXT        NOT NULL');
  });

  it('멤버별로 훑을 수 있게 색인을 둔다 (내보낼 때 한 번에 거두려면 필요하다)', () => {
    expect(SQL).toContain('idx_staffroom_file_grants_member');
  });

  it('같은 사람에게 같은 파일 권한을 두 번 만들지 않는다', () => {
    expect(SQL).toContain('uq_staffroom_file_grants');
  });
});

describe('051 마이그레이션 — 용량 집계 (계획서 §8-C)', () => {
  it('★ 접어 둔 이전 판도 함께 센다', () => {
    // 드라이브에 그대로 남아 실제로 용량을 먹는데 빼고 세면
    // 화면 숫자와 관리자가 드라이브에서 보는 숫자가 어긋난다.
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION staffroom_storage_usage'));
    expect(fn).toContain('staffroom_file_versions');
  });

  it('미리보기 글자 크기도 함께 센다', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION staffroom_storage_usage'));
    expect(fn).toContain('preview_size');
  });
});
