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
  type ComciganTeacherSummary,
} from '@domain/entities/ComciganTimetable';
import {
  buildTeacherSchedule,
  decodeTimetable,
  detectDecodeAnomaly,
  parseComciganPeriodTimes,
  summarizeTeachers,
} from '@domain/rules/comciganRules';
import type { DecodeAnomalyReport, ParsedComciganPeriodTimes } from '@domain/rules/comciganRules';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import type { ComciganTeacherFingerprint } from '@domain/entities/Settings';

interface ComciganImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 교사 선택 완료 — 구성된 시간표 + (옵트인 시) 교시 시각 + 재매칭용 교사 지문을 전달.
   * 실제 적용 여부는 부모의 미리보기에서 확정한다. periodTimes 는 미선택 시 null.
   * fingerprint 는 부모가 확정 시 컴시간 자동연동(변경 감지)용으로 저장한다.
   */
  onImport: (
    schedule: TeacherScheduleData,
    periodTimes: ParsedComciganPeriodTimes | null,
    fingerprint: ComciganTeacherFingerprint,
  ) => void;
}

type WizardStep = 'school' | 'teacher' | 'loading' | 'error';

export function ComciganImportModal({ isOpen, onClose, onImport }: ComciganImportModalProps) {
  const { settings } = useSettingsStore();

  /* ── 학교 검색 ── */
  const [schoolQuery, setSchoolQuery] = useState('');
  const [searchResults, setSearchResults] = useState<readonly ComciganSchool[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<ComciganSchool | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── 교사 선택 ── */
  const [lessons, setLessons] = useState<readonly ComciganLesson[]>([]);
  const [teacherFilter, setTeacherFilter] = useState('');
  const [dayTimes, setDayTimes] = useState<readonly string[] | undefined>(undefined);
  const [importPeriodTimes, setImportPeriodTimes] = useState(false);

  /* ── 상태 ── */
  const [step, setStep] = useState<WizardStep>('school');
  const [errorMsg, setErrorMsg] = useState('');
  /** 해석 신뢰도 경고 (컴시간 코드 해석이 이 학교에서 어긋났을 가능성) */
  const [anomaly, setAnomaly] = useState<DecodeAnomalyReport | null>(null);

  /* ── 열릴 때 리셋 + 나이스 학교명 프리필 ── */
  useEffect(() => {
    if (!isOpen) return;
    setStep('school');
    setSelectedSchool(null);
    setSearchResults([]);
    setSearched(false);
    setLessons([]);
    setTeacherFilter('');
    setDayTimes(undefined);
    setImportPeriodTimes(false);
    setErrorMsg('');
    setAnomaly(null);
    const prefill = settings.neis.schoolName.split(' (')[0] ?? '';
    setSchoolQuery(prefill);
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

  /* ── 학교 선택 → 시간표 수신 → 교사 목록 ── */
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
      setAnomaly(detectDecodeAnomaly(data, decoded));
      setStep('teacher');
    } catch (e) {
      setErrorMsg(
        e instanceof ComciganError
          ? getComciganErrorMessage(e.errorType)
          : getComciganErrorMessage('NETWORK_ERROR'),
      );
      setStep('error');
    }
  }, []);

  /* ── 교사 요약 (더미 제외 + 이름 필터) ── */
  const teacherSummaries = useMemo(() => summarizeTeachers(lessons), [lessons]);
  const visibleTeachers = useMemo(() => {
    const filter = teacherFilter.trim();
    return teacherSummaries.filter((t) => !t.isDummy && (filter === '' || t.name.includes(filter)));
  }, [teacherSummaries, teacherFilter]);

  /* ── 일과시간 파싱 (교시 시각 옵트인 노출 여부 판단) ── */
  const parsedPeriodTimes = useMemo(
    () => parseComciganPeriodTimes(dayTimes, settings.schoolLevel),
    [dayTimes, settings.schoolLevel],
  );

  /* ── 동명이인 구분용 담당 학년 힌트 (교사 인덱스 → 'N학년·M학년') ── */
  const teacherGradeHint = useMemo(() => {
    const byIndex = new Map<number, Set<number>>();
    for (const l of lessons) {
      let grades = byIndex.get(l.teacherIndex);
      if (!grades) {
        grades = new Set();
        byIndex.set(l.teacherIndex, grades);
      }
      grades.add(l.grade);
    }
    const hint = new Map<number, string>();
    for (const [idx, grades] of byIndex) {
      hint.set(
        idx,
        [...grades]
          .sort((a, b) => a - b)
          .map((g) => `${g}학년`)
          .join('·'),
      );
    }
    return hint;
  }, [lessons]);

  /* ── 교사 선택 → 시간표 구성 → 부모 미리보기로 전달 ── */
  const handleSelectTeacher = useCallback(
    (teacher: ComciganTeacherSummary) => {
      if (!selectedSchool) return;
      const { schedule } = buildTeacherSchedule(lessons, teacher.index);
      onImport(schedule, importPeriodTimes ? parsedPeriodTimes : null, {
        schoolCode: selectedSchool.code,
        maskedName: teacher.name,
        subjects: teacher.subjects,
      });
    },
    [lessons, onImport, importPeriodTimes, parsedPeriodTimes, selectedSchool],
  );

  const stepLabels = ['학교 선택', '교사 선택'];
  const currentStepNum = step === 'school' ? 1 : 2;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="컴시간 시간표 불러오기" srOnlyTitle size="lg">
      <div className="flex flex-col flex-1 min-h-0">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            컴시간에서 교사 시간표 불러오기
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 스텝 인디케이터 */}
        {(step === 'school' || step === 'teacher') && (
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
                      <span className="font-semibold">양식 다운로드 → 엑셀 불러오기</span> 또는 직접
                      입력을 이용해주세요.
                    </p>
                  </div>
                )}

              <p className="text-xs text-sp-muted">
                컴시간알리미에 등록된 학교의 시간표에서 내 수업만 골라 교사 시간표를 만들어 드려요.
              </p>
            </div>
          )}

          {/* Step 2: 교사 선택 */}
          {step === 'teacher' && (
            <div className="space-y-3">
              <div className="p-3 bg-sp-accent/5 border border-sp-accent/20 rounded-xl text-xs text-sp-muted">
                <span className="font-semibold text-sp-text">{selectedSchool?.name}</span>의 교사
                목록이에요. 개인정보 보호를 위해 이름 끝 글자는 *로 표시돼요 — 본인을 선택해주세요.
              </div>

              {/* 해석 신뢰도 경고 — 비차단(계속 진행 가능). 밝은 표면 + amber 좌측 스트라이프
                  (다크모드 amber-on-amber 가독성 가드 준수) */}
              {anomaly?.suspicious && (
                <div
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--sp-warning) 7%, var(--sp-card))',
                    borderColor: 'color-mix(in srgb, var(--sp-warning) 22%, transparent)',
                  }}
                  className="p-3 rounded-xl border text-xs space-y-1"
                >
                  <p className="font-semibold text-sp-text flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-amber-400">
                      warning
                    </span>
                    이 학교 시간표 해석이 정확하지 않을 수 있어요
                  </p>
                  <p className="text-sp-muted leading-relaxed">
                    {anomaly.reasons[0]}. 결과가 이상하면{' '}
                    <span className="font-semibold text-sp-text">
                      [양식 다운로드 → 엑셀 불러오기]
                    </span>{' '}
                    또는 직접 입력을 권장해요. 그래도 계속 진행할 수 있어요.
                  </p>
                </div>
              )}

              {/* 일과시간(교시 시각) 옵트인 — 컴시간에 시각 정보가 있을 때만 노출 */}
              {parsedPeriodTimes && (
                <PeriodTimesImportOption
                  checked={importPeriodTimes}
                  onChange={setImportPeriodTimes}
                  firstStart={parsedPeriodTimes.periodTimes[0]?.start}
                />
              )}

              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-lg">
                  filter_alt
                </span>
                <input
                  type="text"
                  value={teacherFilter}
                  onChange={(e) => setTeacherFilter(e.target.value)}
                  placeholder="이름으로 찾기 (예: 백순)"
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none"
                />
              </div>

              {visibleTeachers.length === 0 ? (
                <p className="text-sm text-sp-muted py-4 text-center">
                  조건에 맞는 선생님이 없어요.
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {visibleTeachers.map((teacher) => (
                    <button
                      key={teacher.index}
                      onClick={() => handleSelectTeacher(teacher)}
                      className="w-full flex items-center justify-between text-left p-3 rounded-xl hover:bg-sp-surface border border-transparent hover:border-sp-border transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-sp-text flex items-center gap-1.5">
                          {teacher.name}
                          {teacher.maskedNameCollision && (
                            <span className="shrink-0 text-micro font-semibold text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded px-1.5 py-0.5">
                              동명이인
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-sp-muted mt-0.5 truncate">
                          {teacher.subjects.join(' · ')}
                          {teacher.maskedNameCollision && teacherGradeHint.get(teacher.index) && (
                            <span className="text-amber-300/80">
                              {' · '}
                              {teacherGradeHint.get(teacher.index)} 담당
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-sp-accent bg-sp-accent/10 rounded-lg px-2 py-1 ml-3">
                        주 {teacher.weeklyHours}시간
                      </span>
                    </button>
                  ))}
                </div>
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
                <p>
                  • 계속 안 되면 [양식 다운로드 → 엑셀 불러오기] 또는 직접 입력으로 만들 수 있어요
                </p>
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
            {step === 'teacher' && (
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
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
