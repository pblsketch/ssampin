import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { surveySupabaseClient } from '@adapters/di/container';
import {
  getActiveSurveys,
  getArchivedSurveys,
  getTeacherCheckProgress,
  getStudentResponseProgress,
} from '@domain/rules/surveyRules';
import type { Survey } from '@domain/entities/Survey';
import { SurveyCreateModal } from './SurveyCreateModal';
import { SurveyDetail } from './SurveyDetail';
import { SurveyStudentDetail } from './SurveyStudentDetail';

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
  const url = survey.shortUrl ?? survey.shareUrl ?? '';

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
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <h3 className="text-sm font-bold text-sp-text">설문 공유</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 flex flex-col items-center gap-4">
          <p className="text-xs text-sp-muted text-center">{survey.title}</p>

          {/* QR 코드 */}
          <div className="bg-white rounded-xl p-3">
            <canvas ref={canvasRef} />
          </div>

          {/* 링크 */}
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

          {/* 버튼들 */}
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

/* ──────────────── SurveyCard ──────────────── */

interface SurveyCardProps {
  survey: Survey;
  totalStudents: number;
  onSelect: (id: string) => void;
  onShare: (survey: Survey) => void;
}

function SurveyCard({ survey, totalStudents, onSelect, onShare }: SurveyCardProps) {
  const localData = useSurveyStore((s) => s.getLocalData(survey.id));
  const color = getColor(survey.categoryColor);

  const progress = survey.mode === 'teacher'
    ? getTeacherCheckProgress(survey, localData, totalStudents)
    : getStudentResponseProgress([], totalStudents);

  const modeLabel = survey.mode === 'teacher' ? '✏️ 교사 체크' : '📱 학생 응답';
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
            <span>{modeLabel}</span>
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
          <div className="text-[10px] text-sp-muted mt-1 text-right">
            {progress.percentage}%
          </div>

          {/* 학생 응답 모드 → 공유 버튼 (링크 + QR) */}
          {survey.mode === 'student' && survey.shareUrl && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(survey);
                }}
                className="text-[11px] text-sp-accent hover:text-sp-accent/80 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">share</span>
                공유 (링크 + QR)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────── SurveyTab ──────────────── */

export function SurveyTab() {
  const { surveys, loaded, load } = useSurveyStore();
  const { students, load: loadStudents, loaded: studentsLoaded } = useStudentStore();
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [shareSurvey, setShareSurvey] = useState<Survey | null>(null);

  useEffect(() => {
    if (!loaded) void load();
    if (!studentsLoaded) void loadStudents();
  }, [loaded, load, studentsLoaded, loadStudents]);

  const activeSurveys = useMemo(() => getActiveSurveys(surveys), [surveys]);
  const archivedSurveys = useMemo(() => getArchivedSurveys(surveys), [surveys]);

  const totalStudents = useMemo(
    () => students.filter((s) => !s.isVacant).length,
    [students],
  );

  const handleSelect = (id: string) => {
    setSelectedSurveyId(id);
    setView('detail');
  };

  const handleShare = useCallback((survey: Survey) => {
    setShareSurvey(survey);
  }, []);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sp-muted text-sm">불러오는 중...</p>
      </div>
    );
  }

  /* 상세 화면 (교사 체크 모드) */
  if (view === 'detail' && selectedSurveyId) {
    const survey = surveys.find((s) => s.id === selectedSurveyId);
    const handleBack = () => { setView('list'); setSelectedSurveyId(null); };
    if (survey?.mode === 'teacher') {
      return <SurveyDetail survey={survey} onBack={handleBack} />;
    }
    if (survey?.mode === 'student') {
      return <SurveyStudentDetail survey={survey} onBack={handleBack} supabaseClient={surveySupabaseClient} />;
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
            <p className="text-xs">위의 &quot;새로 만들기&quot; 버튼으로 첫 설문을 만들어보세요</p>
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
                  <SurveyCard
                    key={s.id}
                    survey={s}
                    totalStudents={totalStudents}
                    onSelect={handleSelect}
                    onShare={handleShare}
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
                  <SurveyCard
                    key={s.id}
                    survey={s}
                    totalStudents={totalStudents}
                    onSelect={handleSelect}
                    onShare={handleShare}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <SurveyCreateModal onClose={() => setShowCreateModal(false)} />
      )}

      {shareSurvey && (
        <SurveyShareModal survey={shareSurvey} onClose={() => setShareSurvey(null)} />
      )}
    </div>
  );
}
