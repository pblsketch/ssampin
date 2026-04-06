import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { formatTime, getPresentationWarningLevel } from '@domain/rules/timerRules';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import {
  playAlarmSound,
  playPreWarningSound,
  ALARM_PRESETS,
  PRE_WARNING_PRESETS,
  PRE_WARNING_TIMES,
  saveCustomAudio,
  loadCustomAudio,
  deleteCustomAudio,
} from './timerAudio';
import { CircleProgress } from './CircleProgress';
import { AlarmSoundSelector } from './AlarmSoundSelector';
import type { AlarmSoundId, PreWarningSettings } from '@domain/entities/Settings';

type PresentationState = 'setup' | 'running' | 'paused' | 'slide-done' | 'all-done';
type InputMode = 'custom' | 'students' | 'teachingClass';

interface Presenter {
  id: string;
  name: string;
  number?: number; // 학번 (명단 연동 시)
}

const DEFAULT_DURATION = 180; // 3분

const DURATION_PRESETS = [
  { label: '1분', seconds: 60 },
  { label: '2분', seconds: 120 },
  { label: '3분', seconds: 180 },
  { label: '5분', seconds: 300 },
];

export function PresentationMode() {
  // ─── 발표자 리스트 관리 ────────────────────────
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [newName, setNewName] = useState('');
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [inputMode, setInputMode] = useState<InputMode>('custom');

  // ─── 타이머 상태 ──────────────────────────────
  const [state, setState] = useState<PresentationState>('setup');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preWarningFiredRef = useRef(false);

  // ─── 명단 연동 (ToolRoulette 패턴) ────────────
  const tcClasses = useTeachingClassStore((s) => s.classes);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);
  const [showTcDropdown, setShowTcDropdown] = useState(false);
  const tcDropdownRef = useRef<HTMLDivElement>(null);

  // ─── 옵션 ─────────────────────────────────────
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [showPreWarningPanel, setShowPreWarningPanel] = useState(false);

  // ─── 알람 설정 ────────────────────────────────
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const { selectedSound, customAudioName, volume, boost, preWarning } = settings.alarmSound;
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCustomAudio().then((data) => {
      if (data?.dataUrl) setCustomDataUrl(data.dataUrl);
    });
  }, []);

  useEffect(() => {
    if (!tcLoaded) loadTc();
  }, [tcLoaded, loadTc]);

  // Close TC dropdown on outside click
  useEffect(() => {
    if (!showTcDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (tcDropdownRef.current && !tcDropdownRef.current.contains(e.target as Node)) {
        setShowTcDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTcDropdown]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // ─── 명단 불러오기 ────────────────────────────
  const loadStudents = useCallback(() => {
    const allStudents = useStudentStore.getState().students;
    const valid = allStudents.filter((s) => !s.isVacant && s.name.trim() !== '');
    if (valid.length > 0) {
      setPresenters(
        valid.map((s) => {
          const idx = allStudents.indexOf(s);
          return { id: `s-${idx}`, name: s.name, number: idx + 1 };
        }),
      );
      setInputMode('students');
    }
  }, []);

  const handleTcButtonClick = useCallback(() => {
    if (tcClasses.length === 0) return;
    if (tcClasses.length === 1) {
      const cls = tcClasses[0]!;
      const valid = cls.students.filter((s) => !s.isVacant);
      if (valid.length > 0) {
        setPresenters(
          valid.map((s, i) => ({
            id: `tc-${i}`,
            name: s.name?.trim() ? s.name : `${s.number}번`,
            number: s.number,
          })),
        );
        setInputMode('teachingClass');
      }
    } else {
      setShowTcDropdown((v) => !v);
    }
  }, [tcClasses]);

  const loadTeachingClass = useCallback((classId: string) => {
    const cls = tcClasses.find((c) => c.id === classId);
    if (!cls) return;
    const valid = cls.students.filter((s) => !s.isVacant);
    if (valid.length > 0) {
      setPresenters(
        valid.map((s, i) => ({
          id: `tc-${i}`,
          name: s.name?.trim() ? s.name : `${s.number}번`,
          number: s.number,
        })),
      );
      setInputMode('teachingClass');
    }
    setShowTcDropdown(false);
  }, [tcClasses]);

  const addPresenter = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const id = `c-${Date.now()}`;
    setPresenters((prev) => {
      const next = [...prev, { id, name }];
      // 직접 입력 모드: 입력 순서 = 발표 순서
      setOrderMap((prevMap) => {
        const nextMap = new Map(prevMap);
        nextMap.set(id, next.length);
        return nextMap;
      });
      return next;
    });
    setNewName('');
    setInputMode('custom');
  }, [newName]);

  const removePresenter = useCallback((id: string) => {
    setPresenters((prev) => prev.filter((p) => p.id !== id));
    setOrderMap((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // ─── 발표 순서 관리 ──────────────────────────
  // orderMap: presenter id → 발표 순서 (1-based). 비어있으면 미지정.
  const [orderMap, setOrderMap] = useState<Map<string, number>>(new Map());
  const [editingOrder, setEditingOrder] = useState<{ id: string; value: string } | null>(null);

  const setPresenterOrder = useCallback((id: string, order: number) => {
    setOrderMap((prev) => {
      const next = new Map(prev);
      if (order < 1) {
        next.delete(id);
      } else {
        next.set(id, order);
      }
      return next;
    });
  }, []);

  const assignOrderByNumber = useCallback(() => {
    // 학번 오름차순
    const sorted = [...presenters].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    const next = new Map<string, number>();
    sorted.forEach((p, i) => next.set(p.id, i + 1));
    setOrderMap(next);
  }, [presenters]);

  const assignOrderByNumberDesc = useCallback(() => {
    // 학번 내림차순
    const sorted = [...presenters].sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    const next = new Map<string, number>();
    sorted.forEach((p, i) => next.set(p.id, i + 1));
    setOrderMap(next);
  }, [presenters]);

  const assignOrderRandom = useCallback(() => {
    const shuffled = [...presenters];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const next = new Map<string, number>();
    shuffled.forEach((p, i) => next.set(p.id, i + 1));
    setOrderMap(next);
  }, [presenters]);

  // 발표 순서가 정해진 학생들을 순서대로 정렬
  const orderedPresenters = useMemo(() => {
    const assigned = presenters.filter((p) => orderMap.has(p.id));
    return assigned.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }, [presenters, orderMap]);

  const hasAllOrders = presenters.length > 0 && presenters.every((p) => orderMap.has(p.id));

  // ─── 타이머 제어 ──────────────────────────────

  // refs for alarm settings to avoid stale closures in setInterval
  const selectedSoundRef = useRef(selectedSound);
  selectedSoundRef.current = selectedSound;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const boostRef = useRef(boost);
  boostRef.current = boost;
  const preWarningRef = useRef(preWarning);
  preWarningRef.current = preWarning;

  const beginCountdown = useCallback((secs: number) => {
    clearTimer();
    setRemaining(secs);
    setState('running');
    preWarningFiredRef.current = false;

    let lastTick = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTick) / 1000);
      if (delta >= 1) {
        lastTick = now - ((now - lastTick) % 1000);
        setRemaining((prev) => {
          const next = prev - delta;

          const pw = preWarningRef.current;
          if (!preWarningFiredRef.current && next <= 10 && next > 0 && pw.enabled) {
            preWarningFiredRef.current = true;
            playPreWarningSound(pw.sound, volumeRef.current, boostRef.current);
          }

          if (next <= 0) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            playAlarmSound(selectedSoundRef.current, volumeRef.current, boostRef.current, null);
            setState('slide-done');
            return 0;
          }
          return next;
        });
      }
    }, 100);
  }, [clearTimer]);

  const startTimer = useCallback(() => {
    if (orderedPresenters.length === 0) return;
    setCurrentIndex(0);
    beginCountdown(duration);
  }, [orderedPresenters.length, duration, beginCountdown]);

  const pauseTimer = useCallback(() => {
    setState('paused');
    clearTimer();
  }, [clearTimer]);

  // resumeTimer needs current remaining — use a ref
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  const resumeTimerStable = useCallback(() => {
    beginCountdown(remainingRef.current);
  }, [beginCountdown]);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const presentersLenRef = useRef(orderedPresenters.length);
  presentersLenRef.current = orderedPresenters.length;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const nextPresenter = useCallback(() => {
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx >= presentersLenRef.current) {
      clearTimer();
      setState('all-done');
      return;
    }
    setCurrentIndex(nextIdx);
    beginCountdown(durationRef.current);
  }, [clearTimer, beginCountdown]);

  const resetAll = useCallback(() => {
    clearTimer();
    setState('setup');
    setCurrentIndex(0);
    setRemaining(0);
  }, [clearTimer]);

  // ─── 자동 진행: slide-done 후 2초 뒤 자동 nextPresenter ──
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state === 'slide-done' && autoAdvanceRef.current) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        nextPresenter();
      }, 2000);
    }
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [state, nextPresenter]);

  // ─── 알람음 핸들러 ────────────────────────────
  const handleSelectSound = useCallback(async (id: AlarmSoundId) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, selectedSound: id },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleVolumeChange = useCallback(async (v: number) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, volume: v },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleBoostChange = useCallback(async (b: number) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, boost: b },
    });
  }, [updateSettings, settings.alarmSound]);

  const handlePreWarningChange = useCallback(async (pw: PreWarningSettings) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, preWarning: pw },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleImportCustom = useCallback(async () => {
    const api = window.electronAPI;
    if (api) {
      const result = await api.importAlarmAudio();
      if (result) {
        setCustomDataUrl(result.dataUrl);
        await saveCustomAudio(result.name, result.dataUrl);
        await updateSettings({
          alarmSound: {
            ...settings.alarmSound,
            selectedSound: 'custom',
            customAudioName: result.name,
          },
        });
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [updateSettings, settings.alarmSound]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCustomDataUrl(dataUrl);
      await saveCustomAudio(file.name, dataUrl);
      await updateSettings({
        alarmSound: {
          ...settings.alarmSound,
          selectedSound: 'custom',
          customAudioName: file.name,
        },
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [updateSettings, settings.alarmSound]);

  const handleDeleteCustom = useCallback(async () => {
    setCustomDataUrl(null);
    await deleteCustomAudio();
    await updateSettings({
      alarmSound: {
        ...settings.alarmSound,
        selectedSound: 'beep',
        customAudioName: null,
      },
    });
  }, [updateSettings, settings.alarmSound]);

  // ─── 키보드 단축키 ────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ') {
        e.preventDefault();
        if (state === 'setup') startTimer();
        else if (state === 'running') pauseTimer();
        else if (state === 'paused') resumeTimerStable();
        else if (state === 'slide-done') nextPresenter();
      } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (state === 'slide-done' || state === 'running' || state === 'paused') {
          nextPresenter();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, startTimer, pauseTimer, resumeTimerStable, nextPresenter, resetAll]);

  // ─── 경고 레벨 ────────────────────────────────
  const warningLevel = (state === 'running' || state === 'paused')
    ? getPresentationWarningLevel(remaining)
    : 'none';

  const currentPresenter = orderedPresenters[currentIndex];
  const ratio = duration > 0 ? remaining / duration : 0;

  // ─── 셋업 화면 ────────────────────────────────
  if (state === 'setup') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
        {/* 명단 소스 선택 */}
        <div className="flex gap-2 w-full">
          <button
            onClick={() => {
              if (inputMode !== 'custom') {
                setPresenters([]);
                setOrderMap(new Map());
              }
              setInputMode('custom');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              inputMode === 'custom'
                ? 'bg-sp-accent/15 border-sp-accent text-sp-accent'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">edit</span>
            직접 입력
          </button>
          <button
            onClick={loadStudents}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              inputMode === 'students'
                ? 'bg-sp-accent/15 border-sp-accent text-sp-accent'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">group</span>
            우리반
          </button>
          <div className="relative flex-1" ref={tcDropdownRef}>
            <button
              onClick={handleTcButtonClick}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                inputMode === 'teachingClass'
                  ? 'bg-sp-accent/15 border-sp-accent text-sp-accent'
                  : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
              }`}
            >
              <span className="material-symbols-outlined text-icon-md">school</span>
              수업반
            </button>
            {showTcDropdown && tcClasses.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg overflow-hidden">
                {tcClasses.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => loadTeachingClass(cls.id)}
                    className="w-full px-4 py-2.5 text-left text-sm text-sp-text hover:bg-sp-accent/10 transition-colors"
                  >
                    {cls.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 발표자 직접 입력 */}
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPresenter(); }}
            placeholder="발표자 이름 입력"
            className="flex-1 px-4 py-2.5 bg-sp-bg border border-sp-border rounded-xl text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none"
          />
          <button
            onClick={addPresenter}
            disabled={!newName.trim()}
            className="px-4 py-2.5 bg-sp-accent text-white rounded-xl text-sm font-medium hover:bg-sp-accent/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            추가
          </button>
        </div>

        {/* 발표자 리스트 */}
        {presenters.length > 0 && (
          <div className="w-full">
            {/* 순서 지정 버튼들 */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-sp-muted">발표 순서</span>
              <div className="flex items-center gap-1.5">
                {presenters.some((p) => p.number != null) && (
                  <>
                    <button
                      onClick={assignOrderByNumber}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40 text-xs font-medium transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                      번호순
                    </button>
                    <button
                      onClick={assignOrderByNumberDesc}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40 text-xs font-medium transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                      번호역순
                    </button>
                  </>
                )}
                <button
                  onClick={assignOrderRandom}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                    orderMap.size > 0 && !presenters.some((p) => p.number != null && orderMap.get(p.id) !== undefined)
                      ? 'bg-sp-accent/10 border-sp-accent/30 text-sp-accent'
                      : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">shuffle</span>
                  무작위
                </button>
                <button
                  onClick={() => setOrderMap(new Map())}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                    orderMap.size === 0
                      ? 'bg-sp-accent/10 border-sp-accent/30 text-sp-accent'
                      : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  직접 입력
                </button>
              </div>
            </div>
            {/* 헤더 */}
            <div className="flex items-center px-3 py-1.5 text-caption text-sp-muted">
              {presenters.some((p) => p.number != null) && (
                <span className="w-8 text-center">번호</span>
              )}
              <span className="flex-1 pl-2">이름</span>
              <span className="w-12 text-center">순서</span>
              <span className="w-6" />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl bg-sp-card border border-sp-border divide-y divide-sp-border/50">
              {presenters.map((p) => {
                const order = orderMap.get(p.id);
                return (
                  <div key={p.id} className="flex items-center px-3 py-2">
                    {/* 학번 */}
                    {presenters.some((pr) => pr.number != null) && (
                      <span className="w-8 text-center text-xs text-sp-muted font-mono">
                        {p.number ?? '–'}
                      </span>
                    )}
                    {/* 이름 */}
                    <span className="flex-1 pl-2 text-sm text-sp-text">{p.name}</span>
                    {/* 발표 순서 */}
                    {editingOrder?.id === p.id ? (
                      <input
                        type="number"
                        min={1}
                        max={presenters.length}
                        value={editingOrder.value}
                        onChange={(e) => setEditingOrder({ id: p.id, value: e.target.value })}
                        onBlur={() => {
                          const num = parseInt(editingOrder.value, 10);
                          if (num >= 1 && num <= presenters.length) {
                            setPresenterOrder(p.id, num);
                          } else if (!editingOrder.value.trim()) {
                            setPresenterOrder(p.id, 0); // 순서 해제
                          }
                          setEditingOrder(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const num = parseInt(editingOrder.value, 10);
                            if (num >= 1 && num <= presenters.length) {
                              setPresenterOrder(p.id, num);
                            } else if (!editingOrder.value.trim()) {
                              setPresenterOrder(p.id, 0);
                            }
                            setEditingOrder(null);
                          } else if (e.key === 'Escape') {
                            setEditingOrder(null);
                          }
                        }}
                        className="w-10 h-7 bg-sp-bg border border-sp-accent rounded-lg text-center text-xs font-mono text-sp-text focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => setEditingOrder({ id: p.id, value: order != null ? String(order) : '' })}
                        className={`w-10 h-7 rounded-lg text-xs font-mono transition-all flex items-center justify-center ${
                          order != null
                            ? 'bg-sp-accent/10 border border-sp-accent/30 text-sp-accent hover:bg-sp-accent/20'
                            : 'bg-sp-bg border border-sp-border text-sp-muted hover:border-sp-accent/40'
                        }`}
                        title="클릭하여 순서 지정"
                      >
                        {order ?? ''}
                      </button>
                    )}
                    {/* 삭제 */}
                    <button
                      onClick={() => removePresenter(p.id)}
                      className="w-6 h-6 ml-1 rounded-full flex items-center justify-center text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="삭제"
                    >
                      <span className="material-symbols-outlined text-icon-sm">close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 발표 시간 설정 */}
        <div className="w-full">
          <p className="text-xs text-sp-muted mb-2">발표 시간 (1인당)</p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.seconds}
                onClick={() => setDuration(p.seconds)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  duration === p.seconds
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 자동 진행 토글 */}
        <div className="flex items-center justify-between w-full px-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-muted text-icon-md">skip_next</span>
            <span className="text-sm text-sp-text">다음 발표자 자동 진행</span>
          </div>
          <button
            onClick={() => setAutoAdvance((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              autoAdvance ? 'bg-sp-accent' : 'bg-sp-border'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                autoAdvance ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* 알람음 / 예고 알림 토글 */}
        <div className="flex items-center gap-2 w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.webm"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            onClick={() => { setShowSoundPanel((v) => !v); setShowPreWarningPanel(false); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              showSoundPanel
                ? 'bg-sp-accent/15 text-sp-accent border border-sp-accent/30'
                : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">
              {volume === 0 ? 'volume_off' : 'volume_up'}
            </span>
            <span>
              알람음: {selectedSound === 'custom' && customAudioName
                ? customAudioName
                : ALARM_PRESETS.find((ap) => ap.id === selectedSound)?.label ?? '기본 알림'}
            </span>
          </button>
          <button
            onClick={() => { setShowPreWarningPanel((v) => !v); setShowSoundPanel(false); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              showPreWarningPanel
                ? 'bg-amber-500 text-white border border-amber-500'
                : preWarning.enabled
                  ? 'bg-sp-card border border-amber-500/50 text-sp-text hover:border-amber-500'
                  : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-amber-500/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">notifications_active</span>
            <span>예고 알림{preWarning.enabled ? `: ${preWarning.secondsBefore < 60 ? `${preWarning.secondsBefore}초` : `${preWarning.secondsBefore / 60}분`} 전` : ' (꺼짐)'}</span>
          </button>
        </div>

        {/* 알람음 설정 패널 */}
        {showSoundPanel && (
          <div className="w-full animate-in fade-in slide-in-from-top-2 duration-200">
            <AlarmSoundSelector
              selectedSound={selectedSound}
              customAudioName={customAudioName}
              customDataUrl={customDataUrl}
              volume={volume}
              boost={boost}
              onSelectSound={handleSelectSound}
              onImportCustom={handleImportCustom}
              onDeleteCustom={handleDeleteCustom}
              onVolumeChange={handleVolumeChange}
              onBoostChange={handleBoostChange}
            />
          </div>
        )}

        {/* 예고 알림 설정 패널 */}
        {showPreWarningPanel && (
          <div className="w-full animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-icon-md">notifications_active</span>
                <span className="text-sm font-medium text-sp-text">종료 전 예고 알림</span>
              </div>
              <button
                onClick={() => handlePreWarningChange({ ...preWarning, enabled: !preWarning.enabled })}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  preWarning.enabled ? 'bg-amber-500' : 'bg-sp-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    preWarning.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {preWarning.enabled && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div>
                  <p className="text-xs text-sp-muted mb-2">알림 시점</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-sp-muted">종료</span>
                    {PRE_WARNING_TIMES.map((sec) => (
                      <button
                        key={sec}
                        onClick={() => handlePreWarningChange({ ...preWarning, secondsBefore: sec })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          preWarning.secondsBefore === sec
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
                        }`}
                      >
                        {sec < 60 ? `${sec}초` : `${sec / 60}분`}
                      </button>
                    ))}
                    <span className="text-xs text-sp-muted">전</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-sp-muted mb-2">알림음</p>
                  <div className="flex gap-2">
                    {PRE_WARNING_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          handlePreWarningChange({ ...preWarning, sound: preset.id });
                          playPreWarningSound(preset.id, volume, boost);
                        }}
                        className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                          preWarning.sound === preset.id
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-amber-500/40'
                        }`}
                      >
                        <span className="material-symbols-outlined text-icon-lg">{preset.icon}</span>
                        <span className="text-xs font-medium">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {!preWarning.enabled && (
              <p className="text-xs text-sp-muted text-center py-2">
                활성화하면 발표 종료 전 미리 알림을 받을 수 있어요
              </p>
            )}
          </div>
        )}

        {/* 시작 버튼 */}
        <button
          onClick={startTimer}
          disabled={!hasAllOrders}
          className="w-full py-4 rounded-xl bg-sp-accent text-white text-lg font-bold hover:bg-sp-accent/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-icon-xl">play_arrow</span>
          {hasAllOrders
            ? `발표 시작 (${orderedPresenters.length}명)`
            : `순서를 지정하세요 (${orderMap.size}/${presenters.length})`
          }
        </button>
      </div>
    );
  }

  // ─── 발표 진행 / 완료 화면 ────────────────────
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      {/* 발표 진행 바 */}
      <div className="flex gap-1 w-full">
        {orderedPresenters.map((p, i) => (
          <div
            key={p.id}
            className={`h-1.5 rounded-full flex-1 transition-all ${
              i < currentIndex
                ? 'bg-emerald-500'
                : i === currentIndex
                  ? warningLevel === 'red'
                    ? 'bg-red-500 animate-pulse'
                    : warningLevel === 'yellow'
                      ? 'bg-amber-500'
                      : 'bg-sp-accent'
                  : 'bg-sp-border'
            }`}
            title={p.name}
          />
        ))}
      </div>

      {/* 순서 표시 */}
      <p className="text-sm text-sp-muted">
        {currentIndex + 1} / {orderedPresenters.length}
      </p>

      {/* 전체 완료 */}
      {state === 'all-done' ? (
        <div className="flex flex-col items-center gap-6 py-8">
          <span className="material-symbols-outlined text-emerald-400 text-[72px]">
            check_circle
          </span>
          <p className="text-3xl font-bold text-sp-text">발표 완료!</p>
          <p className="text-sp-muted">
            {orderedPresenters.length}명 모두 발표를 마쳤습니다
          </p>
          <button
            onClick={resetAll}
            className="px-8 py-3 rounded-xl bg-sp-accent text-white font-medium hover:bg-sp-accent/80 transition-colors"
          >
            처음으로
          </button>
        </div>
      ) : (
        <>
          {/* 현재 발표자 이름 */}
          <div className={`text-center transition-colors duration-300 ${
            warningLevel === 'red'
              ? 'text-red-400'
              : warningLevel === 'yellow'
                ? 'text-amber-400'
                : 'text-sp-text'
          }`}>
            <p className="text-lg text-sp-muted mb-1">현재 발표자</p>
            <p className="text-4xl font-bold">{currentPresenter?.name}</p>
          </div>

          {/* 카운트다운 링 */}
          <div className={`relative w-[280px] h-[280px] flex items-center justify-center rounded-full transition-all duration-500 ${
            warningLevel === 'red'
              ? 'ring-4 ring-red-500/30'
              : warningLevel === 'yellow'
                ? 'ring-4 ring-amber-500/20'
                : ''
          }`}>
            <CircleProgress
              ratio={ratio}
              preWarningActive={warningLevel === 'yellow' || warningLevel === 'red'}
            />
            <div className="z-10 flex flex-col items-center">
              <span className={`text-7xl font-mono font-bold select-none transition-colors duration-300 ${
                warningLevel === 'red'
                  ? 'text-red-400 animate-pulse'
                  : warningLevel === 'yellow'
                    ? 'text-amber-400'
                    : 'text-sp-text'
              }`}>
                {formatTime(remaining)}
              </span>
              {state === 'slide-done' && (
                <p className="text-lg font-bold text-amber-400 mt-2 animate-bounce">
                  시간 종료!
                </p>
              )}
            </div>
          </div>

          {/* 다음 발표자 미리보기 */}
          {currentIndex + 1 < orderedPresenters.length && (
            <p className="text-sm text-sp-muted flex items-center gap-1.5">
              <span className="material-symbols-outlined text-icon-sm">arrow_forward</span>
              다음: {orderedPresenters[currentIndex + 1]!.name}
            </p>
          )}

          {/* 컨트롤 */}
          <div className="flex items-center gap-4">
            <button
              onClick={resetAll}
              className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all flex items-center justify-center"
              title="처음으로"
            >
              <span className="material-symbols-outlined text-icon-xl">restart_alt</span>
            </button>

            {state === 'running' ? (
              <button
                onClick={pauseTimer}
                className="w-20 h-20 rounded-full bg-sp-highlight text-white flex items-center justify-center hover:bg-sp-highlight/80 transition-colors shadow-lg shadow-sp-highlight/20"
                title="일시정지"
              >
                <span className="material-symbols-outlined text-4xl">pause</span>
              </button>
            ) : state === 'paused' ? (
              <button
                onClick={resumeTimerStable}
                className="w-20 h-20 rounded-full bg-sp-accent text-white flex items-center justify-center hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20"
                title="재개"
              >
                <span className="material-symbols-outlined text-4xl">play_arrow</span>
              </button>
            ) : (
              <button
                onClick={nextPresenter}
                className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                title="다음 발표자"
              >
                <span className="material-symbols-outlined text-4xl">skip_next</span>
              </button>
            )}

            {(state === 'running' || state === 'paused') && (
              <button
                onClick={nextPresenter}
                className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all flex items-center justify-center"
                title="건너뛰기"
              >
                <span className="material-symbols-outlined text-icon-xl">skip_next</span>
              </button>
            )}
            {state === 'slide-done' && <div className="w-14 h-14" />}
          </div>
        </>
      )}
    </div>
  );
}
