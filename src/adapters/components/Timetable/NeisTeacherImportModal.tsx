import { useState, useEffect, useCallback, useRef } from 'react';
import { neisPort } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import {
  NeisApiError,
  getNeisErrorMessage,
  settingsLevelToNeisLevel,
  getCurrentWeekRange,
} from '@domain/entities/NeisTimetable';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import {
  deriveClassFromTeachingClass,
  isLikelyMovementClass,
  type TeacherClassMapping,
} from '@domain/rules/neisTeacherReconstruct';
import { reconstructNeisTeacherSchedule } from '@usecases/timetable/ReconstructNeisTeacherSchedule';

interface NeisTeacherImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 재조합된 교사 시간표 적용 — 부모가 미리보기(TeacherExcelPreviewModal)로 합류시킨다. */
  onImport: (schedule: TeacherScheduleData) => void;
}

type WizardStep = 'setup' | 'loading' | 'error';

/** 수업반 한 줄의 편집 상태 (사용자가 학년·반·과목·포함여부를 확정) */
interface MappingRow {
  readonly classId: string;
  readonly className: string;
  subject: string;
  grade: string;
  classNum: string;
  include: boolean;
  /** 선택과목 이동수업 의심 — 기본 제외 + 안내 라벨 */
  readonly movement: boolean;
  /** 학년·반을 자동 도출했는지(false면 사용자가 직접 채워야 함) */
  readonly derived: boolean;
}

export function NeisTeacherImportModal({ isOpen, onClose, onImport }: NeisTeacherImportModalProps) {
  const { settings } = useSettingsStore();
  const { classes, loaded, load } = useTeachingClassStore();
  const showToast = useToastStore((s) => s.show);

  const [step, setStep] = useState<WizardStep>('setup');
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const initedRef = useRef(false);

  const hasSchool = Boolean(settings.neis.schoolCode && settings.neis.atptCode);

  // 모달 열릴 때 수업반 로드 보장
  useEffect(() => {
    if (!isOpen) {
      initedRef.current = false;
      return;
    }
    void load();
  }, [isOpen, load]);

  // 수업반이 준비되면 편집 행을 1회 구성 (학년·반 자동 도출, 이동수업 기본 제외)
  useEffect(() => {
    if (!isOpen || initedRef.current || !loaded) return;
    setRows(
      classes.map((cls) => {
        const derived = deriveClassFromTeachingClass(cls);
        const movement = isLikelyMovementClass(cls);
        return {
          classId: cls.id,
          className: cls.name,
          subject: cls.subject,
          grade: derived ? String(derived.grade) : '',
          classNum: derived ? String(derived.classNum) : '',
          include: !movement && derived !== null,
          movement,
          derived: derived !== null,
        };
      }),
    );
    setStep('setup');
    setErrorMsg('');
    initedRef.current = true;
  }, [isOpen, loaded, classes]);

  const updateRow = useCallback((classId: string, patch: Partial<MappingRow>) => {
    setRows((prev) => prev.map((r) => (r.classId === classId ? { ...r, ...patch } : r)));
  }, []);

  const selectedCount = rows.filter((r) => r.include).length;

  const handleReconstruct = useCallback(async () => {
    const mappings: TeacherClassMapping[] = [];
    for (const r of rows) {
      if (!r.include) continue;
      const grade = Number(r.grade);
      const classNum = Number(r.classNum);
      if (!Number.isInteger(grade) || grade < 1) continue;
      if (!Number.isInteger(classNum) || classNum < 1) continue;
      if (!r.subject.trim()) continue;
      mappings.push({ classId: r.classId, subject: r.subject.trim(), grade, classNum });
    }

    if (mappings.length === 0) {
      setErrorMsg('재조합할 수업을 하나 이상 선택하고, 과목·학년·반을 채워주세요.');
      return;
    }

    setStep('loading');
    setErrorMsg('');
    try {
      const { fromDate, toDate } = getCurrentWeekRange();
      const result = await reconstructNeisTeacherSchedule(neisPort, {
        apiKey: NEIS_API_KEY,
        officeCode: settings.neis.atptCode,
        schoolCode: settings.neis.schoolCode,
        schoolLevel: settingsLevelToNeisLevel(settings.schoolLevel),
        fromDate,
        toDate,
        mappings,
        weekendDays: settings.enableWeekendDays,
      });

      if (result.matchedCount === 0) {
        const parts = ['재조합된 수업이 없어요.'];
        if (result.fetchErrors.length > 0) {
          parts.push(
            '일부 학급 시간표를 불러오지 못했어요. 인터넷 연결과 학교 설정(초/중/고)을 확인해주세요.',
          );
        } else {
          parts.push(
            '과목명이 나이스 정식 명칭과 다르거나, 학년·반이 실제와 다를 수 있어요.\n값을 확인하고 다시 시도해주세요.',
          );
        }
        setErrorMsg(parts.join('\n'));
        setStep('error');
        return;
      }

      if (result.unmatched.length > 0) {
        const names = result.unmatched
          .map((u) => `${u.grade}-${u.classNum} ${u.subject}`)
          .join(', ');
        showToast(
          `${result.unmatched.length}개 수업은 나이스에서 못 찾았어요 (${names}). 미리보기에서 확인·수정해주세요.`,
          'info',
          undefined,
          5000,
        );
      }

      onImport(result.schedule);
    } catch (e) {
      setErrorMsg(
        e instanceof NeisApiError
          ? getNeisErrorMessage(e.errorType)
          : '교사 시간표 재조합 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
      );
      setStep('error');
    }
  }, [rows, settings.neis, settings.schoolLevel, settings.enableWeekendDays, onImport, showToast]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="나이스 교사 시간표 불러오기"
      srOnlyTitle
      size="lg"
    >
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            나이스에서 교사 시간표 불러오기
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 로드 대기 */}
          {!loaded && step === 'setup' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-t-sp-accent border-sp-border rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">수업반을 불러오는 중...</p>
            </div>
          )}

          {/* 가드: 나이스 학교 미연결 */}
          {loaded && step === 'setup' && !hasSchool && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-sp-muted text-3xl">school</span>
              </div>
              <p className="text-sm font-bold text-sp-text">먼저 나이스 학교를 연결해주세요</p>
              <p className="text-xs text-sp-muted max-w-xs">
                설정 › 학교 정보에서 우리 학교를 선택하면 재조합에 필요한 학교 정보가 채워져요.
              </p>
            </div>
          )}

          {/* 가드: 수업반 없음 */}
          {loaded && step === 'setup' && hasSchool && classes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-sp-muted text-3xl">groups</span>
              </div>
              <p className="text-sm font-bold text-sp-text">먼저 수업반을 등록해주세요</p>
              <p className="text-xs text-sp-muted max-w-xs">
                교사 시간표는 등록된 수업반의 과목으로 재조합해요. 학급 관리에서 내가 가르치는
                수업반을 먼저 만들어주세요.
              </p>
            </div>
          )}

          {/* 본문: 수업반 매핑 편집 */}
          {loaded && step === 'setup' && hasSchool && classes.length > 0 && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl border border-sp-border bg-black/5 dark:bg-white/10 text-xs text-sp-muted space-y-1">
                <p className="font-bold text-sp-text flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-icon-md text-sp-accent">
                    info
                  </span>
                  나이스에는 교사 시간표가 없어요 (베타)
                </p>
                <p>
                  내 수업반의 <span className="font-semibold text-sp-text">과목</span>을 학급
                  시간표와 맞춰 교사 시간표를 만들어요. 과목명·학년·반이 맞는지 확인하고
                  재조합해주세요.
                </p>
              </div>

              <div className="rounded-xl border border-sp-border overflow-hidden">
                <div className="max-h-[380px] overflow-y-auto">
                  {/* 컬럼 헤더 — 수업반이 많을 때도 행마다 라벨을 반복하지 않고 한 번만 스캔하도록 */}
                  <div className="sticky top-0 z-10 grid grid-cols-[28px_minmax(0,1fr)_132px_48px_48px] gap-2.5 items-center px-3 py-2 bg-sp-surface border-b border-sp-border">
                    <span aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-sp-muted">수업반</span>
                    <span className="text-[11px] font-semibold text-sp-muted">과목</span>
                    <span className="text-[11px] font-semibold text-sp-muted text-center">
                      학년
                    </span>
                    <span className="text-[11px] font-semibold text-sp-muted text-center">반</span>
                  </div>

                  <div className="divide-y divide-sp-border">
                    {rows.map((r) => (
                      <div
                        key={r.classId}
                        className={`grid grid-cols-[28px_minmax(0,1fr)_132px_48px_48px] gap-2.5 items-center px-3 py-2.5 border-l-4 transition-colors ${
                          r.movement ? 'border-l-amber-500' : 'border-l-transparent'
                        } ${r.include ? 'bg-black/5 dark:bg-white/10' : 'bg-sp-card'}`}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={r.include}
                          aria-label={`${r.className} 재조합 포함`}
                          onClick={() => updateRow(r.classId, { include: !r.include })}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                            r.include
                              ? 'border-sp-accent bg-sp-accent text-white'
                              : 'border-sp-border bg-sp-card text-transparent'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm leading-none">
                            check
                          </span>
                        </button>

                        <div className="min-w-0">
                          <p className="text-sm font-bold text-sp-text truncate">{r.className}</p>
                          {r.movement && (
                            <span className="flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-amber-500">
                              <span className="material-symbols-outlined text-[13px] leading-none">
                                warning
                              </span>
                              이 수업은 재조합이 어려워요
                            </span>
                          )}
                          {!r.derived && !r.movement && (
                            <span className="block mt-0.5 text-[11px] text-sp-muted">
                              학년·반을 확인해주세요
                            </span>
                          )}
                        </div>

                        <input
                          type="text"
                          value={r.subject}
                          onChange={(e) => updateRow(r.classId, { subject: e.target.value })}
                          placeholder="나이스 과목명"
                          aria-label={`${r.className} 과목`}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-sp-card border border-sp-border text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                        />
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={r.grade}
                          onChange={(e) => updateRow(r.classId, { grade: e.target.value })}
                          aria-label={`${r.className} 학년`}
                          className="w-full px-2 py-1.5 rounded-lg bg-sp-card border border-sp-border text-sm text-sp-text text-center focus:border-sp-accent focus:outline-none"
                        />
                        <input
                          type="number"
                          min={1}
                          value={r.classNum}
                          onChange={(e) => updateRow(r.classId, { classNum: e.target.value })}
                          aria-label={`${r.className} 반`}
                          className="w-full px-2 py-1.5 rounded-lg bg-sp-card border border-sp-border text-sm text-sp-text text-center focus:border-sp-accent focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl border border-red-500 bg-sp-card text-xs text-red-400 whitespace-pre-line">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* 로딩 */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-t-sp-accent border-sp-border rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">학급 시간표로 교사 시간표를 만드는 중...</p>
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
              <button
                type="button"
                onClick={() => {
                  setStep('setup');
                  setErrorMsg('');
                }}
                className="px-4 py-2 rounded-xl bg-sp-surface border border-sp-border text-sm font-medium text-sp-text hover:bg-sp-card transition-colors"
              >
                다시 설정
              </button>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-sp-border">
          <span className="text-xs text-sp-muted">
            {step === 'setup' && hasSchool && classes.length > 0 && (
              <>
                <strong className="font-bold text-sp-text">{selectedCount}</strong>개 수업 선택됨
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
            >
              {step === 'error' ? '닫기' : '취소'}
            </button>
            {step === 'setup' && hasSchool && classes.length > 0 && (
              <button
                type="button"
                onClick={() => void handleReconstruct()}
                disabled={selectedCount === 0}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sp-accent text-white text-sm font-bold hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">auto_fix_high</span>
                재조합하기
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
