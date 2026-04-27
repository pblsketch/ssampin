import { Modal } from '@adapters/components/common/Modal';

export type StickerAddMode = 'individual' | 'sheet';

interface StickerAddPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mode: StickerAddMode) => void;
  /** 빈 상태에서 호출할 때 "만드는 법 보기" 버튼 노출 */
  onOpenGuide?: () => void;
}

/**
 * "이모티콘 추가" 진입점 모달.
 *
 * 두 가지 등록 방식 중 사용자가 골라 더 적합한 화면으로 라우팅한다:
 * - individual: 한 장 또는 여러 장의 PNG 파일을 그대로 등록 (StickerUploader)
 * - sheet:      4×4 등 격자 시트 한 장을 자동 분할해 한 번에 등록 (StickerSheetSplitter)
 *
 * 모드 선택 시 본 모달은 닫히고, 부모가 해당 모드의 모달을 띄운다.
 */
export function StickerAddPickerModal({
  isOpen,
  onClose,
  onSelect,
  onOpenGuide,
}: StickerAddPickerModalProps): JSX.Element {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="이모티콘 추가 방식 선택"
      srOnlyTitle
      size="md"
    >
      <div className="flex flex-col">
        {/* 헤더 */}
        <header className="flex items-start justify-between px-5 py-4 border-b border-sp-border">
          <div>
            <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
              <span aria-hidden="true">😎</span>
              이모티콘 추가
            </h3>
            <p className="text-detail text-sp-muted mt-0.5">
              어떤 방식으로 등록할지 골라주세요. 언제든 다시 바꿀 수 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* 옵션 카드 */}
        <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ModeCard
            emoji="🖼️"
            icon="add_photo_alternate"
            title="개별 파일로 등록"
            description="PNG 파일을 한 장 또는 여러 장 한꺼번에 골라서 등록해요."
            highlights={['1장 또는 여러 장 동시 등록', '드래그 앤 드롭 지원']}
            onClick={() => onSelect('individual')}
          />
          <ModeCard
            emoji="📐"
            icon="grid_view"
            title="시트 분할로 한 번에"
            description="4×4 등 격자 시트 한 장을 자동으로 잘라서 한꺼번에 등록해요."
            highlights={['ChatGPT의 4×4 시트에 최적', '빈 칸/중복 자동 제외']}
            onClick={() => onSelect('sheet')}
          />
        </div>

        {/* 푸터 — 가이드 보기 (옵션) */}
        {onOpenGuide && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-sp-border bg-sp-bg/30">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenGuide();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors"
            >
              <span className="material-symbols-outlined icon-sm">tips_and_updates</span>
              만드는 법 보기
            </button>
          </footer>
        )}
      </div>
    </Modal>
  );
}

interface ModeCardProps {
  emoji: string;
  icon: string;
  title: string;
  description: string;
  highlights: string[];
  onClick: () => void;
}

function ModeCard({
  emoji,
  icon,
  title,
  description,
  highlights,
  onClick,
}: ModeCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative text-left p-4 rounded-xl bg-sp-card ring-1 ring-sp-border hover:ring-sp-accent hover:bg-sp-accent/5 hover:shadow-sp-md transition-all duration-sp-base ease-sp-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
    >
      <div className="flex items-start gap-3 mb-2">
        <div
          className="text-3xl shrink-0 leading-none select-none"
          aria-hidden="true"
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm md:text-base font-sp-bold text-sp-text leading-tight flex items-center gap-1.5">
            <span className="material-symbols-outlined icon-sm text-sp-accent">
              {icon}
            </span>
            {title}
          </h4>
        </div>
      </div>

      <p className="text-detail text-sp-muted leading-relaxed mb-3">
        {description}
      </p>

      <ul className="space-y-1 mb-3">
        {highlights.map((h) => (
          <li
            key={h}
            className="text-detail text-sp-text flex items-center gap-1.5 leading-snug"
          >
            <span className="material-symbols-outlined icon-sm text-sp-accent/80 shrink-0">
              check_circle
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="inline-flex items-center gap-1 text-detail font-sp-semibold text-sp-muted group-hover:text-sp-accent transition-colors">
        선택하기
        <span className="material-symbols-outlined icon-sm">arrow_forward</span>
      </div>
    </button>
  );
}
