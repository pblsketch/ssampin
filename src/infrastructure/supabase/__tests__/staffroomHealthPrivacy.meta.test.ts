/**
 * 온라인 교무실 계측(064) — 개인정보·계약 메타 테스트 (ADR-079)
 *
 * 049~056 격리 테스트와 같은 이유로 둔다: 마이그레이션 SQL 을 **글자 그대로** 읽어,
 * 방어 장치가 실수로 무너지지 않았는지 본다.
 *
 * ★ 이 파일이 지키는 것은 "화면에 안 보인다"가 아니라 **"데이터가 DB 밖으로 안 나간다"** 이다.
 *   관리자 대시보드는 비밀번호를 쿠키에 그대로 담는 경계 위에 있어서, 화면에서 가리는 방식은
 *   네트워크 응답 본문에 그대로 남아 실질 방어가 되지 못한다.
 *
 * ★ 계획서가 예측한 "실제로 일어날 사고 경로" 두 개를 특별히 겨눈다:
 *   ① 064 를 고치는 게 아니라 **나중 마이그레이션이 CREATE OR REPLACE 로 덮어쓰는 것**
 *   ② 대시보드에 fetchTable('staffroom_departments', ...) 한 줄을 더하는 것 (→ REGRESSION #66)
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../supabase/migrations');
const SQL = readFileSync(resolve(MIGRATIONS_DIR, '064_staffroom_health.sql'), 'utf-8');

/** 주석을 걷어낸 SQL — "없음"을 볼 때는 반드시 이걸 쓴다(주석 속 글자에 속지 않게) */
const EXEC_SQL = SQL.replace(/--.*$/gm, '');

/** 함수 본문($$ ... $$)만 */
const BODY = (() => {
  const start = EXEC_SQL.indexOf('AS $$');
  const end = EXEC_SQL.indexOf('$$;', start);
  return start >= 0 && end > start ? EXEC_SQL.slice(start + 5, end) : '';
})();

/** RETURNS TABLE ( ... ) 안쪽만 */
const RETURNS_BLOCK = (() => {
  const start = EXEC_SQL.indexOf('RETURNS TABLE (');
  if (start < 0) return '';
  const open = EXEC_SQL.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < EXEC_SQL.length; i += 1) {
    if (EXEC_SQL[i] === '(') depth += 1;
    else if (EXEC_SQL[i] === ')') {
      depth -= 1;
      if (depth === 0) return EXEC_SQL.slice(open + 1, i);
    }
  }
  return '';
})();

/** 19칸 허용 목록 — 금지 목록이 아니라 **허용 목록**이다. 여기 없는 칸은 전부 실패다. */
const ALLOWED_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['generated_at', 'TIMESTAMPTZ'],
  ['departments_total', 'BIGINT'],
  ['dept_members_0', 'BIGINT'],
  ['dept_members_1', 'BIGINT'],
  ['dept_members_2_5', 'BIGINT'],
  ['dept_members_6_10', 'BIGINT'],
  ['dept_members_11_30', 'BIGINT'],
  ['dept_members_31_up', 'BIGINT'],
  ['posts_total', 'BIGINT'],
  ['comments_total', 'BIGINT'],
  ['files_total', 'BIGINT'],
  ['files_bytes', 'BIGINT'],
  ['last_activity_date', 'DATE'],
  ['depts_no_activity', 'BIGINT'],
  ['health_ok', 'BIGINT'],
  ['health_broken', 'BIGINT'],
  ['health_quiet', 'BIGINT'],
  ['health_unlinked', 'BIGINT'],
  ['last_broken_at', 'TIMESTAMPTZ'],
];

function parsedColumns(): Array<[string, string]> {
  return RETURNS_BLOCK.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, ...rest] = s.split(/\s+/);
      return [name, rest.join(' ')] as [string, string];
    });
}

describe('064 — 표에 칸 2개만 더한다 (새 표를 만들지 않는다)', () => {
  it('staffroom_admin_tokens 에 last_broken_at · broken_kind 를 더한다', () => {
    expect(EXEC_SQL).toMatch(/ALTER TABLE staffroom_admin_tokens/);
    expect(EXEC_SQL).toMatch(/ADD COLUMN IF NOT EXISTS last_broken_at\s+TIMESTAMPTZ/);
    expect(EXEC_SQL).toMatch(/ADD COLUMN IF NOT EXISTS broken_kind\s+SMALLINT/);
  });

  it('🔒 새 표를 만들지 않는다 — 만들면 049 의 정책·REVOKE 관례와 격리 테스트를 함께 고쳐야 한다', () => {
    expect(EXEC_SQL).not.toMatch(/CREATE TABLE/i);
  });
});

describe('064 — 개인정보 방어 (i) 반환 칸은 허용 목록과 정확히 일치한다', () => {
  it('19칸이다', () => {
    expect(parsedColumns()).toHaveLength(ALLOWED_COLUMNS.length);
  });

  it('이름과 타입이 허용 목록과 한 칸도 다르지 않다', () => {
    expect(parsedColumns()).toEqual(ALLOWED_COLUMNS.map(([n, t]) => [n, t]));
  });

  it('🔒 식별 가능한 타입(uuid·text·jsonb·varchar)이 하나도 없다', () => {
    // 이게 없으면 RETURNS TABLE(department_id uuid, ...) 로 부서 단위 행이 되살아난다.
    expect(RETURNS_BLOCK).not.toMatch(/\b(UUID|TEXT|JSONB|JSON|VARCHAR|CITEXT|BYTEA)\b/i);
  });

  it('🔒 부서를 가리키는 이름의 칸이 없다', () => {
    for (const [name] of parsedColumns()) {
      expect(name).not.toMatch(/(department|dept_id|email|name|title|id)$/i);
    }
  });
});

describe('064 — 개인정보 방어 (ii) 카디널리티는 구조로 보장한다', () => {
  it('🔒 바깥 SELECT 에 FROM 이 없다 — 스칼라 서브쿼리만이라 항상 1행이다', () => {
    // 균형 잡힌 괄호를 전부 걷어내면 CTE 정의와 스칼라 서브쿼리가 통째로 사라진다.
    // 남는 것은 WITH 이름들과 바깥 SELECT 의 컬럼 목록뿐이고, 거기엔 FROM 이 없어야 한다.
    let stripped = BODY.replace(/--.*$/gm, '');
    let prev = '';
    while (prev !== stripped) {
      prev = stripped;
      stripped = stripped.replace(/\([^()]*\)/g, ' ');
    }
    expect(stripped).not.toMatch(/\bFROM\b/i);
  });
});

describe('064 — 개인정보 방어: 본문이 PII 를 만지지 않는다', () => {
  it('🔒 본문에 *_email 컬럼이 등장하지 않는다', () => {
    expect(BODY).not.toMatch(/admin_email|member_email|owner_email|uploader_email/);
  });

  it('🔒 본문에 SELECT * / 별칭.* 가 없다 — SELECT * 안에는 email 이라는 글자가 없어 위 검사로 못 잡는다', () => {
    expect(BODY).not.toMatch(/SELECT\s+\*/i);
    expect(BODY).not.toMatch(/\b\w+\.\*/);
  });

  it('🔒 부서 이름·글 제목 컬럼을 읽지 않는다', () => {
    expect(BODY).not.toMatch(/\bd\.name\b|\bp\.title\b|display_name/);
  });
});

describe('064 — RPC 계약 (빠지면 탭이 조용히 빈 화면이 된다)', () => {
  it('★ STABLE 이다 — PostgREST 는 VOLATILE 함수의 GET 을 405 로 거부하고, fetchRpc 는 그걸 빈 배열로 삼킨다', () => {
    expect(EXEC_SQL).toMatch(/LANGUAGE sql\s+STABLE/);
  });

  it('SECURITY DEFINER 다 — 교무실 도메인 3종(050·051·052)과 같은 관례', () => {
    expect(EXEC_SQL).toMatch(/SECURITY DEFINER/);
  });

  it('search_path 를 public, pg_temp 로 고정한다', () => {
    expect(EXEC_SQL).toMatch(/SET search_path = public, pg_temp/);
  });

  it('★ 파일 끝에 NOTIFY pgrst 가 있다 — 없으면 스키마 캐시가 새 RPC 를 모르는 동안 404 이고 화면은 빈 채로 나간다', () => {
    expect(EXEC_SQL).toMatch(/NOTIFY pgrst, 'reload schema';/);
  });
});

describe('064 — 부서 간 격리: 아무나 부를 수 없다', () => {
  it('🔒 PUBLIC·anon·authenticated 에서 실행 권한을 거둔다', () => {
    expect(EXEC_SQL).toMatch(
      /REVOKE ALL ON FUNCTION staffroom_health_v1\(\) FROM PUBLIC, anon, authenticated;/,
    );
  });

  it('service_role 에만 실행 권한을 준다', () => {
    expect(EXEC_SQL).toMatch(/GRANT EXECUTE ON FUNCTION staffroom_health_v1\(\) TO service_role;/);
  });
});

describe('064 이후 어떤 마이그레이션도 이 함수를 다시 정의하지 않는다', () => {
  it('🔒 065 이상 어떤 파일에도 staffroom_health_v1 문자열이 없다', () => {
    // ★ 계획서가 예측한 실제 사고 경로다 — 064 를 고치는 게 아니라 **나중 파일이 덮어쓴다.**
    //   064 만 읽는 테스트는 그때도 계속 초록이므로, 여기서 전체를 훑는다.
    //   CREATE OR REPLACE 뿐 아니라 DROP + CREATE 도 함께 잡히도록 "문자열 자체"를 본다.
    const offenders = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => {
        const n = Number.parseInt(f.slice(0, 3), 10);
        return Number.isFinite(n) && n > 64;
      })
      .filter((f) =>
        readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8').includes('staffroom_health_v1'),
      );

    expect(offenders).toEqual([]);
  });

  it('스캔이 실제로 파일을 훑었다 (0개를 훑고 초록이 되지 않는다)', () => {
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(all.length).toBeGreaterThan(50);
    expect(all).toContain('064_staffroom_health.sql');
  });
});

// ══════════════════════════════════════════════════════════════════
// 계측 코드 쪽 — 조용히 0 이 되는 함정 3개를 못박는다
// ══════════════════════════════════════════════════════════════════

const LIBRARY_TS = readFileSync(
  resolve(__dirname, '../../../../supabase/functions/staffroom-library/index.ts'),
  'utf-8',
);

/**
 * recordAdminTokenBreak 함수 본문만 — **주석을 걷어낸 상태**로 본다.
 *
 * ★ 주석을 안 걷으면 나중에 누가 함수 안에 "왜 updated_at 을 안 쓰는가"를 설명하는 주석을
 *   달았을 때 거짓 빨간불이 난다. 이 저장소가 실제로 겪은 유형이다(todoTime.ts).
 */
const RECORD_FN = (() => {
  const start = LIBRARY_TS.indexOf('async function recordAdminTokenBreak(');
  if (start < 0) return '';
  const end = LIBRARY_TS.indexOf('\n}', start);
  const raw = end > start ? LIBRARY_TS.slice(start, end) : '';
  return raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
})();

describe('계측 — 끊김이 구조적으로 0 이 되는 함정을 막는다', () => {
  it('기록 함수가 존재한다', () => {
    expect(RECORD_FN).not.toBe('');
  });

  it('🚨 실패 기록에 updated_at 을 절대 쓰지 않는다 — 넣으면 "끊김"이 영원히 0 이고 게이트는 전부 초록이다', () => {
    // 이 표를 만지는 기존 두 곳(staffroomDrive.ts · save-admin-token)이 전부 updated_at 을
    // 함께 넣기 때문에 습관으로 따라 쓰기 쉽다. "정상 = updated_at 이 최근" 이므로
    // 실패에 updated_at 을 같이 쓰면 updated_at >= last_broken_at 이 되어 끊김이 안 잡힌다.
    expect(RECORD_FN).toMatch(/\.update\(/);
    expect(RECORD_FN).not.toMatch(/updated_at/);
  });

  it('🚨 스로틀이 NULL 을 함께 본다 — .lt() 만 쓰면 첫 고장이 영영 기록되지 않는다', () => {
    // 컬럼을 새로 더했으므로 기존 행은 전부 NULL 이고, SQL 에서 NULL < cutoff 는 UNKNOWN 이다.
    expect(RECORD_FN).toMatch(/last_broken_at\.is\.null/);
  });

  it('기록 실패를 삼킨다 — 계측이 자료실을 죽이지 않는다', () => {
    expect(RECORD_FN).toMatch(/try\s*\{/);
    expect(RECORD_FN).toMatch(/catch/);
  });

  it('전역 설정 사고(미연결·구글 클라이언트 미설정)는 부서 끊김으로 적지 않는다', () => {
    expect(RECORD_FN).toMatch(/kind === 'missing'/);
    expect(RECORD_FN).toMatch(/GOOGLE_CLIENT_ID/);
    expect(RECORD_FN).toMatch(/GOOGLE_CLIENT_SECRET/);
  });
});

describe('계측 — 끊김 종류를 가르는 변수가 catch 안에서 뒤집히지 않는다', () => {
  /** list 의 driveStatus try/catch 블록 */
  const CATCH_BLOCK = (() => {
    const anchor = LIBRARY_TS.indexOf('let tokenIssued = false;');
    if (anchor < 0) return '';
    const catchAt = LIBRARY_TS.indexOf('} catch (error) {', anchor);
    if (catchAt < 0) return '';
    const end = LIBRARY_TS.indexOf('\n      }', catchAt);
    return end > catchAt ? LIBRARY_TS.slice(catchAt, end) : '';
  })();

  it('tokenIssued 를 쓴다 (driveConnected 가 아니다)', () => {
    expect(LIBRARY_TS).toMatch(/let tokenIssued = false;/);
    expect(CATCH_BLOCK).toMatch(/recordAdminTokenBreak\([^)]*tokenIssued\)/s);
  });

  it('🚨 catch 안에서 tokenIssued 를 재대입하지 않는다 — driveConnected 는 catch 첫 줄에서 false 로 되돌아간다', () => {
    // driveConnected 로 종류를 가르면 kind 4(드라이브 거부 = 용량 초과·폴더 휴지통)가
    // 전부 kind 2(갱신 실패)로 기록되어, 이 계측을 여기 둔 이유가 통째로 사라진다.
    expect(CATCH_BLOCK).not.toBe('');
    expect(CATCH_BLOCK).not.toMatch(/tokenIssued\s*=/);
    expect(CATCH_BLOCK).toMatch(/driveConnected = false/);
  });
});

describe('download — 이미 권한 받은 파일은 관리자 토큰이 끊겨도 열린다 (계획서 §3.4-나)', () => {
  /** download 분기 본문 */
  const DOWNLOAD = (() => {
    const start = LIBRARY_TS.indexOf("if (action === 'download')");
    const end = LIBRARY_TS.indexOf("if (action === 'delete')", start);
    return start >= 0 && end > start ? LIBRARY_TS.slice(start, end) : '';
  })();

  it('🚨 권한 행 조회가 adminAccessToken 보다 먼저다', () => {
    const grants = DOWNLOAD.indexOf("from('staffroom_file_grants')");
    const token = DOWNLOAD.indexOf('adminAccessToken(');
    expect(grants).toBeGreaterThan(-1);
    expect(token).toBeGreaterThan(-1);
    expect(grants).toBeLessThan(token);
  });

  it('권한이 있으면 AdminTokenError 를 잡아 결정적 폴백 주소를 돌려준다', () => {
    expect(DOWNLOAD).toMatch(
      /const fallbackUrl = `https:\/\/drive\.google\.com\/file\/d\/\$\{target\.drive_file_id\}\/view`/,
    );
    expect(DOWNLOAD).toMatch(/if \(!\(error instanceof AdminTokenError\)\) throw error;/);
    expect(DOWNLOAD).toMatch(/url: fallbackUrl/);
  });
});
