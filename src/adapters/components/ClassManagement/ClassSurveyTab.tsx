import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import {
  getActiveSurveys,
  getArchivedSurveys,
  getTeacherCheckProgress,
  getStudentResponseProgress,
} from '@domain/rules/surveyRules';
import type { Survey } from '@domain/entities/Survey';
import { SurveyCreateModal } from '@adapters/components/Homeroom/Survey/SurveyCreateModal';
import { SurveyDetail } from '@adapters/components/Homeroom/Survey/SurveyDetail';
import { SurveyStudentDetail } from '@adapters/components/Homeroom/Survey/SurveyStudentDetail';
import { useToastStore } from '@adapters/components/common/Toast';
import { surveySupabaseClient, shortLinkClient } from '@adapters/di/container';

/* ──────────────── 색상 매핑 ──────────────── */

const COLOR_MAP: Record<string, { bg: string; dot: string; bar: string }> = {
  blue:   { bg: 'bg-blue-500/10',   dot: 'bg-blue-400',   bar: 'bg-blue-400' },
  green:  { bg: 'bg-green-500/10',  dot: 'bg-green-400',  bar: 'bg-green-400' },
  yellow: { bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', bar: 'bg-yellow-400' },
  purple: { bg: 'bg-purple-500/10', dot: 'bg-purple-400', bar: 'bg-purple-400' },
  red:    { bg: 'bg-red-500/10',    dot: 'bg-red-400',    bar: 'bg-red-400' },
  pink:   { bg: 'bg-pink-500/10',   dot: 'bg-pink-400',   bar: 'bg-pink-400' },
  indigo: { bg: 'bg-indigo-500/10', dot: 'bg-indigo-400', bar: 'bg-indigo-400' },
  teal:   { bg: 'bg-teal-500/10',   dot: 'bg-teal-400',   bar: 'bg-teal-400' },
};

function getColor(color: string) {
  return COLOR_MAP[color] ?? COLOR_MAP.blue!;
}

/* ──────────────── SurveyShareModal ──────────────── */

interface SurveyShareModalProps {
  survey: Survey;
  onClose: () => void;
}

function SurveyShareModal({ survey, onClose }: SurveyShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showToast = useToastStore((s) => s.show);
  const [url, setUrl] = useState(survey.shortUrl ?? survey.shareUrl ?? '');

  useEffect(() => {
    if (survey.shortUrl || !survey.shareUrl) return;
    let cancelled = false;
    shortLinkClient.createShortLink(survey.shareUrl).then((result) => {
      if (cancelled || result === survey.shareUrl) return;
      setUrl(result);
      void useSurveyStore.getState().updateSurvey({ ...survey, shortUrl: result });
    }).catch(() => { /* 네트워크 실패 무시 */ });
    return () => { cancelled = true; };
  }, [survey]);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      color: { dark: '#1a2332', light: '#ffffff' },
    });
  }, [url]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크가 복사되었습니다', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('링크가 복사되었습니다', 'success');
    }
  }, [url, showToast]);

  const handleDownloadQR = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `설문_QR_${survey.title.slice(0, 20)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    showToast('QR 이미지가 저장되었습니다', 'success');
  }, [survey.title, showToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <h3 className="text-sm font-bold text-sp-text">설문 공유</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          <p className="text-xs text-sp-muted text-center">{survey.title}</p>
          <div className="bg-white rounded-xl p-3">
            <canvas ref={canvasRef} />
          </div>
          <div className="w-full flex items-center gap-2 bg-sp-surface rounded-lg border border-sp-border px-3 py-2">
            <span className="material-symbols-outlined text-sm text-sp-muted">link</span>
            <span className="flex-1 text-xs text-sp-text truncate select-all">{url}</span>
            <button
              onClick={handleCopyLink}
              className="shrink-0 text-xs text-sp-accent hover:text-sp-accent/80 font-medium transition-colors"
            >
              복사
            </button>
          </div>
          <div className="w-full grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              링크 복사
            </button>
            <button
              onClick={handleDownloadQR}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent/50 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              QR 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── SurveyCopyModal ──────────────── */

interface SurveyCopyModalProps {
  survey: Survey;
  currentClassId: string;
  onClose: () => void;
}

function SurveyCopyModal({ survey, currentClassId, onClose }: SurveyCopyModalProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const duplicateSurvey = useSurveyStore((s) => s.duplicateSurvey);
  const showToast = useToastStore((s) => s.show);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const targets = useMemo(
    () => classes.filter((c) => c.id !== currentClassId),
    [classes, currentClassId],
  );

  const handleCopy = useCallback(
    async (targetClassId: string, targetCount: number) => {
      if (copyingId) return;
      setCopyingId(targetClassId);
      try {
        await duplicateSurvey(survey.id, targetClassId, targetCount);
        showToast('다른 반으로 복사했습니다', 'success');
        onClose();
      } catch {
        showToast('복사에 실패했습니다', 'error');
        setCopyingId(null);
      }
    },
    [copyingId, duplicateSurvey, survey.id, showToast, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-sm mx-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <div>
            <h3 className="text-sm font-bold text-sp-text">다른 반에 복사</h3>
            <p className="text-xs text-sp-muted mt-0.5 truncate">{survey.title}</p>
          </div>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {targets.length === 0 ? (
            <div className="py-8 text-center text-sp-muted text-xs">
              복사할 수 있는 다른 수업반이 없습니다
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {targets.map((c) => {
                const activeCount = c.students.filter(
                  (st) => !st.isVacant && (st.status ?? 'active') === 'active',
                ).length;
                const isCopying = copyingId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleCopy(c.id, activeCount)}
                    disabled={copyingId !== null || activeCount === 0}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border hover:border-sp-accent/50 hover:bg-sp-surface/80 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-sp-text font-medium truncate">{c.name}</p>
                      <p className="text-xs text-sp-muted mt-0.5 truncate">
                        {c.subject} · {activeCount}명
                      </p>
                    </div>
                    {isCopying ? (
                      <span className="text-xs text-sp-accent shrink-0 ml-2">복사 중...</span>
                    ) : (
                      <span className="material-symbols-outlined text-base text-sp-muted shrink-0 ml-2">
                        arrow_forward
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-sp-border shrink-0">
          <p className="text-caption text-sp-muted">
            질문·설정은 그대로 복사되며, 응답 데이터는 복사되지 않습니다. 학생 응답 모드는 새 공유 링크와 PIN이 생성됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── ClassSurveyCard ──────────────── */

interface ClassSurveyCardProps {
  survey: Survey;
  totalStudents: number;
  onSelect: (id: string) => void;
  onShare: (survey: Survey) => void;
  onCopy: (survey: Survey) => void;
}

function ClassSurveyCard({ survey, totalStudents, onSelect, onShare, onCopy }: ClassSurveyCardProps) {
  const localData = useSurveyStore((s) => s.getLocalData(survey.id));
  const color = getColor(survey.categoryColor);
  const progress = survey.mode === 'teacher'
    ? getTeacherCheckProgress(survey, localData, totalStudents)
    : getStudentResponseProgress([], totalStudents);

  const modeIcon = survey.mode === 'teacher' ? '✏️' : '📱';
  const modeLabelText = survey.mode === 'teacher' ? '교사 체크' : '학생 응답';

  const questionTypes = survey.questions
    .map((q) => {
      if (q.type === 'yesno') return '○/×';
      if (q.type === 'choice') return '선택형';
      return '텍스트';
    })
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(survey.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(survey.id); }}
      className={`w-full text-left rounded-xl border border-sp-border p-4 transition-all hover:border-sp-accent/50 hover:shadow-lg cursor-pointer ${color.bg}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${color.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-sp-text truncate">{survey.title}</h4>
            <span className="text-xs text-sp-muted whitespace-nowrap">
              {progress.completed}/{progress.total}명
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-sp-muted">
            <span>{modeIcon} {modeLabelText}</span>
            <span>·</span>
            <span>{questionTypes}</span>
            {survey.dueDate && (
              <>
                <span>·</span>
                <span>마감 {survey.dueDate.slice(5).replace('-', '/')}</span>
              </>
            )}
          </div>

          {/* 진행률 바 */}
          <div className="mt-2.5 h-1.5 bg-sp-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${color.bar}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="text-caption text-sp-muted mt-1 text-right">
            {progress.percentage}%
          </div>

          {/* 액션 버튼 (공유 / 복사) */}
          <div className="mt-2 flex items-center gap-3">
            {survey.mode === 'student' && survey.shareUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(survey);
                }}
                className="text-detail text-sp-accent hover:text-sp-accent/80 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">share</span>
                공유 (링크 + QR)
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(survey);
              }}
              className="text-detail text-sp-muted hover:text-sp-text transition-colors flex items-center gap-1"
              title="다른 반에 복사"
            >
              <span className="material-symbols-outlined text-xs">content_copy</span>
              다른 반에 복사
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── ClassSurveyTab ──────────────── */

interface ClassSurveyTabProps {
  classId: string;
}

export function ClassSurveyTab({ classId }: ClassSurveyTabProps) {
  const { surveys, loaded, load } = useSurveyStore();
  const classes = useTeachingClassStore((s) => s.classes);

  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [shareSurvey, setShareSurvey] = useState<Survey | null>(null);
  const [copySurvey, setCopySurvey] = useState<Survey | null>(null);

  const handleShare = useCallback((survey: Survey) => {
    setShareSurvey(survey);
  }, []);

  const handleCopy = useCallback((survey: Survey) => {
    setCopySurvey(survey);
  }, []);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // 학급 학생 목록
  const currentClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId],
  );
  const classStudents = currentClass?.students ?? [];

  // SurveyDetail 호환 형식으로 변환
  const studentLikes = useMemo(
    () =>
      classStudents
        .filter((s) => !s.isVacant)
        .map((s) => ({
          id: studentKey(s),
          name: s.name,
          isVacant: s.isVacant,
        })),
    [classStudents],
  );

  const totalStudents = studentLikes.length;

  // 이 학급의 설문만 필터
  const classSurveys = useMemo(
    () => surveys.filter((s) => s.classId === classId),
    [surveys, classId],
  );
  const activeSurveys = useMemo(() => getActiveSurveys(classSurveys), [classSurveys]);
  const archivedSurveys = useMemo(() => getArchivedSurveys(classSurveys), [classSurveys]);

  const handleSelect = useCallback((id: string) => {
    setSelectedSurveyId(id);
    setView('detail');
  }, []);

  const handleBack = useCallback(() => {
    setView('list');
    setSelectedSurveyId(null);
  }, []);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sp-muted text-sm">불러오는 중...</p>
      </div>
    );
  }

  /* 상세 화면 */
  if (view === 'detail' && selectedSurveyId) {
    const survey = classSurveys.find((s) => s.id === selectedSurveyId);
    if (survey?.mode === 'teacher') {
      return (
        <SurveyDetail
          survey={survey}
          onBack={handleBack}
          students={studentLikes}
        />
      );
    }
    if (survey?.mode === 'student') {
      return (
        <SurveyStudentDetail
          survey={survey}
          onBack={handleBack}
          supabaseClient={surveySupabaseClient}
          students={studentLikes}
        />
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">checklist</span>
          설문/체크리스트
          {activeSurveys.length > 0 && (
            <span className="text-sp-muted font-normal">({activeSurveys.length}개)</span>
          )}
        </h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새로 만들기
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {activeSurveys.length === 0 && archivedSurveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sp-muted">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-medium">아직 설문이 없습니다</p>
            <p className="text-xs">&quot;새로 만들기&quot; 버튼으로 설문을 만들어보세요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 진행 중 */}
            {activeSurveys.length > 0 && (
              <>
                <p className="text-xs text-sp-muted font-medium px-1">
                  진행 중 ({activeSurveys.length})
                </p>
                {activeSurveys.map((s) => (
                  <ClassSurveyCard
                    key={s.id}
                    survey={s}
                    totalStudents={totalStudents}
                    onSelect={handleSelect}
                    onShare={handleShare}
                    onCopy={handleCopy}
                  />
                ))}
              </>
            )}

            {/* 완료/보관 */}
            {archivedSurveys.length > 0 && (
              <>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors px-1 mt-2"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showArchived ? 'expand_less' : 'expand_more'}
                  </span>
                  완료/보관 ({archivedSurveys.length})
                </button>
                {showArchived && archivedSurveys.map((s) => (
                  <ClassSurveyCard
                    key={s.id}
                    survey={s}
                    totalStudents={totalStudents}
                    onSelect={handleSelect}
                    onShare={handleShare}
                    onCopy={handleCopy}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <SurveyCreateModal
          onClose={() => setShowCreateModal(false)}
          classId={classId}
          targetCount={totalStudents}
        />
      )}

      {shareSurvey && (
        <SurveyShareModal survey={shareSurvey} onClose={() => setShareSurvey(null)} />
      )}

      {copySurvey && (
        <SurveyCopyModal
          survey={copySurvey}
          currentClassId={classId}
          onClose={() => setCopySurvey(null)}
        />
      )}
    </div>
  );
}
