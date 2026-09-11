/**
 * 「기후생태 뉴스 체커톤」 예시 자료(`scripts/fixtures/checkathon-demo.mjs`)가 **홍보·테스트에 써도 되는 상태**인지 잠근다.
 *
 * 왜 테스트로 두는가: 이 자료는 캡처에 그대로 찍히고 AI 초안 요청서에도 실린다. 기재 금지 낱말 하나가 섞이면
 * 캡처 속 초안에 경고가 뜨고, 장면 카테고리 id 가 틀리면 지도에서 열 이름이 비어 보인다. 문장을 고치다
 * 그런 것이 섞여도 **여기서 먼저 빨개지게** 한다. 시더와 이 테스트는 같은 파일을 읽는다.
 */
import { describe, it, expect } from 'vitest';
import { checkRecordNarrative } from '../recordNarrativeChecks';
import { hasProhibitedTerms } from '../prohibitedRecordTerms';
import { FRAME_SLOTS } from '../narrativeFrames';
import { TEACHING_SLOTS } from '../observationSlots';
import { TEACHING_PRESETS } from '../selfAssessmentPresets';
import { NARRATIVE_NOTE_MAX } from '@domain/entities/InquiryThread';
import { SELF_ASSESSMENT_MAX_ANSWER_LENGTH } from '@domain/entities/SelfAssessment';
// @ts-expect-error — 스크립트용 순수 데이터 모듈(.mjs, 타입 선언 없음). 값만 읽는다.
import * as demo from '../../../../scripts/fixtures/checkathon-demo.mjs';

type Role = 'evaluation' | 'motive' | 'process' | 'result';
interface DemoScene {
  readonly role: Role;
  readonly moduleId: string;
  readonly note?: string;
  readonly leadIn?: string;
  readonly ev: readonly string[];
}
interface DemoThread {
  readonly key: string;
  readonly title: string;
  readonly scenes?: readonly DemoScene[];
  readonly link?: { readonly from: string; readonly note?: string };
}
interface DemoEvidence {
  readonly key: string;
  readonly from: string;
  readonly thread?: string;
  readonly content?: string;
}
interface DemoStudent {
  readonly number: number;
  readonly name: string;
  readonly obs: readonly (readonly [string, string, readonly string[], string])[];
  readonly evidence: readonly DemoEvidence[];
  readonly threads: readonly DemoThread[];
  readonly report: { readonly fileName: string; readonly text: string };
  readonly self: Readonly<Record<string, string>>;
  readonly grading: { readonly notes: Readonly<Record<string, string>>; readonly overall: string };
  readonly draft?: string;
}

const students = demo.DEMO_STUDENTS as readonly DemoStudent[];
const questions = demo.DEMO_SELF_QUESTIONS as readonly {
  id: string;
  slot: string;
  prompt: string;
}[];

/** NEIS 바이트 — 한글 3B / ASCII 1B(시더·앱과 같은 규칙). */
const neisBytes = (s: string): number => {
  let b = 0;
  for (const ch of s) b += (ch.codePointAt(0) ?? 0) <= 0x7f ? 1 : 3;
  return b;
};

/** 화면·요청서에 실릴 수 있는 모든 글. */
function allTexts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const s of students) {
    for (const o of s.obs) out.push({ where: `${s.name} 관찰 ${o[0]}`, text: o[3] });
    for (const e of s.evidence)
      if (e.content) out.push({ where: `${s.name} 근거 ${e.key}`, text: e.content });
    for (const t of s.threads) {
      out.push({ where: `${s.name} 주제 제목`, text: t.title });
      if (t.link?.note) out.push({ where: `${s.name} 주제 이음말`, text: t.link.note });
      for (const sc of t.scenes ?? []) {
        if (sc.note) out.push({ where: `${s.name} 장면 메모`, text: sc.note });
        if (sc.leadIn) out.push({ where: `${s.name} 장면 이음말`, text: sc.leadIn });
      }
    }
    out.push({ where: `${s.name} 보고서`, text: s.report.text });
    for (const [q, a] of Object.entries(s.self))
      out.push({ where: `${s.name} 자기평가 ${q}`, text: a });
    for (const n of Object.values(s.grading.notes))
      out.push({ where: `${s.name} 채점 메모`, text: n });
    out.push({ where: `${s.name} 총평`, text: s.grading.overall });
    if (s.draft) out.push({ where: `${s.name} 초안`, text: s.draft });
  }
  return out;
}

describe('체커톤 예시 자료 — 글', () => {
  it('어디에도 기재 금지 낱말이 없다(대회·수상·논문·학원 등)', () => {
    const hits = allTexts()
      .filter((t) => hasProhibitedTerms(t.text))
      .map((t) => t.where);
    expect(hits).toEqual([]);
  });

  it('실명·연락처 형태가 섞이지 않는다', () => {
    for (const t of allTexts()) {
      expect(t.text).not.toMatch(/01[016-9]-?\d{3,4}-?\d{4}/);
      expect(t.text).not.toMatch(/\d{6}-\d{7}/);
      expect(t.text).not.toMatch(/\b\d{5}\b/); // 학번 꼴(다섯 자리 숫자)
    }
  });

  it('관찰은 500자, 장면 메모·이음말은 상한, 자기평가 답은 상한 안이다', () => {
    for (const s of students) {
      for (const o of s.obs) expect(Array.from(o[3]).length).toBeLessThanOrEqual(500);
      for (const t of s.threads) {
        for (const sc of t.scenes ?? []) {
          expect(Array.from(sc.note ?? '').length).toBeLessThanOrEqual(NARRATIVE_NOTE_MAX);
          expect(Array.from(sc.leadIn ?? '').length).toBeLessThanOrEqual(NARRATIVE_NOTE_MAX);
        }
      }
      for (const a of Object.values(s.self)) {
        expect(Array.from(a).length).toBeLessThanOrEqual(SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
      }
    }
  });

  it('초안은 서사 점검 경고 0건이고 1,500바이트 안이다(캡처에 경고가 뜨지 않게)', () => {
    const drafts = students.filter((s) => s.draft).map((s) => s.draft as string);
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const d of drafts) {
      const flags = checkRecordNarrative({
        content: d,
        area: 'subject',
        peerContents: drafts.filter((x) => x !== d),
      }).flags.map((f) => f.code);
      expect(flags).toEqual([]);
      expect(neisBytes(d)).toBeLessThanOrEqual(1500);
      expect(d.startsWith(' ')).toBe(false);
    }
  });
});

describe('체커톤 예시 자료 — 구조', () => {
  it('관찰 슬롯은 교과 슬롯 목록의 값이다', () => {
    const allowed = new Set<string>(TEACHING_SLOTS);
    for (const s of students)
      for (const o of s.obs) for (const slot of o[2]) expect(allowed.has(slot)).toBe(true);
  });

  it('자기평가 문항은 추천 문항과 물음·슬롯이 같고, 학생마다 모든 문항에 답했다', () => {
    for (const q of questions) {
      expect(TEACHING_PRESETS.some((p) => p.prompt === q.prompt && p.slot === q.slot)).toBe(true);
    }
    for (const s of students) {
      for (const q of questions) expect((s.self[q.id] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('장면 카테고리는 그 자리에 놓을 수 있는 것이고, 장면이 가리키는 근거는 모두 있다', () => {
    for (const s of students) {
      const evKeys = new Set(s.evidence.map((e) => e.key));
      const obsKeys = new Set(s.obs.map((o) => o[0]));
      for (const e of s.evidence) {
        if (e.from.startsWith('obs:')) expect(obsKeys.has(e.from.slice(4))).toBe(true);
        else expect(e.content?.trim().length ?? 0).toBeGreaterThan(0);
      }
      for (const t of s.threads) {
        for (const sc of t.scenes ?? []) {
          expect(FRAME_SLOTS.inquiry[sc.role] as readonly string[]).toContain(sc.moduleId);
          for (const k of sc.ev) expect(evKeys.has(k)).toBe(true);
        }
        // 첫 장면에는 앞 장면이 없으므로 이음말을 두지 않는다(요청서에도 실리지 않는다).
        expect(t.scenes?.[0]?.leadIn).toBeUndefined();
        if (t.link) expect(s.threads.some((x) => x.key === t.link!.from)).toBe(true);
      }
    }
  });

  it('한 근거가 두 장면에 놓이지 않는다', () => {
    for (const s of students) {
      for (const t of s.threads) {
        const placed = (t.scenes ?? []).flatMap((sc) => sc.ev);
        expect(new Set(placed).size).toBe(placed.length);
      }
    }
  });
});
