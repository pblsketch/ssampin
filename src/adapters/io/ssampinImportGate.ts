import type { IPinGate } from '@domain/ports/IPinGate';
import { PiiAccessDenied } from '@domain/ports/IPinGate';

/**
 * StudentImportPayload — `.ssampin` 외부 import 시 받는 학생 페이로드.
 *
 * 향후 외부 협업자가 PII 필드(gender/academicLevel)를 포함해 보낼 수 있다.
 * 본 게이트가 `ImportStudentPii` capability 검증 후 strip 또는 통과 결정.
 */
export interface StudentImportPayload {
  readonly id: string;
  readonly name?: string;
  readonly studentNumber?: number;
  readonly phone?: string;
  // 잠재적 PII 필드 (외부 협업자가 제공할 수 있음)
  readonly gender?: 'M' | 'F';
  readonly academicLevel?: 'A' | 'B' | 'C' | 'D' | 'E';
}

export interface StudentImportPayloadStripped {
  readonly id: string;
  readonly name?: string;
  readonly studentNumber?: number;
  readonly phone?: string;
}

export interface ImportGateResult {
  readonly accepted: readonly StudentImportPayload[];
  readonly strippedCount: number;
  readonly notice: string | null;
  readonly piiAllowed: boolean;
}

const STRIPPED_NOTICE =
  '민감 정보 항목이 잠금 상태에서 제외되었습니다 (PIN 설정 후 재시도하세요).';

function stripPii(p: StudentImportPayload): StudentImportPayloadStripped {
  const { id, name, studentNumber, phone } = p;
  return { id, name, studentNumber, phone };
}

/**
 * gateImport — Decision 6 + Critic R7 (Import-path PII gate).
 *
 * 페이로드 배열을 받아:
 * - `ImportStudentPii` capability 보유 시 PII 필드 그대로 통과.
 * - 미보유 시 모든 페이로드의 PII 필드 strip + 사용자 알림 메시지 반환.
 *
 * @returns accepted 페이로드 (strip 여부 포함) + strip 카운트 + 알림 메시지.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 6 + Critic Tension 3.1
 */
export function gateImport(
  payloads: readonly StudentImportPayload[],
  gate: IPinGate,
): ImportGateResult {
  const session = gate.currentSession();
  let allowed = false;
  try {
    gate.requireCapability('ImportStudentPii', session);
    allowed = true;
  } catch (err) {
    if (!(err instanceof PiiAccessDenied)) throw err;
    allowed = false;
  }

  if (allowed) {
    return {
      accepted: payloads,
      strippedCount: 0,
      notice: null,
      piiAllowed: true,
    };
  }

  let strippedCount = 0;
  const accepted = payloads.map((p) => {
    if (p.gender !== undefined || p.academicLevel !== undefined) {
      strippedCount++;
    }
    return stripPii(p);
  });
  return {
    accepted,
    strippedCount,
    notice: strippedCount > 0 ? STRIPPED_NOTICE : null,
    piiAllowed: false,
  };
}
