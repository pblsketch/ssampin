import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { StudentGrid } from '@adapters/components/Homeroom/shared/StudentGrid';
import { ExportModal } from '@adapters/components/Homeroom/shared/ExportModal';
import type { ReadonlyModeProps } from '@adapters/components/Homeroom/shared/StudentGrid';
import type { Survey, SurveyResponse } from '@domain/entities/Survey';
import { getStudentResponseProgress } from '@domain/rules/surveyRules';
import type { SurveySupabaseClient, SurveyResponsePublic } from '@infrastructure/supabase/SurveySupabaseClient';

/* ──────────────── Props ──────────────── */

interface SurveyStudentDetailProps {
  survey: Survey;
  onBack: () => void;
  supabaseClient?: SurveySupabaseClient;
}

/* ──────────────── 컴포넌트 ──────────────── */

export function SurveyStudentDetail({ survey, onBack, supabaseClient }: SurveyStudentDetailProps) {
  const { students } = useStudentStore();
  const { archiveSurvey, deleteSurvey } = useSurveyStore();
  const showToast = useToastStore((s) => s.show);

  const [responses, setResponses] = useState<SurveyResponsePublic[]>([]);
  const [showExport, setShowExport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const stopPollingRef = useRef<(() => void) | null>(null);

  const totalStudents = useMemo(
    () => students.filter((s) => !s.isVacant).length,
    [students],
  );

  /* ── 온라인 상태 감시 ── */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /* ── Supabase에 설문이 없으면 자동 업로드 ── */
  useEffect(() => {
    if (!supabaseClient || !isOnline || !survey.adminKey) return;

    const ensureOnline = async () => {
      try {
        const existing = await supabaseClient.getSurvey(survey.id);
        if (!existing) {
          await supabaseClient.createSurvey({
            id: survey.id,
            title: survey.title,
            description: survey.description,
            mode: survey.mode,
            questions: survey.questions,
            dueDate: survey.dueDate,
            adminKey: survey.adminKey!,
            targetCount: survey.targetCount ?? 30,
          });
        }
      } catch {
        // 자동 업로드 실패는 무시 (다음에 재시도)
      }
    };
    void ensureOnline();
  }, [survey, supabaseClient, isOnline]);

  /* ── 폴링 (30초) ── */
  useEffect(() => {
    if (!supabaseClient || !isOnline) return;

    const stop = supabaseClient.startPolling(
      survey.id,
      (data) => setResponses(data),
      30_000,
    );
    stopPollingRef.current = stop;

    return () => {
      stop();
      stopPollingRef.current = null;
    };
  }, [survey.id, supabaseClient, isOnline]);

  /* ── 진행률 ── */
  const domainResponses: readonly SurveyResponse[] = useMemo(() => {
    return responses.map((r) => ({
      id: r.id,
      surveyId: r.surveyId,
      studentNumber: r.studentNumber,
      answers: r.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
      submittedAt: r.submittedAt,
    }));
  }, [responses]);

  const progress = getStudentResponseProgress(domainResponses, totalStudents);

  /* ── 학생 번호→이름 매핑 (로컬 명단) ── */
  const respondedMap = useMemo(() => {
    const map = new Map<string, string>();
    const nonVacant = students.filter((s) => !s.isVacant);
    const respondedNumbers = new Set(responses.map((r) => r.studentNumber));

    nonVacant.forEach((s, idx) => {
      const num = idx + 1;
      map.set(s.id, respondedNumbers.has(num) ? 'responded' : '');
    });
    return map;
  }, [students, responses]);

  /* ── 내보내기 데이터 (로컬 이름 매칭) ── */
  const exportData = useMemo(() => {
    const nonVacant = students.filter((s) => !s.isVacant);
    const columns = [
      { key: 'number', label: '번호' },
      { key: 'name', label: '이름' },
      ...survey.questions.map((q, i) => ({
        key: `q${i}`,
        label: `Q${i + 1}.${q.label}`,
      })),
      { key: 'submittedAt', label: '응답 시간' },
    ];

    const rows = nonVacant.map((s, idx) => {
      const num = idx + 1;
      const resp = responses.find((r) => r.studentNumber === num);
      const row: Record<string, string> = {
        number: String(num),
        name: s.name,
        submittedAt: resp ? new Date(resp.submittedAt).toLocaleString('ko-KR') : '-',
      };
      survey.questions.forEach((q, i) => {
        if (resp) {
          const ans = resp.answers.find((a) => a.questionId === q.id);
          row[`q${i}`] = ans ? String(ans.value) : '-';
        } else {
          row[`q${i}`] = '-';
        }
      });
      return row;
    });

    return { columns, rows };
  }, [survey, responses, students]);

  /* ── ReadonlyMode 설정 ── */
  const readonlyConfig = useMemo((): ReadonlyModeProps<string> => {
    return {
      mode: 'readonly',
      values: respondedMap,
      renderValue: (v) => (v === 'responded' ? '✓' : '(미응)'),
      valueStyle: (v) =>
        v === 'responded'
          ? 'bg-green-500/20 text-green-400'
          : 'bg-sp-surface text-sp-muted',
      renderSub: (studentId) => {
        const nonVacant = students.filter((s) => !s.isVacant);
        const idx = nonVacant.findIndex((s) => s.id === studentId);
        if (idx === -1) return undefined;
        const num = idx + 1;
        const resp = responses.find((r) => r.studentNumber === num);
        if (!resp) return undefined;
        const d = new Date(resp.submittedAt);
        return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      },
    };
  }, [respondedMap, students, responses]);

  /* ── 메뉴 핸들러 ── */
  const handleArchive = useCallback(async () => {
    await archiveSurvey(survey.id);
    showToast('보관 처리되었습니다', 'success');
    onBack();
  }, [archiveSurvey, survey.id, showToast, onBack]);

  const handleDelete = useCallback(async () => {
    await deleteSurvey(survey.id);
    showToast('삭제되었습니다', 'success');
    onBack();
  }, [deleteSurvey, survey.id, showToast, onBack]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="text-sp-muted hover:text-sp-text transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h3 className="text-sm font-bold text-sp-text truncate">{survey.title}</h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {survey.shareUrl && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-muted text-xs hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-sm">share</span>
              공유
            </button>
          )}
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-muted text-xs hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-sm">file_download</span>
            내보내기
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-lg">more_vert</span>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[120px]">
                  <button
                    onClick={() => { setShowMenu(false); void handleArchive(); }}
                    className="w-full text-left px-3 py-2 text-xs text-sp-text hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">archive</span>
                    보관
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); void handleDelete(); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 부제 */}
      <div className="text-xs text-sp-muted mb-3 flex items-center gap-2 flex-wrap">
        <span>📱 학생 응답</span>
        <span>·</span>
        <span>{progress.completed}/{progress.total}명 응답 ({progress.percentage}%)</span>
        {survey.dueDate && (
          <>
            <span>·</span>
            <span>마감 {survey.dueDate}</span>
          </>
        )}
      </div>

      {/* 오프라인 안내 */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3 text-xs text-amber-400 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">wifi_off</span>
          인터넷 연결이 필요합니다. 학생 응답 현황은 온라인에서만 확인할 수 있습니다.
        </div>
      )}

      {/* 응답 현황 그리드 */}
      <div className="flex-1 overflow-y-auto">
        <StudentGrid
          students={students}
          gridMode={readonlyConfig}
          columns={5}
          hideVacant
        />
      </div>

      {/* 하단 통계 */}
      <div className="mt-3 pt-3 border-t border-sp-border flex flex-wrap gap-3 text-xs text-sp-muted">
        <span>✓ 응답: <strong className="text-green-400">{progress.completed}명</strong></span>
        <span>미응답: <strong>{progress.total - progress.completed}명</strong></span>
      </div>

      {/* 공유 모달 (QR + 링크) */}
      {showShareModal && survey.shareUrl && (
        <ShareModal
          title={survey.title}
          url={survey.shareUrl}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* 내보내기 모달 */}
      {showExport && (
        <ExportModal
          title={`${survey.title} — 내보내기`}
          columns={exportData.columns}
          rows={exportData.rows}
          onClose={() => setShowExport(false)}
          fileName={survey.title}
        />
      )}
    </div>
  );
}

/* ──────────────── ShareModal (QR + 링크) ──────────────── */

interface ShareModalProps {
  title: string;
  url: string;
  onClose: () => void;
}

function ShareModal({ title, url, onClose }: ShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showToast = useToastStore((s) => s.show);

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
    link.download = `설문_QR_${title.slice(0, 20)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    showToast('QR 이미지가 저장되었습니다', 'success');
  }, [title, showToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent text-base">share</span>
            설문 공유
          </h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 flex flex-col items-center gap-4">
          <p className="text-xs text-sp-muted text-center">{title}</p>

          {/* QR 코드 */}
          <div className="bg-white rounded-xl p-3">
            <canvas ref={canvasRef} />
          </div>

          {/* 링크 */}
          <div className="w-full flex items-center gap-2 bg-sp-surface rounded-lg border border-sp-border px-3 py-2">
            <span className="material-symbols-outlined text-sm text-sp-muted">link</span>
            <span className="flex-1 text-xs text-sp-text truncate select-all">{url}</span>
            <button
              onClick={() => void handleCopyLink()}
              className="shrink-0 text-xs text-sp-accent hover:text-sp-accent/80 font-medium transition-colors"
            >
              복사
            </button>
          </div>

          {/* 버튼들 */}
          <div className="w-full grid grid-cols-2 gap-2">
            <button
              onClick={() => void handleCopyLink()}
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

          <p className="text-[10px] text-sp-muted/60 text-center">
            학생들에게 QR 코드를 보여주거나 링크를 공유하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
