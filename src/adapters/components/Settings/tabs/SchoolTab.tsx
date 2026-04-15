import { useState, useCallback } from 'react';
import type { Settings, NeisSettings, MealSchoolSettings } from '@domain/entities/Settings';
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

  // 급식용 학교 검색 상태 (기본 학교 검색과 분리)
  const [mealSchoolQuery, setMealSchoolQuery] = useState('');
  const [showMealSchoolSearch, setShowMealSchoolSearch] = useState(false);
  const [mealSearchResults, setMealSearchResults] = useState<readonly SchoolSearchResult[]>([]);
  const [mealSearching, setMealSearching] = useState(false);
  const [mealSearchError, setMealSearchError] = useState<string | null>(null);

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
    const kind = school.schoolType ?? '';
    const detectedLevel: Settings['schoolLevel'] | null =
      kind.includes('초등') ? 'elementary'
      : kind.includes('중학') ? 'middle'
      : kind.includes('고등') ? 'high'
      : null;
    patch(
      detectedLevel && detectedLevel !== draft.schoolLevel
        ? { schoolName: school.schoolName, schoolLevel: detectedLevel }
        : { schoolName: school.schoolName }
    );
    setSchoolQuery('');
    setShowSchoolSearch(false);
    clearSearch();
  }, [patchNeis, patch, clearSearch, draft.schoolLevel]);

  // 급식용 학교 검색
  const handleMealSchoolSearch = useCallback(async () => {
    const q = mealSchoolQuery.trim();
    if (!q) return;
    setMealSearching(true);
    setMealSearchError(null);
    try {
      // useMealStore의 searchSchools를 직접 사용하면 기본 검색 결과와 충돌하므로
      // 별도로 검색 결과를 관리
      const { searchSchools: doSearch } = useMealStore.getState();
      await doSearch(q);
      const { searchResults: results, searchError: err } = useMealStore.getState();
      setMealSearchResults(results);
      setMealSearchError(err);
      // 기본 검색 결과 초기화
      clearSearch();
    } catch {
      setMealSearchError('검색 중 오류가 발생했습니다');
    } finally {
      setMealSearching(false);
    }
  }, [mealSchoolQuery, clearSearch]);

  const handleSelectMealSchool = useCallback((school: SchoolSearchResult) => {
    const mealSchool: MealSchoolSettings = {
      schoolCode: school.schoolCode,
      atptCode: school.atptCode,
      schoolName: `${school.schoolName} (${school.address.split(' ').slice(0, 2).join(' ')})`,
    };
    patch({ mealSchool });
    setMealSchoolQuery('');
    setShowMealSchoolSearch(false);
    setMealSearchResults([]);
    setMealSearchError(null);
  }, [patch]);

  const handleClearMealSchool = useCallback(() => {
    patch({ mealSchool: { schoolCode: '', atptCode: '', schoolName: '' } });
  }, [patch]);

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
              <span className="material-symbols-outlined text-teal-400 text-icon-md">school</span>
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
                    <span className="material-symbols-outlined text-icon-md">search</span>
                  )}
                  검색
                </button>
              </div>

              {searchError && searchResults.length === 0 && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  <p className="text-xs text-sp-text font-medium">🔍 검색 결과가 없습니다</p>
                  <p className="text-xs text-sp-muted leading-relaxed">
                    유치원·학원·대안학교 등은 NEIS에 등록되어 있지 않아요.
                    학교명을 직접 입력하시면 NEIS 연동 없이 쌤핀을 사용할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const manualName = schoolQuery.trim();
                      if (manualName) {
                        patch({
                          schoolName: manualName,
                          neis: { ...draft.neis, schoolName: manualName, schoolCode: '', atptCode: '' },
                        });
                        setSchoolQuery('');
                        setShowSchoolSearch(false);
                        clearSearch();
                      }
                    }}
                    disabled={!schoolQuery.trim()}
                    className="w-full py-2 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    &ldquo;{schoolQuery.trim()}&rdquo;(으)로 직접 설정하기
                  </button>
                </div>
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
                        <span className="text-caption text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">
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

      {/* 급식 조회용 별도 학교 설정 */}
      {draft.neis.schoolCode && (
        <details className="mt-5 rounded-xl border border-sp-border bg-sp-bg/50">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm text-sp-muted hover:text-sp-text transition-colors select-none">
            <span className="flex items-center gap-2">
              <span>🍱</span>
              <span>급식이 안 나오나요?</span>
            </span>
            <span className="material-symbols-outlined text-icon">expand_more</span>
          </summary>
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-sp-muted leading-relaxed">
              중·고 통합학교의 경우 급식이 다른 학교 코드로 등록되어 있을 수 있어요.
              아래에서 급식 조회용 학교를 별도로 설정하면 해결됩니다.
            </p>

            <div className="space-y-2 relative">
              <label className="text-xs font-medium text-sp-text">급식 조회용 학교</label>
              {draft.mealSchool?.schoolName && !showMealSchoolSearch ? (
                <div className="flex items-center justify-between bg-sp-card rounded-lg px-3 py-2.5 border border-sp-border">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="material-symbols-outlined text-amber-400 text-icon-md shrink-0">restaurant</span>
                    <span className="text-sm text-sp-text truncate">{draft.mealSchool.schoolName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => setShowMealSchoolSearch(true)}
                      className="text-xs text-sp-accent hover:text-blue-400 font-medium"
                    >
                      변경
                    </button>
                    <button
                      type="button"
                      onClick={handleClearMealSchool}
                      className="text-xs text-sp-muted hover:text-red-400 transition-colors"
                    >
                      해제
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mealSchoolQuery}
                      onChange={(e) => { setMealSchoolQuery(e.target.value); setMealSearchResults([]); setMealSearchError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && void handleMealSchoolSearch()}
                      placeholder="급식 조회용 학교명 검색"
                      className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder-sp-muted focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => void handleMealSchoolSearch()}
                      disabled={mealSearching || !mealSchoolQuery.trim()}
                      className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      {mealSearching ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="material-symbols-outlined text-icon">search</span>
                      )}
                      검색
                    </button>
                  </div>

                  {mealSearchError && mealSearchResults.length === 0 && (
                    <p className="text-xs text-sp-muted mt-1">{mealSearchError}</p>
                  )}

                  {mealSearchResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 mt-1 w-full bg-sp-card rounded-lg border border-sp-border shadow-2xl max-h-48 overflow-y-auto">
                      {mealSearchResults.map((school) => (
                        <button
                          key={`meal-${school.atptCode}-${school.schoolCode}`}
                          type="button"
                          onClick={() => handleSelectMealSchool(school)}
                          className="w-full text-left px-4 py-2.5 hover:bg-sp-text/5 transition-colors border-b border-sp-border last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-sp-text">{school.schoolName}</span>
                            <span className="text-caption text-sp-muted bg-sp-border/30 px-1.5 py-0.5 rounded">
                              {school.schoolType}
                            </span>
                          </div>
                          <p className="text-xs text-sp-muted mt-0.5">{school.address}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {showMealSchoolSearch && draft.mealSchool?.schoolName && (
                    <button
                      type="button"
                      onClick={() => { setShowMealSchoolSearch(false); setMealSchoolQuery(''); setMealSearchResults([]); setMealSearchError(null); }}
                      className="text-xs text-sp-muted hover:text-sp-text"
                    >
                      취소
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </details>
      )}
    </SettingsSection>
  );
}
