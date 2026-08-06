import { useEffect } from 'react';
import type { TeachingClass } from '@domain/entities/TeachingClass';

/**
 * 보관 확인 다이얼로그 — 개별·일괄 공용 (school-year-archive plan §4 S1.3 ③).
 *
 * - "정말요?" 류 위협 문구 금지, 버튼은 행동 서술형("보관하기").
 * - 보관 ≠ 삭제: 데이터가 그대로 남는다는 약속을 본문이 먼저 말한다.
 * - 사전 동기화 안내의 유일한 지점(ADR-033 — 배너 삭제로 여기로 일원화).
 * - 시간표는 수업반과 구조적으로 분리돼 있어 따로 갱신 안내(§12-A ④).
 */
interface ArchiveConfirmDialogProps {
  /** 보관 대상(1개 = 단건, 2개 이상 = 일괄) */
  targets: readonly TeachingClass[];
  /** 단건 보관 시 같은 groupId로 활성에 남는 형제 과목 수 (일괄이면 무시) */
  activeSiblingCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ArchiveConfirmDialog({
  targets,
  activeSiblingCount,
  onConfirm,
  onCancel,
}: ArchiveConfirmDialogProps) {
  const single = targets.length === 1 ? targets[0] : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  if (targets.length === 0) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="수업반 보관 확인"
        className="bg-sp-card border border-sp-border rounded-2xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-sp-accent bg-sp-surface rounded-xl p-2 shrink-0">
            inventory_2
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-sp-semibold text-sp-text">
              {single
                ? `'${single.name}(${single.subject})'을 보관할까요?`
                : `선택한 ${targets.length}개 수업반을 보관할까요?`}
            </h3>
            <p className="text-sm text-sp-muted mt-1.5">
              {single
                ? '출결·진도·기록은 그대로 남고 언제든 다시 볼 수 있어요.'
                : '기록은 그대로 남아요. 보관된 반은 목록 아래 보관 섹션에서 언제든 다시 볼 수 있어요.'}
            </p>

            {single && activeSiblingCount > 0 && (
              <p className="text-sm text-sp-text mt-2">
                같은 반의 다른 과목 {activeSiblingCount}개는 계속 활성 상태로 남아요.
              </p>
            )}

            {!single && (
              <ul className="mt-2 max-h-32 overflow-y-auto rounded-xl bg-sp-surface p-2.5 space-y-1">
                {targets.map((cls) => (
                  <li key={cls.id} className="flex items-center gap-2 text-xs text-sp-text">
                    <span className="w-1 h-1 rounded-full bg-sp-muted shrink-0" />
                    <span className="truncate">
                      {cls.name} · {cls.subject}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="mt-3 space-y-1.5 rounded-xl bg-sp-surface p-3">
              <li className="flex items-start gap-2 text-xs text-sp-muted">
                <span className="material-symbols-outlined text-sm text-sp-accent shrink-0">
                  sync
                </span>
                다른 기기(폰·다른 PC)를 먼저 동기화한 뒤 정리하는 것을 권장해요.
              </li>
              <li className="flex items-start gap-2 text-xs text-sp-muted">
                <span className="material-symbols-outlined text-sm text-sp-accent shrink-0">
                  calendar_month
                </span>
                시간표는 따로 갱신해 주세요.
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-sp-muted bg-sp-surface border border-sp-border hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-sp-semibold bg-sp-accent text-sp-accent-fg hover:brightness-110 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-icon-sm">inventory_2</span>
            보관하기
          </button>
        </div>
      </div>
    </div>
  );
}
