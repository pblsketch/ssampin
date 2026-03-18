import { useState, useMemo, useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { Settings, SchoolLevel, NeisSettings } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { SchoolSearchResult } from '@domain/entities/Meal';
import { getDefaultPreset, generatePeriodTimes, parseMinutes, PERIOD_DURATION } from '@domain/rules/periodRules';
import { NAV_ITEMS } from '@adapters/components/Layout/Sidebar';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { ROLE_MENU_MAP, MENU_DESCRIPTIONS, type TeacherRoleId } from './menuRecommendations';
import { getPresetKey } from '@widgets/presets';

/** NEIS schoolType → SchoolLevel 매핑 */
function detectSchoolLevel(schoolType: string): SchoolLevel | null {
    if (schoolType.includes('초등')) return 'elementary';
    if (schoolType.includes('중학')) return 'middle';
    if (schoolType.includes('고등')) return 'high';
    return null;
}

export function Onboarding() {
    const { track } = useAnalytics();
    const { isFirstRun, completeOnboarding } = useSettingsStore();
    const { searchResults, searching, searchError, searchSchools, clearSearch } = useMealStore();
    const [step, setStep] = useState(1);
    const [schoolQuery, setSchoolQuery] = useState('');
    const [manualSchoolInput, setManualSchoolInput] = useState(false);

    // Local state for settings to be configured
    const [draft, setDraft] = useState<Partial<Settings>>({
        schoolName: '',
        className: '',
        teacherName: '',
        subject: '',
        schoolLevel: 'middle',
        maxPeriods: generatePeriodTimes(getDefaultPreset('middle')).length,
        periodTimes: generatePeriodTimes(getDefaultPreset('middle')),
        hiddenMenus: [],
    });

    const [selectedRoles, setSelectedRoles] = useState<TeacherRoleId[]>([]);

    // 역할 선택에 따른 추천 메뉴 계산
    const recommendedMenuIds = useMemo(() => {
        if (selectedRoles.length === 0) {
            return NAV_ITEMS.map((item) => item.id);
        }
        const menuSet = new Set<PageId>();
        menuSet.add('dashboard');
        for (const role of selectedRoles) {
            for (const menuId of ROLE_MENU_MAP[role]) {
                menuSet.add(menuId);
            }
        }
        return Array.from(menuSet);
    }, [selectedRoles]);

    // 개별 메뉴 토글 상태 (추천 기반 초기화 + 사용자 오버라이드)
    const [menuOverrides, setMenuOverrides] = useState<Record<string, boolean>>({});

    // 최종 메뉴 표시 상태 계산
    const menuVisibility = useMemo(() => {
        const result: Record<string, boolean> = {};
        for (const item of NAV_ITEMS) {
            const recommended = recommendedMenuIds.includes(item.id);
            result[item.id] = menuOverrides[item.id] ?? recommended;
        }
        result['dashboard'] = true;
        return result;
    }, [recommendedMenuIds, menuOverrides]);

    // 역할 변경
    const toggleRole = useCallback((roleId: TeacherRoleId) => {
        setSelectedRoles((prev) =>
            prev.includes(roleId)
                ? prev.filter((r) => r !== roleId)
                : [...prev, roleId],
        );
        setMenuOverrides({});
    }, []);

    // 개별 메뉴 토글
    const toggleMenu = useCallback((menuId: string) => {
        if (menuId === 'dashboard') return;
        setMenuOverrides((prev) => ({
            ...prev,
            [menuId]: !(prev[menuId] ?? recommendedMenuIds.includes(menuId as PageId)),
        }));
    }, [recommendedMenuIds]);

    const nextStep = () => setStep((s) => Math.min(5, s + 1));
    const prevStep = () => setStep((s) => Math.max(1, s - 1));

    const handleFinish = async () => {
        track('onboarding_complete', { step: 5 });

        // hiddenMenus 계산
        const hiddenMenus = NAV_ITEMS
            .filter((item) => !menuVisibility[item.id])
            .map((item) => item.id);

        const finalDraft: Partial<Settings> = {
            ...draft,
            hiddenMenus,
            teacherRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
        };

        // 역할 선택 이벤트
        track('onboarding_roles_selected', {
            roles: selectedRoles,
            hiddenMenuCount: hiddenMenus.length,
            visibleMenuCount: NAV_ITEMS.length - hiddenMenus.length,
        });

        // 위젯 프리셋 결정
        const presetKey = getPresetKey(
            (finalDraft.schoolLevel ?? 'middle') as 'elementary' | 'middle' | 'high' | 'custom',
            selectedRoles.includes('homeroom'),
            selectedRoles,
        );
        track('onboarding_widget_preset', { presetKey, roles: selectedRoles });

        // school_set 이벤트
        if (finalDraft.schoolName) {
            track('school_set', {
                school: finalDraft.schoolName,
                level: finalDraft.schoolLevel ?? 'middle',
                region: 'unknown',
            });
        }

        // class_set 이벤트
        if (finalDraft.className) {
            const gradeMatch = finalDraft.className.match(/(\d+)학년/);
            const classMatch = finalDraft.className.match(/(\d+)반/);
            track('class_set', {
                grade: gradeMatch ? parseInt(gradeMatch[1] ?? '0', 10) : 0,
                classNum: classMatch ? parseInt(classMatch[1] ?? '0', 10) : 0,
                studentCount: 0,
            });
        }

        await completeOnboarding(finalDraft);
    };

    const patch = (patch: Partial<Settings>) => {
        setDraft((prev) => ({ ...prev, ...patch }));
    };

    const handleSchoolSearch = useCallback(() => {
        if (!schoolQuery.trim()) return;
        void searchSchools(schoolQuery.trim());
    }, [schoolQuery, searchSchools]);

    const handleSelectSchool = useCallback((school: SchoolSearchResult) => {
        // neis 설정 저장
        const neisUpdate: Partial<NeisSettings> = {
            schoolCode: school.schoolCode,
            atptCode: school.atptCode,
            schoolName: `${school.schoolName} (${school.address.split(' ').slice(0, 2).join(' ')})`,
        };

        // 학교급 자동 감지 → 교시 프리셋도 자동 전환
        const detected = detectSchoolLevel(school.schoolType);
        let levelUpdate: Pick<Settings, 'schoolLevel' | 'maxPeriods' | 'periodTimes'> | Record<string, never> = {};
        if (detected) {
            const p = getDefaultPreset(detected);
            const times = generatePeriodTimes(p);
            levelUpdate = { schoolLevel: detected, maxPeriods: times.length, periodTimes: times };
        }

        setDraft((prev) => ({
            ...prev,
            schoolName: school.schoolName,
            neis: {
                schoolCode: '',
                atptCode: '',
                schoolName: '',
                ...(prev.neis ?? {}),
                ...neisUpdate,
            },
            ...levelUpdate,
        }));
        setSchoolQuery('');
        clearSearch();
    }, [clearSearch]);

    const setPresetByLevel = (level: SchoolLevel) => {
        if (level === 'custom') {
            setDraft((prev) => ({ ...prev, schoolLevel: level, customPeriodDuration: 50, maxPeriods: 6 }));
            return;
        }
        const p = getDefaultPreset(level);
        const times = generatePeriodTimes(p);
        setDraft((prev) => ({ ...prev, schoolLevel: level, maxPeriods: times.length, periodTimes: times }));
    };

    const toTimeStr = (minutes: number): string => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const updatePeriod = (index: number, field: 'start' | 'end', value: string) => {
        setDraft((prev) => {
            const arr = [...(prev.periodTimes ?? [])] as PeriodTime[];
            const existing = arr[index];
            if (!existing) return prev;

            if (field === 'start' && prev.schoolLevel) {
                const duration = prev.schoolLevel === 'custom' && prev.customPeriodDuration
                    ? prev.customPeriodDuration
                    : PERIOD_DURATION[prev.schoolLevel];
                const delta = parseMinutes(value) - parseMinutes(existing.start);

                // 현재 교시: 시작 시간 변경 + 종료 시간 자동 계산
                arr[index] = { period: existing.period, start: value, end: toTimeStr(parseMinutes(value) + duration) };

                // 이후 교시: 동일한 delta만큼 시작·종료 시간 이동
                for (let i = index + 1; i < arr.length; i++) {
                    const p = arr[i];
                    if (!p) continue;
                    arr[i] = {
                        period: p.period,
                        start: toTimeStr(parseMinutes(p.start) + delta),
                        end: toTimeStr(parseMinutes(p.end) + delta),
                    };
                }
            } else {
                arr[index] = { period: existing.period, start: existing.start, end: existing.end, [field]: value };
            }

            return { ...prev, periodTimes: arr };
        });
    };

    if (!isFirstRun) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-sp-card w-full max-w-2xl rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden flex flex-col min-h-[500px]">
                {/* Indicators */}
                <div className="flex justify-center gap-2 pt-8 pb-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className={`w-2.5 h-2.5 rounded-full transition-all ${i === step ? 'bg-sp-accent w-6' : i < step ? 'bg-sp-accent/50' : 'bg-slate-700'
                                }`}
                        />
                    ))}
                </div>

                {/* Form Body */}
                <div className="flex-1 p-8 px-10 flex flex-col justify-center">
                    {step === 1 && (
                        <div className="text-center animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-500">
                            <div className="mx-auto w-24 h-24 bg-sp-accent/20 rounded-full flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-5xl text-sp-accent">emoji_people</span>
                            </div>
                            <h1 className="text-4xl font-black text-white tracking-tight mb-4">쌤핀에 오신 것을 환영합니다!</h1>
                            <p className="text-slate-400 text-lg mb-8">
                                스마트한 교실 관리를 위한 모든 것,<br />지금 바로 몇 가지 기본 정보를 설정해 보세요.
                            </p>
                            <button
                                type="button"
                                onClick={nextStep}
                                className="px-8 py-4 bg-sp-accent hover:bg-blue-600 text-white rounded-xl text-lg font-bold shadow-lg shadow-sp-accent/30 transition-all hover:-translate-y-1 active:scale-95 mx-auto flex items-center gap-2"
                            >
                                시작하기
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                            <h2 className="text-2xl font-bold text-white mb-2 text-center">학교 정보 입력</h2>
                            <p className="text-sp-muted text-center mb-8">대시보드와 출력물에 사용될 기본 정보입니다.</p>

                            <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
                                {/* 학교명 — NEIS 검색 또는 직접 입력 */}
                                <div className="space-y-2 col-span-2 relative">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학교명</label>
                                        <button
                                            type="button"
                                            onClick={() => { setManualSchoolInput(!manualSchoolInput); clearSearch(); setSchoolQuery(''); }}
                                            className="text-[10px] text-sp-muted hover:text-sp-accent transition-colors"
                                        >
                                            {manualSchoolInput ? '학교 검색으로 전환' : '직접 입력'}
                                        </button>
                                    </div>

                                    {/* 선택된 학교 표시 */}
                                    {!manualSchoolInput && draft.schoolName && !schoolQuery ? (
                                        <div className="flex items-center gap-3 bg-[#0d1117] border border-slate-600 rounded-lg px-4 py-3">
                                            <span className="material-symbols-outlined text-teal-400 text-[18px]">school</span>
                                            <span className="text-sm text-[#e2e8f0] flex-1 truncate">{draft.schoolName}</span>
                                            <button
                                                type="button"
                                                onClick={() => { setSchoolQuery(draft.schoolName ?? ''); patch({ schoolName: '' }); }}
                                                className="text-xs text-sp-accent hover:text-blue-400 font-medium shrink-0"
                                            >
                                                변경
                                            </button>
                                        </div>
                                    ) : manualSchoolInput ? (
                                        <input
                                            type="text"
                                            value={draft.schoolName}
                                            onChange={(e) => patch({ schoolName: e.target.value })}
                                            placeholder="예: 서울미래초등학교"
                                            className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-4 py-3 text-[#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                        />
                                    ) : (
                                        <>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={schoolQuery}
                                                    onChange={(e) => { setSchoolQuery(e.target.value); clearSearch(); }}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSchoolSearch()}
                                                    placeholder="학교명을 검색하세요"
                                                    className="flex-1 bg-[#0d1117] border border-slate-600 rounded-lg px-4 py-3 text-[#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleSchoolSearch}
                                                    disabled={searching || !schoolQuery.trim()}
                                                    className="px-4 py-3 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
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
                                                <div className="absolute z-20 top-full left-0 mt-1 w-full bg-sp-card rounded-lg border border-sp-border shadow-2xl max-h-48 overflow-y-auto">
                                                    {searchResults.map((school) => (
                                                        <button
                                                            key={`${school.atptCode}-${school.schoolCode}`}
                                                            type="button"
                                                            onClick={() => handleSelectSchool(school)}
                                                            className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-slate-700/50 last:border-0"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-sp-text">{school.schoolName}</span>
                                                                <span className="text-[10px] text-sp-muted bg-slate-700/50 px-1.5 py-0.5 rounded">
                                                                    {school.schoolType}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-sp-muted mt-0.5">{school.address}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학년/반</label>
                                    <input
                                        type="text"
                                        value={draft.className}
                                        onChange={(e) => patch({ className: e.target.value })}
                                        placeholder="예: 6학년 3반"
                                        className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-4 py-3 text-[#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">교사명</label>
                                    <input
                                        type="text"
                                        value={draft.teacherName}
                                        onChange={(e) => patch({ teacherName: e.target.value })}
                                        placeholder="홍길동"
                                        className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-4 py-3 text-[#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">담당 과목</label>
                                    <input
                                        type="text"
                                        value={draft.subject}
                                        onChange={(e) => patch({ subject: e.target.value })}
                                        placeholder="구분 없음 (담임)"
                                        className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-4 py-3 text-[#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col items-center">
                            <h2 className="text-2xl font-bold text-white mb-2 text-center">교시 시간 설정</h2>
                            <p className="text-sp-muted text-center mb-6">학교급에 맞는 프리셋을 선택하고 시간을 수정할 수 있습니다.</p>

                            <div className="flex gap-4 w-full max-w-lg mb-6">
                                {[
                                    { id: 'elementary', label: '초등학교 (6교시)' },
                                    { id: 'middle', label: '중학교 (7교시)' },
                                    { id: 'high', label: '고등학교 (7교시)' },
                                    { id: 'custom', label: '직접 설정' },
                                ].map((l) => (
                                    <button
                                        key={l.id}
                                        type="button"
                                        onClick={() => setPresetByLevel(l.id as SchoolLevel)}
                                        className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition-all ${draft.schoolLevel === l.id
                                            ? 'bg-sp-accent/20 border-sp-accent text-white ring-1 ring-sp-accent'
                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                                            }`}
                                    >
                                        {l.label}
                                    </button>
                                ))}
                            </div>

                            {draft.schoolLevel === 'custom' && (
                                <div className="flex gap-4 w-full max-w-lg mb-4">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-xs text-sp-muted block">수업 시간 (분)</label>
                                        <input
                                            type="number"
                                            min={20}
                                            max={120}
                                            value={draft.customPeriodDuration ?? 50}
                                            onChange={(e) => {
                                                const dur = Math.max(20, Math.min(120, Number(e.target.value)));
                                                setDraft((prev) => ({ ...prev, customPeriodDuration: dur }));
                                            }}
                                            className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-sp-accent"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-xs text-sp-muted block">총 교시 수</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={12}
                                            value={draft.maxPeriods ?? 6}
                                            onChange={(e) => {
                                                const total = Math.max(1, Math.min(12, Number(e.target.value)));
                                                setDraft((prev) => ({ ...prev, maxPeriods: total }));
                                            }}
                                            className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-sp-accent"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const preset = {
                                                ...getDefaultPreset('custom'),
                                                totalPeriods: draft.maxPeriods ?? 6,
                                                customPeriodDuration: draft.customPeriodDuration ?? 50,
                                            };
                                            const times = generatePeriodTimes(preset);
                                            setDraft((prev) => ({ ...prev, periodTimes: times, maxPeriods: times.length }));
                                        }}
                                        className="self-end px-4 py-2 bg-sp-accent hover:bg-blue-600 rounded-lg text-sm text-white font-medium transition-colors"
                                    >
                                        생성
                                    </button>
                                </div>
                            )}

                            <div className="w-full max-w-lg bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                                <div className="max-h-[240px] overflow-y-auto">
                                    <table className="w-full text-sm text-center">
                                        <thead className="bg-slate-900/50 text-xs text-sp-muted uppercase sticky top-0">
                                            <tr>
                                                <th className="py-2.5 font-medium">교시</th>
                                                <th className="py-2.5 font-medium">시작</th>
                                                <th className="py-2.5 font-medium">종료</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700">
                                            {(draft.periodTimes ?? []).map((pt, i) => (
                                                <tr key={pt.period} className="hover:bg-slate-700/30 transition-colors">
                                                    <td className="py-2 text-slate-300">{i + 1}교시</td>
                                                    <td className="py-2">
                                                        <input
                                                            type="time"
                                                            value={pt.start}
                                                            onChange={(e) => updatePeriod(i, 'start', e.target.value)}
                                                            className="bg-[#0d1117] border border-slate-600 rounded px-2 py-1 text-sm text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-sp-accent [color-scheme:dark]"
                                                        />
                                                    </td>
                                                    <td className="py-2">
                                                        <input
                                                            type="time"
                                                            value={pt.end}
                                                            onChange={(e) => updatePeriod(i, 'end', e.target.value)}
                                                            className="bg-[#0d1117] border border-slate-600 rounded px-2 py-1 text-sm text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-sp-accent [color-scheme:dark]"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">나중에 설정 화면에서 자유롭게 수정할 수 있습니다.</p>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col">
                            <h2 className="text-2xl font-bold text-white mb-2 text-center">나에게 맞는 메뉴 설정</h2>
                            <p className="text-sp-muted text-center mb-6">역할을 선택하면 맞춤 메뉴를 추천해 드려요.</p>

                            {/* 역할 선택 */}
                            <div className="mb-6">
                                <p className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-3 text-center">나의 역할 (복수 선택 가능)</p>
                                <div className="flex justify-center gap-3">
                                    {([
                                        { id: 'homeroom' as TeacherRoleId, label: '담임교사', icon: 'school', desc: '학급 담임을 맡고 있어요' },
                                        { id: 'subject' as TeacherRoleId, label: '교과교사', icon: 'menu_book', desc: '교과 수업을 담당해요' },
                                        { id: 'admin' as TeacherRoleId, label: '관리자/부장', icon: 'admin_panel_settings', desc: '부장 또는 관리 업무를 해요' },
                                    ]).map((role) => {
                                        const isSelected = selectedRoles.includes(role.id);
                                        return (
                                            <button
                                                key={role.id}
                                                type="button"
                                                onClick={() => toggleRole(role.id)}
                                                className={`flex flex-col items-center gap-2 px-6 py-4 rounded-xl border-2 transition-all ${
                                                    isSelected
                                                        ? 'bg-sp-accent/20 border-sp-accent text-white ring-1 ring-sp-accent shadow-lg shadow-sp-accent/10'
                                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-2xl">{role.icon}</span>
                                                <span className="font-bold text-sm">{role.label}</span>
                                                <span className="text-xs text-sp-muted">{role.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 메뉴 토글 */}
                            {selectedRoles.length > 0 && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <p className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-3">추천 메뉴</p>
                                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden max-h-[240px] overflow-y-auto">
                                        {NAV_ITEMS.map((item) => {
                                            const isAlwaysVisible = item.id === 'dashboard';
                                            const isVisible = menuVisibility[item.id] ?? true;

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 last:border-b-0 hover:bg-slate-700/30 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className={`material-symbols-outlined text-lg ${isVisible ? 'text-sp-muted' : 'text-sp-muted/30'}`}>
                                                            {item.icon}
                                                        </span>
                                                        <div>
                                                            <span className={`text-sm font-medium ${isVisible ? 'text-sp-text' : 'text-sp-muted/40'}`}>
                                                                {item.label}
                                                            </span>
                                                            {MENU_DESCRIPTIONS[item.id] && (
                                                                <p className={`text-xs ${isVisible ? 'text-sp-muted' : 'text-sp-muted/30'}`}>
                                                                    {MENU_DESCRIPTIONS[item.id]}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {isAlwaysVisible && (
                                                            <span className="text-[10px] text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded ml-1">항상 표시</span>
                                                        )}
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={isAlwaysVisible || isVisible}
                                                            onChange={() => toggleMenu(item.id)}
                                                            disabled={isAlwaysVisible}
                                                            className="sr-only peer"
                                                        />
                                                        <div className={`w-9 h-5 rounded-full transition-colors ${
                                                            isAlwaysVisible
                                                                ? 'bg-sp-accent/50 cursor-not-allowed'
                                                                : isVisible
                                                                    ? 'bg-sp-accent'
                                                                    : 'bg-slate-600'
                                                        } after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${
                                                            (isAlwaysVisible || isVisible) ? 'after:translate-x-4' : ''
                                                        }`} />
                                                    </label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-3 text-center">
                                        나중에 <span className="text-sp-accent">설정 &gt; 사이드바</span>에서 언제든 변경할 수 있어요
                                    </p>
                                </div>
                            )}

                            {selectedRoles.length === 0 && (
                                <p className="text-sm text-slate-500 text-center mt-4">
                                    역할을 선택하면 맞춤 메뉴가 추천됩니다
                                </p>
                            )}
                        </div>
                    )}

                    {step === 5 && (
                        <div className="text-center animate-in zoom-in-95 duration-500">
                            <div className="mx-auto w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-6xl text-emerald-400">check_circle</span>
                            </div>
                            <h2 className="text-3xl font-black text-white mb-3">설정이 모두 완료되었습니다!</h2>
                            <p className="text-slate-400 text-lg mb-8">이제 쌤핀을 사용하여 교실 업무를 더욱 스마트하게 관리하세요.</p>

                            <button
                                type="button"
                                onClick={handleFinish}
                                className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-lg font-bold shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-1 active:scale-95 mx-auto flex items-center gap-2"
                            >
                                대시보드로 이동
                                <span className="material-symbols-outlined">rocket_launch</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Action Bar */}
                {step > 1 && step < 5 && (
                    <div className="bg-slate-900/50 p-6 flex justify-between border-t border-slate-800">
                        <button
                            type="button"
                            onClick={prevStep}
                            className="px-6 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold"
                        >
                            이전
                        </button>
                        <button
                            type="button"
                            onClick={nextStep}
                            className="px-6 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors font-semibold shadow-md shadow-sp-accent/20"
                        >
                            다음 단계
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
