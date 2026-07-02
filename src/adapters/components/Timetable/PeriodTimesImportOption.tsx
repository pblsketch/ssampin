interface PeriodTimesImportOptionProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 안내 문구에 보여줄 1교시 시작 시각 (예: '08:40') */
  firstStart?: string;
}

/**
 * 컴시간 불러오기(학급·교사 공용) — '교시 시각도 함께 가져오기' 옵트인 체크박스.
 * 전역 교시 시간 설정을 덮어쓰므로 기본 OFF이며, 컴시간에 시각 정보가 있을 때만 노출한다.
 */
export function PeriodTimesImportOption({
  checked,
  onChange,
  firstStart,
}: PeriodTimesImportOptionProps) {
  return (
    <label className="flex items-start gap-3 p-3 bg-sp-surface rounded-xl border border-sp-border cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-sp-accent"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-sp-text">교시 시각도 함께 가져오기</p>
        <p className="text-xs text-sp-muted mt-0.5">
          컴시간의 교시별 시각으로 현재{' '}
          <span className="font-semibold">교시 시간 설정을 덮어씁니다</span>
          {firstStart ? ` (예: 1교시 ${firstStart})` : ''}.
        </p>
      </div>
    </label>
  );
}
