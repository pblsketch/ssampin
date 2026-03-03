import { useState } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';
import type { CategoryItem } from '@domain/entities/SchoolEvent';

const DEFAULT_CAT_IDS = new Set(['school', 'class', 'department', 'treeSchool', 'etc']);

// COLOR_MAP proxy from SettingsPage
const SETTINGS_COLOR_MAP: Record<string, { bg: string; shadow: string; ring: string }> = {
    blue: { bg: 'bg-blue-500', shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]', ring: 'ring-blue-500' },
    green: { bg: 'bg-green-500', shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]', ring: 'ring-green-500' },
    yellow: { bg: 'bg-amber-500', shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]', ring: 'ring-amber-500' },
    purple: { bg: 'bg-purple-500', shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]', ring: 'ring-purple-500' },
    red: { bg: 'bg-red-500', shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]', ring: 'ring-red-500' },
    pink: { bg: 'bg-pink-500', shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]', ring: 'ring-pink-500' },
    indigo: { bg: 'bg-indigo-500', shadow: 'shadow-[0_0_8px_rgba(99,102,241,0.5)]', ring: 'ring-indigo-500' },
    teal: { bg: 'bg-teal-500', shadow: 'shadow-[0_0_8px_rgba(20,184,166,0.5)]', ring: 'ring-teal-500' },
    gray: { bg: 'bg-slate-400', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]', ring: 'ring-slate-400' },
};

function colorDot(color: string, size = 'w-3 h-3') {
    const fallback = SETTINGS_COLOR_MAP['gray']!;
    const c = SETTINGS_COLOR_MAP[color] ?? fallback;
    return `${size} rounded-full ${c.bg} ${c.shadow}`;
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
        <div className="flex items-center justify-between p-3 rounded-lg bg-sp-surface hover:bg-sp-text/5 transition-colors group border border-transparent hover:border-sp-border/50">
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

export function CategoryManagementModal({ onClose }: { onClose: () => void }) {
    const { categories, addCategory, deleteCategory } = useEventsStore();
    const [showCatForm, setShowCatForm] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState<string>('blue');

    async function handleAddCategory() {
        if (!newCatName.trim()) return;
        await addCategory(newCatName.trim(), newCatColor);
        setNewCatName('');
        setNewCatColor('blue');
        setShowCatForm(false);
    }

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                    className="w-full max-w-[480px] bg-sp-card rounded-2xl border border-sp-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                                <span className="material-symbols-outlined">category</span>
                            </div>
                            <h2 className="text-lg font-bold text-white">일정 카테고리 관리</h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-sp-muted hover:text-white"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-sp-muted">내 카테고리</span>
                            {!showCatForm && (
                                <button
                                    type="button"
                                    onClick={() => setShowCatForm(true)}
                                    className="text-xs font-medium text-sp-accent hover:text-blue-400 flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    카테고리 추가
                                </button>
                            )}
                        </div>

                        <div className="space-y-2">
                            {categories.map((cat) => (
                                <CategoryRow
                                    key={cat.id}
                                    category={cat}
                                    isDefault={DEFAULT_CAT_IDS.has(cat.id)}
                                    onDelete={() => void deleteCategory(cat.id)}
                                />
                            ))}

                            {showCatForm && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-sp-surface border border-sp-border/50">
                                    <div className="flex gap-1.5 flex-wrap w-[40%]">
                                        {CATEGORY_COLOR_PRESETS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setNewCatColor(c)}
                                                className={`w-5 h-5 rounded-full ${SETTINGS_COLOR_MAP[c]?.bg ?? 'bg-slate-400'} ${newCatColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-sp-card' : ''
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                    <input
                                        type="text"
                                        value={newCatName}
                                        onChange={(e) => setNewCatName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && void handleAddCategory()}
                                        placeholder="카테고리 이름"
                                        className="flex-1 bg-transparent text-sm text-sp-text placeholder-sp-muted focus:outline-none border-none p-0 min-w-0"
                                        autoFocus
                                    />
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => void handleAddCategory()}
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
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
