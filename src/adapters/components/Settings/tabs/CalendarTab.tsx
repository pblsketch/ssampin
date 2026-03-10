import { useState } from 'react';
import type { CategoryItem } from '@domain/entities/SchoolEvent';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { SettingsSection } from '../shared/SettingsSection';
import { COLOR_MAP, colorDot, DEFAULT_CAT_IDS } from '../shared/constants';
import { NeisScheduleSection } from '../NeisScheduleSection';
import { NeisTimetableAutoSyncSection } from '../NeisTimetableAutoSyncSection';
import { CalendarSettings } from '../CalendarSettings';

export function CalendarTab() {
  const { categories, addCategory, deleteCategory } = useEventsStore();
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>('blue');

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim(), newCatColor);
    setNewCatName('');
    setNewCatColor('blue');
    setShowCatForm(false);
  };

  return (
    <div>
      {/* 일정 카테고리 관리 */}
      <SettingsSection
        icon="category"
        iconColor="bg-pink-500/10 text-pink-400"
        title="일정 카테고리 관리"
        actions={
          <button
            type="button"
            onClick={() => setShowCatForm(true)}
            className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            카테고리 추가
          </button>
        }
      >
        <div className="space-y-2">
          {categories.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              isDefault={DEFAULT_CAT_IDS.has(cat.id)}
              onDelete={() => deleteCategory(cat.id)}
            />
          ))}

          {showCatForm && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-sp-surface border border-sp-border">
              <div className="flex gap-1.5">
                {CATEGORY_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCatColor(c)}
                    className={`w-5 h-5 rounded-full ${COLOR_MAP[c]?.bg ?? 'bg-slate-400'} ${newCatColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card' : ''
                      }`}
                  />
                ))}
              </div>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="카테고리 이름"
                className="flex-1 bg-transparent text-sm text-sp-text placeholder-sp-muted focus:outline-none border-none p-0"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="text-sp-accent hover:text-blue-400 text-xs font-medium"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => { setShowCatForm(false); setNewCatName(''); }}
                className="text-sp-muted hover:text-sp-text text-xs"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* NEIS 학사일정 */}
      <NeisScheduleSection />

      {/* NEIS 시간표 자동 동기화 */}
      <NeisTimetableAutoSyncSection />

      {/* 구글 캘린더 연동 */}
      <SettingsSection
        icon="calendar_month"
        iconColor="bg-green-500/10 text-green-400"
        title="구글 캘린더 연동"
      >
        <CalendarSettings />
      </SettingsSection>
    </div>
  );
}

function CategoryRow({
  category,
  isDefault,
  onDelete,
}: {
  category: CategoryItem;
  isDefault: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-sp-surface/80 hover:bg-sp-surface transition-colors group border border-transparent hover:border-sp-border">
      <div className="flex items-center gap-3">
        <div className={colorDot(category.color)} />
        <span className="text-sm font-medium text-sp-text">{category.name}</span>
        {isDefault && (
          <span className="text-[10px] text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">기본</span>
        )}
      </div>
      {!isDefault && (
        <button
          type="button"
          onClick={onDelete}
          className="text-sp-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      )}
    </div>
  );
}
