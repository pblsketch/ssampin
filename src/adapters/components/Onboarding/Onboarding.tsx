import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { Settings, SchoolLevel } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { getDefaultPreset, generatePeriodTimes } from '@domain/rules/periodRules';

export function Onboarding() {
    const { isFirstRun, completeOnboarding } = useSettingsStore();
    const [step, setStep] = useState(1);

    // Local state for settings to be configured
    const [draft, setDraft] = useState<Partial<Settings>>({
        schoolName: '',
        className: '',
        teacherName: '',
        subject: '',
        schoolLevel: 'middle',
        maxPeriods: 6,
        periodTimes: generatePeriodTimes(getDefaultPreset('middle')),
    });

    const nextStep = () => setStep((s) => Math.min(4, s + 1));
    const prevStep = () => setStep((s) => Math.max(1, s - 1));

    const handleFinish = async () => {
        await completeOnboarding(draft);
    };

    const patch = (patch: Partial<Settings>) => {
        setDraft((prev) => ({ ...prev, ...patch }));
    };

    const setPresetByLevel = (level: SchoolLevel) => {
        const p = getDefaultPreset(level);
        const times = generatePeriodTimes(p);
        setDraft((prev) => ({ ...prev, schoolLevel: level, maxPeriods: times.length, periodTimes: times }));
    };

    const updatePeriod = (index: number, field: 'start' | 'end', value: string) => {
        setDraft((prev) => {
            const arr = [...(prev.periodTimes ?? [])] as PeriodTime[];
            const existing = arr[index];
            if (!existing) return prev;
            arr[index] = { period: existing.period, start: existing.start, end: existing.end, [field]: value };
            return { ...prev, periodTimes: arr };
        });
    };

    if (!isFirstRun) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-sp-card w-full max-w-2xl rounded-2xl shadow-2xl ring-1 ring-white/10 overflow-hidden flex flex-col min-h-[500px]">
                {/* Indicators */}
                <div className="flex justify-center gap-2 pt-8 pb-4">
                    {[1, 2, 3, 4].map((i) => (
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
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학교명</label>
                                    <input
                                        type="text"
                                        value={draft.schoolName}
                                        onChange={(e) => patch({ schoolName: e.target.value })}
                                        placeholder="예: 서울미래초등학교"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">학년/반</label>
                                    <input
                                        type="text"
                                        value={draft.className}
                                        onChange={(e) => patch({ className: e.target.value })}
                                        placeholder="예: 6학년 3반"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">교사명</label>
                                    <input
                                        type="text"
                                        value={draft.teacherName}
                                        onChange={(e) => patch({ teacherName: e.target.value })}
                                        placeholder="홍길동"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-sp-muted uppercase tracking-wider">담당 과목</label>
                                    <input
                                        type="text"
                                        value={draft.subject}
                                        onChange={(e) => patch({ subject: e.target.value })}
                                        placeholder="구분 없음 (담임)"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent transition-all"
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
                                                            className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sp-accent [&::-webkit-calendar-picker-indicator]:invert"
                                                        />
                                                    </td>
                                                    <td className="py-2">
                                                        <input
                                                            type="time"
                                                            value={pt.end}
                                                            onChange={(e) => updatePeriod(i, 'end', e.target.value)}
                                                            className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sp-accent [&::-webkit-calendar-picker-indicator]:invert"
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
                {step > 1 && step < 4 && (
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
