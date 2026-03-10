import { useState, useCallback } from 'react';
import type { Settings, NeisSettings } from '@domain/entities/Settings';
import type { SchoolSearchResult } from '@domain/entities/Meal';
import { useMealStore } from '@adapters/stores/useMealStore';
import { SettingsSection } from '../shared/SettingsSection';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function SchoolTab({ draft, patch }: Props) {
  const [schoolQuery, setSchoolQuery] = useState('');
  const [showSchoolSearch, setShowSchoolSearch] = useState(false);
  const { searchResults, searching, searchError, searchSchools, clearSearch } = useMealStore();

  const patchNeis = useCallback((p: Partial<NeisSettings>) => {
    patch({ neis: { ...draft.neis, ...p } });
  }, [draft.neis, patch]);

  const handleSchoolSearch = useCallback(() => {
    if (!schoolQuery.trim()) return;
    void searchSchools(schoolQuery.trim());
  }, [schoolQuery, searchSchools]);

  const handleSelectSchool = useCallback((school: SchoolSearchResult) => {
    patchNeis({
      schoolCode: school.schoolCode,
      atptCode: school.atptCode,
      schoolName: `${school.schoolName} (${school.address.split(' ').slice(0, 2).join(' ')})`,
    });
    patch({ schoolName: school.schoolName });
    setSchoolQuery('');
    setShowSchoolSearch(false);
    clearSearch();
  }, [patchNeis, patch, clearSearch]);

  return (
    <SettingsSection
      icon="school"
      iconColor="bg-blue-500/10 text-blue-400"
      title="학교/학급 정보"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 학교명 — NEIS 검색 연동 */}
        <div className="space-y-2 relative md:col-span-2">
          <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
            학교명
          </label>
          {draft.neis.schoolName && !showSchoolSearch ? (
            <div className="flex items-center gap-3 bg-sp-surface border border-sp-border rounded-lg px-4 py-2.5">
              <span className="material-symbols-outlined text-teal-400 text-[18px]">school</span>
              <span className="text-sm text-sp-text flex-1 truncate">{draft.neis.schoolName}</span>
              <button
                type="button"
                onClick={() => setShowSchoolSearch(true)}
                className="text-xs text-sp-accent hover:text-blue-400 font-medium shrink-0"
              >
                변경
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={schoolQuery}
                  onChange={(e) => { setSchoolQuery(e.target.value); clearSearch(); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSchoolSearch()}
                  placeholder="학교명을 입력하세요"
                  className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-4 py-2.5 text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={handleSchoolSearch}
                  disabled={searching || !schoolQuery.trim()}
                  className="px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  {searching ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">search</span>
                  )}
                  검색
                </button>
              </div>

              {searchError && searchResults.length === 0 && (
                <p className="text-xs text-sp-muted mt-1">{searchError}</p>
              )}

              {searchResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 mt-1 w-full bg-sp-card rounded-lg border border-sp-border shadow-2xl max-h-60 overflow-y-auto">
                  {searchResults.map((school) => (
                    <button
                      key={`${school.atptCode}-${school.schoolCode}`}
                      type="button"
                      onClick={() => handleSelectSchool(school)}
                      className="w-full text-left px-4 py-3 hover:bg-sp-text/5 transition-colors border-b border-sp-border last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-sp-text">{school.schoolName}</span>
                        <span className="text-[10px] text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">
                          {school.schoolType}
                        </span>
                      </div>
                      <p className="text-xs text-sp-muted mt-0.5">{school.address}</p>
                    </button>
                  ))}
                </div>
              )}

              {showSchoolSearch && draft.neis.schoolName && (
                <button
                  type="button"
                  onClick={() => { setShowSchoolSearch(false); setSchoolQuery(''); clearSearch(); }}
                  className="text-xs text-sp-muted hover:text-sp-text"
                >
                  취소
                </button>
              )}
            </>
          )}
        </div>

        {/* 나머지 필드 */}
        {([
          ['className', '학급명'] as const,
          ['teacherName', '교사명'] as const,
          ['subject', '담당 과목'] as const,
        ]).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
              {label}
            </label>
            <input
              type="text"
              value={draft[key]}
              onChange={(e) => patch({ [key]: e.target.value })}
              placeholder={label}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-4 py-2.5 text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
            />
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
