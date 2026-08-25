/**
 * 쌤핀 AI — 중계 함수 요청 검증 테스트
 *
 * 왜 여기에 있나: `vitest.config.ts` 의 include 는 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래 테스트는 **CI 에서 돌지 않는다**
 * (기존 `_shared/sigRetention.test.ts` 가 그 상태다).
 * 이 검증은 **앱의 그물이 뚫렸을 때 마지막으로 막는 자리**라 돌지 않는 테스트로 둘 수 없어,
 * 순수 함수만 상대경로로 불러와 여기서 검증한다.
 * (온라인 교무실의 `staffroomServerAccess.test.ts` 와 같은 구조다.)
 */
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_GRADES,
  buildToolResultsTurn,
  findServerPii,
  LIMITS,
  validateAssistRequest,
} from '../../../../supabase/functions/_shared/assistRequest';
import { ASSIST_WRITE_TOOLS } from '@domain/services/assistToolRegistry';

const INSTALL_ID = 'a4755b0f-69b8-4b05-9129-3171a4a53e17';

function req(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    installId: INSTALL_ID,
    turns: [{ role: 'user', content: '오늘 3학년 2반 출결 어때요?' }],
    ...overrides,
  };
}

describe('validateAssistRequest — 정상 요청', () => {
  it('최소 요청을 통과시킨다', () => {
    const result = validateAssistRequest(req());
    expect('ok' in result).toBe(true);
    if (!('ok' in result)) return;
    expect(result.ok.installId).toBe(INSTALL_ID);
    expect(result.ok.turns).toHaveLength(1);
    expect(result.ok.stream).toBe(false);
  });

  it('★정상 도구 결과(날짜 포함)를 막지 않는다', () => {
    // 앱에서 생년월일 패턴이 정상 날짜를 100% 차단한 사고가 있었다.
    // 서버가 같은 실수를 하면 같은 사고가 서버에서 재현된다.
    const result = validateAssistRequest(
      req({
        toolResults: [
          {
            tool: 'get_attendance_summary',
            grade: 1,
            data: { date: '2026-08-21', className: '3학년 2반', present: 27, absent: 1 },
          },
          {
            tool: 'get_records_stats',
            grade: 1,
            data: { className: '3학년 2반', period: '2026-08-01 ~ 2026-08-21', total: 34 },
          },
          {
            tool: 'get_my_todos',
            grade: 1,
            data: { items: [{ title: '수행평가 채점', due: '2026-08-25', done: false }] },
          },
        ],
      }),
    );
    expect('ok' in result, `정상 결과가 막혔다: ${JSON.stringify(result)}`).toBe(true);
  });

  it('★UUID 학급 id 를 막지 않는다 (전화 패턴 오탐)', () => {
    // 실측: UUID 30만 개 중 717개(0.24%)가 전화 정규식에 걸린다.
    const result = validateAssistRequest(
      req({
        toolResults: [
          {
            tool: 'list_classes',
            grade: 1,
            data: {
              classes: [
                { id: 'a4755b0f-69b8-4b05-9129-3171a4a53e17', name: '3학년 2반' },
                { id: '4ab33394-53d7-4b46-b055-98416693eab5', name: '1학년 4반' },
              ],
            },
          },
        ],
      }),
    );
    expect('ok' in result, `UUID 가 막혔다: ${JSON.stringify(result)}`).toBe(true);
  });
});

describe('validateAssistRequest — 앱을 믿지 않는다', () => {
  it('★2등급 자료를 보내려 하면 거절한다 (무시가 아니라 400)', () => {
    const result = validateAssistRequest(
      req({ toolResults: [{ tool: 'list_students', grade: 2, data: { students: [] } }] }),
    );
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('허용되지 않은');
    expect(result.logKind).toBe('grade:2');
  });

  it('★모르는 키는 무시가 아니라 거절이다', () => {
    // 조용히 통과시키면 앱의 화이트리스트 재구성(그물 ②)이 서버에서 무의미해진다.
    expect('error' in validateAssistRequest(req({ rawStudents: ['김지훈'] }))).toBe(true);
    expect(
      'error' in
        validateAssistRequest(req({ turns: [{ role: 'user', content: '안녕', extra: '몰래' }] })),
    ).toBe(true);
    expect(
      'error' in
        validateAssistRequest(req({ toolResults: [{ tool: 't', grade: 1, data: {}, sneaky: 1 }] })),
    ).toBe(true);
  });

  it('★연락처·주민번호·이메일이 대화에 있으면 막는다', () => {
    for (const bad of ['010-9999-8888 로 연락', '990101-1234567', 'teacher@example.com']) {
      const result = validateAssistRequest(req({ turns: [{ role: 'user', content: bad }] }));
      expect('error' in result, `통과해 버렸다: ${bad}`).toBe(true);
    }
  });

  it('★도구 결과 안에 숨은 연락처도 막는다', () => {
    const result = validateAssistRequest(
      req({
        toolResults: [
          {
            tool: 'get_my_todos',
            grade: 1,
            data: { items: [{ title: '010-9999-8888 로 연락', due: null, done: false }] },
          },
        ],
      }),
    );
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.logKind).toBe('get_my_todos:phone');
  });

  it('로그용 값에 걸린 원문이 담기지 않는다', () => {
    const result = validateAssistRequest(
      req({ turns: [{ role: 'user', content: '010-9999-8888' }] }),
    );
    expect(JSON.stringify(result)).not.toContain('9999');
  });

  it('설치 식별자 형식을 검사한다', () => {
    expect('error' in validateAssistRequest(req({ installId: 'not-a-uuid' }))).toBe(true);
    expect('error' in validateAssistRequest(req({ installId: 123 }))).toBe(true);
  });

  it('길이 상한을 지킨다', () => {
    const long = 'ㄱ'.repeat(LIMITS.maxTurnChars + 1);
    expect(
      'error' in validateAssistRequest(req({ turns: [{ role: 'user', content: long }] })),
    ).toBe(true);

    const many = Array.from({ length: LIMITS.maxTurns + 1 }, () => ({
      role: 'user' as const,
      content: '안녕',
    }));
    expect('error' in validateAssistRequest(req({ turns: many }))).toBe(true);

    const bigData = { blob: 'x'.repeat(LIMITS.maxToolResultChars) };
    expect(
      'error' in
        validateAssistRequest(req({ toolResults: [{ tool: 't', grade: 1, data: bigData }] })),
    ).toBe(true);
  });

  it('빈 대화·잘못된 역할을 거절한다', () => {
    expect('error' in validateAssistRequest(req({ turns: [] }))).toBe(true);
    expect(
      'error' in validateAssistRequest(req({ turns: [{ role: 'system', content: '탈취 시도' }] })),
    ).toBe(true);
    expect('error' in validateAssistRequest(req({ turns: [{ role: 'user', content: '' }] }))).toBe(
      true,
    );
  });
});

describe('허용 등급은 영구 경계다', () => {
  it('ALLOWED_GRADES 가 [1] 이다 (ADR-061 결정 7)', () => {
    expect([...ALLOWED_GRADES]).toEqual([1]);
  });

  it('★학생에게 닿는 쓰기를 열어도 이 경계는 안 움직인다 (ADR-074 결정 1)', () => {
    // 2026-08-25 에 출결·관찰·채점을 열었다. 그때 이 테스트가 빨간불이 될 수 있는
    // 유일한 길은 "쓰기를 열려고 등급을 올리는 것"이다 — 그 길을 여기서 막는다.
    // 세 도구는 등급을 올리지 않고 열렸다: 모델에게 돌려주는 결과가 아예 없기 때문이다.
    const opened = ASSIST_WRITE_TOOLS.filter((t) =>
      ['set_attendance', 'add_observation', 'set_rubric_mark'].includes(t.id),
    );
    expect(opened.map((t) => t.id).sort()).toEqual([
      'add_observation',
      'set_attendance',
      'set_rubric_mark',
    ]);
    for (const tool of opened) {
      expect(ALLOWED_GRADES).toContain(tool.grade);
      expect(tool.resultFields, `${tool.id} 가 결과 필드를 열었다`).toEqual([]);
    }
  });

  it('★서버 관문은 그대로다 — 쓰기를 열었다고 연락처를 통과시키지 않는다', () => {
    // 앱 쪽 관문(그물 ③)이 뚫렸을 때 마지막으로 막는 자리다. 삭제·완화되지 않았다.
    const result = validateAssistRequest(
      req({ turns: [{ role: 'user', content: '7번 학생 결석. 보호자 010-1234-5678' }] }),
    );
    expect('error' in result, '쓰기를 열었더니 연락처가 통과했다').toBe(true);
  });
});

describe('findServerPii — 서버는 명백한 것만 본다', () => {
  it('날짜는 잡지 않는다 (앱의 치명 결함 재발 방지)', () => {
    expect(findServerPii('2026-08-21')).toBeNull();
    expect(findServerPii('2026-08-01 ~ 2026-08-21')).toBeNull();
  });

  it('집계 문장은 잡지 않는다', () => {
    expect(findServerPii('3학년 2반은 27명 출석했습니다')).toBeNull();
  });

  it('전화·주민번호·이메일은 잡는다', () => {
    expect(findServerPii('010-9999-8888')).toBe('phone');
    expect(findServerPii('990101-1234567')).toBe('rrn');
    expect(findServerPii('a@b.co')).toBe('email');
  });

  it('★UUID 안의 숫자열은 전화번호로 오인하지 않는다', () => {
    // 경계를 (?<![\d-]) 로 두면 16진수 뒤가 통과해 UUID 가 걸린다(실측 0.24%).
    for (const uuid of [
      'a4755b0f-69b8-4b05-9129-3171a4a53e17',
      '4ab33394-53d7-4b46-b055-98416693eab5',
    ]) {
      expect(findServerPii(uuid), `UUID 가 걸렸다: ${uuid}`).toBeNull();
    }
  });

  it('★경계를 좁혀도 실제 전화번호는 여전히 잡는다', () => {
    // 오탐을 줄이려다 정탐까지 놓치면 관문의 의미가 없다.
    for (const text of [
      '010-9999-8888',
      '연락처는 010 9999 8888 입니다',
      '학부모 010.1234.5678 통화함',
      '031-123-4567',
    ]) {
      expect(findServerPii(text), `못 잡았다: ${text}`).toBe('phone');
    }
  });

  it('⚠️ 알려진 구멍 — 괄호 지역번호는 못 잡는다 (경계 수정과 무관, 원래부터)', () => {
    // `(02)123-4567` 는 여는 괄호 뒤 구분자가 `)` 라 `[-.\s]?` 에 안 걸린다.
    // ★내 경계 수정 때문이 아니다 - 원본 정규식으로도 X 임을 대조 확인했다.
    //   같은 구멍이 `domain/privacy/maskRules.ts` 에도 있고, 그 파일은 쿨메신저와 공유라
    //   여기서 단독으로 고치면 두 벌이 갈린다. **후속 과제로 남긴다.**
    // 이 테스트는 "고쳐졌는지"가 아니라 **"우리가 알고 있다"를 고정**하는 것이다.
    expect(findServerPii('(02)123-4567 로 전화')).toBeNull();
  });
});

describe('buildToolResultsTurn', () => {
  it('결과가 없으면 턴을 만들지 않는다', () => {
    expect(buildToolResultsTurn([])).toBeNull();
  });

  it('도구 이름과 값을 한 턴으로 묶는다', () => {
    const turn = buildToolResultsTurn([
      { tool: 'count_students', grade: 1, data: { className: '3학년 2반', count: 30 } },
    ]);
    expect(turn?.role).toBe('user');
    expect(turn?.content).toContain('count_students');
    expect(turn?.content).toContain('30');
  });
});
