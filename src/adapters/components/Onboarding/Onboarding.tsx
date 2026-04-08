import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { Settings, SchoolLevel, NeisSettings } from '@domain/entities/Settings';
import { DEFAULT_NEIS_SCHEDULE_SETTINGS } from '@domain/entities/NeisSchedule';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { SchoolSearchResult, NEIS_API_KEY as _ApiKeyType } from '@domain/entities/Meal';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import { getDefaultPreset, generatePeriodTimes, parseMinutes, PERIOD_DURATION } from '@domain/rules/periodRules';
import { settingsLevelToNeisLevel, getGradeRange, getCurrentAcademicYear } from '@domain/entities/NeisTimetable';
import type { NeisClassInfo } from '@domain/entities/NeisTimetable';
import { neisPort } from '@adapters/di/container';
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

    // NEIS 학년/반 선택 상태
    const [neisGrade, setNeisGrade] = useState('');
    const [neisClass, setNeisClass] = useState('');
    const [classList, setClassList] = useState<readonly NeisClassInfo[]>([]);
    const [classListLoading, setClassListLoading] = useState(false);

    // NEIS 학사일정 자동 동기화 온보딩 옵트인
    const [neisScheduleEnabled, setNeisScheduleEnabled] = useState(true);

    // NEIS 학교가 선택된 상태인지
    const hasNeisSchool = Boolean(draft.neis?.schoolCode && draft.neis?.atptCode);

    // 학교급에 따른 학년 범위
    const gradeRange = useMemo(() => {
        const level = draft.schoolLevel ?? 'middle';
        return getGradeRange(settingsLevelToNeisLevel(level));
    }, [draft.schoolLevel]);

    // 학년 변경 시 반 목록 자동 로드
    useEffect(() => {
        if (!hasNeisSchool || !neisGrade || !draft.neis?.atptCode || !draft.neis?.schoolCode) {
            setClassList([]);
            return;
        }
        setClassListLoading(true);
        setNeisClass('');
        void neisPort
            .getClassList({
                apiKey: NEIS_API_KEY,
                officeCode: draft.neis.atptCode,
                schoolCode: draft.neis.schoolCode,
                academicYear: getCurrentAcademicYear(),
                grade: neisGrade,
            })
            .then(setClassList)
            .catch(() => setClassList([]))
            .finally(() => setClassListLoading(false));
    }, [hasNeisSchool, neisGrade, draft.neis?.atptCode, draft.neis?.schoolCode]);

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

    const nextStep = () => setStep((s) => Math.min(6, s + 1));
    const prevStep = () => setStep((s) => Math.max(1, s - 1));

    const handleFinish = async () => {
        track('onboarding_complete', { step: 6 });

        // hiddenMenus 계산
        const hiddenMenus = NAV_ITEMS
            .filter((item) => !menuVisibility[item.id])
            .map((item) => item.id);

        // NEIS 자동 동기화 설정 (학교+학년+반이 모두 설정된 경우)
        const neisWithAutoSync = hasNeisSchool && neisGrade && neisClass
            ? {
                ...draft.neis!,
                autoSync: {
                    enabled: true,
                    grade: neisGrade,
                    className: neisClass,
                    lastSyncDate: '',
                    lastSyncWeek: '',
                    syncTarget: 'class' as const,
                },
            }
            : draft.neis;

        // NEIS 학사일정 자동 동기화 설정
        const neisScheduleSettings = hasNeisSchool && neisScheduleEnabled
            ? { ...DEFAULT_NEIS_SCHEDULE_SETTINGS, enabled: true }
            : undefined;

        const finalDraft: Partial<Settings> = {
            ...draft,
            ...(neisWithAutoSync != null ? { neis: neisWithAutoSync } : {}),
            ...(neisScheduleSettings != null ? { neisSchedule: neisScheduleSettings } : {}),
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
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                            key={i}
                            className={`w-2.5 h-2.5 rounded-full transition-all ${i === step ? 'bg-sp-accent w-6' : i < step ? 'bg-sp-accent/50' : 'bg-sp-surface'
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
                            <h1 className="text-4xl font-black text-sp-text tracking-tight mb-4">쌤핀에 오신 것을 환영합니다!</h1>
                            <p className="text-sp-muted text-lg mb-8">
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
                            <h2 className="text-2xl font-bold text-sp-text mb-2 text-center">학교 정보 입력</h2>
                            <p className="text-sp-muted text-center mb-8">대시보드와 출력물에 사용될 기본 정보입니다.</p>

                            <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
                                {/* 학교명 — NEIS 검색 또는 직접 입력 */}
                                <div className="space-y-2 col-span-2 relative">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학교명</label>
                                        <button
                                            type="button"
                                            onClick={() => { setManualSchoolInput(!manualSchoolInput); clearSearch(); setSchoolQuery(''); }}
                                            className="text-caption text-sp-muted hover:text-sp-accent transition-colors"
                                        >
                                            {manualSchoolInput ? '학교 검색으로 전환' : '직접 입력'}
                                        </button>
                                    </div>

                                    {/* 선택된 학교 표시 */}
                                    {!manualSchoolInput && draft.schoolName && !schoolQuery ? (
                                        <div className="flex items-center gap-3 bg-sp-bg border border-sp-border rounded-lg px-4 py-3">
                                            <span className="material-symbols-outlined text-teal-400 text-icon-md">school</span>
                                            <span className="text-sm text-sp-text flex-1 truncate">{draft.schoolName}</span>
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
                                            className="w-full bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
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
                                                    className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
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
                                                        아래 버튼으로 학교 정보를 직접 입력할 수 있습니다.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setManualSchoolInput(true); clearSearch(); setSchoolQuery(''); }}
                                                        className="w-full py-2 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                        직접 입력하기
                                                    </button>
                                                </div>
                                            )}

                                            {searchResults.length > 0 && (
                                                <div className="absolute z-20 top-full left-0 mt-1 w-full bg-sp-card rounded-lg border border-sp-border shadow-2xl max-h-48 overflow-y-auto">
                                                    {searchResults.map((school) => (
                                                        <button
                                                            key={`${school.atptCode}-${school.schoolCode}`}
                                                            type="button"
                                                            onClick={() => handleSelectSchool(school)}
                                                            className="w-full text-left px-4 py-3 hover:bg-sp-text/5 transition-colors border-b border-sp-border/50 last:border-0"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-sp-text">{school.schoolName}</span>
                                                                <span className="text-caption text-sp-muted bg-sp-surface/50 px-1.5 py-0.5 rounded">
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

                                {/* 학년/반 — NEIS 연동 또는 직접 입력 */}
                                {hasNeisSchool ? (
                                    <>
                                        <div className="col-span-2 flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15">
                                            <span className="material-symbols-outlined text-blue-400 text-icon mt-0.5">info</span>
                                            <p className="text-detail text-blue-300">
                                                학년/반을 선택하면 해당 반의 <strong>학급 시간표</strong>가 자동으로 연동됩니다 (담임용). 건너뛰어도 나중에 설정할 수 있어요.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학년 <span className="text-sp-muted/50 normal-case">(선택)</span></label>
                                            <select
                                                value={neisGrade}
                                                onChange={(e) => {
                                                    setNeisGrade(e.target.value);
                                                    patch({ className: e.target.value ? `${e.target.value}학년` : '' });
                                                }}
                                                className="w-full bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                            >
                                                <option value="">선택</option>
                                                {gradeRange.map((g) => (
                                                    <option key={g} value={String(g)}>{g}학년</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">반 <span className="text-sp-muted/50 normal-case">(선택)</span></label>
                                            {classListLoading ? (
                                                <div className="flex items-center gap-2 bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-muted text-sm">
                                                    <div className="w-4 h-4 border-2 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
                                                    반 목록 로딩 중...
                                                </div>
                                            ) : (
                                                <select
                                                    value={neisClass}
                                                    onChange={(e) => {
                                                        setNeisClass(e.target.value);
                                                        if (neisGrade && e.target.value) {
                                                            patch({ className: `${neisGrade}학년 ${e.target.value}반` });
                                                        }
                                                    }}
                                                    disabled={!neisGrade || classList.length === 0}
                                                    className="w-full bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all disabled:opacity-40"
                                                >
                                                    <option value="">{!neisGrade ? '학년 먼저 선택' : classList.length === 0 ? '반 정보 없음' : '선택'}</option>
                                                    {classList.map((c) => (
                                                        <option key={c.CLASS_NM} value={c.CLASS_NM}>{c.CLASS_NM}반</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        {/* NEIS 학사일정 자동 동기화 — 학교만 선택하면 바로 가능 */}
                                        <div className="col-span-2 flex items-center justify-between p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                                            <div className="flex items-start gap-2">
                                                <span className="material-symbols-outlined text-purple-400 text-icon-md mt-0.5">calendar_month</span>
                                                <div>
                                                    <p className="text-sm font-medium text-sp-text">NEIS 학사일정 자동 동기화</p>
                                                    <p className="text-xs text-sp-muted mt-0.5">학교 학사일정·공휴일을 자동으로 가져옵니다</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={neisScheduleEnabled}
                                                onClick={() => setNeisScheduleEnabled(!neisScheduleEnabled)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${neisScheduleEnabled ? 'bg-sp-accent' : 'bg-sp-border'}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${neisScheduleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                        {/* NEIS 학급 시간표 자동 연동 확인 — 학년+반 선택 완료 시 */}
                                        {neisGrade && neisClass && (
                                            <div className="col-span-2 flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 animate-in fade-in duration-300">
                                                <span className="material-symbols-outlined text-emerald-400 text-icon-md mt-0.5">auto_awesome</span>
                                                <p className="text-xs text-emerald-300">
                                                    {neisGrade}학년 {neisClass}반의 학급 시간표가 대시보드에 자동으로 표시됩니다.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학년/반</label>
                                        <input
                                            type="text"
                                            value={draft.className}
                                            onChange={(e) => patch({ className: e.target.value })}
                                            placeholder="예: 6학년 3반"
                                            className="w-full bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">교사명</label>
                                    <input
                                        type="text"
                                        value={draft.teacherName}
                                        onChange={(e) => patch({ teacherName: e.target.value })}
                                        placeholder="홍길동"
                                        className="w-full bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">담당 과목</label>
                                    <input
                                        type="text"
                                        value={draft.subject}
                                        onChange={(e) => patch({ subject: e.target.value })}
                                        placeholder="구분 없음 (담임)"
                                        className="w-full bg-sp-bg border border-sp-border rounded-lg px-4 py-3 text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col items-center">
                            <h2 className="text-2xl font-bold text-sp-text mb-2 text-center">교시 시간 설정</h2>
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
                                            : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-border'
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
                                            className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
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
                                            className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent"
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

                            <div className="w-full max-w-lg bg-sp-surface rounded-xl border border-sp-border overflow-hidden">
                                <div className="max-h-[240px] overflow-y-auto">
                                    <table className="w-full text-sm text-center">
                                        <thead className="bg-sp-bg/50 text-xs text-sp-muted uppercase sticky top-0">
                                            <tr>
                                                <th className="py-2.5 font-medium">교시</th>
                                                <th className="py-2.5 font-medium">시작</th>
                                                <th className="py-2.5 font-medium">종료</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-sp-border">
                                            {(draft.periodTimes ?? []).map((pt, i) => (
                                                <tr key={pt.period} className="hover:bg-sp-surface/30 transition-colors">
                                                    <td className="py-2 text-sp-muted">{i + 1}교시</td>
                                                    <td className="py-2">
                                                        <input
                                                            type="time"
                                                            value={pt.start}
                                                            onChange={(e) => updatePeriod(i, 'start', e.target.value)}
                                                            className="bg-sp-bg border border-sp-border rounded px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent [color-scheme:dark]"
                                                        />
                                                    </td>
                                                    <td className="py-2">
                                                        <input
                                                            type="time"
                                                            value={pt.end}
                                                            onChange={(e) => updatePeriod(i, 'end', e.target.value)}
                                                            className="bg-sp-bg border border-sp-border rounded px-2 py-1 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent [color-scheme:dark]"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <p className="text-xs text-sp-muted mt-2">나중에 설정 화면에서 자유롭게 수정할 수 있습니다.</p>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col">
                            <h2 className="text-2xl font-bold text-sp-text mb-2 text-center">나에게 맞는 메뉴 설정</h2>
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
                                                        : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-border'
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
                                    <div className="bg-sp-surface rounded-xl border border-sp-border overflow-hidden max-h-[240px] overflow-y-auto">
                                        {NAV_ITEMS.map((item) => {
                                            const isAlwaysVisible = item.id === 'dashboard';
                                            const isVisible = menuVisibility[item.id] ?? true;

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between px-4 py-3 border-b border-sp-border/50 last:border-b-0 hover:bg-sp-surface/30 transition-colors"
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
                                                            <span className="text-caption text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded ml-1">항상 표시</span>
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
                                                                    : 'bg-sp-surface'
                                                        } after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${
                                                            (isAlwaysVisible || isVisible) ? 'after:translate-x-4' : ''
                                                        }`} />
                                                    </label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-sp-muted mt-3 text-center">
                                        나중에 <span className="text-sp-accent">설정 &gt; 사이드바</span>에서 언제든 변경할 수 있어요
                                    </p>
                                </div>
                            )}

                            {selectedRoles.length === 0 && (
                                <p className="text-sm text-sp-muted text-center mt-4">
                                    역할을 선택하면 맞춤 메뉴가 추천됩니다
                                </p>
                            )}
                        </div>
                    )}

                    {step === 5 && <AccountLinkingStep />}

                    {step === 6 && (
                        <div className="text-center animate-in zoom-in-95 duration-500">
                            <div className="mx-auto w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-6xl text-emerald-400">check_circle</span>
                            </div>
                            <h2 className="text-3xl font-black text-sp-text mb-3">설정이 모두 완료되었습니다!</h2>
                            <p className="text-sp-muted text-lg mb-8">이제 쌤핀을 사용하여 교실 업무를 더욱 스마트하게 관리하세요.</p>

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
                {step > 1 && step < 6 && (
                    <div className="bg-sp-bg/50 p-6 flex justify-between border-t border-sp-border">
                        <button
                            type="button"
                            onClick={prevStep}
                            className="px-6 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors font-semibold"
                        >
                            이전
                        </button>
                        <button
                            type="button"
                            onClick={nextStep}
                            className="px-6 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors font-semibold shadow-md shadow-sp-accent/20"
                        >
                            {step === 5 ? '건너뛰기' : '다음 단계'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function AccountLinkingStep() {
    const {
        isConnected, email, isLoading,
        startAuth, disconnect,
        showFallbackSuggestion, fallbackSuggestionData, acceptFallback, setShowFallbackSuggestion,
        oauthError, setOAuthError, showPKCEFallback, setShowPKCEFallback,
        startPKCEFallback, completePKCEAuth, error: authError,
    } = useCalendarSyncStore();
    const [pkceCode, setPkceCode] = useState('');

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onOAuthError) return;
        return api.onOAuthError((err) => setOAuthError(err));
    }, [setOAuthError]);

    return (
        <div className="animate-in fade-in slide-in-from-right-8 duration-300 flex flex-col items-center w-full">
            <h2 className="text-2xl font-bold text-sp-text mb-2 text-center">Google 계정 연동</h2>
            <p className="text-sp-muted text-center mb-6">다른 PC에서도 데이터를 이어 쓰려면 계정을 연결하세요. 나중에 설정에서도 할 수 있어요.</p>

            <div className="w-full max-w-md space-y-4">
                {isConnected ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 rounded-xl bg-sp-surface p-4">
                            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-green-400 text-2xl">check_circle</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-base font-semibold text-sp-text">Google 계정 연결됨</p>
                                <p className="text-sm text-sp-muted truncate">{email}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2 rounded-lg border border-sp-border p-3">
                                <span className="material-symbols-outlined text-cyan-400 text-icon-md">cloud_sync</span>
                                <span className="text-sp-text">드라이브 동기화</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-sp-border p-3">
                                <span className="material-symbols-outlined text-pink-400 text-icon-md">event</span>
                                <span className="text-sp-text">캘린더 연동</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void disconnect()}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm transition-colors"
                        >
                            <span className="material-symbols-outlined text-icon">link_off</span>
                            연결 해제
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl bg-sp-surface border border-sp-border p-5 space-y-3">
                            <p className="text-sm font-semibold text-sp-muted uppercase tracking-wider">연결하면 사용할 수 있는 기능</p>
                            <ul className="space-y-2 text-sm text-sp-muted">
                                <li className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-icon text-cyan-400">cloud_sync</span>
                                    여러 기기 간 데이터 자동 동기화
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-icon text-pink-400">event</span>
                                    Google 캘린더와 일정 연동
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-icon text-emerald-400">folder_open</span>
                                    과제수합 (Google 드라이브)
                                </li>
                            </ul>
                        </div>
                        {authError && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                                {authError}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => void startAuth()}
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all shadow-lg shadow-sp-accent/25 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-icon-md">progress_activity</span>
                                    연결 중...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-icon-md">login</span>
                                    Google 계정 연결
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* OAuth fallback suggestion modal */}
            {showFallbackSuggestion && fallbackSuggestionData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowFallbackSuggestion(false)}>
                    <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <span className="material-symbols-outlined text-amber-400">wifi_off</span>
                            </div>
                            <h3 className="text-lg font-bold text-sp-text">연결이 안 되시나요?</h3>
                        </div>
                        <p className="text-sm text-sp-muted">
                            {fallbackSuggestionData.reason === 'LOCALHOST_BLOCKED'
                                ? '학교 보안 프로그램이 구글 연결을 차단하고 있어요. 수동 인증 방식으로 연결할 수 있습니다.'
                                : `Google 로그인 후 앱 연결이 ${fallbackSuggestionData.elapsedSec}초째 대기 중이에요.`}
                        </p>
                        <div className="flex items-center justify-end gap-2 mt-6">
                            <button onClick={() => setShowFallbackSuggestion(false)} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface">좀 더 기다릴게요</button>
                            <button onClick={() => void acceptFallback()} className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80">수동 인증으로 전환</button>
                        </div>
                    </div>
                </div>
            )}

            {/* OAuth error modal */}
            {oauthError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOAuthError(null)}>
                    <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-red-500/10">
                                <span className="material-symbols-outlined text-red-400">error</span>
                            </div>
                            <h3 className="text-lg font-bold text-sp-text">Google 로그인 연결 실패</h3>
                        </div>
                        <p className="text-sm text-sp-muted">{oauthError.message}</p>
                        <div className="flex items-center justify-end gap-2 mt-6">
                            {(oauthError.code === 'SERVER_START_FAILED' || oauthError.code === 'LOCALHOST_BLOCKED') && (
                                <button onClick={() => { setOAuthError(null); void startPKCEFallback(); }} className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80">수동 인증으로 시도</button>
                            )}
                            <button onClick={() => setOAuthError(null)} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface">닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* PKCE manual auth */}
            {showPKCEFallback && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPKCEFallback(false)}>
                    <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <span className="material-symbols-outlined text-blue-400">key</span>
                            </div>
                            <h3 className="text-lg font-bold text-sp-text">수동 인증</h3>
                        </div>
                        <p className="text-sm text-sp-muted mb-4">브라우저에서 Google 로그인 후 표시된 인증 코드를 아래에 붙여넣어 주세요.</p>
                        {authError && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 mb-4">{authError}</div>
                        )}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={pkceCode}
                                onChange={(e) => setPkceCode(e.target.value)}
                                placeholder="인증 코드 입력..."
                                className="flex-1 rounded-lg border border-sp-border bg-sp-surface px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter' && pkceCode.trim()) void completePKCEAuth(pkceCode.trim()); }}
                            />
                            <button
                                onClick={() => pkceCode.trim() && void completePKCEAuth(pkceCode.trim())}
                                disabled={isLoading || !pkceCode.trim()}
                                className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80 disabled:opacity-50"
                            >
                                {isLoading ? '인증 중...' : '인증'}
                            </button>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-4">
                            <button onClick={() => setShowPKCEFallback(false)} disabled={isLoading} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface disabled:opacity-50">취소</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
