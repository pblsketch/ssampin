/**
 * PiiMigrationRestoreModal — Option α 복원 CTA 모달 (Decision 4)
 *
 * 부팅 시 PII overlay 파일 손상 감지 시 표시. 세 가지 선택지:
 * - **백업 파일에서 복원** (`.bak`이 있을 때 활성)
 * - **초기화 후 새로 시작** (모든 PII 데이터 삭제)
 * - **지원팀에 문의** (외부 링크 / 메일)
 *
 * 본 모달은 사용자가 선택할 때까지 화면 차단(blocking).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 4
 */
export type RestoreAction = 'restore-from-bak' | 'wipe-and-restart' | 'contact-support';

export interface PiiMigrationRestoreModalProps {
  readonly open: boolean;
  readonly hasBak: boolean;
  readonly onSelect: (action: RestoreAction) => void;
}

export function PiiMigrationRestoreModal({
  open,
  hasBak,
  onSelect,
}: PiiMigrationRestoreModalProps): React.ReactElement | null {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pii-restore-title"
      aria-describedby="pii-restore-desc"
    >
      <div className="w-full max-w-md rounded-xl border border-red-500/50 bg-sp-card p-6 shadow-2xl">
        <h2 id="pii-restore-title" className="mb-3 text-lg font-bold text-red-400">
          ⚠️ 학생 정보 파일 손상 감지
        </h2>
        <p id="pii-restore-desc" className="mb-4 text-sm text-sp-text">
          학생 민감 정보(성별·학업성취도) 저장 파일이 손상되었거나 비정상 종료된 흔적이 있습니다.
          다음 중 하나를 선택해주세요:
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onSelect('restore-from-bak')}
            disabled={!hasBak}
            className="w-full rounded-lg border border-sp-border bg-sp-bg/60 px-4 py-3 text-left text-sm text-sp-text hover:border-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="font-semibold">📥 백업 파일에서 복원</div>
            <div className="mt-0.5 text-xs text-sp-muted">
              {hasBak ? '직전 정상 저장본을 사용합니다.' : '백업 파일이 없습니다.'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('wipe-and-restart')}
            className="w-full rounded-lg border border-sp-border bg-sp-bg/60 px-4 py-3 text-left text-sm text-sp-text hover:border-amber-500/60"
          >
            <div className="font-semibold">🗑 초기화 후 새로 시작</div>
            <div className="mt-0.5 text-xs text-sp-muted">
              모든 학생 민감 정보를 삭제하고 빈 상태로 시작합니다.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('contact-support')}
            className="w-full rounded-lg border border-sp-border bg-sp-bg/60 px-4 py-3 text-left text-sm text-sp-text hover:border-sp-accent"
          >
            <div className="font-semibold">💬 지원팀에 문의</div>
            <div className="mt-0.5 text-xs text-sp-muted">
              데이터 복구 가능성을 상담합니다.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
