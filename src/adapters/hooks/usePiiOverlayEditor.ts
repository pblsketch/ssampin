import { useCallback, useEffect, useState } from 'react';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';
import type { Gender } from '@domain/valueObjects/Gender';
import type { AcademicLevel } from '@domain/valueObjects/AcademicLevel';
import type { PinCapability } from '@domain/valueObjects/PinCapability';
import { PiiAccessDenied } from '@domain/ports/IPinGate';
import {
  getStudentPiiRepository,
  pinGate,
  piiAuditLogger,
  requirePiiCapability,
} from '@adapters/di/container';
import { hashPin } from '@infrastructure/crypto/pinHash';
import { isWidgetWindow } from '@adapters/utils/isWidgetWindow';

/**
 * usePiiOverlayEditor — 학생 1명에 대한 PII overlay 편집 훅
 *
 * - 위젯 윈도우에서는 read/edit 모두 무력화 (Decision 9).
 * - View 시 `ViewStudentPii` capability 검증 → 실패 시 locked=true.
 * - Edit 시 `EditStudentPii` capability 검증 → audit `update` 이벤트 (FIFO tier).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 2 + Decision 5 + Decision 9
 */
export interface UsePiiOverlayEditorReturn {
  readonly locked: boolean;
  readonly widget: boolean;
  readonly overlay: StudentPiiOverlay | null;
  readonly saving: boolean;
  readonly error: string | null;
  readonly updateGender: (g: Gender | undefined) => Promise<void>;
  readonly updateAcademicLevel: (l: AcademicLevel | undefined) => Promise<void>;
  readonly reload: () => Promise<void>;
}

async function checkCapability(cap: PinCapability, studentId: string): Promise<boolean> {
  try {
    const hash = await hashPin(studentId);
    await requirePiiCapability.execute(cap, hash);
    return true;
  } catch (err) {
    if (err instanceof PiiAccessDenied) return false;
    throw err;
  }
}

export function usePiiOverlayEditor(studentId: string): UsePiiOverlayEditorReturn {
  const widget = isWidgetWindow();
  const [overlay, setOverlay] = useState<StudentPiiOverlay | null>(null);
  const [locked, setLocked] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (widget) {
      setOverlay(null);
      setLocked(true);
      return;
    }
    const can = await checkCapability('ViewStudentPii', studentId);
    if (!can) {
      setLocked(true);
      setOverlay(null);
      return;
    }
    setLocked(false);
    const repo = getStudentPiiRepository();
    const result = await repo.get(studentId);
    setOverlay(result);
  }, [widget, studentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (
      mut: (cur: StudentPiiOverlay) => StudentPiiOverlay,
      field: 'gender' | 'academicLevel',
    ): Promise<void> => {
      if (widget) return;
      setError(null);
      setSaving(true);
      try {
        const can = await checkCapability('EditStudentPii', studentId);
        if (!can) {
          setLocked(true);
          throw new Error('잠금 상태 — 편집 권한 없음');
        }
        const session = pinGate.currentSession();
        const repo = getStudentPiiRepository();
        const current: StudentPiiOverlay = overlay ?? { studentId };
        const next = mut(current);
        await repo.save(next);
        setOverlay(next);
        const hash = await hashPin(studentId);
        await Promise.resolve(
          piiAuditLogger.logPiiAccess({
            action: 'update',
            studentIdHash: hash,
            capability: 'EditStudentPii',
            timestamp: Date.now(),
            meta: { field, hasSession: session !== null ? 'true' : 'false' },
          }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [widget, studentId, overlay],
  );

  const updateGender = useCallback(
    (g: Gender | undefined) =>
      update((cur) => ({ ...cur, gender: g }), 'gender'),
    [update],
  );

  const updateAcademicLevel = useCallback(
    (l: AcademicLevel | undefined) =>
      update((cur) => ({ ...cur, academicLevel: l }), 'academicLevel'),
    [update],
  );

  return {
    locked,
    widget,
    overlay,
    saving,
    error,
    updateGender,
    updateAcademicLevel,
    reload,
  };
}
