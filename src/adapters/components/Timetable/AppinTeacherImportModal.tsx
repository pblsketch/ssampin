import { useState, useEffect, useCallback } from 'react';
import { appinPort } from '@adapters/di/container';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import {
  AppinError,
  getAppinErrorMessage,
  type AppinSchool,
} from '@domain/entities/AppinTimetable';
import {
  parseGrid,
  buildTeacherScheduleFromAppin,
  countWeekFiles,
  currentWeekByModified,
  estimateWeekFromDate,
  weekFileName,
} from '@domain/rules/appinRules';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { toLocalDateString, endOfLocalDayIso } from '@shared/utils/localDate';
import { AppinSchoolSearch } from './AppinSchoolSearch';

interface AppinTeacherImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 교사 시간표 적용 — 부모가 미리보기(TeacherExcelPreviewModal)로 합류시킨다. */
  onImport: (schedule: TeacherScheduleData) => void;
}

type WizardStep = 'school' | 'teacherNo' | 'loading' | 'error';

export function AppinTeacherImportModal({
  isOpen,
  onClose,
  onImport,
}: AppinTeacherImportModalProps) {
  const updateSettings = useSettingsStore((s) => s.update);
  const [school, setSchool] = useState<AppinSchool | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [teacherCount, setTeacherCount] = useState<number | null>(null);
  const [teacherNo, setTeacherNo] = useState('');

  const [step, setStep] = useState<WizardStep>('school');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep('school');
    setSchool(null);
    setWeek(null);
    setTeacherCount(null);
    setTeacherNo('');
    setErrorMsg('');
  }, [isOpen]);

  const handleSchoolResolved = useCallback(async (found: AppinSchool) => {
    setStep('loading');
    setErrorMsg('');
    try {
      const [ele, files] = await Promise.all([
        appinPort.getElements(found.webdir),
        appinPort.listFiles(found.webdir),
      ]);
      const total = countWeekFiles(files);
      const now = new Date();
      const anchorWeek = estimateWeekFromDate(found.date, total, now) ?? undefined;
      const resolvedWeek =
        currentWeekByModified(files, endOfLocalDayIso(now), anchorWeek) ??
        anchorWeek ??
        (total > 0 ? total : 1);
      setSchool(found);
      setWeek(resolvedWeek);
      setTeacherCount(ele.teacherNumbers.length);
      setStep('teacherNo');
    } catch (e) {
      setErrorMsg(
        e instanceof AppinError
          ? getAppinErrorMessage(e.errorType)
          : getAppinErrorMessage('NETWORK_ERROR'),
      );
      setStep('error');
    }
  }, []);

  const applyImport = useCallback(async () => {
    if (!school || week == null) return;
    const num = Number(teacherNo);
    if (!Number.isInteger(num) || num < 1) {
      setErrorMsg('교사 번호를 1 이상의 숫자로 입력해주세요.');
      return;
    }
    if (teacherCount != null && num > teacherCount) {
      setErrorMsg(`이 학교의 교사 번호는 1~${teacherCount} 범위예요.`);
      return;
    }
    setStep('loading');
    try {
      // 교사 시간표는 g파일(교차검증 확정 — t는 특별실)
      const text = await appinPort.getWeekFileText(school.webdir, weekFileName('g', week));
      const grids = parseGrid(text);
      const dayGrid = grids[num - 1];
      const hasContent = dayGrid && dayGrid.some((day) => day.some((cell) => cell !== null));
      if (!dayGrid || !hasContent) {
        setErrorMsg(
          '그 번호의 교사 시간표가 압핀에 없어요.\n번호를 다시 확인하거나, 이 학교가 압핀에 교사 시간표를 올리지 않았을 수 있어요.',
        );
        setStep('error');
        return;
      }
      const { schedule } = buildTeacherScheduleFromAppin(dayGrid);
      // 자동 변경감지용 설정 저장(교사 대상)
      await updateSettings({
        appin: {
          autoSync: {
            enabled: true,
            webdir: school.webdir,
            schoolName: school.name,
            city: school.city,
            ...(school.date ? { date: school.date } : {}),
            target: 'teacher',
            teacherNo: num,
            autoApply: false,
            lastSyncDate: toLocalDateString(),
          },
        },
      });
      onImport(schedule);
    } catch (e) {
      setErrorMsg(
        e instanceof AppinError
          ? getAppinErrorMessage(e.errorType)
          : getAppinErrorMessage('NETWORK_ERROR'),
      );
      setStep('error');
    }
  }, [school, week, teacherNo, teacherCount, onImport, updateSettings]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="압핀 교사 시간표 불러오기"
      srOnlyTitle
      size="lg"
    >
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-border">
          <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">download</span>
            압핀에서 교사 시간표 불러오기
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: 학교 검색 */}
          {step === 'school' && (
            <AppinSchoolSearch
              onResolved={(found) => void handleSchoolResolved(found)}
              note={
                <div className="p-3 bg-sp-surface rounded-xl border border-sp-border text-xs text-sp-muted space-y-1">
                  <p className="font-semibold text-sp-text">참고</p>
                  <p>
                    압핀 교사 시간표는 학교가 압핀에 올려둔 경우에만 불러올 수 있어요. 학교를 고른
                    뒤 압핀에서 쓰는 <span className="font-semibold">교사 번호</span>를 입력하면
                    돼요.
                  </p>
                </div>
              }
            />
          )}

          {/* Step 2: 교사 번호 입력 */}
          {step === 'teacherNo' && (
            <div className="space-y-4">
              <div className="p-3 bg-sp-surface border border-sp-border rounded-xl text-xs text-sp-muted">
                <span className="font-semibold text-sp-text">{school?.name}</span>에서 사용하는
                본인의 교사 번호를 입력하세요.
                {week != null && <span className="ml-1">(현재 {week}주차)</span>}
                {teacherCount != null && teacherCount > 0 && (
                  <span className="ml-1">· 교사 번호 1~{teacherCount}</span>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sp-muted">교사 번호</label>
                <input
                  type="number"
                  min={1}
                  value={teacherNo}
                  onChange={(e) => setTeacherNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void applyImport();
                  }}
                  placeholder="예: 12"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl bg-sp-surface border border-sp-border text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent"
                />
                <p className="text-xs text-sp-muted">
                  교사 번호는 압핀 앱 설정에서 확인할 수 있어요.
                </p>
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-3 border-sp-border border-t-sp-accent rounded-full animate-spin" />
              <p className="text-sm text-sp-muted">교사 시간표를 불러오는 중...</p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
              </div>
              <p className="text-sm text-sp-text text-center px-4 whitespace-pre-line">
                {errorMsg}
              </p>
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

        <div className="flex items-center justify-between px-6 py-4 border-t border-sp-border">
          <div>
            {step === 'teacherNo' && (
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
            {step === 'teacherNo' ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-sp-border text-sm text-sp-muted hover:text-sp-text transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => void applyImport()}
                  disabled={teacherNo.trim() === ''}
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
      </div>
    </Modal>
  );
}
