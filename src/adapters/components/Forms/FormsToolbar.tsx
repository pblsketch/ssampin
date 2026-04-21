import { useState } from 'react';
import type { FormFormat } from '@domain/entities/FormTemplate';
import type { FormSort } from '@domain/rules/formTemplateRules';
import { useFormStore } from '@adapters/stores/useFormStore';
import { CategoryManager } from './CategoryManager';

const FORMAT_TABS: ReadonlyArray<{ id: FormFormat | 'all'; label: string; dot: string }> = [
  { id: 'all',   label: '전체',  dot: 'bg-sp-muted' },
  { id: 'hwpx',  label: 'HWPX',  dot: 'bg-sp-accent' },
  { id: 'pdf',   label: 'PDF',   dot: 'bg-sp-highlight' },
  { id: 'excel', label: 'Excel', dot: 'bg-emerald-500' },
];

export function FormsToolbar() {
  const filter = useFormStore((s) => s.filter);
  const sort = useFormStore((s) => s.sort);
  const categories = useFormStore((s) => s.categories);
  const setFilter = useFormStore((s) => s.setFilter);
  const setSort = useFormStore((s) => s.setSort);

  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  return (
    <div className="space-y-3 mb-5">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-lg pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={filter.query ?? ''}
          onChange={(e) => setFilter({ query: e.target.value })}
          placeholder="서식명/태그 검색"
          className="w-full pl-10 pr-3 py-2 bg-sp-card border border-sp-border rounded-lg text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FORMAT_TABS.map((tab) => {
          const active =
            (tab.id === 'all' && !filter.format) ||
            filter.format === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setFilter({ format: tab.id === 'all' ? undefined : tab.id })
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
              {tab.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setFilter({ starred: filter.starred ? undefined : true })
          }
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            filter.starred
              ? 'bg-sp-highlight/20 text-sp-highlight border border-sp-highlight/40'
              : 'bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border'
          }`}
        >
          <span className="material-symbols-outlined text-base">star</span>
          즐겨찾기만
        </button>

        <div className="ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as FormSort)}
            className="bg-sp-card border border-sp-border rounded-lg text-sm text-sp-text px-3 py-1.5 focus:outline-none focus:border-sp-accent"
          >
            <option value="recent">최근 사용순</option>
            <option value="name">이름순</option>
            <option value="created">생성일순</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter({ categoryId: undefined })}
          className={`px-3 py-1 rounded-lg text-xs transition-colors ${
            !filter.categoryId
              ? 'bg-sp-accent text-white'
              : 'bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border'
          }`}
        >
          전체
        </button>
        {categories.map((c) => {
          const active = filter.categoryId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter({ categoryId: c.id })}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs transition-colors ${
                active
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-card text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{c.icon}</span>
              {c.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCategoryManagerOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs bg-sp-card text-sp-muted hover:text-sp-text border border-dashed border-sp-border"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새 카테고리
        </button>
      </div>

      {categoryManagerOpen && (
        <CategoryManager onClose={() => setCategoryManagerOpen(false)} />
      )}
    </div>
  );
}
