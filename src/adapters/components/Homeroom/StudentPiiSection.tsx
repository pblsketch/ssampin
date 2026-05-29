import { usePiiOverlayEditor } from '@adapters/hooks/usePiiOverlayEditor';
import type { Gender } from '@domain/valueObjects/Gender';
import { GENDER_LABELS } from '@domain/valueObjects/Gender';
import type { AcademicLevel } from '@domain/valueObjects/AcademicLevel';
import { ACADEMIC_LEVELS } from '@domain/valueObjects/AcademicLevel';

/**
 * StudentPiiSection — 학생 1명에 대한 PII 편집 UI (P5)
 *
 * **렌더링 조건**:
 * - 위젯 윈도우: null 반환 (Decision 9).
 * - PIN 잠금: 마스킹 + "PIN 해제 필요" 메시지.
 * - PIN 해제: 성별(남/여/미지정) + 학업성취도(A-E/없음) 컨트롤.
 *
 * **시각 안내**:
 * - 빨간 테두리 + "민감 정보 — 로컬에만 저장됩니다" 영구 배지.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 2 + Decision 9 + §Legal Basis
 */
export interface StudentPiiSectionProps {
  readonly studentId: string;
}

const GENDERS: readonly (Gender | undefined)[] = ['M', 'F', undefined];

export function StudentPiiSection({ studentId }: StudentPiiSectionProps): React.ReactElement | null {
  const editor = usePiiOverlayEditor(studentId);

  if (editor.widget) {
    // Decision 9: 위젯 윈도우에서는 마운트 자체 불가
    return null;
  }

  return (
    <section
      data-testid="pii-section"
      className="mt-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3"
      aria-label="민감 정보 영역"
    >
      <header className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-red-300">
          🔒 민감 정보 — 로컬에만 저장됩니다
        </span>
        {editor.saving && (
          <span className="text-xs text-sp-muted">저장 중…</span>
        )}
      </header>

      {editor.locked ? (
        <div className="rounded-md bg-sp-bg/60 p-2 text-center text-xs text-sp-muted">
          PIN 해제 후 입력할 수 있습니다.
        </div>
      ) : (
        <div className="space-y-2">
          <fieldset className="flex items-center gap-2">
            <legend className="text-xs text-sp-muted">성별</legend>
            {GENDERS.map((g, i) => {
              const isActive = editor.overlay?.gender === g || (!editor.overlay?.gender && g === undefined);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => void editor.updateGender(g)}
                  disabled={editor.saving}
                  className={`rounded-md px-2 py-1 text-xs ${
                    isActive
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-bg text-sp-muted hover:text-sp-text'
                  }`}
                  aria-pressed={isActive}
                >
                  {g ? GENDER_LABELS[g] : '미지정'}
                </button>
              );
            })}
          </fieldset>

          <fieldset className="flex items-center gap-2">
            <legend className="text-xs text-sp-muted">학업성취도</legend>
            {[...ACADEMIC_LEVELS, undefined].map((lv, i) => {
              const isActive =
                editor.overlay?.academicLevel === lv ||
                (!editor.overlay?.academicLevel && lv === undefined);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => void editor.updateAcademicLevel(lv as AcademicLevel | undefined)}
                  disabled={editor.saving}
                  className={`rounded-md px-2 py-1 text-xs ${
                    isActive
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-bg text-sp-muted hover:text-sp-text'
                  }`}
                  aria-pressed={isActive}
                >
                  {lv ?? '없음'}
                </button>
              );
            })}
          </fieldset>

          {editor.error && (
            <div role="alert" className="text-xs text-red-400">
              {editor.error}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
