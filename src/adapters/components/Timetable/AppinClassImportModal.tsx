import { useState, useEffect, useCallback, useMemo } from 'react';
import { appinPort } from '@adapters/di/container';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import {
  AppinError,
  getAppinErrorMessage,
  type AppinSchool,
  type AppinClassRef,
} from '@domain/entities/AppinTimetable';
import {
  parseGrid,
  parseAppinClasses,
  gradesOf,
  classesOfGrade,
  buildClassScheduleFromAppin,
  countWeekFiles,
  currentWeekByModified,
  estimateWeekFromDate,
  weekFileName,
  parseAppinDayTimes,
} from '@domain/rules/appinRules';
import {
  parseComciganPeriodTimes,
  periodTimesToSettingsPatch,
  type ParsedComciganPeriodTimes,
} from '@domain/rules/comciganRules';
import type { ClassScheduleData } from '@domain/entities/Timetable';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { toLocalDateString, endOfLocalDayIso } from '@shared/utils/localDate';
import { AppinSchoolSearch } from './AppinSchoolSearch';
import { PeriodTimesImportOption } from './PeriodTimesImportOption';

interface AppinClassImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 학급 시간표 적용 — 나이스/컴시간 경로와 동일 계약(부모의 handleNeisImport 재사용) */
  onImport: (data: ClassScheduleData, maxPeriods: number) => void;
  hasExistingData: boolean;
}

type WizardStep = 'school' | 'classSelect' | 'loading' | 'done' | 'error';

/** 오늘 자정 직후~자정까지를 포함하도록 로컬 기준 하루 끝 ISO(나이브) 문자열 */
export function AppinClassImportModal({
  isOpen,
  onClose,
  onImport,
  hasExistingData,
}: AppinClassImportModalProps) {
  const { settings } = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.update);

  /* ── 학교 (검색·해석은 AppinSchoolSearch, 확정된 학교만 보관) ── */
  const [school, setSchool] = useState<AppinSchool | null>(null);

  /* ── 학급/주차 데이터 ── */
  const [classes, setClasses] = useState<readonly AppinClassRef[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [parsedPeriodTimes, setParsedPeriodTimes] = useState<ParsedComciganPeriodTimes | null>(
    null,
  );
  const [importPeriodTimes, setImportPeriodTimes] = useState(false);

  /* ── 상태 ── */
  const [step, setStep] = useState<WizardStep>('school');
  const [errorMsg, setErrorMsg] = useState('');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  /* ── 열릴 때 리셋 ── */
  useEffect(() => {
    if (!isOpen) return;
    setStep('school');
    setSchool(null);
    setClasses([]);
    setWeek(null);
    setSelectedGrade('');
    setSelectedClass('');
    setParsedPeriodTimes(null);
    setImportPeriodTimes(false);
    setErrorMsg('');
    setShowOverwriteConfirm(false);
  }, [isOpen]);

  /* ── 학교 확정 → 원소표/주차 수신 → 학년/반 선택 ── */
  const handleSchoolResolved = useCallback(
    async (found: AppinSchool) => {
      setStep('loading');
      setErrorMsg('');
      try {
        const [elements, files] = await Promise.all([
          appinPort.getElements(found.webdir),
          appinPort.listFiles(found.webdir),
        ]);
        const parsed = parseAppinClasses(elements.elements);
        if (parsed.length === 0) {
          setSchool(found);
          setErrorMsg(getAppinErrorMessage('NO_DATA'));
          setStep('error');
          return;
        }
        const total = countWeekFiles(files);
        const now = new Date();
        const anchorWeek = estimateWeekFromDate(found.date, total, now) ?? undefined;
        const resolvedWeek =
          currentWeekByModified(files, endOfLocalDayIso(now), anchorWeek) ??
          anchorWeek ??
          (total > 0 ? total : 1);
        setSchool(found);
        setClasses(parsed);
        setWeek(resolvedWeek);
        // 교시 시각(옵트인) — s파일이 있으면 파싱해 둔다(없으면 조용히 생략)
        try {
          const sText = await appinPort.getWeekFileText(
            found.webdir,
            weekFileName('s', resolvedWeek),
          );
          setParsedPeriodTimes(
            parseComciganPeriodTimes(parseAppinDayTimes(sText), settings.schoolLevel),
          );
        } catch {
          setParsedPeriodTimes(null);
        }
        setStep('classSelect');
      } catch (e) {
        setErrorMsg(
          e instanceof AppinError
            ? getAppinErrorMessage(e.errorType)
            : getAppinErrorMessage('NETWORK_ERROR'),
        );
        setStep('error');
      }
    },
    [settings.schoolLevel],
  );

  /* ── 학년/반 파생 ── */
  const grades = useMemo(() => gradesOf(classes), [classes]);
  const classesForGrade = useMemo(
    () => (selectedGrade === '' ? [] : classesOfGrade(classes, Number(selectedGrade))),
    [classes, selectedGrade],
  );

  /* ── 적용 ── */
  const applyImport = useCallback(async () => {
    if (!school || week == null) return;
    const ref = classes.find(
      (c) => c.grade === Number(selectedGrade) && c.classNum === Number(selectedClass),
    );
    if (!ref) return;
    setStep('loading');
    try {
      const text = await appinPort.getWeekFileText(school.webdir, weekFileName('h', week));
      const grids = parseGrid(text);
      const dayGrid = grids[ref.index];
      if (!dayGrid) {
        setErrorMsg(getAppinErrorMessage('NO_DATA'));
        setStep('error');
        return;
      }
      const { schedule, maxPeriod } = buildClassScheduleFromAppin(dayGrid);
      if (maxPeriod === 0) {
        setErrorMsg('이번 주차 시간표가 아직 비어 있어요. 학기 중인지 확인해주세요.');
        setStep('error');
        return;
      }
      // 교시 시각 옵트인 — 학급 적용 전에 먼저 저장(설정 I/O 직렬화)
      if (importPeriodTimes && parsedPeriodTimes) {
        await updateSettings(periodTimesToSettingsPatch(parsedPeriodTimes));
      }
      // 자동 변경감지용 설정 저장(학급 대상)
      await updateSettings({
        appin: {
          autoSync: {
            enabled: true,
            webdir: school.webdir,
            schoolName: school.name,
            city: school.city,
            ...(school.date ? { date: school.date } : {}),
            target: 'class',
            grade: ref.grade,
            classNum: ref.classNum,
            autoApply: false,
            lastSyncDate: toLocalDateString(),
          },
        },
      });
      onImport(schedule, maxPeriod);
      setStep('done');
    } catch (e) {
      setErrorMsg(
        e instanceof AppinError
          ? getAppinErrorMessage(e.errorType)
          : getAppinErrorMessage('NETWORK_ERROR'),
      );
      setStep('error');
    }
  }, [
    school,
    week,
    classes,
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
  const stepLabels = ['학교 찾기', '학년/반 선택'];
  const currentStepNum = step === 'school' ? 1 : 2;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="압핀 학급 시간표 불러오기"
      srOnlyTitle
      size="lg"
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            압핀에서 학급 시간표 불러오기
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
                            ? 'bg-sp-surface text-sp-accent border-2 border-sp-accent'
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
          {/* Step 1: 학교 검색(정확일치) */}
          {step === 'school' && (
            <AppinSchoolSearch
              onResolved={(found) => void handleSchoolResolved(found)}
              note={
                <p className="text-xs text-sp-muted">
                  압핀 학급 시간표엔 담당 교사 정보가 없어 과목만 채워져요. 필요한 부분은 직접
                  수정할 수 있어요.
                </p>
              }
            />
          )}

          {/* Step 2: 학년/반 선택 */}
          {step === 'classSelect' && (
            <div className="space-y-4">
              <div className="p-3 bg-sp-surface border border-sp-border rounded-xl text-xs text-sp-muted">
                <span className="font-semibold text-sp-text">{school?.name}</span>의 시간표에서
                불러올 반을 선택하세요.
                {week != null && <span className="ml-1">(현재 {week}주차)</span>}
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
                      <option key={c.classNum} value={String(c.classNum)}>
                        {c.classNum}반
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted">
                압핀 학급 시간표엔 담당 교사 정보가 없어 과목만 채워져요. 필요한 부분은 직접 수정할
                수 있어요.
              </div>

              {/* 교시 시각 옵트인 — 압핀에 교시 시각(s파일)이 있을 때만 노출 */}
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
              <div className="w-10 h-10 border-3 border-sp-border border-t-sp-accent rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">시간표를 불러오는 중...</p>
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
                <p>• 압핀은 외부 서비스라 일시적으로 연결이 안 될 수 있어요 — 잠시 후 다시 시도</p>
                <p>• 계속 안 되면 [나이스에서 불러오기] 또는 직접 입력으로 만들 수 있어요</p>
              </div>

              <button
                onClick={() => {
                  setStep('school');
                  setSchool(null);
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
                  setSchool(null);
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
