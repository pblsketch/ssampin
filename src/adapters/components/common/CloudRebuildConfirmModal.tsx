import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@adapters/components/common/Modal';

export interface CloudRebuildConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * "클라우드 백업 다시 만들기" 확인 모달.
 *
 * 장부와 실제 Drive 파일이 어긋나 동기화가 멈췄을 때, 선생님이 누를 수 있는 유일한 복구다.
 *
 * ## 안내 순서를 안심 → 경고로 잡은 이유
 *
 * 이 화면을 보는 선생님은 이미 빨간 오류를 보고 놀란 상태다. 경고부터 들이밀면
 * **고칠 수 있는데도 아무것도 못 하고 덮어 둔다** — 그러면 동기화가 계속 멈춰 있어
 * 오히려 손해가 커진다. 그래서 "이 컴퓨터 자료는 그대로다", "휴지통에 남는다"를 먼저
 * 보여 주고, 진짜 위험 한 가지만 마지막에 눈에 띄게 둔다.
 *
 * 안심시키되 속이지는 않는다 — 유일한 실질 위험(다른 기기에만 있는 변경분)은
 * 색을 갈라 두고, 체크박스 문구에도 그 위험을 명시한다.
 *
 * ## createPortal 이 필수인 이유 (지우지 말 것)
 *
 * 이 모달은 사이드바 안(DriveSyncIndicator)에서 렌더된다. 사이드바 aside 에는
 * `data-sp-glass-surface` 가 붙어 있고, 유리를 켜면 index.css 가 거기에
 * `backdrop-filter` 를 건다. backdrop-filter 가 none 이 아니면 CSS 사양상
 * 그 조상이 `position: fixed` 의 containing block 이 된다 — 모달이 뷰포트가 아니라
 * **폭 256px 사이드바에 갇히고**, 사이드바의 overflow-hidden 에 잘려 단추가 사라진다.
 *
 * 게다가 `html.sp-glass-slow` 는 backdrop-filter 를 다시 none 으로 되돌린다.
 * 즉 **유리를 켠 빠른 기기에서만** 깨진다 — 기본 설정으로 보면 멀쩡해 보이고,
 * jsdom 은 레이아웃을 계산하지 않아 테스트로도 안 잡힌다.
 *
 * Modal.tsx 자체를 고치지 않는 이유: 앱 전체가 쓰는 컴포넌트라 파급이 너무 크다.
 * (같은 함정과 처방이 docs/02-design/features 의 발제 피드백 설계서에 이미 적혀 있다)
 */
export function CloudRebuildConfirmModal({
  open,
  onCancel,
  onConfirm,
}: CloudRebuildConfirmModalProps) {
  const [understood, setUnderstood] = useState(false);

  // 닫혔다 다시 열리면 체크박스는 항상 처음 상태로 — 두 번째 실행이 무심코 통과하면 안 된다.
  useEffect(() => {
    if (!open) setUnderstood(false);
  }, [open]);

  return createPortal(
    <Modal
      isOpen={open}
      onClose={onCancel}
      title="클라우드 백업 다시 만들기"
      srOnlyTitle
      size="sm"
      closeOnBackdrop={false}
    >
      <div className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-sp-surface flex items-center justify-center">
            <span className="material-symbols-outlined text-sp-accent text-icon-lg">
              cloud_sync
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-sp-text">클라우드 백업 다시 만들기</h2>
            <p className="mt-1 text-sm text-sp-muted leading-relaxed">
              구글 드라이브에 있는 백업을 지우고, 이 컴퓨터의 자료로 처음부터 다시 올려요.
            </p>
          </div>
        </div>

        {/* 안심 두 가지 — 경고보다 먼저 본다 */}
        <ul className="space-y-2">
          <li className="flex items-start gap-2 px-3 py-2 rounded-lg bg-sp-surface">
            <span className="material-symbols-outlined text-emerald-500 text-icon-sm mt-0.5 flex-shrink-0">
              check_circle
            </span>
            <span className="text-sm text-sp-text">
              이 컴퓨터에 있는 자료는 하나도 지워지지 않아요.
            </span>
          </li>
          <li className="flex items-start gap-2 px-3 py-2 rounded-lg bg-sp-surface">
            <span className="material-symbols-outlined text-emerald-500 text-icon-sm mt-0.5 flex-shrink-0">
              check_circle
            </span>
            <span className="text-sm text-sp-text">
              드라이브에서 지운 파일은 휴지통에 30일 동안 남아 되살릴 수 있어요.
            </span>
          </li>
          {/* 진짜 위험 하나 — 색을 갈라 둔다 */}
          <li className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10">
            <span className="material-symbols-outlined text-amber-500 text-icon-sm mt-0.5 flex-shrink-0">
              warning
            </span>
            <span className="text-sm text-sp-text">
              휴대폰이나 다른 컴퓨터에서만 바꾸고 이 컴퓨터로 아직 받아오지 않은 내용은 사라져요.
            </span>
          </li>
        </ul>

        <label className="mt-4 flex items-start gap-2 p-3 rounded-lg border border-sp-border cursor-pointer">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 accent-sp-accent"
          />
          <span className="text-sm text-sp-text">
            다른 기기에만 있는 최근 내용이 사라질 수 있다는 점을 이해했어요
          </span>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-sp-border text-sp-text hover:bg-black/5 dark:hover:bg-white/10 text-sm transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!understood}
            className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            다시 만들기
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
