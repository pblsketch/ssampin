/**
 * 쌤핀 AI — 도구 레지스트리 계약 테스트 (egress 4중 그물 ④)
 *
 * 이 테스트의 목적은 "지금 맞는가"가 아니라 **"나중에 조용히 틀려지지 않는가"** 다.
 * 누가 2등급 도구를 등록하거나 ALLOWED_GRADES 를 넓히면 여기가 빨간불이 된다.
 */
import { describe, expect, it } from 'vitest';

import { ALLOWED_GRADES, hasFreeText, isGradeAllowed } from '@domain/entities/AssistTool';
import {
  ASSIST_READ_TOOLS,
  ASSIST_TOOLS,
  ASSIST_WRITE_TOOLS,
  assistToolIds,
  findAssistTool,
} from '@domain/services/assistToolRegistry';

describe('assistToolRegistry — 계약', () => {
  it('등록된 모든 도구가 허용 등급 안에 있다', () => {
    const violations = ASSIST_TOOLS.filter((tool) => !isGradeAllowed(tool.grade)).map((tool) => ({
      id: tool.id,
      grade: tool.grade,
    }));
    expect(violations).toEqual([]);
  });

  it('2등급·3등급 도구가 하나도 등록돼 있지 않다', () => {
    expect(ASSIST_TOOLS.filter((tool) => tool.grade !== 1)).toEqual([]);
  });

  it('ALLOWED_GRADES 는 [1] 이다 — 영구 경계(ADR-061 결정 7)', () => {
    // 이 값을 [1, 2] 로 바꾸면 위 두 테스트가 어떤 도구를 새로 열지 드러낸다.
    expect([...ALLOWED_GRADES]).toEqual([1]);
  });

  it('도구 id 가 중복되지 않는다', () => {
    const ids = assistToolIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 **읽기** 도구가 반환 필드 화이트리스트를 갖는다 (빈 목록 금지)', () => {
    // 읽기 도구에 빈 목록은 "재구성을 안 거친다"는 뜻이라 위험하다.
    // 쓰기 도구는 반대다 — 빈 목록이 곧 "모델에게 돌려줄 것이 없다"는 보장이다(아래 참조).
    const empty = ASSIST_READ_TOOLS.filter((tool) => tool.resultFields.length === 0).map(
      (t) => t.id,
    );
    expect(empty).toEqual([]);
  });

  it('자유 입력이 섞이는 도구는 freeTextFields 로 표시돼 있다', () => {
    // get_my_todos.title 에 선생님이 학생 이름을 적는다 - 그물 3 대상임을 레지스트리가 알아야 한다.
    const todos = findAssistTool('get_my_todos');
    const count = findAssistTool('count_students');
    if (!todos || !count) throw new Error('도구를 찾지 못했다');

    expect(hasFreeText(todos)).toBe(true);
    expect([...todos.freeTextFields]).toEqual(['title']);
    expect(hasFreeText(count)).toBe(false);
  });

  it('중첩 구조를 가진 도구는 nestedFields 를 반드시 선언한다', () => {
    // 최상위만 걸러내면 depth 1 에서 그물 2 가 뚫린다.
    const missing = ASSIST_TOOLS.filter(
      (t) =>
        t.resultFields.some((f) => ['items', 'classes', 'byCategory'].includes(f)) &&
        !t.nestedFields,
    ).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it('★자유 입력처럼 보이는 필드는 freeTextFields 선언을 강제한다', () => {
    // freeTextFields 도입으로 생년월일·주소 검사가 "키 이름 기반 옵트인"이 됐다.
    // 선언을 빠뜨리면 그 필드가 조용히 검사에서 빠진다 - 사람이 기억하는 설계는 무너진다.
    const FREE_TEXT_LIKE = /^(title|memo|content|note|place|reason|description|text|body)$/;
    const undeclared: string[] = [];

    for (const tool of ASSIST_TOOLS) {
      const declared = new Set(tool.freeTextFields);
      const candidates = [...tool.resultFields, ...Object.values(tool.nestedFields ?? {}).flat()];
      for (const field of candidates) {
        if (FREE_TEXT_LIKE.test(field) && !declared.has(field)) {
          undeclared.push(`${tool.id}.${field}`);
        }
      }
    }
    expect(undeclared).toEqual([]);
  });

  it('★opaqueFields 는 nestedFields/resultFields 안에 실제로 있는 필드만 가리킨다', () => {
    const dangling: string[] = [];
    for (const tool of ASSIST_TOOLS) {
      const known = new Set([
        ...tool.resultFields,
        ...Object.values(tool.nestedFields ?? {}).flat(),
      ]);
      for (const field of tool.opaqueFields ?? []) {
        if (!known.has(field)) dangling.push(`${tool.id}.${field}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('★쓰기 도구는 "별도 보호 모델" 아래에서만 존재한다 (Phase 3)', () => {
    // ── 이 테스트의 내력 ──
    // 원래 문구는 "outbound:'result' 가 아닌 도구가 **하나도 없어야 한다**"였다.
    // 이유는 지금도 유효하다: 쓰기 도구는 저장할 문장을 모델이 지어내므로 읽기 쪽
    // 등급제로 막을 수 없다. 그 가드는 "별도 보호 모델이 생기기 전까지 쓰기 금지"라는
    // 뜻이었고, 그 조건을 Phase 3 이 채웠다(계획서 §2 C그룹) —
    //   모델은 실행하지 못한다. 제안 → 미리보기 → 선생님의 [실행].
    //
    // 그래서 가드를 **지우지 않고 조건을 옮긴다.** 쓰기 도구가 있어도 되지만,
    // 있으려면 아래 세 가지를 전부 지켜야 한다.
    for (const tool of ASSIST_WRITE_TOOLS) {
      // ① 모델에게 돌려줄 결과가 없다 — 하나라도 열리면 조용한 유출 통로가 된다.
      expect(tool.resultFields, `${tool.id} 가 결과 필드를 열었다`).toEqual([]);
      expect(tool.nestedFields, `${tool.id} 가 중첩 결과 필드를 열었다`).toBeUndefined();
      // ② 나가는 것이 인자임을 레지스트리가 스스로 밝힌다.
      expect(tool.outbound).toBe('args');
      // ③ 등급 경계는 그대로다.
      expect(tool.grade).toBe(1);
    }

    // 읽기 도구 쪽 원래 조건은 그대로 남는다 — 읽기가 몰래 쓰기가 되는 것을 막는다.
    const nonResult = ASSIST_READ_TOOLS.filter((t) => t.outbound !== 'result').map(
      (t) => `${t.id}:${t.outbound}`,
    );
    expect(nonResult).toEqual([]);

    // 학생 데이터에 닿는 쓰기는 **만들지 않는다**(계획서 §6 — 이 계획 밖).
    const forbidden = ASSIST_WRITE_TOOLS.filter((t) =>
      /attendance|observation|rubric|grading|record_draft|score/.test(t.id),
    ).map((t) => t.id);
    expect(forbidden).toEqual([]);
  });

  it('★opaqueFields 와 freeTextFields 는 겹칠 수 없다', () => {
    // opaque 분기가 free-text 분기보다 먼저 return 하므로, 겹치면 자유 입력 필드의
    // 패턴 검사가 통째로 꺼진다. 오탐을 만난 사람의 "최단 우회"가 정확히 이 한 줄이다.
    const overlaps: string[] = [];
    for (const tool of ASSIST_TOOLS) {
      const free = new Set(tool.freeTextFields);
      for (const field of tool.opaqueFields ?? []) {
        if (free.has(field)) overlaps.push(`${tool.id}.${field}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('없는 도구를 찾으면 undefined — 모델이 지어낸 이름을 걸러낸다', () => {
    expect(findAssistTool('get_student_detail')).toBeUndefined();
    expect(findAssistTool('list_students')).toBeUndefined();
  });
});
