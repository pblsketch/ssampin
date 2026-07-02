import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { comciganPort } from '@adapters/di/container';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { PeriodTimesImportOption } from './PeriodTimesImportOption';
import {
  ComciganError,
  getComciganErrorMessage,
  type ComciganLesson,
  type ComciganSchool,
} from '@domain/entities/ComciganTimetable';
import {
  buildClassSchedule,
  decodeTimetable,
  listComciganClasses,
  parseComciganPeriodTimes,
  periodTimesToSettingsPatch,
} from '@domain/rules/comciganRules';
import type { ClassScheduleData } from '@domain/entities/Timetable';

interface ComciganClassImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 학급 시간표 적용 — 나이스 경로와 동일 계약(부모의 handleNeisImport 재사용) */
  onImport: (data: ClassScheduleData, maxPeriods: number) => void;
  hasExistingData: boolean;
}

type WizardStep = 'school' | 'classSelect' | 'loading' | 'done' | 'error';

export function ComciganClassImportModal({
  isOpen,
  onClose,
  onImport,
  hasExistingData,
}: ComciganClassImportModalProps) {
  const { settings } = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.update);

  /* ── 학교 검색 ── */
  const [schoolQuery, setSchoolQuery] = useState('');
  const [searchResults, setSearchResults] = useState<readonly ComciganSchool[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<ComciganSchool | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 학급 데이터 ── */
  const [lessons, setLessons] = useState<readonly ComciganLesson[]>([]);
  const [dayTimes, setDayTimes] = useState<readonly string[] | undefined>(undefined);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [importPeriodTimes, setImportPeriodTimes] = useState(false);

  /* ── 상태 ── */
  const [step, setStep] = useState<WizardStep>('school');
  const [errorMsg, setErrorMsg] = useState('');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [periodTimesApplied, setPeriodTimesApplied] = useState(false);

  /* ── 열릴 때 리셋 + 나이스 학교명 프리필 ── */
  useEffect(() => {
    if (!isOpen) return;
    setStep('school');
    setSelectedSchool(null);
    setSearchResults([]);
    setSearched(false);
    setLessons([]);
    setDayTimes(undefined);
    setSelectedGrade('');
    setSelectedClass('');
    setImportPeriodTimes(false);
    setErrorMsg('');
    setShowOverwriteConfirm(false);
    setPeriodTimesApplied(false);
    setSchoolQuery(settings.neis.schoolName.split(' (')[0] ?? '');
  }, [isOpen, settings.neis.schoolName]);

  /* ── 학교 검색 디바운스 ── */
  useEffect(() => {
    if (!isOpen || step !== 'school' || selectedSchool) return;
    const query = schoolQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      comciganPort
        .searchSchools(query)
        .then((results) => {
          setSearchResults(results);
          setSearched(true);
        })
        .catch(() => {
          setSearchResults([]);
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, step, schoolQuery, selectedSchool]);

  /* ── 학교 선택 → 전체 시간표 수신 → 학년/반 선택 ── */
  const handleSelectSchool = useCallback(async (school: ComciganSchool) => {
    setSelectedSchool(school);
    setStep('loading');
    setErrorMsg('');
    try {
      const data = await comciganPort.getSchoolData(school.code);
      const decoded = decodeTimetable(data);
      if (decoded.length === 0) {
        setErrorMsg(getComciganErrorMessage('NO_DATA'));
        setStep('error');
        return;
      }
      setLessons(decoded);
      setDayTimes(data.dayTimes);
      setStep('classSelect');
    } catch (e) {
      setErrorMsg(
        e instanceof ComciganError
          ? getComciganErrorMessage(e.errorType)
          : getComciganErrorMessage('NETWORK_ERROR'),
      );
      setStep('error');
    }
  }, []);

  /* ── 격자에서 실제 존재하는 학년/반 파생 ── */
  const classRefs = useMemo(() => listComciganClasses(lessons), [lessons]);
  const grades = useMemo(
    () => [...new Set(classRefs.map((c) => c.grade))].sort((a, b) => a - b),
    [classRefs],
  );
  const classesForGrade = useMemo(
    () =>
      classRefs
        .filter((c) => c.grade === Number(selectedGrade))
        .map((c) => c.classNum)
        .sort((a, b) => a - b),
    [classRefs, selectedGrade],
  );

  /* ── 일과시간 파싱 (교시 시각 옵트인 노출 여부 판단) ── */
  const parsedPeriodTimes = useMemo(
    () => parseComciganPeriodTimes(dayTimes, settings.schoolLevel),
    [dayTimes, settings.schoolLevel],
  );

  /* ── 나이스 자동동기화에 저장된 학년/반이 있으면 프리필 ── */
  useEffect(() => {
    if (step !== 'classSelect' || selectedGrade !== '') return;
    const g = settings.neis.autoSync?.grade;
    if (!g || !grades.includes(Number(g))) return;
    setSelectedGrade(g);
    const c = settings.neis.autoSync?.className;
    if (c && classRefs.some((r) => r.grade === Number(g) && r.classNum === Number(c))) {
      setSelectedClass(c);
    }
  }, [step, selectedGrade, grades, classRefs, settings.neis.autoSync]);

  /* ── 적용 ── */
  const applyImport = useCallback(async () => {
    // 교시 시각 설정 갱신을 먼저 await해 부모의 학급 적용(maxPeriods·과목색 설정 갱신)과
    // 저장 I/O가 겹치지 않게 직렬화한다 — 동시 발화 시 일부 설정 필드 유실 방지.
    if (importPeriodTimes && parsedPeriodTimes) {
      await updateSettings(periodTimesToSettingsPatch(parsedPeriodTimes));
      setPeriodTimesApplied(true);
    }

    const { schedule, maxPeriod } = buildClassSchedule(
      lessons,
      Number(selectedGrade),
      Number(selectedClass),
    );
    onImport(schedule, maxPeriod);
    setStep('done');
  }, [
    lessons,
    selectedGrade,
    selectedClass,
    onImport,
    importPeriodTimes,
    parsedPeriodTimes,
    updateSettings,
  ]);

  const handleImportClick = useCallback(() => {
    if (hasExistingData) setShowOverwriteConfirm(true);
    else void applyImport();
  }, [hasExistingData, applyImport]);

  const canImport = selectedGrade !== '' && selectedClass !== '';
  const stepLabels = ['학교 선택', '학년/반 선택'];
  const currentStepNum = step === 'school' ? 1 : 2;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="컴시간 학급 시간표 불러오기"
      srOnlyTitle
      size="lg"
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            컴시간에서 학급 시간표 불러오기
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 스텝 인디케이터 */}
        {(step === 'school' || step === 'classSelect') && (
          <div className="flex items-center justify-center gap-0 px-6 pt-4">
            {stepLabels.map((label, idx) => {
              const stepNum = idx + 1;
              const isCompleted = currentStepNum > stepNum;
              const isActive = currentStepNum === stepNum;
              return (
                <div key={stepNum} className="flex items-center">
                  {idx > 0 && (
                    <div className={`w-8 h-0.5 ${isCompleted ? 'bg-sp-accent' : 'bg-sp-border'}`} />
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCompleted
                          ? 'bg-sp-accent text-white'
                          : isActive
                            ? 'bg-sp-accent/20 text-sp-accent border-2 border-sp-accent'
                            : 'bg-sp-surface text-sp-muted border border-sp-border'
                      }`}
                    >
                      {isCompleted ? (
                        <span className="material-symbols-outlined text-sm">check</span>
                      ) : (
                        stepNum
                      )}
                    </div>
                    <span
                      className={`text-caption font-medium ${isActive ? 'text-sp-accent' : 'text-sp-muted'}`}
                    >
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: 학교 검색/선택 */}
          {step === 'school' && (
            <div className="space-y-4">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-lg">
                  search
                </span>
                <input
                  type="text"
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  placeholder="학교명을 입력하세요..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50"
                  autoFocus
                />
              </div>

              {searching && (
                <div className="flex items-center gap-2 text-sp-muted text-sm py-2">
                  <div className="w-4 h-4 border-2 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
                  컴시간에서 학교를 찾는 중...
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.map((school) => (
                    <button
                      key={school.code}
                      onClick={() => void handleSelectSchool(school)}
                      className="w-full text-left p-3 rounded-xl hover:bg-sp-surface border border-transparent hover:border-sp-border transition-colors"
                    >
                      <p className="text-sm font-medium text-sp-text">{school.name}</p>
                      <p className="text-xs text-sp-muted mt-0.5">{school.regionName}</p>
                    </button>
                  ))}
                </div>
              )}

              {!searching &&
                searched &&
                searchResults.length === 0 &&
                schoolQuery.trim() !== '' && (
                  <div className="p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted space-y-1">
                    <p className="font-semibold text-sp-text">검색 결과가 없어요</p>
                    <p>
                      학교명을 다시 확인해주세요. 학교가 컴시간알리미를 사용하지 않는 경우에는{' '}
                      <span className="font-semibold">나이스에서 불러오기</span> 또는 직접 입력을
                      이용해주세요.
                    </p>
                  </div>
                )}

              <p className="text-xs text-sp-muted">
                컴시간알리미를 쓰는 학교라면 우리 반 시간표를 담당 교사까지 한 번에 채워드려요.
              </p>
            </div>
          )}

          {/* Step 2: 학년/반 선택 */}
          {step === 'classSelect' && (
            <div className="space-y-4">
              <div className="p-3 bg-sp-accent/5 border border-sp-accent/20 rounded-xl text-xs text-sp-muted">
                <span className="font-semibold text-sp-text">{selectedSchool?.name}</span>의
                시간표에서 불러올 반을 선택하세요.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sp-muted">학년</label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => {
                      setSelectedGrade(e.target.value);
                      setSelectedClass('');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                  >
                    <option value="">선택</option>
                    {grades.map((g) => (
                      <option key={g} value={String(g)}>
                        {g}학년
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sp-muted">반</label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    disabled={selectedGrade === '' || classesForGrade.length === 0}
                    className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-40"
                  >
                    <option value="">선택</option>
                    {classesForGrade.map((c) => (
                      <option key={c} value={String(c)}>
                        {c}반
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted">
                담당 교사 이름은 개인정보 보호를 위해 끝 글자가{' '}
                <span className="font-semibold">*</span>로 표시돼요.
              </div>

              {/* 일과시간(교시 시각) 옵트인 — 컴시간에 시각 정보가 있을 때만 노출 */}
              {parsedPeriodTimes && (
                <PeriodTimesImportOption
                  checked={importPeriodTimes}
                  onChange={setImportPeriodTimes}
                  firstStart={parsedPeriodTimes.periodTimes[0]?.start}
                />
              )}
            </div>
          )}

          {/* 로딩 */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">학교 전체 시간표를 불러오는 중...</p>
            </div>
          )}

          {/* 완료 */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-400 text-3xl">
                  check_circle
                </span>
              </div>
              <p className="text-sm font-medium text-sp-text">
                {selectedGrade}학년 {selectedClass}반 시간표를 불러왔어요!
              </p>
              <p className="text-xs text-sp-muted">필요한 부분은 직접 수정할 수 있어요.</p>
              {periodTimesApplied && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check</span>
                  교시 시각도 함께 반영했어요
                </p>
              )}
            </div>
          )}

          {/* 에러 */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
              </div>
              <p className="text-sm text-sp-text text-center px-4 whitespace-pre-line">
                {errorMsg}
              </p>

              <div className="w-full p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted space-y-1">
                <p className="font-semibold text-sp-text mb-1">이럴 땐 이렇게 해보세요</p>
                <p>
                  • 컴시간은 외부 서비스라 일시적으로 연결이 안 될 수 있어요 — 잠시 후 다시 시도
                </p>
                <p>• 계속 안 되면 [나이스에서 불러오기] 또는 직접 입력으로 만들 수 있어요</p>
              </div>

              <button
                onClick={() => {
                  setStep('school');
                  setSelectedSchool(null);
                  setErrorMsg('');
                }}
                className="px-4 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm font-medium text-sp-text hover:bg-sp-card transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-sp-border">
          <div>
            {step === 'classSelect' && (
              <button
                onClick={() => {
                  setStep('school');
                  setSelectedSchool(null);
                }}
                className="flex items-center gap-1 text-sm text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                이전
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'done' ? (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-sp-accent text-white text-sm font-bold hover:bg-blue-600 transition-colors"
              >
                확인
              </button>
            ) : step === 'classSelect' ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleImportClick}
                  disabled={!canImport}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sp-accent text-white text-sm font-bold hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  불러오기
                </button>
              </>
            ) : step === 'school' ? (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
              >
                취소
              </button>
            ) : null}
          </div>
        </div>

        {/* 덮어쓰기 확인 */}
        {showOverwriteConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-xs w-full mx-4 shadow-2xl">
              <h3 className="text-base font-bold text-sp-text mb-2">기존 시간표 덮어쓰기</h3>
              <p className="text-sm text-sp-muted mb-5">
                기존 학급 시간표를 덮어씁니다. 실행 취소(Ctrl+Z)로 복원할 수 있습니다.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowOverwriteConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    setShowOverwriteConfirm(false);
                    void applyImport();
                  }}
                  className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  덮어쓰기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
