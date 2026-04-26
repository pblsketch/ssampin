import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useMealStore } from '@adapters/stores/useMealStore';
import { neisPort } from '@adapters/di/container';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import type { SchoolSearchResult } from '@domain/entities/Meal';
import type { NeisClassInfo } from '@domain/entities/NeisTimetable';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import {
  NeisApiError,
  getNeisErrorMessage,
  settingsLevelToNeisLevel,
  getGradeRange,
  getCurrentAcademicYear,
  getCurrentSemester,
  getCurrentWeekRange,
  getLastWeekRange,
  formatDateDisplay,
} from '@domain/entities/NeisTimetable';
import type { ClassScheduleData } from '@domain/entities/Timetable';
import {
  transformToClassSchedule,
  getMaxPeriod,
} from '@domain/rules/neisTransformRules';

interface NeisImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ClassScheduleData, maxPeriods: number) => void;
  hasExistingData: boolean;
  onEnableAutoSync?: (grade: string, className: string) => void;
}

type WizardStep = 'school' | 'classSelect' | 'period' | 'confirm' | 'loading' | 'done' | 'error';

type PeriodOption = 'thisWeek' | 'lastWeek' | 'custom';

export function NeisImportModal({ isOpen, onClose, onImport, hasExistingData, onEnableAutoSync }: NeisImportModalProps) {
  const { settings } = useSettingsStore();
  const { searchResults, searching, searchSchools, clearSearch } = useMealStore();
  const showToast = useToastStore((s) => s.show);

  /* ── 학교 선택 ── */
  const [schoolQuery, setSchoolQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<SchoolSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 학년/반 ── */
  const [classList, setClassList] = useState<readonly NeisClassInfo[]>([]);
  const [classListLoading, setClassListLoading] = useState(false);
  const [classListError, setClassListError] = useState('');

  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

  /* ── 기간 ── */
  const [periodOption, setPeriodOption] = useState<PeriodOption>('thisWeek');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  /* ── 학년도/학기 ── */
  const [academicYear] = useState(getCurrentAcademicYear);
  const [semester] = useState(getCurrentSemester);

  /* ── 상태 ── */
  const [step, setStep] = useState<WizardStep>('school');
  const [errorMsg, setErrorMsg] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [autoSyncOffered, setAutoSyncOffered] = useState(false);

  const apiKey = NEIS_API_KEY;
  const neisLevel = settingsLevelToNeisLevel(settings.schoolLevel);
  const gradeRange = getGradeRange(neisLevel);

  /* ── 기존 학교 정보 자동 채우기 ── */
  useEffect(() => {
    if (isOpen && settings.neis.schoolCode && settings.neis.atptCode) {
      setSelectedSchool({
        schoolName: settings.neis.schoolName.split(' (')[0] ?? settings.neis.schoolName,
        schoolCode: settings.neis.schoolCode,
        atptCode: settings.neis.atptCode,
        address: '',
        schoolType: '',
      });
    }
  }, [isOpen, settings.neis]);

  /* ── 학교 검색 디바운스 ── */
  useEffect(() => {
    if (!schoolQuery.trim()) {
      clearSearch();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchSchools(schoolQuery.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [schoolQuery, searchSchools, clearSearch]);

  /* ── 학년 선택 시 반 목록 로드 ── */
  useEffect(() => {
    if (!selectedSchool || !selectedGrade) return;

    setClassListLoading(true);
    setSelectedClass('');
    setClassListError('');
    void neisPort
      .getClassList({
        apiKey,
        officeCode: selectedSchool.atptCode,
        schoolCode: selectedSchool.schoolCode,
        academicYear,
        grade: selectedGrade,
      })
      .then((list) => {
        setClassList(list);
      })
      .catch((e) => {
        setClassList([]);
        setClassListError(
          e instanceof NeisApiError
            ? getNeisErrorMessage(e.errorType)
            : '반 목록을 불러올 수 없습니다. 학교 정보와 학교 구분(초/중/고)을 확인해주세요.'
        );
      })
      .finally(() => {
        setClassListLoading(false);
      });
  }, [selectedSchool, selectedGrade, academicYear, apiKey]);

  /* ── 기간 계산 ── */
  const dateRange = useMemo(() => {
    if (periodOption === 'thisWeek') return getCurrentWeekRange();
    if (periodOption === 'lastWeek') return getLastWeekRange();
    return { fromDate: customFrom.replace(/-/g, ''), toDate: customTo.replace(/-/g, '') };
  }, [periodOption, customFrom, customTo]);

  /* ── 불러오기 실행 ── */
  const executeImport = useCallback(async () => {
    if (!selectedSchool) return;

    setStep('loading');
    setErrorMsg('');

    try {
      setImportProgress('시간표를 불러오는 중...');
      const rows = await neisPort.getTimetable({
        apiKey,
        officeCode: selectedSchool.atptCode,
        schoolCode: selectedSchool.schoolCode,
        schoolLevel: neisLevel,
        academicYear,
        semester,
        grade: selectedGrade,
        className: selectedClass,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
      });

      if (rows.length === 0) {
        const hint = [
          `학년도: ${academicYear}년 ${semester}학기`,
          `학교 구분: ${neisLevel === 'els' ? '초등' : neisLevel === 'mis' ? '중학' : '고등'}`,
          `기간: ${formatDateDisplay(dateRange.fromDate)} ~ ${formatDateDisplay(dateRange.toDate)}`,
        ].join(' | ');

        setErrorMsg(
          `시간표 데이터가 없습니다.\n\n` +
          `가능한 원인:\n` +
          `• 해당 기간에 등록된 시간표가 없음 (개학 전 데이터)\n` +
          `• 학교 구분(초/중/고)이 실제 학교와 다름\n` +
          `• 학년/반 번호가 NEIS에 등록된 것과 다름\n\n` +
          `조회 정보: ${hint}`
        );
        setStep('error');
        return;
      }

      const maxPeriod = getMaxPeriod(rows);
      const data = transformToClassSchedule(rows, maxPeriod);
      onImport(data, maxPeriod);
      setStep('done');
    } catch (e) {
      if (e instanceof NeisApiError) {
        setErrorMsg(getNeisErrorMessage(e.errorType));
      } else {
        setErrorMsg('시간표를 불러오는 중 오류가 발생했습니다.');
      }
      setStep('error');
    }
  }, [selectedSchool, selectedGrade, selectedClass, neisLevel, academicYear, semester, dateRange, apiKey, onImport]);

  /* ── 다음 단계 진행 ── */
  const goNext = useCallback(() => {
    if (step === 'school') {
      setStep('classSelect');
    } else if (step === 'classSelect') {
      setStep('period');
    } else if (step === 'period') {
      if (hasExistingData) {
        setShowOverwriteConfirm(true);
      } else {
        void executeImport();
      }
    }
  }, [step, hasExistingData, executeImport]);

  const goBack = useCallback(() => {
    if (step === 'classSelect') setStep('school');
    else if (step === 'period') setStep('classSelect');
    else if (step === 'error') setStep('period');
  }, [step]);

  /* ── 다음 버튼 활성 조건 ── */
  const canGoNext = useMemo(() => {
    if (step === 'school') return selectedSchool !== null;
    if (step === 'classSelect') return selectedGrade !== '' && selectedClass !== '';
    if (step === 'period') {
      if (periodOption === 'custom') return customFrom !== '' && customTo !== '';
      return true;
    }
    return false;
  }, [step, selectedSchool, selectedGrade, selectedClass, periodOption, customFrom, customTo]);

  /* ── 학교 선택 핸들러 ── */
  const handleSelectSchool = useCallback((school: SchoolSearchResult) => {
    setSelectedSchool(school);
    setSchoolQuery('');
    clearSearch();
  }, [clearSearch]);

  /* ── 리셋 ── */
  useEffect(() => {
    if (isOpen) {
      setStep('school');
      setErrorMsg('');
      setSchoolQuery('');
      setSelectedGrade('');
      setSelectedClass('');
      setClassList([]);
      setClassListError('');
      setPeriodOption('thisWeek');
      setShowOverwriteConfirm(false);
      setAutoSyncOffered(false);
    }
  }, [isOpen]);

  const stepLabels = ['학교 선택', '학년/반 선택', '기간 선택'];
  const currentStepNum = step === 'school' ? 1 : step === 'classSelect' ? 2 : 3;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="나이스 시간표 불러오기" srOnlyTitle size="lg">
      <div className="flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            나이스 시간표 불러오기
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 스텝 인디케이터 */}
        {(step === 'school' || step === 'classSelect' || step === 'period') && (
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
                    <span className={`text-caption font-medium ${isActive ? 'text-sp-accent' : 'text-sp-muted'}`}>
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
          {/* Step 1: 학교 선택 */}
          {step === 'school' && (
            <div className="space-y-4">
              {selectedSchool ? (
                <div className="flex items-center justify-between p-3 bg-sp-accent/10 border border-sp-accent/30 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-sp-text">{selectedSchool.schoolName}</p>
                    {selectedSchool.address && (
                      <p className="text-xs text-sp-muted mt-0.5">{selectedSchool.address}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelectedSchool(null); setSchoolQuery(''); }}
                    className="text-xs text-sp-accent hover:text-blue-400 font-medium"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <>
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
                      검색 중...
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {searchResults.map((school, idx) => (
                        <button
                          key={`${school.schoolCode}-${idx}`}
                          onClick={() => handleSelectSchool(school)}
                          className="w-full text-left p-3 rounded-xl hover:bg-sp-surface border border-transparent hover:border-sp-border transition-colors"
                        >
                          <p className="text-sm font-medium text-sp-text">{school.schoolName}</p>
                          <p className="text-xs text-sp-muted mt-0.5">
                            {school.address} — {school.schoolType}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: 학년/반 선택 */}
          {step === 'classSelect' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sp-muted">학년</label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => { setSelectedGrade(e.target.value); setClassListError(''); }}
                    className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                  >
                    <option value="">선택</option>
                    {gradeRange.map((g) => (
                      <option key={g} value={String(g)}>{g}학년</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sp-muted">반</label>
                  {classListLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sp-muted text-sm">
                      <div className="w-4 h-4 border-2 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
                      로딩 중...
                    </div>
                  ) : (
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      disabled={!selectedGrade || classList.length === 0}
                      className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-40"
                    >
                      <option value="">선택</option>
                      {classList.map((c) => (
                        <option key={c.CLASS_NM} value={c.CLASS_NM}>{c.CLASS_NM}반</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <p className="text-xs text-sp-muted">
                선택한 반의 시간표를 불러옵니다.
              </p>
              {classListError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                  {classListError}
                </div>
              )}
            </div>
          )}

          {/* Step 3: 기간 선택 */}
          {step === 'period' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {(['thisWeek', 'lastWeek', 'custom'] as PeriodOption[]).map((opt) => {
                  const labels: Record<PeriodOption, string> = {
                    thisWeek: '이번 주',
                    lastWeek: '지난 주',
                    custom: '직접 선택',
                  };
                  const range = opt === 'thisWeek' ? getCurrentWeekRange() : opt === 'lastWeek' ? getLastWeekRange() : null;

                  return (
                    <button
                      key={opt}
                      onClick={() => setPeriodOption(opt)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        periodOption === opt
                          ? 'bg-sp-accent/10 border-sp-accent/30'
                          : 'bg-sp-surface border-sp-border hover:border-sp-accent/30'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          periodOption === opt ? 'border-sp-accent' : 'border-sp-border'
                        }`}
                      >
                        {periodOption === opt && <div className="w-2.5 h-2.5 rounded-full bg-sp-accent" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-sp-text">{labels[opt]}</p>
                        {range && (
                          <p className="text-xs text-sp-muted">
                            {formatDateDisplay(range.fromDate)} ~ {formatDateDisplay(range.toDate)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {periodOption === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sp-muted">시작일</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sp-muted">종료일</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-sp-surface rounded-xl border border-sp-border">
                <p className="text-xs text-sp-muted">
                  {selectedGrade}학년 {selectedClass}반의 시간표를 불러옵니다.
                </p>
                <p className="text-xs text-sp-muted mt-1">
                  학년도 {academicYear}년 {semester}학기
                </p>
              </div>
            </div>
          )}

          {/* 로딩 */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-sp-accent/30 border-t-sp-accent rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">{importProgress || '시간표를 불러오는 중...'}</p>
            </div>
          )}

          {/* 완료 */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-400 text-3xl">check_circle</span>
              </div>
              <p className="text-sm font-medium text-sp-text">시간표를 성공적으로 불러왔습니다!</p>
              <p className="text-xs text-sp-muted">필요한 부분은 수동으로 수정할 수 있습니다.</p>

              {/* 자동 동기화 제안 */}
              {onEnableAutoSync && !settings.neis.autoSync?.enabled && !autoSyncOffered && selectedGrade && selectedClass && (
                <div className="mt-4 w-full p-4 bg-sp-accent/5 border border-sp-accent/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-sp-accent text-xl mt-0.5">sync</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-sp-text">자동 동기화를 켤까요?</p>
                      <p className="text-xs text-sp-muted mt-1">
                        매주 앱을 시작할 때 {selectedGrade}학년 {selectedClass}반 시간표를 자동으로 가져옵니다.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => {
                            onEnableAutoSync(selectedGrade, selectedClass);
                            setAutoSyncOffered(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-bold hover:bg-blue-600 transition-colors"
                        >
                          켜기
                        </button>
                        <button
                          onClick={() => setAutoSyncOffered(true)}
                          className="px-3 py-1.5 rounded-lg border border-sp-border text-xs text-sp-muted hover:text-sp-text transition-colors"
                        >
                          나중에
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {autoSyncOffered && settings.neis.autoSync?.enabled && (
                <p className="text-xs text-green-400 flex items-center gap-1 mt-2">
                  <span className="material-symbols-outlined text-sm">check</span>
                  자동 동기화가 설정되었습니다
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
              <p className="text-sm text-sp-text text-center px-4 whitespace-pre-line">{errorMsg}</p>

              <div className="w-full p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted space-y-1">
                <p className="font-semibold text-sp-text mb-1">현재 설정 확인</p>
                <p>학교: {settings.neis.schoolName || '미설정'}</p>
                <p>학교 구분: {settings.schoolLevel === 'elementary' ? '초등학교' : settings.schoolLevel === 'middle' ? '중학교' : settings.schoolLevel === 'high' ? '고등학교' : '미설정'}</p>
                <p>학년도: {academicYear}년 {semester}학기</p>
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => void executeImport()}
                  className="px-4 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm font-medium text-sp-text hover:bg-sp-card transition-colors"
                >
                  다시 시도
                </button>
                <button
                  onClick={() => {
                    const ctx = [
                      `[NEIS 연동 오류 신고]`,
                      `학교: ${settings.neis.schoolName}`,
                      `학교구분: ${settings.schoolLevel}`,
                      `학년도: ${academicYear}년 ${semester}학기`,
                      `에러: ${errorMsg}`,
                    ].join('\n');
                    void navigator.clipboard.writeText(ctx);
                    showToast('오류 정보가 복사되었습니다. 피드백으로 보내주세요.', 'success');
                  }}
                  className="px-4 py-2 rounded-xl border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  오류 신고
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-sp-border">
          <div>
            {(step === 'classSelect' || step === 'period' || step === 'error') && (
              <button
                onClick={goBack}
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
            ) : (step === 'school' || step === 'classSelect' || step === 'period') ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sp-accent text-white text-sm font-bold hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {step === 'period' ? (
                    <>
                      <span className="material-symbols-outlined text-lg">download</span>
                      불러오기
                    </>
                  ) : (
                    <>
                      다음
                      <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </>
                  )}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* 덮어쓰기 확인 모달 */}
        {showOverwriteConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-xs w-full mx-4 shadow-2xl">
              <h3 className="text-base font-bold text-sp-text mb-2">기존 시간표 덮어쓰기</h3>
              <p className="text-sm text-sp-muted mb-5">
                기존 시간표를 덮어씁니다. 실행 취소(Ctrl+Z)로 복원할 수 있습니다.
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
                    void executeImport();
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
