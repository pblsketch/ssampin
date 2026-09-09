import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { Notice } from '@adapters/components/common/Notice';
import { describeAccessFailure } from '@domain/rules/consultationAccessReason';
import { StudentGrid } from '@adapters/components/Homeroom/shared/StudentGrid';
import { ExportModal } from '@adapters/components/Homeroom/shared/ExportModal';
import type { ReadonlyModeProps } from '@adapters/components/Homeroom/shared/StudentGrid';
import type { Survey, SurveyResponse, StudentPinMap } from '@domain/entities/Survey';
import { isStudentActive } from '@domain/rules/studentActivity';
import { numberActiveRoster } from '@domain/rules/rosterNumbering';
import type { Student } from '@domain/entities/Student';
import { getStudentResponseProgress } from '@domain/rules/surveyRules';
import type {
  SurveySupabaseClient,
  SurveyResponsePublic,
} from '@infrastructure/supabase/SurveySupabaseClient';
import { shortLinkClient } from '@adapters/di/container';

/* ──────────────── 타입 ──────────────── */

type StudentLike = {
  readonly id: string;
  readonly name: string;
  readonly isVacant?: boolean;
  readonly status?: Student['status'];
  /** 수업반 명단의 출석번호 */
  readonly number?: number;
  /** 담임 명렬표의 출석번호 */
  readonly studentNumber?: number;
};

/**
 * 명단 학생 → 실제 출석번호. 담임은 `studentNumber`, 수업반은 `number` 다.
 * ★배열 위치(`idx + 1`)를 쓰면 결번 뒤 학생이 남의 응답·PIN 을 받는다(2026-09-08 검토 D).
 */
function numberedActive(students: readonly StudentLike[]): (StudentLike & { _num: number })[] {
  return numberActiveRoster(students).map(({ student, number }) => ({ ...student, _num: number }));
}

/* ──────────────── Props ──────────────── */

interface SurveyStudentDetailProps {
  survey: Survey;
  onBack: () => void;
  supabaseClient?: SurveySupabaseClient;
  students?: readonly StudentLike[];
}

/* ──────────────── 컴포넌트 ──────────────── */

export function SurveyStudentDetail({
  survey,
  onBack,
  supabaseClient,
  students: studentsProp,
}: SurveyStudentDetailProps) {
  const storeStudents = useStudentStore((s) => s.students);
  const students = (studentsProp ?? storeStudents) as readonly StudentLike[];
  const { archiveSurvey, deleteSurvey } = useSurveyStore();
  const showToast = useToastStore((s) => s.show);

  const [responses, setResponses] = useState<SurveyResponsePublic[]>([]);
  /** 응답을 못 불러온 이유. null 이면 정상이다(ADR-095). */
  const [accessError, setAccessError] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const stopPollingRef = useRef<(() => void) | null>(null);

  const totalStudents = useMemo(() => students.filter(isStudentActive).length, [students]);

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

  /*
   * ── 자동 재업로드는 없앴다 (ADR-095) ──
   *
   * 예전에는 "서버에 설문이 없으면 로컬 관리 키로 다시 올리는" 자기 치유 효과가 있었다.
   * 이제 관리 키는 **서버가 발급한다.** 다시 올리면 서버에 새 키가 생겨서 기기에 있는
   * 키와 어긋나고, 그 순간부터 응답을 못 보게 된다.
   *
   * 애초에 이 상황이 생기지 않는다 — 만들기가 서버 먼저라, 서버가 실패하면 로컬에도
   * 저장되지 않는다. 서버에서 설문이 사라진 경우는 새로 만들어야 하는 상황이다.
   */

  /* ── 폴링 (30초) ── */
  useEffect(() => {
    // adminKey 는 응답 조회 RPC 의 인자다(마이그레이션 046). 없으면 폴링하지 않는다.
    if (!supabaseClient || !isOnline || !survey.adminKey) return;
    const adminKey = survey.adminKey;

    const stop = supabaseClient.startPolling(
      survey.id,
      adminKey,
      (data) => {
        setResponses(data);
        setAccessError(null);
      },
      30_000,
      // 거부는 빈 응답 목록이 아니라 문장으로 뜬다 — "아직 아무도 안 냈다"와
      // "볼 수 없다"는 선생님에게 완전히 다른 상황이다(수용 기준 #5, ADR-095).
      (e) => setAccessError(describeAccessFailure(e)),
    );
    stopPollingRef.current = stop;

    return () => {
      stop();
      stopPollingRef.current = null;
    };
  }, [survey.id, survey.adminKey, supabaseClient, isOnline]);

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
    const respondedNumbers = new Set(responses.map((r) => r.studentNumber));
    for (const s of numberedActive(students)) {
      map.set(s.id, respondedNumbers.has(s._num) ? 'responded' : '');
    }
    return map;
  }, [students, responses]);

  /* ── 내보내기 데이터 (로컬 이름 매칭) ── */
  const exportData = useMemo(() => {
    const nonVacant = numberedActive(students);
    const columns = [
      { key: 'number', label: '번호' },
      { key: 'name', label: '이름' },
      ...survey.questions.map((q, i) => ({
        key: `q${i}`,
        label: `Q${i + 1}.${q.label}`,
      })),
      { key: 'submittedAt', label: '응답 시간' },
    ];

    const rows = nonVacant.map((s) => {
      const num = s._num;
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
  const numberById = useMemo(
    () => new Map(numberedActive(students).map((s) => [s.id, s._num])),
    [students],
  );
  const readonlyConfig = useMemo((): ReadonlyModeProps<string> => {
    return {
      mode: 'readonly',
      values: respondedMap,
      renderValue: (v) => (v === 'responded' ? '✓' : '(미응)'),
      valueStyle: (v) =>
        v === 'responded' ? 'bg-green-500/20 text-green-400' : 'bg-sp-surface text-sp-muted',
      renderSub: (studentId) => {
        const num = numberById.get(studentId);
        if (num === undefined) return undefined;
        const resp = responses.find((r) => r.studentNumber === num);
        if (!resp) return undefined;
        const d = new Date(resp.submittedAt);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${mm}/${dd} ${hh}:${mi}`;
      },
    };
  }, [respondedMap, numberById, responses]);

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
      {accessError && (
        <div className="mb-3">
          <Notice variant="warning" title="응답을 불러오지 못했습니다">
            {accessError}
          </Notice>
        </div>
      )}
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
          {survey.pinProtection && survey.studentPins && (
            <button
              onClick={() => setShowPinModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">pin</span>
              PIN 확인
            </button>
          )}
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
                <div
                  data-sp-floating
                  className="absolute right-0 top-full mt-1 z-50 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[120px]"
                >
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      void handleArchive();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-sp-text hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">archive</span>
                    보관
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      void handleDelete();
                    }}
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
        <span>
          {progress.completed}/{progress.total}명 응답 ({progress.percentage}%)
        </span>
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
        <StudentGrid students={students} gridMode={readonlyConfig} columns={5} hideVacant />
      </div>

      {/* 하단 통계 */}
      <div className="mt-3 pt-3 border-t border-sp-border flex flex-wrap gap-3 text-xs text-sp-muted">
        <span>
          ✓ 응답: <strong className="text-green-400">{progress.completed}명</strong>
        </span>
        <span>
          미응답: <strong>{progress.total - progress.completed}명</strong>
        </span>
      </div>

      {/* PIN 확인/인쇄 모달 */}
      {showPinModal && survey.pinProtection && survey.studentPins && (
        <PinListModal
          studentPins={survey.studentPins}
          students={students}
          surveyTitle={survey.title}
          onClose={() => setShowPinModal(false)}
        />
      )}

      {/* 공유 모달 (QR + 링크) */}
      {showShareModal && survey.shareUrl && (
        <ShareModal
          title={survey.title}
          url={survey.shortUrl ?? survey.shareUrl}
          survey={survey}
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

/* ──────────────── PinListModal ──────────────── */

function PinListModal({
  studentPins,
  students,
  surveyTitle,
  onClose,
}: {
  studentPins: StudentPinMap;
  students: readonly StudentLike[];
  surveyTitle: string;
  onClose: () => void;
}) {
  const nonVacant = numberedActive(students);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-base">pin</span>
            PIN 목록
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">print</span>
              인쇄
            </button>
            <button
              onClick={onClose}
              className="text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* 테이블 (스크린 표시) */}
        <div className="flex-1 overflow-y-auto p-4 print:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-sp-muted text-xs">
                <th className="text-left pb-2 font-medium">번호</th>
                <th className="text-left pb-2 font-medium">이름</th>
                <th className="text-center pb-2 font-medium">PIN</th>
              </tr>
            </thead>
            <tbody>
              {nonVacant.map((student) => {
                const pin = studentPins[student._num] ?? '-';
                return (
                  <tr key={student.id} className="border-t border-sp-border/50">
                    <td className="py-2 text-sp-muted">{student._num}</td>
                    <td className="py-2 text-sp-text">{student.name}</td>
                    <td className="py-2 text-center font-mono text-sp-accent font-bold tracking-widest">
                      {pin}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 인쇄용 레이아웃 (화면에서는 숨김) */}
        <div className="hidden print:block p-4">
          <h2 className="text-base font-bold text-center mb-4">{surveyTitle} — PIN 코드</h2>
          <div className="grid grid-cols-3 gap-3">
            {nonVacant.map((student) => {
              const pin = studentPins[student._num] ?? '-';
              return (
                <div key={student.id} className="border border-gray-300 rounded-lg p-3 text-center">
                  <p className="text-sm font-bold">
                    {student._num}번 {student.name}
                  </p>
                  <p className="text-2xl font-mono font-bold mt-1 tracking-widest">{pin}</p>
                  <p className="text-xs text-gray-400 mt-1">설문 PIN 코드</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 안내 */}
        <div className="p-3 border-t border-sp-border text-center shrink-0 print:hidden">
          <p className="text-caption text-sp-muted/60">
            인쇄 후 잘라서 학생들에게 개별 배부하세요. PIN은 이 설문에서만 유효합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── ShareModal (QR + 링크) ──────────────── */

interface ShareModalProps {
  title: string;
  url: string;
  survey: Survey;
  onClose: () => void;
}

function ShareModal({ title, url: initialUrl, survey, onClose }: ShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showToast = useToastStore((s) => s.show);
  const [url, setUrl] = useState(initialUrl);

  // shortUrl이 없으면 조회/생성 시도
  useEffect(() => {
    if (survey.shortUrl || !survey.shareUrl) return;
    let cancelled = false;
    shortLinkClient
      .createShortLink(survey.shareUrl)
      .then((result) => {
        if (cancelled || result === survey.shareUrl) return;
        setUrl(result);
        void useSurveyStore.getState().updateSurvey({ ...survey, shortUrl: result });
      })
      .catch(() => {
        /* 네트워크 실패는 무시 */
      });
    return () => {
      cancelled = true;
    };
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
    link.download = `설문_QR_${title.slice(0, 20)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    showToast('QR 이미지가 저장되었습니다', 'success');
  }, [title, showToast]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
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

          <p className="text-caption text-sp-muted/60 text-center">
            학생들에게 QR 코드를 보여주거나 링크를 공유하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
