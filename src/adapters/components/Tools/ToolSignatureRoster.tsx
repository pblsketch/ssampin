/**
 * 서명받기 교사 도구 — 명단에 QR로 서명을 받아 구글시트/Excel 등록부로 내보낸다.
 *
 * 5단계 마법사 플로우:
 *   ① 기본 정보 (제목·머리말)
 *   ② 명단 구성 (담임반·수업반·라이브러리·CSV·붙여넣기 + 열 편집 + 명단 표)
 *   ③ 공개 설정 (요약 확인 + 신뢰 모델 → 서명 페이지 공개)
 *   ④ 공유·현황 (QR/링크 + 실시간 현황 보드)
 *   ⑤ 등록부 생성 (구글시트·Excel)
 *
 * 진행 중 세션은 useSignatureRosterStore가 localStorage에 영속하므로
 * 도구를 나갔다 오거나 앱을 재시작해도 ④~⑤단계를 이어서 진행할 수 있다.
 *
 * 의존성 역전: 컴포넌트는 SupabaseClient/Google을 직접 import하지 않는다.
 *  - 세션 공개:  container.publishSignatureSession
 *  - 현황 폴링:  container.submitMonitorSignature (10초)
 *  - 시트 내보내기: container.createExportRegisterToSheet (교사 OAuth accessToken 주입)
 *  - 세션 삭제:  container.signaturePort.deleteSession
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ToolLayout } from './ToolLayout';
import { buildSignaturePublicUrl } from '../../../signature/signaturePublicUrl';
import { SIGNATURE_LEGAL_DISCLAIMER } from '../../../signature/signatureLegalCopy';
import type { ColumnDef, ColumnType, RosterMember } from '@domain/entities/SignatureRoster';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { TrustMode } from '@domain/entities/SignatureSession';
import { isStudentActive } from '@domain/rules/studentActivity';
/* eslint-disable no-restricted-imports */
import { exportRegisterToExcel } from '@infrastructure/export/ExportRegisterToExcel';
/* eslint-enable no-restricted-imports */
import {
  authenticateGoogle,
  createExportRegisterToSheet,
  publishSignatureSession,
  signaturePort,
  submitMonitorSignature,
} from '@adapters/di/container';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import {
  useSignatureRosterStore,
  type SavedSignatureRoster,
} from '@adapters/stores/useSignatureRosterStore';
import {
  buildExcelRows,
  buildRosterTemplateCsv,
  buildSheetRows,
  classStudentsToMembers,
  getOwnerTeacherId,
  parseRosterGrid,
  teachingClassToMembers,
  type ApplyImportResult,
  type ParsedRosterGrid,
} from './SignatureRoster/signatureRosterLogic';
import { RosterImportMapping } from './SignatureRoster/RosterImportMapping';
import { RosterTable } from './SignatureRoster/RosterTable';
import {
  ExportPanel,
  SharePanel,
  type SignatureRetentionPreset,
} from './SignatureRoster/SessionPanels';
import { Notice } from '@adapters/components/common/Notice';

// 순수 로직 재export — 기존 단위 테스트(ToolSignatureRoster.signatureMapping.test.ts) 호환.
export {
  buildExcelRows,
  buildRosterTemplateCsv,
  buildSheetRows,
  parseCsvLine,
  parsePastedRoster,
  rosterInputColumns,
} from './SignatureRoster/signatureRosterLogic';

interface ToolSignatureRosterProps {
  readonly onBack: () => void;
  readonly isFullscreen: boolean;
}

type WizardStep = 'info' | 'roster' | 'options' | 'share' | 'export';
type SetupStep = Extract<WizardStep, 'info' | 'roster' | 'options'>;
type SessionView = Extract<WizardStep, 'share' | 'export'>;

const WIZARD_STEPS: Array<{
  readonly id: WizardStep;
  readonly label: string;
  readonly description: string;
}> = [
  { id: 'info', label: '기본 정보', description: '제목·안내 문구를 정해요' },
  { id: 'roster', label: '명단 구성', description: '서명 받을 사람을 모아요' },
  { id: 'options', label: '공개 설정', description: '확인 후 서명 페이지를 열어요' },
  { id: 'share', label: '공유·현황', description: 'QR 공유, 실시간 현황 확인' },
  { id: 'export', label: '등록부 생성', description: '구글시트·Excel로 내보내요' },
];

/** 기본 열 — 연번·소속·이름·서명·서명일시 */
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'no', label: '연번', type: 'number', builtin: true, order: 0 },
  { key: 'affiliation', label: '소속', type: 'text', builtin: true, order: 1 },
  { key: 'name', label: '이름', type: 'text', builtin: true, order: 2 },
  { key: 'signature', label: '서명', type: 'signature', builtin: true, order: 3 },
  { key: 'signedAt', label: '서명일시', type: 'datetime', builtin: true, order: 4 },
];

const COLUMN_TYPE_OPTIONS: Array<{ readonly value: ColumnType; readonly label: string }> = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'datetime', label: '일시' },
  { value: 'signature', label: '서명' },
];

/** 임포트 미리보기 대기 상태 (붙여넣기/CSV → 매핑 확인) */
interface PendingImport {
  readonly grid: ParsedRosterGrid;
  readonly sourceLabel: string;
}

export function ToolSignatureRoster({ onBack, isFullscreen }: ToolSignatureRosterProps) {
  // 진행 중 세션이 영속돼 있으면 그 스냅샷으로 초기화 (도구 재진입·앱 재시작 대응).
  // getState()는 useState 초기값 계산에만 쓰고, 이후 로직은 구독값(activeSession)을 쓴다.
  const [initialSession] = useState(() => useSignatureRosterStore.getState().activeSession);

  // ── 마법사 단계 ──
  const [setupStep, setSetupStep] = useState<SetupStep>('info');
  const [sessionView, setSessionView] = useState<SessionView>('share');

  // ── setup 상태 ──
  const [title, setTitle] = useState(() => initialSession?.title ?? '서명 등록부');
  const [headerText, setHeaderText] = useState(() => initialSession?.headerText ?? '');
  const [columns, setColumns] = useState<ColumnDef[]>(() =>
    (initialSession?.columns ?? DEFAULT_COLUMNS).map((c) => ({ ...c })),
  );
  const [members, setMembers] = useState<RosterMember[]>(() =>
    (initialSession?.members ?? []).map((m) => ({ ...m })),
  );
  const [rosterName, setRosterName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [dedupLock, setDedupLock] = useState(true);
  const [accessCodeEnabled, setAccessCodeEnabled] = useState(false);
  const [accessCode, setAccessCode] = useState('');

  // ── share/export 상태 ──
  const [publishing, setPublishing] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [reopeningSession, setReopeningSession] = useState(false);
  const [deletingSignatureImages, setDeletingSignatureImages] = useState(false);
  const [retentionPreset, setRetentionPreset] = useState<SignatureRetentionPreset>(() => {
    const days = initialSession?.signatureRetentionDays ?? 30;
    if (days === 30) return '30';
    if (days === 60) return '60';
    if (days === 90) return '90';
    return 'custom';
  });
  const [customRetentionDays, setCustomRetentionDays] = useState(() =>
    String(initialSession?.signatureRetentionDays ?? 30),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopPollingRef = useRef<(() => void) | null>(null);

  // 명단 라이브러리 + 현재 세션 (Zustand)
  const rosters = useSignatureRosterStore((s) => s.rosters);
  const loadRosters = useSignatureRosterStore((s) => s.loadRosters);
  const saveRoster = useSignatureRosterStore((s) => s.saveRoster);
  const deleteRoster = useSignatureRosterStore((s) => s.deleteRoster);
  const activeSession = useSignatureRosterStore((s) => s.activeSession);
  const statusRows = useSignatureRosterStore((s) => s.statusRows);
  const setActiveSession = useSignatureRosterStore((s) => s.setActiveSession);
  const updateActiveSession = useSignatureRosterStore((s) => s.updateActiveSession);
  const setStatusRows = useSignatureRosterStore((s) => s.setStatusRows);
  const resetSession = useSignatureRosterStore((s) => s.resetSession);

  // 담임반·수업반 명렬
  const students = useStudentStore((s) => s.students);
  const loadStudents = useStudentStore((s) => s.load);
  const grade = useSettingsStore((s) => s.settings.grade);
  const className = useSettingsStore((s) => s.settings.className);
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const loadTeachingClasses = useTeachingClassStore((s) => s.load);

  const currentStep: WizardStep = activeSession ? sessionView : setupStep;

  const studentUrl = useMemo(() => {
    if (!activeSession) return '';
    // 참석자 공개 페이지(/sign/{code})와 동일 규약 — 단일 빌더로 정합 보장.
    return buildSignaturePublicUrl(activeSession.shortLinkCode);
  }, [activeSession]);

  const orderedColumns = useMemo(() => [...columns].sort((a, b) => a.order - b.order), [columns]);

  // 세션 스냅샷 기준 열 (등록부 생성은 항상 공개 시점 데이터로).
  const sessionColumns = useMemo(
    () => (activeSession ? [...activeSession.columns].sort((a, b) => a.order - b.order) : []),
    [activeSession],
  );

  // 서명(signature) 타입 열이 하나라도 있는지 — 없으면 안내 + 시트/Excel 서명 임베드 생략.
  const hasSignatureColumn = useMemo(() => columns.some((c) => c.type === 'signature'), [columns]);

  const activeClassStudents = useMemo(() => students.filter(isStudentActive), [students]);
  const signedCount = statusRows.filter((row) => row.signed).length;
  const activeSessionId = activeSession?.sessionId;
  const activeSessionAdminKey = activeSession?.adminKey;

  useEffect(() => {
    loadRosters();
    void loadStudents();
    void loadTeachingClasses();
  }, [loadRosters, loadStudents, loadTeachingClasses]);

  // QR 생성
  useEffect(() => {
    let cancelled = false;
    if (!studentUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(studentUrl, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studentUrl]);

  // 현황 폴링 (10초) — 세션 활성 시 시작, 정리 시 정지
  useEffect(() => {
    if (!activeSessionId || !activeSessionAdminKey) return;
    const stop = submitMonitorSignature.start({
      sessionId: activeSessionId,
      adminKey: activeSessionAdminKey,
      onUpdate: (rows, details) => {
        setStatusRows(rows);
        if (details) {
          updateActiveSession({
            status: details.status,
            closedAt: details.closedAt,
            signatureRetentionDays: details.signatureRetentionDays,
            signatureCleanupAfter: details.signatureCleanupAfter,
            signatureImagesDeletedAt: details.signatureImagesDeletedAt,
          });
        }
      },
    });
    stopPollingRef.current = stop;
    return () => {
      stop();
      stopPollingRef.current = null;
    };
  }, [activeSessionId, activeSessionAdminKey, setStatusRows, updateActiveSession]);

  // ── 명단 불러오기 ──

  /** 기존 명단이 있으면 교체 여부를 먼저 묻는다 (실수로 덮어쓰기 방지). */
  const confirmReplaceMembers = useCallback((): boolean => {
    if (members.length === 0) return true;
    return window.confirm(`현재 명단 ${members.length}명을 새 명단으로 교체할까요?`);
  }, [members.length]);

  const loadFromClassRoster = useCallback(() => {
    if (activeClassStudents.length === 0) {
      setError('담임반 명렬이 비어 있습니다. 학급 관리에서 학생을 먼저 등록해 주세요.');
      return;
    }
    if (!confirmReplaceMembers()) return;
    const affiliation = [grade, className].filter(Boolean).join('-') || '우리 반';
    setMembers(classStudentsToMembers(activeClassStudents, affiliation));
    setError(null);
    setNotice(`담임반 명렬 ${activeClassStudents.length}명을 불러왔어요.`);
  }, [activeClassStudents, confirmReplaceMembers, grade, className]);

  const loadFromTeachingClass = useCallback(
    (tc: TeachingClass) => {
      const next = teachingClassToMembers(tc);
      if (next.length === 0) {
        setError(`'${tc.name}' 수업반에 등록된 학생이 없습니다. 수업 관리에서 먼저 등록해 주세요.`);
        return;
      }
      if (!confirmReplaceMembers()) return;
      setMembers(next);
      setError(null);
      setNotice(`수업반 '${tc.name}' 명렬 ${next.length}명을 불러왔어요.`);
    },
    [confirmReplaceMembers],
  );

  const handleLoadSavedRoster = useCallback(
    (roster: SavedSignatureRoster) => {
      if (!confirmReplaceMembers()) return;
      setRosterName(roster.name);
      setColumns(roster.columns.map((c) => ({ ...c })));
      setMembers(roster.members.map((m) => ({ ...m })));
      setNotice(`저장된 명단 '${roster.name}' ${roster.members.length}명을 불러왔어요.`);
    },
    [confirmReplaceMembers],
  );

  const handleSaveRoster = useCallback(() => {
    if (members.length === 0) {
      setError('저장할 명단이 비어 있습니다. 먼저 명단을 구성해 주세요.');
      return;
    }
    saveRoster({ name: rosterName || title, columns, members });
    setNotice('명단을 라이브러리에 저장했습니다. 다음에 같은 명단을 바로 불러올 수 있어요.');
  }, [members, rosterName, title, columns, saveRoster]);

  // ── 붙여넣기/CSV → 매핑 미리보기 ──

  const handlePreviewPaste = useCallback(() => {
    const grid = parseRosterGrid(pasteText, orderedColumns);
    if (grid.rows.length === 0) {
      setError('붙여넣은 내용에서 명단을 찾지 못했습니다. 한 줄에 한 명씩 입력해 주세요.');
      return;
    }
    setError(null);
    setPendingImport({ grid, sourceLabel: '붙여넣기' });
  }, [pasteText, orderedColumns]);

  const handleCsvUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const grid = parseRosterGrid(text, orderedColumns);
        if (grid.rows.length === 0) {
          setError('CSV에서 명단을 읽지 못했습니다. 첫 열에 이름이 있는지 확인해 주세요.');
          return;
        }
        setError(null);
        setPendingImport({ grid, sourceLabel: 'CSV 파일' });
      };
      reader.readAsText(file, 'utf-8');
      event.target.value = '';
    },
    [orderedColumns],
  );

  const handleApplyImport = useCallback(
    (result: ApplyImportResult) => {
      if (!confirmReplaceMembers()) return;
      // 열 편집 동기화 결과 안내 — 새로 생긴 열과 정리된 열을 라벨로 알려준다.
      const prevKeys = new Set(columns.map((c) => c.key));
      const nextKeys = new Set(result.columns.map((c) => c.key));
      const addedLabels = result.columns.filter((c) => !prevKeys.has(c.key)).map((c) => c.label);
      const removedLabels = columns.filter((c) => !nextKeys.has(c.key)).map((c) => c.label);
      setMembers(result.members);
      setColumns(result.columns);
      setPendingImport(null);
      setPasteText('');
      setNotice(
        `${result.members.length}명을 명단에 넣었어요.` +
          (addedLabels.length > 0
            ? ` 새 열(${addedLabels.join(', ')})이 열 편집에 추가됐어요.`
            : '') +
          (removedLabels.length > 0
            ? ` 안 쓰는 열(${removedLabels.join(', ')})은 정리했어요.`
            : ''),
      );
    },
    [confirmReplaceMembers, columns],
  );

  const handleDownloadTemplate = useCallback(async () => {
    setError(null);
    try {
      const csv = buildRosterTemplateCsv(orderedColumns);
      const fileName = `${(rosterName || title).trim() || '서명 명단'} 양식.csv`;
      await downloadCsv(csv, fileName);
      setNotice(
        '명단 작성용 CSV 양식을 내려받았습니다. 이름·소속과 추가 열을 채워 다시 업로드하세요.',
      );
    } catch {
      setError('CSV 양식을 내려받지 못했습니다.');
    }
  }, [orderedColumns, rosterName, title]);

  // ── 열 편집 ──

  const addColumn = useCallback(() => {
    setColumns((prev) => {
      const maxOrder = prev.reduce((m, c) => Math.max(m, c.order), -1);
      const key = `custom_${Date.now().toString(36)}`;
      return [...prev, { key, label: '새 열', type: 'text', order: maxOrder + 1 }];
    });
  }, []);

  const removeColumn = useCallback((key: string) => {
    setColumns((prev) => {
      // 최소 1개 열은 유지 — 마지막 열은 삭제하지 않는다.
      if (prev.length <= 1) return prev;
      const next = prev.filter((c) => c.key !== key);
      return next.length > 0 ? next : prev;
    });
  }, []);

  const renameColumn = useCallback((key: string, label: string) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, label } : c)));
  }, []);

  const changeColumnType = useCallback((key: string, type: ColumnType) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, type } : c)));
  }, []);

  /** 열 순서 이동 — 인접 열과 자리를 바꾸고 order를 0부터 재부여한다. */
  const moveColumn = useCallback((key: string, direction: -1 | 1) => {
    setColumns((prev) => {
      const ordered = [...prev].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((c) => c.key === key);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return prev;
      const current = ordered[index];
      const neighbor = ordered[targetIndex];
      if (!current || !neighbor) return prev;
      ordered[index] = neighbor;
      ordered[targetIndex] = current;
      return ordered.map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  // ── 공개(publish) ──

  const handlePublish = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (members.length === 0) {
      setError('서명 대상 명단이 비어 있습니다. 2단계에서 명단을 먼저 구성해 주세요.');
      return;
    }
    if (accessCodeEnabled && accessCode.trim().length === 0) {
      setError('접근 코드를 켰다면 코드를 입력해 주세요.');
      return;
    }
    setPublishing(true);
    try {
      const trustMode: TrustMode = { dedupLock, accessCodeEnabled };
      const trimmedTitle = title.trim() || '서명 등록부';
      const trimmedHeader = headerText.trim();
      const result = await publishSignatureSession.execute({
        ownerTeacherId: getOwnerTeacherId(),
        title: trimmedTitle,
        headerText: trimmedHeader || undefined,
        trustMode,
        accessCode: accessCodeEnabled ? accessCode.trim() : undefined,
        columns: orderedColumns,
        rosterSnapshot: members,
      });
      // 공개 시점 스냅샷째 영속 — 도구 재진입·앱 재시작 후에도 현황/등록부 이어가기.
      setActiveSession({
        sessionId: result.sessionId,
        adminKey: result.adminKey,
        shortLinkCode: result.shortLinkCode,
        title: trimmedTitle,
        headerText: trimmedHeader || undefined,
        columns: orderedColumns,
        members,
        status: 'active',
        signatureRetentionDays: resolveRetentionDays(retentionPreset, customRetentionDays) ?? 30,
      });
      setStatusRows([]);
      setSessionView('share');
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션을 공개하지 못했습니다.');
    } finally {
      setPublishing(false);
    }
  }, [
    members,
    accessCodeEnabled,
    accessCode,
    dedupLock,
    title,
    headerText,
    orderedColumns,
    setActiveSession,
    setStatusRows,
    retentionPreset,
    customRetentionDays,
  ]);

  const handleCopyLink = useCallback(async () => {
    if (!studentUrl) return;
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('링크 복사에 실패했습니다. 화면의 주소를 직접 복사해 주세요.');
    }
  }, [studentUrl]);

  // ── 등록부 생성 (세션 스냅샷 기준) ──

  const handleExportSheet = useCallback(async () => {
    if (!activeSession) return;
    setError(null);
    setNotice(null);
    setExporting(true);
    try {
      const exporter = createExportRegisterToSheet(() => authenticateGoogle.getValidAccessToken());
      const rows = buildSheetRows(activeSession.members, sessionColumns, statusRows);
      const result = await exporter.execute({
        sessionId: activeSession.sessionId,
        adminKey: activeSession.adminKey,
        title: activeSession.title,
        headerText: activeSession.headerText || SIGNATURE_LEGAL_DISCLAIMER,
        columns: sessionColumns,
        rows,
      });
      updateActiveSession({ sheetUrl: result.url });
      setNotice('구글시트 등록부를 생성했습니다. 서명을 더 받지 않는다면 세션을 마감해 주세요.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '구글시트를 생성하지 못했습니다. 구글 로그인 상태를 확인해 주세요.',
      );
    } finally {
      setExporting(false);
    }
  }, [activeSession, sessionColumns, statusRows, updateActiveSession]);

  const handleExportExcel = useCallback(async () => {
    if (!activeSession) return;
    setError(null);
    setNotice(null);
    setExportingExcel(true);
    try {
      const rows = buildExcelRows(activeSession.members, sessionColumns, statusRows);
      const buffer = await exportRegisterToExcel({
        title: activeSession.title,
        headerText: activeSession.headerText || SIGNATURE_LEGAL_DISCLAIMER,
        columns: sessionColumns,
        rows,
      });
      const fileName = `${activeSession.title.trim() || '서명 등록부'}.xlsx`;
      await downloadExcel(buffer, fileName);
      setNotice('Excel 등록부를 내보냈습니다. 서명을 더 받지 않는다면 세션을 마감해 주세요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel 등록부를 생성하지 못했습니다.');
    } finally {
      setExportingExcel(false);
    }
  }, [activeSession, sessionColumns, statusRows]);

  const openSheet = useCallback(() => {
    const url = activeSession?.sheetUrl;
    if (!url) return;
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [activeSession]);

  const handleBackupAndReset = useCallback(() => {
    stopPollingRef.current?.();
    resetSession();
    setSessionView('share');
    setSetupStep('info');
    setNotice('현재 세션을 닫고 처음 화면으로 돌아왔습니다. 명단은 그대로 남아 있어요.');
  }, [resetSession]);

  const handleCloseSession = useCallback(async () => {
    if (!activeSession) return;
    const retentionDays = resolveRetentionDays(retentionPreset, customRetentionDays);
    if (retentionDays === null) {
      setError('보관기간은 1일부터 365일 사이의 정수로 입력해 주세요.');
      return;
    }
    const ok = window.confirm(
      `세션을 마감할까요?\n\n참여자는 더 이상 서명할 수 없습니다. 서명 이미지는 마감 후 ${retentionDays}일 동안 보관한 뒤 자동 삭제됩니다.`,
    );
    if (!ok) return;

    setError(null);
    setClosingSession(true);
    try {
      const result = await signaturePort.closeSession(
        activeSession.sessionId,
        activeSession.adminKey,
        retentionDays,
      );
      updateActiveSession({
        status: result.status,
        closedAt: result.closedAt,
        signatureRetentionDays: result.signatureRetentionDays,
        signatureCleanupAfter: result.signatureCleanupAfter,
        signatureImagesDeletedAt: result.signatureImagesDeletedAt,
      });
      setNotice(
        '세션을 마감했습니다. 보관기간 동안 현황 확인과 내보내기는 계속 사용할 수 있습니다.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 마감에 실패했습니다.');
    } finally {
      setClosingSession(false);
    }
  }, [activeSession, customRetentionDays, retentionPreset, updateActiveSession]);

  const handleReopenSession = useCallback(async () => {
    if (!activeSession) return;
    if (activeSession.signatureImagesDeletedAt) {
      setError('서명 이미지가 이미 삭제된 세션은 다시 열 수 없습니다. 새 세션을 만들어 주세요.');
      return;
    }
    const ok = window.confirm(
      '세션을 다시 열까요?\n\n참여 링크가 다시 유효해지고 아직 서명하지 않은 참여자가 서명할 수 있습니다. 기존 서명 기록은 유지됩니다.',
    );
    if (!ok) return;

    setError(null);
    setReopeningSession(true);
    try {
      const result = await signaturePort.reopenSession(
        activeSession.sessionId,
        activeSession.adminKey,
      );
      updateActiveSession({
        status: result.status,
        closedAt: result.closedAt,
        signatureRetentionDays: result.signatureRetentionDays,
        signatureCleanupAfter: result.signatureCleanupAfter,
        signatureImagesDeletedAt: result.signatureImagesDeletedAt,
      });
      setNotice('세션을 다시 열었습니다. 참여 링크로 서명을 이어서 받을 수 있습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 다시 열기에 실패했습니다.');
    } finally {
      setReopeningSession(false);
    }
  }, [activeSession, updateActiveSession]);

  const handleDeleteSignatureImages = useCallback(async () => {
    if (!activeSession) return;
    const ok = window.confirm(
      '서명 이미지 삭제\n\n서명 이미지를 지금 삭제하면 구글시트의 서명 칸이 더 이상 보이지 않을 수 있습니다. 서명 완료 여부와 명단 기록은 유지되지만, 삭제한 이미지는 복구할 수 없습니다.',
    );
    if (!ok) return;

    setError(null);
    setDeletingSignatureImages(true);
    try {
      const result = await signaturePort.deleteSignatureImages(
        activeSession.sessionId,
        activeSession.adminKey,
      );
      updateActiveSession({
        status: result.status,
        signatureImagesDeletedAt: result.signatureImagesDeletedAt,
      });
      setStatusRows(
        statusRows.map((row) =>
          row.signed
            ? {
                ...row,
                signaturePublicUrl: undefined,
                signatureImageDeletedAt: result.signatureImagesDeletedAt,
              }
            : row,
        ),
      );
      setNotice(
        `서명 이미지 ${result.removedStorageObjects}개를 삭제했습니다. 서명 완료 기록은 유지됩니다.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '서명 이미지 삭제에 실패했습니다.');
    } finally {
      setDeletingSignatureImages(false);
    }
  }, [activeSession, setStatusRows, statusRows, updateActiveSession]);

  const handleDeleteSession = useCallback(async () => {
    if (!activeSession) return;
    const ok = window.confirm('이 서명 세션을 삭제할까요? 수집된 서명도 함께 삭제됩니다.');
    if (!ok) return;
    setError(null);
    try {
      await signaturePort.deleteSession(activeSession.sessionId, activeSession.adminKey);
      stopPollingRef.current?.();
      resetSession();
      setSessionView('share');
      setSetupStep('info');
      setNotice('서명 세션을 삭제했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 삭제에 실패했습니다.');
    }
  }, [activeSession, resetSession]);

  // ── 단계 이동 ──

  const goToStep = useCallback(
    (step: WizardStep) => {
      if (activeSession) {
        // 공개 이후엔 ①~③ 수정 불가 (서버 스냅샷과 어긋남 방지) — ④/⑤만 이동.
        if (step === 'share' || step === 'export') setSessionView(step);
        return;
      }
      if (step === 'share' || step === 'export') return; // 공개 전엔 진입 불가
      if (step === 'options' && members.length === 0) return;
      setSetupStep(step);
    },
    [activeSession, members.length],
  );

  return (
    <ToolLayout title="서명받기" emoji="✍️" onBack={onBack} isFullscreen={isFullscreen} disableZoom>
      <div className="space-y-5">
        {/* 헤더 + 단계 인디케이터 */}
        <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-sp-accent">명단에 서명을 받아 등록부로</p>
              <h2 className="mt-2 text-2xl font-bold text-sp-text">
                QR로 서명을 모아 등록부를 만들어요
              </h2>
              <p className="mt-2 text-sm leading-6 text-sp-muted">{SIGNATURE_LEGAL_DISCLAIMER}</p>
            </div>
            <div className="min-w-[220px] rounded-2xl bg-sp-surface p-4">
              <p className="text-xs font-semibold text-sp-muted">현재 진행</p>
              <p className="mt-1 text-lg font-bold text-sp-text">{labelForStep(currentStep)}</p>
              <p className="mt-2 text-xs leading-5 text-sp-muted">
                대상 {(activeSession?.members ?? members).length}명 · 완료 {signedCount}명
                {activeSession ? ` · 코드 ${activeSession.shortLinkCode}` : ''}
              </p>
            </div>
          </div>
          <StepIndicator
            currentStep={currentStep}
            sessionActive={Boolean(activeSession)}
            membersCount={members.length}
            onStepClick={goToStep}
          />
        </section>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl border border-sp-border bg-sp-surface p-3 text-sm text-sp-muted">
            {notice}
          </p>
        )}

        {/* ① 기본 정보 */}
        {currentStep === 'info' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <p className="text-sm font-semibold text-sp-accent">1단계 · 기본 정보</p>
            <h3 className="mt-1 text-xl font-bold text-sp-text">
              무엇에 대한 서명인지 알려 주세요
            </h3>
            <div className="mt-5 max-w-2xl space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-sp-text">제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 현장체험학습 동의 서명"
                  className="mt-2 w-full rounded-xl border border-sp-border bg-sp-surface px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                />
                <span className="mt-1 block text-xs text-sp-muted">
                  서명 페이지와 등록부 맨 위에 표시돼요.
                </span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-sp-text">머리말 (선택)</span>
                <textarea
                  value={headerText}
                  onChange={(event) => setHeaderText(event.target.value)}
                  rows={2}
                  placeholder="서명 페이지·등록부 상단에 표시할 안내 문구"
                  className="mt-2 w-full rounded-xl border border-sp-border bg-sp-surface px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                />
              </label>
            </div>
            <WizardFooter nextLabel="다음: 명단 구성 →" onNext={() => setSetupStep('roster')} />
          </section>
        )}

        {/* ② 명단 구성 */}
        {currentStep === 'roster' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <p className="text-sm font-semibold text-sp-accent">2단계 · 명단 구성</p>
            <h3 className="mt-1 text-xl font-bold text-sp-text">서명 받을 사람을 모아요</h3>

            {/* 명단 불러오기 */}
            <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
              <h4 className="text-lg font-bold text-sp-text">학급 명렬에서 불러오기</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadFromClassRoster}
                  className="rounded-xl border border-sp-border bg-sp-card px-4 py-2.5 text-sm font-bold text-sp-text transition hover:border-sp-accent/60"
                >
                  담임반 ({activeClassStudents.length}명)
                </button>
                {teachingClasses.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => loadFromTeachingClass(tc)}
                    className="rounded-xl border border-sp-border bg-sp-card px-4 py-2.5 text-sm font-bold text-sp-text transition hover:border-sp-accent/60"
                  >
                    {tc.name}
                    {tc.subject ? ` · ${tc.subject}` : ''} (
                    {tc.students.filter(isStudentActive).length}명)
                  </button>
                ))}
              </div>
              {teachingClasses.length === 0 && (
                <p className="mt-2 text-xs text-sp-muted">
                  수업반 명렬도 여기에 나타나요. 수업 관리에서 반을 등록하면 바로 쓸 수 있어요.
                </p>
              )}

              <div className="mt-5 border-t border-sp-border pt-4">
                <h4 className="text-lg font-bold text-sp-text">파일·붙여넣기로 불러오기</h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-xl border border-sp-border bg-sp-card px-4 py-2.5 text-sm font-bold text-sp-text transition hover:border-sp-accent/60">
                    CSV 불러오기
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCsvUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="rounded-xl border border-sp-border bg-sp-card px-4 py-2.5 text-sm font-bold text-sp-text transition hover:border-sp-accent/60"
                  >
                    양식 다운로드
                  </button>
                </div>
                <p className="mt-2 text-xs text-sp-muted">
                  '양식 다운로드'로 받은 CSV에 이름·소속과 추가 열을 채워 올리면 열까지 자동으로
                  맞춰져요. 다른 파일도 올린 뒤 미리보기에서 열을 지정할 수 있어요.
                </p>
                <div className="mt-4">
                  <span className="text-sm font-medium text-sp-text">
                    붙여넣기 (한 줄에 한 명 — 엑셀에서 복사해도 돼요)
                  </span>
                  <textarea
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    rows={3}
                    placeholder={'홍길동\n김철수, 1반\n이영희'}
                    className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handlePreviewPaste}
                    disabled={pasteText.trim().length === 0}
                    className="mt-2 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    미리보고 가져오기
                  </button>
                </div>
              </div>
            </div>

            {/* 임포트 매핑 미리보기 */}
            {pendingImport && (
              <div className="mt-5">
                <RosterImportMapping
                  grid={pendingImport.grid}
                  columns={orderedColumns}
                  sourceLabel={pendingImport.sourceLabel}
                  onApply={handleApplyImport}
                  onCancel={() => setPendingImport(null)}
                />
              </div>
            )}

            {/* 저장된 명단 */}
            {rosters.length > 0 && (
              <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
                <h4 className="text-lg font-bold text-sp-text">저장된 명단</h4>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {rosters.map((roster) => (
                    <div
                      key={roster.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-sp-border bg-sp-card p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-sp-text">{roster.name}</p>
                        <p className="text-xs text-sp-muted">{roster.members.length}명</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadSavedRoster(roster)}
                          className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
                        >
                          불러오기
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm('이 명단을 삭제할까요?');
                            if (ok) deleteRoster(roster.id);
                          }}
                          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/10"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 현재 명단 표 */}
            <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-lg font-bold text-sp-text">현재 명단</h4>
                {members.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      value={rosterName}
                      onChange={(event) => setRosterName(event.target.value)}
                      placeholder="저장할 이름 (예: 3학년 2반)"
                      className="rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveRoster}
                      className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-bold text-sp-text transition hover:bg-sp-card"
                    >
                      라이브러리에 저장
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <RosterTable members={members} columns={orderedColumns} onChange={setMembers} />
              </div>
            </div>

            {/* 열 편집 */}
            <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-bold text-sp-text">열 편집</h4>
                  <p className="mt-1 text-xs text-sp-muted">
                    등록부에 들어갈 열이에요. 추가한 열은 위 명단 표와 CSV 양식에도 바로 반영돼요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addColumn}
                  className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-bold text-sp-text transition hover:bg-sp-card"
                >
                  + 열 추가
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {orderedColumns.map((column, columnIndex) => (
                  <div
                    key={column.key}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-sp-border bg-sp-card p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveColumn(column.key, -1)}
                        disabled={columnIndex === 0}
                        title="위로 이동"
                        className="rounded-md border border-sp-border px-1.5 py-0.5 text-sp-muted transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-icon-sm">
                          keyboard_arrow_up
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumn(column.key, 1)}
                        disabled={columnIndex === orderedColumns.length - 1}
                        title="아래로 이동"
                        className="rounded-md border border-sp-border px-1.5 py-0.5 text-sp-muted transition hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-icon-sm">
                          keyboard_arrow_down
                        </span>
                      </button>
                    </div>
                    <input
                      value={column.label}
                      onChange={(event) => renameColumn(column.key, event.target.value)}
                      className="min-w-[120px] flex-1 rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    />
                    {column.builtin && (
                      <span className="rounded-full bg-sp-surface px-3 py-1 text-xs font-bold text-sp-muted">
                        기본
                      </span>
                    )}
                    <select
                      value={column.type}
                      onChange={(event) =>
                        changeColumnType(column.key, event.target.value as ColumnType)
                      }
                      className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    >
                      {COLUMN_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm(`'${column.label}' 열을 삭제할까요?`);
                        if (ok) removeColumn(column.key);
                      }}
                      disabled={columns.length <= 1}
                      className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
              {!hasSignatureColumn && (
                <Notice variant="warning" className="mt-3">
                  서명을 받을 열이 없습니다. 열 타입을 '서명'으로 지정하면 참석자가 서명한 이미지가
                  시트·Excel에 들어갑니다.
                </Notice>
              )}
            </div>

            <WizardFooter
              backLabel="← 기본 정보"
              onBack={() => setSetupStep('info')}
              nextLabel="다음: 공개 설정 →"
              nextDisabled={members.length === 0}
              nextHint={
                members.length === 0 ? '명단에 최소 1명이 있어야 다음으로 갈 수 있어요.' : undefined
              }
              onNext={() => setSetupStep('options')}
            />
          </section>
        )}

        {/* ③ 공개 설정 */}
        {currentStep === 'options' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <p className="text-sm font-semibold text-sp-accent">3단계 · 공개 설정</p>
            <h3 className="mt-1 text-xl font-bold text-sp-text">확인하고 서명 페이지를 열어요</h3>

            {/* 요약 */}
            <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
              <h4 className="text-lg font-bold text-sp-text">이렇게 만들어져요</h4>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <SummaryItem label="제목" value={title.trim() || '서명 등록부'} />
                <SummaryItem label="대상" value={`${members.length}명`} />
                <SummaryItem
                  label="열 구성"
                  value={orderedColumns.map((c) => c.label).join(' · ')}
                />
              </dl>
              <p className="mt-3 text-xs text-sp-muted">
                공개한 뒤에는 명단과 열을 바꿀 수 없어요. 고치려면 2단계로 돌아가 주세요.
              </p>
            </div>

            {/* 신뢰 모델 */}
            <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
              <h4 className="text-lg font-bold text-sp-text">참여 방식</h4>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ToggleCard
                  checked={dedupLock}
                  onChange={setDedupLock}
                  title="중복 서명 잠금"
                  description="한 번 서명한 대상자는 다시 서명할 수 없어요."
                />
                <ToggleCard
                  checked={accessCodeEnabled}
                  onChange={setAccessCodeEnabled}
                  title="접근 코드 사용"
                  description="코드를 아는 사람만 서명 페이지에 들어올 수 있어요."
                />
              </div>
              {accessCodeEnabled && (
                <label className="mt-3 block max-w-xs">
                  <span className="text-sm font-medium text-sp-text">접근 코드</span>
                  <input
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    placeholder="예: 2026"
                    className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                  />
                </label>
              )}
            </div>

            <WizardFooter
              backLabel="← 명단 구성"
              onBack={() => setSetupStep('roster')}
              nextLabel={publishing ? '공개하는 중...' : '서명 페이지 공개하기'}
              nextDisabled={publishing || members.length === 0}
              onNext={() => void handlePublish()}
            />
          </section>
        )}

        {/* ④ 공유·현황 */}
        {currentStep === 'share' && activeSession && (
          <SharePanel
            session={activeSession}
            studentUrl={studentUrl}
            qrDataUrl={qrDataUrl}
            copied={copied}
            statusRows={statusRows}
            onCopyLink={() => void handleCopyLink()}
            onGoExport={() => setSessionView('export')}
            retentionPreset={retentionPreset}
            customRetentionDays={customRetentionDays}
            closingSession={closingSession}
            reopeningSession={reopeningSession}
            deletingSignatureImages={deletingSignatureImages}
            onRetentionPresetChange={setRetentionPreset}
            onCustomRetentionDaysChange={setCustomRetentionDays}
            onCloseSession={() => void handleCloseSession()}
            onReopenSession={() => void handleReopenSession()}
            onDeleteSignatureImages={() => void handleDeleteSignatureImages()}
            onDeleteSession={() => void handleDeleteSession()}
          />
        )}

        {/* ⑤ 등록부 생성 */}
        {currentStep === 'export' && activeSession && (
          <ExportPanel
            session={activeSession}
            signedCount={signedCount}
            exporting={exporting}
            exportingExcel={exportingExcel}
            onBackToShare={() => setSessionView('share')}
            onExport={() => void handleExportSheet()}
            onExportExcel={() => void handleExportExcel()}
            onOpenSheet={openSheet}
            retentionPreset={retentionPreset}
            customRetentionDays={customRetentionDays}
            closingSession={closingSession}
            reopeningSession={reopeningSession}
            deletingSignatureImages={deletingSignatureImages}
            onRetentionPresetChange={setRetentionPreset}
            onCustomRetentionDaysChange={setCustomRetentionDays}
            onCloseSession={() => void handleCloseSession()}
            onReopenSession={() => void handleReopenSession()}
            onDeleteSignatureImages={() => void handleDeleteSignatureImages()}
            onBackupReset={handleBackupAndReset}
            onDeleteSession={() => void handleDeleteSession()}
          />
        )}
      </div>
    </ToolLayout>
  );
}

// ──────────────────────────────────────────────────────────
// 파일 다운로드 (Electron showSaveDialog 우선, 웹은 Blob)
// ──────────────────────────────────────────────────────────

/** xlsx 버퍼를 파일로 저장 (Electron showSaveDialog 우선, 웹은 Blob 다운로드). */
async function downloadExcel(buffer: ArrayBuffer, fileName: string): Promise<void> {
  if (window.electronAPI) {
    const saved = await window.electronAPI.showSaveDialog({
      title: 'Excel 등록부 저장',
      defaultPath: fileName,
      filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
    });
    if (saved) {
      await window.electronAPI.writeFile(saved.handle, buffer);
    }
    return;
  }
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV 문자열을 파일로 저장 (Electron showSaveDialog 우선, 웹은 Blob 다운로드). UTF-8 BOM 포함. */
async function downloadCsv(csvText: string, fileName: string): Promise<void> {
  // 엑셀 한글 깨짐 방지를 위해 UTF-8 BOM(U+FEFF) 선행.
  const withBom = String.fromCharCode(0xfeff) + csvText;
  if (window.electronAPI) {
    const saved = await window.electronAPI.showSaveDialog({
      title: 'CSV 양식 저장',
      defaultPath: fileName,
      filters: [{ name: 'CSV 파일', extensions: ['csv'] }],
    });
    if (saved) {
      // writeFile(string)은 UTF-8로 기록 — BOM 문자가 그대로 선행 바이트로 보존된다.
      await window.electronAPI.writeFile(saved.handle, withBom);
    }
    return;
  }
  const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────────
// 프리젠테이션 컴포넌트
// ──────────────────────────────────────────────────────────

function labelForStep(step: WizardStep): string {
  return WIZARD_STEPS.find((s) => s.id === step)?.label ?? '기본 정보';
}

function resolveRetentionDays(
  preset: SignatureRetentionPreset,
  customRetentionDays: string,
): number | null {
  const raw = preset === 'custom' ? Number(customRetentionDays) : Number(preset);
  if (!Number.isInteger(raw) || raw < 1 || raw > 365) return null;
  return raw;
}

function StepIndicator({
  currentStep,
  sessionActive,
  membersCount,
  onStepClick,
}: {
  readonly currentStep: WizardStep;
  readonly sessionActive: boolean;
  readonly membersCount: number;
  readonly onStepClick: (step: WizardStep) => void;
}) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStep);

  const isClickable = (step: WizardStep): boolean => {
    if (sessionActive) return step === 'share' || step === 'export';
    if (step === 'share' || step === 'export') return false;
    if (step === 'options') return membersCount > 0;
    return true;
  };

  return (
    <ol className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
      {WIZARD_STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const isDone = index < currentIndex;
        const clickable = isClickable(step.id) && !isActive;
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              disabled={!clickable}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                isActive
                  ? 'border-sp-accent bg-sp-accent/10'
                  : isDone
                    ? 'border-sp-border bg-sp-surface'
                    : 'border-sp-border bg-sp-card'
              } ${clickable ? 'cursor-pointer hover:border-sp-accent/60' : 'cursor-default'}`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                    isActive || isDone ? 'bg-sp-accent text-white' : 'bg-sp-surface text-sp-muted'
                  }`}
                >
                  {isDone ? '✓' : index + 1}
                </span>
                <span className="text-sm font-bold text-sp-text">{step.label}</span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-sp-muted">{step.description}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function WizardFooter({
  backLabel,
  onBack,
  nextLabel,
  nextDisabled,
  nextHint,
  onNext,
}: {
  readonly backLabel?: string;
  readonly onBack?: () => void;
  readonly nextLabel: string;
  readonly nextDisabled?: boolean;
  readonly nextHint?: string;
  readonly onNext: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-sp-border pt-4">
      {backLabel && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
        >
          {backLabel}
        </button>
      )}
      <div className="flex-1" />
      {nextHint && <p className="text-xs text-sp-muted">{nextHint}</p>}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-xl bg-sp-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-sp-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium text-sp-text">{value}</dd>
    </div>
  );
}

function ToggleCard({
  checked,
  onChange,
  title,
  description,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-xl border p-4 text-left transition ${
        checked
          ? 'border-sp-accent bg-sp-accent/10'
          : 'border-sp-border bg-sp-card hover:border-sp-accent/60'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold text-sp-text">
        <span className="material-symbols-outlined text-icon-md">
          {checked ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        {title}
      </span>
      <span className="mt-2 block text-xs leading-5 text-sp-muted">{description}</span>
    </button>
  );
}
