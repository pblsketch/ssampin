import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolLayout } from './ToolLayout';
import { convertDocument, maskMarkdown, manageMaskSessions } from '@adapters/di/container';
import { useClassRosterStore } from '@adapters/stores/useClassRosterStore';
import type { MaskConfig, MaskKind, MaskMapping, PatternConfig } from '@domain/privacy/types';
import type { SavedMaskSession } from '@domain/ports/IMaskMappingRepository';
import type {
  ParseOutcome,
  ParsedDocMetadata,
  ParsedDocOutlineItem,
  ParsedTextQuality,
} from '@domain/ports/IDocumentParserPort';
import { textQualityNotice } from './markdownConvertQuality';
import { toHwpxFileName } from './markdownConvertExport';

interface ToolMarkdownConvertProps {
  onBack: () => void;
  isFullscreen: boolean;
}

const SAVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

const KIND_LABEL: Record<MaskKind, string> = {
  phone: '전화',
  rrn: '주민번호',
  email: '이메일',
  birth: '생년월일',
  address: '주소',
  keyword: '키워드',
};

const LOW_CONFIDENCE_KINDS: ReadonlySet<MaskKind> = new Set<MaskKind>(['address']);

function parseKeywords(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
}

/** 원본 파일명을 .md 로 바꾼 추천 저장명 */
function toMdFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').trim();
  return `${base.length > 0 ? base : 'converted'}.md`;
}

/** 텍스트를 .md 파일로 저장. 데스크톱은 저장 다이얼로그, 브라우저(dev)는 Blob 다운로드. */
async function saveMarkdownFile(
  text: string,
  suggestedName: string,
): Promise<'saved' | 'canceled' | 'unavailable'> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.showSaveDialog && api?.writeFile) {
    const res = await api.showSaveDialog({
      title: '마크다운 파일로 저장',
      defaultPath: suggestedName,
      filters: [
        { name: '마크다운', extensions: ['md'] },
        { name: '모든 파일', extensions: ['*'] },
      ],
    });
    if (!res) return 'canceled';
    await api.writeFile(res.handle, text);
    return 'saved';
  }
  if (typeof document !== 'undefined') {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
    return 'saved';
  }
  return 'unavailable';
}

/** 여러 파일을 개별 .md 로 묶은 ZIP 1개로 저장. 데스크톱은 ZIP, 브라우저(dev)는 개별 다운로드 폴백. */
async function saveMarkdownZip(
  files: { name: string; text: string }[],
  zipName = '변환결과.zip',
): Promise<'saved' | 'canceled' | 'unavailable'> {
  if (files.length === 0) return 'unavailable';
  const api = typeof window !== 'undefined' ? window.electronAPI?.markdownConvert : undefined;
  if (api?.saveZip) {
    const r = await api.saveZip(files, zipName);
    if (r.status === 'saved') return 'saved';
    if (r.status === 'canceled') return 'canceled';
    return 'unavailable';
  }
  if (typeof document !== 'undefined') {
    for (const f of files) {
      const blob = new Blob([f.text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(url);
    }
    return 'saved';
  }
  return 'unavailable';
}

/**
 * 마크다운을 한글(.hwpx)로 저장. 변환은 메인 프로세스의 kordoc markdownToHwpx 가 수행하므로
 * 데스크톱(Electron)에서만 가능 — 브라우저(dev)에서는 'unavailable'.
 */
async function saveHwpxFile(
  markdown: string,
  suggestedName: string,
): Promise<'saved' | 'canceled' | 'unavailable' | 'error'> {
  const api = typeof window !== 'undefined' ? window.electronAPI?.markdownConvert : undefined;
  if (!api?.saveHwpx) return 'unavailable';
  const r = await api.saveHwpx(markdown, suggestedName);
  if (r.status === 'saved') return 'saved';
  if (r.status === 'canceled') return 'canceled';
  return 'error';
}

/** 여러 마크다운을 각 .hwpx 로 묶은 ZIP 1개로 저장(데스크톱 전용). */
async function saveHwpxZip(
  files: { name: string; markdown: string }[],
  zipName = '변환결과(한글).zip',
): Promise<'saved' | 'canceled' | 'unavailable' | 'error'> {
  if (files.length === 0) return 'unavailable';
  const api = typeof window !== 'undefined' ? window.electronAPI?.markdownConvert : undefined;
  if (!api?.saveHwpxZip) return 'unavailable';
  const r = await api.saveHwpxZip(files, zipName);
  if (r.status === 'saved') return 'saved';
  if (r.status === 'canceled') return 'canceled';
  return 'error';
}

interface ParsedDoc {
  fileName: string;
  markdown: string;
  format: string;
  isImageBased: boolean;
  warnings: string[];
  metadata?: ParsedDocMetadata;
  outline?: readonly ParsedDocOutlineItem[];
  textQuality?: ParsedTextQuality;
}

/** 메타데이터 작성일 표시 정리 — ISO/날짜면 YYYY-MM-DD 만, 아니면 원문(최대 20자). */
function formatDocDate(raw: string): string {
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  return raw.length > 20 ? `${raw.slice(0, 20)}…` : raw;
}

export function ToolMarkdownConvert({ onBack, isFullscreen }: ToolMarkdownConvertProps) {
  const [tab, setTab] = useState<'convert' | 'restore'>('convert');
  const [helpOpen, setHelpOpen] = useState(true);

  // 변환 상태
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [docs, setDocs] = useState<ParsedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 가리기 옵션
  const [maskOn, setMaskOn] = useState(true);
  const [patterns, setPatterns] = useState<PatternConfig>({
    phone: true,
    rrn: true,
    email: true,
    birth: true,
    address: true,
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [rosterId, setRosterId] = useState('');

  // 결과
  const [masked, setMasked] = useState<string | null>(null);
  const [mappings, setMappings] = useState<readonly MaskMapping[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadedEach, setDownloadedEach] = useState(false);
  const [hwpxBusy, setHwpxBusy] = useState(false);
  const [hwpxSaved, setHwpxSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // 결과 보기 대상: 'all'(전체 합본) 또는 파일 인덱스
  const [resultView, setResultView] = useState<'all' | number>('all');

  // 되돌리기(복원)
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreOutput, setRestoreOutput] = useState<string | null>(null);
  const [restoreCopied, setRestoreCopied] = useState(false);
  const [restoreDownloaded, setRestoreDownloaded] = useState(false);
  const [restoreHwpxSaved, setRestoreHwpxSaved] = useState(false);
  const [savedSessions, setSavedSessions] = useState<readonly SavedMaskSession[]>([]);
  const [restoreSourceId, setRestoreSourceId] = useState<'current' | string>('current');

  const rosters = useClassRosterStore((s) => s.rosters);
  const loadRosters = useClassRosterStore((s) => s.load);
  useEffect(() => {
    void loadRosters();
  }, [loadRosters]);

  const refreshSaved = useCallback(() => {
    void manageMaskSessions.list().then(setSavedSessions);
  }, []);
  useEffect(() => {
    refreshSaved();
  }, [refreshSaved]);

  const rosterNames = useMemo(() => {
    const r = rosters.find((x) => x.id === rosterId);
    return r ? [...r.studentNames] : [];
  }, [rosters, rosterId]);

  const resetResult = useCallback(() => {
    setMasked(null);
    setMappings([]);
    setReviewed(false);
    setCopied(false);
    setSaveMsg(null);
    setResultView('all');
  }, []);

  const applyOutcomes = useCallback((outcomes: readonly ParseOutcome[]) => {
    const ok: ParsedDoc[] = [];
    const errs: string[] = [];
    for (const o of outcomes) {
      if (o.status === 'ok') {
        ok.push({
          fileName: o.fileName,
          markdown: o.document.markdown,
          format: o.document.format,
          isImageBased: o.document.isImageBased,
          warnings: [...o.document.warnings],
          metadata: o.document.metadata,
          outline: o.document.outline,
          textQuality: o.document.textQuality,
        });
      } else if (o.status === 'error') {
        errs.push(o.message);
      }
    }
    setDocs(ok);
    setError(errs.length > 0 ? errs.join('\n') : null);
  }, []);

  // 파일 선택(다이얼로그, 여러 개 가능) + 파싱
  const handlePick = useCallback(async () => {
    setBusy(true);
    try {
      const outcomes = await convertDocument.executeMulti();
      if (outcomes.length === 0) return; // 취소
      resetResult();
      applyOutcomes(outcomes);
    } finally {
      setBusy(false);
    }
  }, [resetResult, applyOutcomes]);

  // 드롭한 파일들 + 파싱 (여러 개 동시)
  const handleFiles = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      resetResult();
      try {
        const outcomes: ParseOutcome[] = [];
        for (const file of files) {
          try {
            const buf = await file.arrayBuffer();
            outcomes.push(await convertDocument.executeFromBytes(new Uint8Array(buf), file.name));
          } catch (e) {
            outcomes.push({
              status: 'error',
              code: 'READ_FAILED',
              message: `${file.name}: ${e instanceof Error ? e.message : '읽기 실패'}`,
            });
          }
        }
        applyOutcomes(outcomes);
      } finally {
        setBusy(false);
      }
    },
    [resetResult, applyOutcomes],
  );

  // 드래그 앤 드롭 — 전역 드롭 가드(window)에 걸리지 않도록 stopPropagation + preventDefault.
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles],
  );

  // 여러 문서를 하나의 마크다운으로 합침(각 파일은 제목 섹션 + 구분선). 별칭 일관성을 위해 합본에 한 번에 마스킹.
  const combinedMarkdown = useMemo(() => {
    if (docs.length === 0) return '';
    if (docs.length === 1) return docs[0]!.markdown;
    return docs.map((d) => `# ${d.fileName}\n\n${d.markdown}`).join('\n\n---\n\n');
  }, [docs]);

  // 변환/가리기 실행
  const handleConvert = useCallback(() => {
    if (docs.length === 0) return;
    if (!maskOn) {
      setMasked(combinedMarkdown);
      setMappings([]);
      setReviewed(true); // 가리기 미사용 시 검토 게이트 불필요
      setCopied(false);
      setSaveMsg(null);
      return;
    }
    const config: MaskConfig = {
      patterns,
      keywordGroups: [
        { label: '키워드', values: [...parseKeywords(keywordInput), ...rosterNames] },
      ].filter((g) => g.values.length > 0),
    };
    const result = maskMarkdown.apply(combinedMarkdown, config);
    setMasked(result.masked);
    setMappings(result.mappings);
    setReviewed(false);
    setCopied(false);
    setSaveMsg(null);
    setResultView('all');
  }, [docs, combinedMarkdown, maskOn, patterns, keywordInput, rosterNames]);

  const maskSummary = useMemo(() => {
    const counts = new Map<MaskKind, number>();
    for (const m of mappings) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    return [...counts.entries()];
  }, [mappings]);

  const hasLowConfidence = useMemo(
    () => mappings.some((m) => LOW_CONFIDENCE_KINDS.has(m.kind)),
    [mappings],
  );

  const canCopy = masked !== null && (!maskOn || reviewed);

  // 합본 마스킹 결과를 파일별 구획으로 분할(별칭 일관성은 합본 마스킹으로 보장).
  const maskedFiles = useMemo<{ fileName: string; text: string }[]>(() => {
    if (masked === null) return [];
    if (docs.length <= 1) {
      return docs.length === 1 ? [{ fileName: docs[0]!.fileName, text: masked }] : [];
    }
    const parts = masked.split('\n\n---\n\n');
    return docs.map((d, i) => ({ fileName: d.fileName, text: parts[i] ?? '' }));
  }, [masked, docs]);

  // 현재 보기 대상(전체 합본 또는 특정 파일)의 텍스트 + 저장 파일명.
  const currentResult = useMemo<{ text: string; name: string }>(() => {
    if (masked === null) return { text: '', name: '변환결과.md' };
    if (resultView !== 'all' && docs.length > 1) {
      const f = maskedFiles[resultView];
      if (f) return { text: f.text, name: toMdFileName(f.fileName) };
    }
    const name = docs.length === 1 ? toMdFileName(docs[0]!.fileName) : '변환결과.md';
    return { text: masked, name };
  }, [masked, resultView, docs, maskedFiles]);

  const handleCopy = useCallback(async () => {
    if (masked === null || !canCopy) return;
    await navigator.clipboard.writeText(currentResult.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [masked, canCopy, currentResult]);

  const handleDownload = useCallback(async () => {
    if (masked === null || !canCopy) return;
    const r = await saveMarkdownFile(currentResult.text, currentResult.name);
    if (r === 'saved') {
      setDownloaded(true);
      window.setTimeout(() => setDownloaded(false), 2000);
    }
  }, [masked, canCopy, currentResult]);

  // 통합 .md 저장 (여러 파일 → 합본 1개)
  const handleDownloadCombined = useCallback(async () => {
    if (masked === null || !canCopy) return;
    const r = await saveMarkdownFile(masked, '변환결과.md');
    if (r === 'saved') {
      setDownloaded(true);
      window.setTimeout(() => setDownloaded(false), 2000);
    }
  }, [masked, canCopy]);

  // 개별 저장 — 파일마다 개별 .md 로 묶은 ZIP 한 개로 내보내기
  const handleDownloadEach = useCallback(async () => {
    if (masked === null || !canCopy || maskedFiles.length === 0) return;
    const r = await saveMarkdownZip(
      maskedFiles.map((f) => ({ name: toMdFileName(f.fileName), text: f.text })),
      '변환결과.zip',
    );
    if (r === 'saved') {
      setDownloadedEach(true);
      window.setTimeout(() => setDownloadedEach(false), 2000);
    }
  }, [masked, canCopy, maskedFiles]);

  // 한글(.hwpx) 저장 결과 처리 공통 — 성공/없음/실패 메시지
  const applyHwpxResult = useCallback((r: 'saved' | 'canceled' | 'unavailable' | 'error') => {
    if (r === 'saved') {
      setHwpxSaved(true);
      window.setTimeout(() => setHwpxSaved(false), 2000);
    } else if (r === 'unavailable') {
      setSaveMsg('한글로 저장하기는 쌤핀 데스크톱 앱에서만 가능해요.');
    } else if (r === 'error') {
      setSaveMsg('한글로 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, []);

  // 한글(.hwpx) 저장 — 현재 보기(단일 또는 선택 파일)
  const handleSaveHwpx = useCallback(async () => {
    if (masked === null || !canCopy || hwpxBusy) return;
    setHwpxBusy(true);
    setSaveMsg(null);
    try {
      applyHwpxResult(await saveHwpxFile(currentResult.text, toHwpxFileName(currentResult.name)));
    } finally {
      setHwpxBusy(false);
    }
  }, [masked, canCopy, hwpxBusy, currentResult, applyHwpxResult]);

  // 통합 .hwpx 저장 (여러 파일 → 합본 1개)
  const handleSaveHwpxCombined = useCallback(async () => {
    if (masked === null || !canCopy || hwpxBusy) return;
    setHwpxBusy(true);
    setSaveMsg(null);
    try {
      applyHwpxResult(await saveHwpxFile(masked, '변환결과.hwpx'));
    } finally {
      setHwpxBusy(false);
    }
  }, [masked, canCopy, hwpxBusy, applyHwpxResult]);

  // 개별 .hwpx 저장 — 파일마다 .hwpx 로 묶은 ZIP 한 개
  const handleSaveHwpxEach = useCallback(async () => {
    if (masked === null || !canCopy || hwpxBusy || maskedFiles.length === 0) return;
    setHwpxBusy(true);
    setSaveMsg(null);
    try {
      applyHwpxResult(
        await saveHwpxZip(
          maskedFiles.map((f) => ({ name: toHwpxFileName(f.fileName), markdown: f.text })),
          '변환결과(한글).zip',
        ),
      );
    } finally {
      setHwpxBusy(false);
    }
  }, [masked, canCopy, hwpxBusy, maskedFiles, applyHwpxResult]);

  const handleSaveSession = useCallback(async () => {
    if (mappings.length === 0 || docs.length === 0) return;
    const now = Date.now();
    const label = docs.length === 1 ? docs[0]!.fileName : `여러 문서 ${docs.length}개`;
    try {
      await manageMaskSessions.save({
        id: crypto.randomUUID(),
        label,
        createdAt: now,
        expiresAt: now + SAVE_TTL_MS,
        mappings,
      });
      setSaveMsg('변환표를 이 기기에 암호화해 보관했어요. (7일 후 자동 삭제)');
      refreshSaved();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '보관에 실패했어요.');
    }
  }, [mappings, docs, refreshSaved]);

  // 복원
  const restoreMappings = useMemo<readonly MaskMapping[]>(() => {
    if (restoreSourceId === 'current') return mappings;
    return savedSessions.find((s) => s.id === restoreSourceId)?.mappings ?? [];
  }, [restoreSourceId, mappings, savedSessions]);

  const handleRestore = useCallback(() => {
    setRestoreOutput(maskMarkdown.restore(restoreInput, restoreMappings));
    setRestoreCopied(false);
  }, [restoreInput, restoreMappings]);

  const handleRestoreCopy = useCallback(async () => {
    if (restoreOutput === null) return;
    await navigator.clipboard.writeText(restoreOutput);
    setRestoreCopied(true);
    window.setTimeout(() => setRestoreCopied(false), 2000);
  }, [restoreOutput]);

  const handleRestoreDownload = useCallback(async () => {
    if (restoreOutput === null) return;
    const r = await saveMarkdownFile(restoreOutput, '복원결과.md');
    if (r === 'saved') {
      setRestoreDownloaded(true);
      window.setTimeout(() => setRestoreDownloaded(false), 2000);
    }
  }, [restoreOutput]);

  const handleRestoreSaveHwpx = useCallback(async () => {
    if (restoreOutput === null || hwpxBusy) return;
    setHwpxBusy(true);
    try {
      const r = await saveHwpxFile(restoreOutput, '복원결과.hwpx');
      if (r === 'saved') {
        setRestoreHwpxSaved(true);
        window.setTimeout(() => setRestoreHwpxSaved(false), 2000);
      }
    } finally {
      setHwpxBusy(false);
    }
  }, [restoreOutput, hwpxBusy]);

  const handleClearSaved = useCallback(async () => {
    await manageMaskSessions.clearAll();
    refreshSaved();
    if (restoreSourceId !== 'current') setRestoreSourceId('current');
  }, [refreshSaved, restoreSourceId]);

  return (
    <ToolLayout
      title="마크다운 변환기"
      emoji="📄"
      onBack={onBack}
      isFullscreen={isFullscreen}
      disableZoom
    >
      <div className="flex flex-col h-full w-full">
        {/* 탭 */}
        <div className="inline-flex shrink-0 rounded-lg border border-sp-border bg-sp-surface/60 p-0.5 gap-0.5 mb-5">
          {(['convert', 'restore'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm transition-all duration-sp-base ease-sp-out ${
                tab === t
                  ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
                  : 'font-sp-medium text-sp-muted hover:text-sp-text'
              }`}
            >
              {t === 'convert' ? '변환하기' : '되돌리기'}
            </button>
          ))}
        </div>

        {/* 안내(접이식) */}
        <div className="shrink-0 rounded-2xl border border-sp-border bg-sp-card mb-5">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <span className="font-sp-semibold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-icon">help</span>
              마크다운이 뭐예요? 왜 필요해요?
            </span>
            <span className="material-symbols-outlined text-sp-muted">
              {helpOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {helpOpen && (
            <div className="px-5 pb-4 text-sm text-sp-muted space-y-2 border-t border-sp-border pt-3">
              <p>
                <strong className="text-sp-text">마크다운</strong>은 제목·목록·표 같은 구조는 그대로
                두면서 AI가 가장 잘 알아듣게 정리한 깔끔한 글이에요. 한글·PDF·엑셀 파일에서
                군더더기를 걷어내고 내용만 또렷하게 남깁니다.
              </p>
              <p>
                ChatGPT·제미나이·클로드에 파일을 그대로 넣으면 표가 깨지거나 엉뚱하게 읽는 일이
                많은데, 마크다운으로 바꿔 넣으면 훨씬 정확하게 이해해요.
              </p>
              <p>
                <strong className="text-sp-text">개인정보 가리기</strong>를 켜면 학생
                이름·연락처·주소 같은 정보를 가린 채로 내보낼 수 있어요. AI 작업을 끝낸 뒤 결과를{' '}
                <strong className="text-sp-text">되돌리기</strong> 탭에 붙여넣으면 실명으로
                복원됩니다.
              </p>
            </div>
          )}
        </div>

        {tab === 'convert' ? (
          <div className="grid lg:grid-cols-2 gap-5 flex-1 min-h-0">
            {/* 왼쪽: 1·2 */}
            <div className="space-y-5 overflow-y-auto min-h-0 lg:pr-1">
              {/* 1. 파일 선택 */}
              <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
                <h3 className="font-sp-semibold text-sp-text mb-1">1. 변환할 문서 고르기</h3>
                <p className="text-sm text-sp-muted mb-4">
                  한글(.hwp/.hwpx) · PDF · 엑셀(.xls/.xlsx) · 워드(.docx)를 지원해요. 파일은 이
                  컴퓨터에서만 처리되고 밖으로 나가지 않아요.
                </p>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                    dragOver
                      ? 'border-sp-accent bg-sp-accent/10'
                      : 'border-sp-border bg-sp-surface/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-4xl text-sp-muted">
                    upload_file
                  </span>
                  <p className="mt-2 text-sm text-sp-muted">
                    {dragOver ? '여기에 놓으세요' : '파일을 여기로 끌어다 놓거나 (여러 개 가능)'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handlePick()}
                    disabled={busy}
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg font-sp-semibold hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-icon">folder_open</span>
                    {busy ? '처리 중…' : '문서 선택하기'}
                  </button>
                </div>

                {error && (
                  <p className="mt-3 text-sm text-red-500 flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-icon-sm">error</span>
                    {error}
                  </p>
                )}

                {docs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {docs.length > 1 && (
                      <p className="text-caption text-sp-muted">
                        변환된 문서 {docs.length}개 — 하나의 마크다운으로 합쳐집니다
                      </p>
                    )}
                    {docs.map((d, i) => {
                      const notice = textQualityNotice(d.textQuality);
                      const meta = d.metadata;
                      const hasMeta =
                        !!meta &&
                        (meta.title ||
                          meta.author ||
                          meta.createdAt ||
                          typeof meta.pageCount === 'number');
                      return (
                        <div
                          key={`${d.fileName}-${i}`}
                          className="rounded-xl border border-sp-border bg-sp-surface/50 px-4 py-3"
                        >
                          <p className="text-sm text-sp-text flex items-center gap-2">
                            <span className="material-symbols-outlined text-icon-sm text-sp-accent">
                              description
                            </span>
                            <span className="font-sp-medium truncate">{d.fileName}</span>
                            <span className="text-caption text-sp-muted uppercase">{d.format}</span>
                          </p>

                          {/* 문서 정보(있을 때만) — 표시 전용, 변환 본문에는 포함되지 않음 */}
                          {hasMeta && meta && (
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-sp-muted">
                              {meta.title && (
                                <span className="truncate max-w-full">제목: {meta.title}</span>
                              )}
                              {meta.author && <span>작성자: {meta.author}</span>}
                              {meta.createdAt && (
                                <span>작성일: {formatDocDate(meta.createdAt)}</span>
                              )}
                              {typeof meta.pageCount === 'number' && (
                                <span>분량: {meta.pageCount}쪽/시트</span>
                              )}
                            </div>
                          )}

                          {/* 문서 목차(있을 때만) — 접이식 */}
                          {d.outline && d.outline.length > 0 && (
                            <details className="mt-2">
                              <summary className="text-caption text-sp-accent cursor-pointer select-none">
                                문서 목차 {d.outline.length}개 보기
                              </summary>
                              <ul className="mt-1.5 space-y-0.5 max-h-40 overflow-auto">
                                {d.outline.map((h, hi) => (
                                  <li
                                    key={`${h.text}-${hi}`}
                                    className="text-caption text-sp-muted truncate"
                                    style={{ paddingLeft: `${Math.max(0, h.level - 1) * 12}px` }}
                                  >
                                    {h.text}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}

                          {/* 텍스트 추출 품질 안내(스캔/깨짐) */}
                          {notice && (
                            <p className="mt-2 text-sm text-amber-500 flex items-start gap-1.5">
                              <span className="material-symbols-outlined text-icon-sm">
                                {notice.tone === 'scan' ? 'image' : 'warning'}
                              </span>
                              {notice.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 2. 가리기 옵션 */}
              {docs.length > 0 && (
                <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-sp-semibold text-sp-text">2. 개인정보 가리기 (선택)</h3>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={maskOn}
                      onClick={() => setMaskOn((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        maskOn ? 'bg-sp-accent' : 'bg-sp-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                          maskOn ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-sm text-sp-muted mb-4">
                    켜면 아래 항목을 가립니다. 100% 보장은 아니라서, 복사 전에 결과를 꼭 한 번
                    확인해 주세요.
                  </p>

                  {maskOn && (
                    <div className="space-y-4">
                      {/* 자동 패턴 */}
                      <div>
                        <p className="text-sm font-sp-medium text-sp-text mb-2">
                          자동으로 찾아 가리기
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ['phone', '전화번호'],
                              ['rrn', '주민등록번호'],
                              ['email', '이메일'],
                              ['birth', '생년월일'],
                              ['address', '집주소 (꼭 확인)'],
                            ] as const
                          ).map(([key, label]) => (
                            <label
                              key={key}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                                patterns[key]
                                  ? 'border-sp-accent/40 bg-sp-accent/10 text-sp-text'
                                  : 'border-sp-border text-sp-muted'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={patterns[key]}
                                onChange={(e) =>
                                  setPatterns((p) => ({ ...p, [key]: e.target.checked }))
                                }
                                className="accent-sp-accent"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <p className="text-caption text-sp-muted mt-1.5">
                          집주소는 형태가 일정하지 않아 놓치거나 잘못 잡을 수 있어요. 결과에서 꼭
                          확인하세요.
                        </p>
                      </div>

                      {/* 수동 키워드 (통합 입력) */}
                      <div>
                        <p className="text-sm font-sp-medium text-sp-text mb-1">
                          가릴 단어 직접 입력
                        </p>
                        <textarea
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          placeholder="가릴 단어를 쉼표(,)로 구분해 입력 — 예: 김민준, 행복중학교, 강남구"
                          rows={3}
                          className="w-full rounded-lg border border-sp-border bg-sp-surface/50 px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 resize-none focus:outline-none focus:ring-2 focus:ring-sp-accent/40"
                        />
                        <p className="text-caption text-sp-muted mt-1">
                          이름·학교·지역 등 가리고 싶은 단어를 자유롭게 넣으세요. 조사가 붙어도(예:
                          김민준이) 함께 가려집니다.
                        </p>
                      </div>

                      {/* 반 선택 → 이름 자동 채움 */}
                      {rosters.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-sp-muted">반 명단에서 이름 채우기:</span>
                          <select
                            value={rosterId}
                            onChange={(e) => setRosterId(e.target.value)}
                            className="rounded-lg border border-sp-border bg-sp-surface/50 px-3 py-1.5 text-sm text-sp-text"
                          >
                            <option value="">반 선택 안 함</option>
                            {rosters.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.studentNames.length}명)
                              </option>
                            ))}
                          </select>
                          {rosterNames.length > 0 && (
                            <span className="text-caption text-sp-accent">
                              학생 {rosterNames.length}명 이름이 키워드에 자동 추가됩니다
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConvert}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg font-sp-semibold hover:brightness-110 transition-all"
                  >
                    <span className="material-symbols-outlined text-icon">sync_alt</span>
                    {maskOn ? '가리고 변환하기' : '변환하기'}
                  </button>
                </section>
              )}
            </div>

            {/* 오른쪽: 3. 결과 */}
            <div className="min-h-0 flex flex-col">
              {masked === null ? (
                <div className="flex-1 rounded-2xl border border-dashed border-sp-border bg-sp-card/40 flex items-center justify-center p-8 text-center">
                  <p className="text-sm text-sp-muted">
                    왼쪽에서 문서를 골라 변환하면
                    <br />
                    결과가 여기에 표시됩니다.
                  </p>
                </div>
              ) : (
                <section className="flex-1 min-h-0 rounded-2xl border border-sp-border bg-sp-card p-5 flex flex-col">
                  <h3 className="font-sp-semibold text-sp-text mb-3 shrink-0">
                    3. 결과 확인 후 복사
                  </h3>

                  {maskOn && (
                    <div className="mb-3 rounded-xl border border-sp-border bg-sp-surface/50 px-4 py-3">
                      <p className="text-sm text-sp-text font-sp-medium mb-1">
                        가린 항목 {mappings.length}개
                      </p>
                      {maskSummary.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {maskSummary.map(([kind, n]) => (
                            <span
                              key={kind}
                              className={`text-caption px-2 py-0.5 rounded-md ${
                                LOW_CONFIDENCE_KINDS.has(kind)
                                  ? 'bg-amber-500/15 text-amber-600'
                                  : 'bg-sp-accent/10 text-sp-accent'
                              }`}
                            >
                              {KIND_LABEL[kind]} {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-caption text-sp-muted">가릴 항목을 찾지 못했어요.</p>
                      )}
                      {hasLowConfidence && (
                        <p className="mt-2 text-caption text-amber-600 flex items-start gap-1">
                          <span className="material-symbols-outlined text-icon-sm">warning</span>
                          주소는 놓치거나 잘못 잡을 수 있어요. 아래 결과를 꼭 확인하세요.
                        </p>
                      )}
                    </div>
                  )}

                  {docs.length > 1 && (
                    <div className="mb-2 shrink-0 flex items-center gap-2 flex-wrap">
                      <span className="text-caption text-sp-muted">결과 보기:</span>
                      <select
                        value={resultView === 'all' ? 'all' : String(resultView)}
                        onChange={(e) =>
                          setResultView(e.target.value === 'all' ? 'all' : Number(e.target.value))
                        }
                        className="rounded-lg border border-sp-border bg-sp-surface/50 px-3 py-1.5 text-sm text-sp-text max-w-full"
                      >
                        <option value="all">전체 합본 ({docs.length}개)</option>
                        {docs.map((d, i) => (
                          <option key={`${d.fileName}-${i}`} value={String(i)}>
                            {d.fileName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <pre className="flex-1 min-h-0 overflow-auto rounded-xl border border-sp-border bg-sp-surface/50 p-4 text-sm text-sp-text whitespace-pre-wrap break-words font-mono">
                    {currentResult.text}
                  </pre>

                  {maskOn && (
                    <label className="mt-3 flex items-center gap-2 text-sm text-sp-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                        className="accent-sp-accent"
                      />
                      결과를 확인했고, 개인정보가 남아 있지 않음을 확인했어요.
                    </label>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      disabled={!canCopy}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg font-sp-semibold hover:brightness-110 transition-all disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-icon">content_copy</span>
                      {copied ? '복사됨!' : '마크다운 복사'}
                    </button>
                    {docs.length <= 1 ? (
                      <button
                        type="button"
                        onClick={() => void handleDownload()}
                        disabled={!canCopy}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-icon">download</span>
                        {downloaded ? '저장됨!' : 'md 파일로 저장'}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDownloadCombined()}
                          disabled={!canCopy}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                          title="모든 문서를 하나의 .md 파일로 저장"
                        >
                          <span className="material-symbols-outlined text-icon">description</span>
                          {downloaded ? '저장됨!' : '통합 .md 저장'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadEach()}
                          disabled={!canCopy}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                          title="문서마다 개별 .md 로 묶은 ZIP 한 개로 저장"
                        >
                          <span className="material-symbols-outlined text-icon">folder_zip</span>
                          {downloadedEach ? '저장됨!' : '개별 저장 (ZIP)'}
                        </button>
                      </>
                    )}
                    {docs.length <= 1 ? (
                      <button
                        type="button"
                        onClick={() => void handleSaveHwpx()}
                        disabled={!canCopy || hwpxBusy}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                        title="변환 결과를 한글(.hwpx) 문서로 저장"
                      >
                        <span className="material-symbols-outlined text-icon">article</span>
                        {hwpxBusy ? '저장 중…' : hwpxSaved ? '저장됨!' : '한글(.hwpx)로 저장'}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleSaveHwpxCombined()}
                          disabled={!canCopy || hwpxBusy}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                          title="모든 문서를 하나의 한글(.hwpx) 파일로 저장"
                        >
                          <span className="material-symbols-outlined text-icon">article</span>
                          {hwpxBusy ? '저장 중…' : hwpxSaved ? '저장됨!' : '통합 .hwpx 저장'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveHwpxEach()}
                          disabled={!canCopy || hwpxBusy}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                          title="문서마다 개별 한글(.hwpx) 로 묶은 ZIP 한 개로 저장"
                        >
                          <span className="material-symbols-outlined text-icon">folder_zip</span>
                          {hwpxBusy ? '저장 중…' : hwpxSaved ? '저장됨!' : '개별 .hwpx (ZIP)'}
                        </button>
                      </>
                    )}
                    {maskOn && mappings.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleSaveSession()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all"
                        title="나중에 실명으로 되돌리려면 변환표를 보관하세요"
                      >
                        <span className="material-symbols-outlined text-icon">lock</span>이 변환표
                        보관
                      </button>
                    )}
                    {!canCopy && maskOn && (
                      <span className="text-caption text-sp-muted">
                        확인란을 체크하면 복사할 수 있어요
                      </span>
                    )}
                  </div>
                  {saveMsg && <p className="mt-2 shrink-0 text-caption text-sp-muted">{saveMsg}</p>}
                </section>
              )}
            </div>
          </div>
        ) : (
          /* 되돌리기 탭 */
          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 max-w-3xl">
            <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
              <h3 className="font-sp-semibold text-sp-text mb-1">AI 결과를 실명으로 되돌리기</h3>
              <p className="text-sm text-sp-muted mb-4">
                가린 글로 AI 작업을 끝낸 뒤, 그 결과를 여기에 붙여넣으면 별칭(［이름1］ 등)을 원래
                값으로 되돌려 줍니다.
              </p>

              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-sp-muted">사용할 변환표:</span>
                <select
                  value={restoreSourceId}
                  onChange={(e) => setRestoreSourceId(e.target.value)}
                  className="rounded-lg border border-sp-border bg-sp-surface/50 px-3 py-1.5 text-sm text-sp-text"
                >
                  <option value="current">방금 변환한 표 ({mappings.length}개)</option>
                  {savedSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} · 보관됨 ({s.mappings.length}개)
                    </option>
                  ))}
                </select>
                {savedSessions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleClearSaved()}
                    className="text-caption text-sp-muted hover:text-red-500 transition-colors"
                  >
                    보관 변환표 모두 비우기
                  </button>
                )}
              </div>

              <textarea
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value)}
                placeholder="AI가 돌려준 결과를 여기에 붙여넣으세요"
                rows={8}
                className="w-full rounded-xl border border-sp-border bg-sp-surface/50 px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/60 resize-y focus:outline-none focus:ring-2 focus:ring-sp-accent/40"
              />

              <button
                type="button"
                onClick={handleRestore}
                disabled={restoreInput.trim().length === 0 || restoreMappings.length === 0}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg font-sp-semibold hover:brightness-110 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-icon">restore</span>실명으로
                되돌리기
              </button>
              {restoreMappings.length === 0 && (
                <p className="mt-2 text-caption text-sp-muted">
                  사용할 변환표가 없어요. 변환하기 탭에서 가리기를 먼저 하거나, 보관한 변환표를
                  선택하세요.
                </p>
              )}
            </section>

            {restoreOutput !== null && (
              <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
                <h3 className="font-sp-semibold text-sp-text mb-3">되돌린 결과</h3>
                <pre className="max-h-80 overflow-auto rounded-xl border border-sp-border bg-sp-surface/50 p-4 text-sm text-sp-text whitespace-pre-wrap break-words font-mono">
                  {restoreOutput}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRestoreCopy()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg font-sp-semibold hover:brightness-110 transition-all"
                  >
                    <span className="material-symbols-outlined text-icon">content_copy</span>
                    {restoreCopied ? '복사됨!' : '결과 복사'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRestoreDownload()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all"
                  >
                    <span className="material-symbols-outlined text-icon">download</span>
                    {restoreDownloaded ? '저장됨!' : 'md 파일로 저장'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRestoreSaveHwpx()}
                    disabled={hwpxBusy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sp-border text-sp-text font-sp-medium hover:bg-sp-surface transition-all disabled:opacity-50"
                    title="되돌린 결과를 한글(.hwpx) 문서로 저장"
                  >
                    <span className="material-symbols-outlined text-icon">article</span>
                    {hwpxBusy ? '저장 중…' : restoreHwpxSaved ? '저장됨!' : '한글(.hwpx)로 저장'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
