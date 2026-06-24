/**
 * 브릿지 미러 왕복 계약(WS2) — 본체측 픽스처 정합 메타테스트.
 *
 * 브릿지 레포(별도)의 미러 파서가 본체 엔티티 변경 시 계약 필드를 silent drop 하지 않도록,
 * 본체는 contracts/entity-samples/*.json 픽스처를 emit 한다. 이 테스트는 그 픽스처가 본체 엔티티와
 * 정합하는지를 본체 빌드에서 강제한다:
 *
 *  (A) 엔티티 인터페이스의 모든 필드가 ENTITY_FIELD_CONTRACT 의 (mirrored ∪ notMirrored)에 분류돼 있다.
 *      → 본체 엔티티에 계약 필드를 추가하고 분류/픽스처를 갱신하지 않으면 실패(가드 동작).
 *  (B) 각 mirrored 필드가 합성 샘플에 실제로 존재한다(왕복 테스트가 그 필드 보존을 실제로 검증하도록).
 *
 * 실제 "필드 drop" 검출은 브릿지 레포 packages/core/test/mirrorRoundtrip.test.ts 가 담당한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENTITY_FIELD_CONTRACT, SAMPLES } from '../../../../scripts/emit-entity-samples.mjs';

const ROOT = resolve(__dirname, '../../../..');

/** TS 인터페이스 본문에서 `readonly <field>?:` 필드명 집합을 추출(중첩 brace 없는 평면 인터페이스 전제). */
function extractInterfaceFields(src: string, interfaceName: string): Set<string> {
  const open = src.indexOf(`interface ${interfaceName} {`);
  if (open === -1) throw new Error(`인터페이스 ${interfaceName} 을 찾을 수 없습니다.`);
  const bodyStart = src.indexOf('{', open) + 1;
  const bodyEnd = src.indexOf('}', bodyStart);
  const body = src.slice(bodyStart, bodyEnd);
  const fields = new Set<string>();
  const re = /readonly\s+([A-Za-z_]\w*)\s*\??\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) fields.add(m[1]!);
  return fields;
}

/**
 * 각 인터페이스의 대표 샘플 객체(들)을 모은다 — mirrored 필드 존재 검증(B)용.
 * 인터페이스명 → 샘플에서 추출한 객체 배열.
 */
function sampleObjectsFor(interfaceName: string): Record<string, unknown>[] {
  const s = SAMPLES as Record<string, unknown>;
  switch (interfaceName) {
    case 'ObservationRecord':
      return (s['observation'] as { records: Record<string, unknown>[] }).records;
    case 'StudentRecord':
      return (s['studentRecord'] as { records: Record<string, unknown>[] }).records;
    case 'AttendancePeriodEntry':
      return (
        s['studentRecord'] as { records: { attendancePeriods?: Record<string, unknown>[] }[] }
      ).records.flatMap((r) => r.attendancePeriods ?? []);
    case 'AttendanceRecord':
      return (s['attendance'] as { records: Record<string, unknown>[] }).records;
    case 'StudentAttendance':
      return (
        s['attendance'] as { records: { students: Record<string, unknown>[] }[] }
      ).records.flatMap((r) => r.students);
    case 'TeachingClass':
      return (s['teachingClass'] as { classes: Record<string, unknown>[] }).classes;
    case 'TeachingClassStudent':
      return (
        s['teachingClass'] as { classes: { students: Record<string, unknown>[] }[] }
      ).classes.flatMap((c) => c.students);
    case 'Student':
      return s['student'] as Record<string, unknown>[];
    default:
      throw new Error(`샘플 매핑이 없는 인터페이스: ${interfaceName}`);
  }
}

describe('WS2 — 엔티티 미러 샘플 계약 정합(본체측)', () => {
  for (const [entity, def] of Object.entries(ENTITY_FIELD_CONTRACT)) {
    const src = readFileSync(resolve(ROOT, def.file), 'utf-8');

    for (const [interfaceName, classified] of Object.entries(def.interfaces)) {
      const mirrored = new Set(classified.mirrored);
      const notMirrored = new Set(classified.notMirrored);

      it(`[${entity}] ${interfaceName}: 모든 인터페이스 필드가 mirrored/notMirrored 로 분류됨`, () => {
        const actualFields = extractInterfaceFields(src, interfaceName);
        const unclassified = [...actualFields].filter(
          (f) => !mirrored.has(f) && !notMirrored.has(f),
        );
        expect(
          unclassified,
          `${interfaceName} 에 분류되지 않은 필드가 있습니다: [${unclassified.join(', ')}]. ` +
            `→ scripts/emit-entity-samples.mjs 의 ENTITY_FIELD_CONTRACT 에 mirrored 또는 notMirrored 로 추가하고 ` +
            `필요 시 샘플/브릿지 미러를 갱신하세요(silent drop 방지).`,
        ).toEqual([]);
      });

      it(`[${entity}] ${interfaceName}: mirrored/notMirrored 가 실제 인터페이스 필드의 부분집합`, () => {
        const actualFields = extractInterfaceFields(src, interfaceName);
        const ghost = [...mirrored, ...notMirrored].filter((f) => !actualFields.has(f));
        expect(
          ghost,
          `${interfaceName} 분류에 인터페이스엔 없는 유령 필드가 있습니다: [${ghost.join(', ')}].`,
        ).toEqual([]);
      });

      it(`[${entity}] ${interfaceName}: 모든 mirrored 필드가 합성 샘플에 존재(왕복 검증 실효성)`, () => {
        const objs = sampleObjectsFor(interfaceName);
        const presentKeys = new Set<string>();
        for (const o of objs) for (const k of Object.keys(o)) presentKeys.add(k);
        const missing = classified.mirrored.filter((f) => !presentKeys.has(f));
        expect(
          missing,
          `${interfaceName} 의 mirrored 필드가 샘플에 없습니다: [${missing.join(', ')}]. ` +
            `샘플에 없으면 브릿지 왕복 테스트가 그 필드 보존을 검증할 수 없습니다.`,
        ).toEqual([]);
      });
    }
  }

  it('샘플에 실 PII 가 혼입되지 않았다(합성 마스킹 단언 통과)', async () => {
    const { assertSynthetic } = await import('../../../../scripts/emit-entity-samples.mjs');
    expect(() => assertSynthetic(SAMPLES)).not.toThrow();
  });
});
