import { useCallback } from 'react';
import type { Settings } from '@domain/entities/Settings';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { SettingsSection } from '../shared/SettingsSection';
import { NumberStepper } from '../shared/NumberStepper';
import { SeatRelationSection } from '../SeatRelationSection';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function SeatTab({ draft, patch }: Props) {
  const resizeGrid = useSeatingStore((s) => s.resizeGrid);

  const handleRowChange = useCallback((v: number) => {
    patch({ seatingRows: v });
    void resizeGrid(v, draft.seatingCols);
  }, [draft.seatingCols, patch, resizeGrid]);

  const handleColChange = useCallback((v: number) => {
    patch({ seatingCols: v });
    void resizeGrid(draft.seatingRows, v);
  }, [draft.seatingRows, patch, resizeGrid]);

  return (
    <div>
      <SettingsSection
        icon="chair"
        iconColor="bg-orange-500/10 text-orange-400"
        title="좌석 배치"
        description="학급 좌석의 행과 열 수를 설정합니다."
      >
        <div className="flex items-center justify-between gap-8">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-sp-muted">행 수 (Rows)</label>
            <NumberStepper value={draft.seatingRows} onChange={handleRowChange} />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-sp-muted">열 수 (Columns)</label>
            <NumberStepper value={draft.seatingCols} onChange={handleColChange} />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-sp-border/30">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-sp-text">기본 시점</span>
            <span className="text-xs text-sp-muted">좌석배치 화면을 열 때의 기본 시점을 설정합니다.</span>
          </div>
          <select
            value={draft.seatingDefaultView ?? 'student'}
            onChange={(e) => patch({ seatingDefaultView: e.target.value as 'student' | 'teacher' })}
            className="bg-sp-card border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
          >
            <option value="student">학생 시점</option>
            <option value="teacher">교사 시점</option>
          </select>
        </div>
      </SettingsSection>

      <SeatRelationSection />
    </div>
  );
}
