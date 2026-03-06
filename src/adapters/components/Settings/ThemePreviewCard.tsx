import type { DashboardTheme } from '@domain/entities/DashboardTheme';

interface ThemePreviewCardProps {
  theme: DashboardTheme;
  isSelected: boolean;
  onClick: () => void;
}

export function ThemePreviewCard({ theme, isSelected, onClick }: ThemePreviewCardProps) {
  const { colors } = theme;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-[130px] h-[100px] rounded-xl border-2 transition-all duration-200 hover:scale-105 cursor-pointer overflow-hidden ${
        isSelected
          ? 'ring-2 ring-offset-2 ring-sp-accent border-sp-accent'
          : 'border-sp-border hover:border-sp-muted'
      }`}
      style={{ backgroundColor: colors.bg }}
    >
      {/* 미니 레이아웃 */}
      <div className="absolute inset-0 p-2 flex flex-col gap-1.5">
        {/* 상단 accent 바 */}
        <div
          className="h-1.5 w-10 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />

        {/* 카드 영역 */}
        <div
          className="flex-1 rounded-md p-1.5 flex flex-col gap-1"
          style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
        >
          {/* 텍스트 샘플 */}
          <div
            className="h-1 w-12 rounded-full"
            style={{ backgroundColor: colors.text, opacity: 0.8 }}
          />
          <div
            className="h-1 w-8 rounded-full"
            style={{ backgroundColor: colors.muted, opacity: 0.6 }}
          />
          {/* highlight 점 */}
          <div className="flex gap-1 mt-auto">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: colors.highlight }}
            />
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: colors.accent }}
            />
          </div>
        </div>
      </div>

      {/* 선택 체크마크 */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-sp-accent flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[14px]">check</span>
        </div>
      )}

      {/* 테마 이름 */}
      <div
        className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium py-0.5"
        style={{ color: colors.text, backgroundColor: `${colors.surface}cc` }}
      >
        {theme.name}
      </div>
    </button>
  );
}
