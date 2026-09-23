/**
 * 관찰 기록 응원 2·3차(ADR-137, 설계 §7) — 한 주 정리·학기 돌아보기 공용 틀.
 *
 * - 화면은 **조각 목록**이다. 조각마다 고유 이름·순서·제목·내용을 가진다. 관찰 조각이 첫 조각이고,
 *   다른 작업(진도·상담·할 일·학교 달력 순간)은 조각 목록(`recapPieces`)에 더하기만 하면 된다.
 * - 보여 줄 조각이 하나도 없으면 비우지 않고 한 줄만 둔다.
 * - ★문서 끝(`document.body`)에 띄운다 — 유리 모드의 확장 창이 흐림 효과로 `fixed` 위치를 가둔다.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@adapters/components/common/Modal';

export interface RecapPiece {
  /** 고유 이름 — 'observation' | 'termGrass' | 'scene' | 'draftReady' | 'thisWeek' | … */
  readonly id: string;
  /** 작을수록 위 */
  readonly order: number;
  /** null 이면 제목 없이 본문만 */
  readonly title: string | null;
  readonly render: () => ReactNode;
  /**
   * 곁들이는 조각(학교 달력 인사 등) — 이런 조각만 있으면 빈 창으로 보고 빈 줄도 함께 둔다.
   * 알릴지 판단(`weeklyRecapHasContent`)에도 넣지 않는다.
   */
  readonly companion?: boolean;
}

interface RecapModalFrameProps {
  readonly onClose: () => void;
  readonly title: string;
  readonly size: 'md' | 'xl';
  readonly pieces: readonly RecapPiece[];
  readonly emptyMessage: string;
  /** 조각 목록 위에 고정으로 두는 조절(예: 학기 고르기) */
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
}

export function RecapModalFrame({
  onClose,
  title,
  size,
  pieces,
  emptyMessage,
  header,
  footer,
}: RecapModalFrameProps): JSX.Element {
  const sorted = [...pieces].sort((a, b) => a.order - b.order);
  const empty = sorted.every((p) => p.companion === true);
  return createPortal(
    <Modal isOpen onClose={onClose} title={title} size={size}>
      <div className="flex min-h-0 flex-col">
        {header}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 pb-4 pt-1">
          {sorted.map((p) => (
            <section key={p.id} aria-label={p.title ?? undefined}>
              {p.title !== null && (
                <h3 className="mb-2 text-sm font-sp-semibold text-sp-text">{p.title}</h3>
              )}
              {p.render()}
            </section>
          ))}
          {empty && <p className="py-8 text-center text-sm text-sp-muted">{emptyMessage}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-sp-border px-6 py-3">
          {footer}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-sp-muted transition-colors hover:text-sp-text"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
