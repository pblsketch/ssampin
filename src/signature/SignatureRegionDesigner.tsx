/**
 * Phase 2C Step D — SignatureRegionDesigner (PRD US-2C-09).
 *
 * 교사가 업로드한 PDF 양식 위에 드래그로 서명 영역 (`SignatureRegion`) 을 그린다.
 * 각 사각형은 참여자 + 서명 종류 (recipient/student/parent/...) 에 바인딩되며,
 * Pattern 2 토글 ON + 두 번째 사각형 드래그 → 명단 N명 자동복제.
 *
 * 좌표 모델:
 *   - 모든 region rect 는 정규화 0~1 (pdfTemplate.pageWidth / pageHeight 기준)
 *   - PDF 페이지를 화면 폭에 맞춰 scale 한 canvas + 같은 크기 SVG overlay 가 위에 얹힘
 *   - drag start/end 의 viewport 픽셀 좌표 → 정규화 변환 후 SignatureRegion 으로 저장
 *
 * 검증 (signatureRegionRules):
 *   - 최소 크기 50×20 px (현재 viewport 기준)
 *   - 페이지 경계 안 (0~1)
 *
 * 자동복제 (inferRowSpacing):
 *   - 균일 양식: 첫 두 사각형 → inferRowSpacing → N명 replicateUniformRows
 *   - 비균일 감지: paused state + manual fallback 안내
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PdfRegionRect,
  PdfTemplate,
  SignatureKind,
  SignatureParticipant,
  SignatureRegion,
} from '@domain/entities/SignatureRequest';
import {
  checkParticipantRegionMatch,
  isWithinPageBounds,
  meetsMinimumSize,
} from '@domain/rules/signatureRegionRules';
import { inferRowSpacing, replicateUniformRows } from './inferRowSpacing';

const SIGNATURE_KIND_LABELS: Record<SignatureKind, string> = {
  recipient: '대상자 서명',
  student: '학생 서명',
  parent: '학부모 서명',
  guardian: '보호자 서명',
  teacher: '교사 서명',
};

const MIN_REGION_SCREEN_PX = { width: 50, height: 20 } as const;

interface PageViewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface SignatureRegionDesignerProps {
  readonly pdfTemplate: PdfTemplate;
  readonly pdfUrl: string;
  readonly participants: readonly SignatureParticipant[];
  readonly initialRegions?: readonly SignatureRegion[];
  readonly onRegionsChange: (regions: readonly SignatureRegion[]) => void;
  /** 화면 폭에 맞춘 PDF render 크기 (기본 720px) */
  readonly canvasWidth?: number;
}

type ToastInfo = { readonly tone: 'error' | 'warn' | 'info'; readonly message: string };

interface DragState {
  readonly pageIndex: number;
  readonly startX: number; // 정규화
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
}

export function SignatureRegionDesigner({
  pdfTemplate,
  pdfUrl,
  participants,
  initialRegions = [],
  onRegionsChange,
  canvasWidth = 720,
}: SignatureRegionDesignerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [regions, setRegions] = useState<readonly SignatureRegion[]>(initialRegions);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [pattern2Mode, setPattern2Mode] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [pageViewports, setPageViewports] = useState<Map<number, PageViewport>>(new Map());
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<unknown | null>(null); // PDFDocumentProxy
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // 외부 변경 콜백
  useEffect(() => {
    onRegionsChange(regions);
  }, [regions, onRegionsChange]);

  // PDF 로드 (dynamic import — pdfjs-dist 5.x)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPdfLoadError(null);
        // @ts-expect-error pdfjs-dist 5.x subpath types not exported
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
          .default as string;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error(`PDF fetch failed (HTTP ${response.status})`);
        const buf = new Uint8Array(await response.arrayBuffer());
        const loadingTask = pdfjs.getDocument({ data: buf, verbosity: 0 });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        // 첫 페이지부터 viewport 등록 — current page 강제 0
        await renderPage(doc, 0, canvasWidth);
      } catch (err) {
        if (!cancelled) {
          setPdfLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, canvasWidth]);

  // 페이지 전환 시 렌더
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    void renderPage(doc, currentPage, canvasWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, canvasWidth]);

  const renderPage = useCallback(async (doc: unknown, pageIndex: number, targetWidth: number) => {
    try {
      setIsLoadingPage(true);
      const d = doc as {
        getPage: (n: number) => Promise<{
          getViewport: (opts: { scale: number }) => { width: number; height: number };
          render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
            promise: Promise<void>;
          };
        }>;
      };
      const page = await d.getPage(pageIndex + 1);
      const initialViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / initialViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      setPageViewports((prev) => {
        const next = new Map(prev);
        next.set(pageIndex, { width: viewport.width, height: viewport.height, scale });
        return next;
      });
    } finally {
      setIsLoadingPage(false);
    }
  }, []);

  const currentViewport = pageViewports.get(currentPage);
  const regionsByPage = useMemo(() => {
    const map = new Map<number, SignatureRegion[]>();
    for (const r of regions) {
      if (!map.has(r.pageIndex)) map.set(r.pageIndex, []);
      map.get(r.pageIndex)!.push(r);
    }
    return map;
  }, [regions]);

  const currentPageRegions = useMemo(
    () => regionsByPage.get(currentPage) ?? [],
    [regionsByPage, currentPage],
  );

  const applyPattern2 = useCallback(
    (
      firstAnchor: SignatureRegion,
      secondRect: PdfRegionRect,
      _firstParticipant: SignatureParticipant,
    ) => {
      const spacing = inferRowSpacing({ first: firstAnchor.rect, second: secondRect });
      if (spacing <= 0) {
        setToast({
          tone: 'warn',
          message: '두 사각형이 너무 가깝습니다. Pattern 2 자동복제는 행 간격이 필요해요.',
        });
        return;
      }
      const target = participants.length;
      const replicated = replicateUniformRows(firstAnchor.rect, spacing, target);
      if (replicated.length < target) {
        setToast({
          tone: 'warn',
          message: `자동복제 결과가 ${target}명 중 ${replicated.length}명까지만 페이지에 들어갑니다. 더 작은 사각형이나 다음 페이지에 이어 그려 주세요.`,
        });
      } else {
        setToast({
          tone: 'info',
          message: `${target}명 자동복제 완료. 빗나간 위치가 있으면 개별 사각형을 드래그해 조정해 주세요.`,
        });
      }
      const newRegions: SignatureRegion[] = [];
      replicated.forEach((rect, idx) => {
        if (idx === 0) return; // anchor 자체는 이미 있음
        const participantForRow = participants[idx];
        if (!participantForRow) return;
        const id = generateRegionId();
        newRegions.push({
          id,
          pageIndex: currentPage,
          rect,
          participantId: participantForRow.id,
          signatureKind: pickDefaultKind(participantForRow),
          autoReplicateRowSourceId: firstAnchor.id,
        });
      });
      setRegions((current) => [...current, ...newRegions]);
      setPattern2Mode(false); // 자동복제 직후 토글 OFF (혼란 방지)
    },
    [currentPage, participants],
  );

  // 드래그 처리
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!currentViewport) return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      setSelectedRegionId(null);
      setDrag({
        pageIndex: currentPage,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
      overlay.setPointerCapture(event.pointerId);
    },
    [currentPage, currentViewport],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      setDrag({ ...drag, currentX: x, currentY: y });
    },
    [drag],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const overlay = overlayRef.current;
      overlay?.releasePointerCapture(event.pointerId);
      const newRect: PdfRegionRect = normalizeDrag(drag);
      setDrag(null);
      if (!currentViewport) return;
      if (!isWithinPageBounds(newRect)) {
        setToast({ tone: 'error', message: '사각형이 페이지 안에 들어가야 해요.' });
        return;
      }
      if (!meetsMinimumSize(newRect, currentViewport)) {
        setToast({
          tone: 'warn',
          message: `사각형 최소 크기는 ${MIN_REGION_SCREEN_PX.width}×${MIN_REGION_SCREEN_PX.height}px 입니다.`,
        });
        return;
      }
      const participant = participants[0];
      if (!participant) {
        setToast({
          tone: 'warn',
          message: '먼저 명단을 등록해 주세요. (참여자가 없으면 영역을 만들 수 없어요.)',
        });
        return;
      }

      // Pattern 2: 같은 페이지에 이미 anchor 1개 있고 토글 ON 이면 자동복제
      const pageAnchors = currentPageRegions.filter((r) => !r.autoReplicateRowSourceId);
      if (pattern2Mode && pageAnchors.length === 1) {
        applyPattern2(pageAnchors[0]!, newRect, participant);
        return;
      }

      // 일반 추가
      const id = generateRegionId();
      const region: SignatureRegion = {
        id,
        pageIndex: currentPage,
        rect: newRect,
        participantId: participant.id,
        signatureKind: pickDefaultKind(participant),
      };
      setRegions((current) => [...current, region]);
      setSelectedRegionId(id);
      setToast(null);
    },
    [
      drag,
      currentViewport,
      participants,
      currentPageRegions,
      pattern2Mode,
      currentPage,
      applyPattern2,
    ],
  );

  const updateRegion = useCallback(
    (id: string, patch: Partial<Pick<SignatureRegion, 'participantId' | 'signatureKind'>>) => {
      setRegions((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [],
  );

  const deleteRegion = useCallback((id: string) => {
    setRegions((current) =>
      current.filter((r) => r.id !== id && r.autoReplicateRowSourceId !== id),
    );
    setSelectedRegionId(null);
  }, []);

  const selectedRegion = useMemo(
    () => regions.find((r) => r.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  const participantRegionMatch = useMemo(
    () => checkParticipantRegionMatch(participants, regions),
    [participants, regions],
  );

  return (
    <section
      className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm"
      data-testid="signature-region-designer"
    >
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-sp-semibold text-sp-accent">서명 영역 지정</p>
          <h3 className="mt-1 text-base font-sp-bold text-sp-text">
            PDF 위에 사각형을 드래그해 서명 자리를 지정해 주세요
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-sp-muted">
            {`${pdfTemplate.pageCount}페이지 / 참여자 ${participants.length}명 / 영역 ${regions.length}개`}
            {participantRegionMatch.status === 'too-few-regions' && (
              <span className="ml-2 text-amber-700" data-testid="region-shortfall">
                — {participantRegionMatch.shortfall}명에게 자리가 부족해요
              </span>
            )}
            {participantRegionMatch.status === 'too-many-regions' && (
              <span className="ml-2 text-amber-700">
                — 사각형이 명단보다 많아요. 일부를 삭제해 주세요
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPattern2Mode((v) => !v)}
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-sp-semibold transition-colors ${
            pattern2Mode
              ? 'border-sp-accent bg-sp-accent text-white'
              : 'border-sp-border bg-sp-surface text-sp-muted hover:border-sp-accent hover:text-sp-accent'
          }`}
          data-testid="pattern2-toggle"
          aria-pressed={pattern2Mode}
        >
          {pattern2Mode ? 'Pattern 2 자동복제: 켜짐' : 'Pattern 2 자동복제: 꺼짐'}
        </button>
      </header>

      {pattern2Mode && currentPageRegions.length === 0 && (
        <p
          className="mb-3 rounded-xl border border-sp-accent/40 bg-sp-accent/5 px-3 py-2 text-xs leading-relaxed text-sp-accent"
          data-testid="pattern2-hint-1"
        >
          1단계: 명단 첫 번째 사람의 서명 자리를 사각형으로 그려 주세요.
        </p>
      )}
      {pattern2Mode && currentPageRegions.length === 1 && (
        <p
          className="mb-3 rounded-xl border border-sp-accent/40 bg-sp-accent/5 px-3 py-2 text-xs leading-relaxed text-sp-accent"
          data-testid="pattern2-hint-2"
        >
          2단계: 두 번째 사람의 서명 자리를 그리면 행 간격을 자동 계산해 {participants.length}명까지
          복제합니다.
        </p>
      )}

      {pdfLoadError && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700"
          data-testid="pdf-load-error"
        >
          PDF 를 불러오지 못했어요: {pdfLoadError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          {/* 페이지 네비게이션 */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-sp-border bg-sp-surface/60 px-3 py-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-lg border border-sp-border px-2 py-1 text-xs font-sp-semibold text-sp-muted disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-xs text-sp-muted" data-testid="page-indicator">
              {currentPage + 1} / {pdfTemplate.pageCount}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(pdfTemplate.pageCount - 1, p + 1))}
              disabled={currentPage >= pdfTemplate.pageCount - 1}
              className="rounded-lg border border-sp-border px-2 py-1 text-xs font-sp-semibold text-sp-muted disabled:opacity-40"
            >
              다음
            </button>
          </div>

          {/* 캔버스 + overlay */}
          <div
            className="relative inline-block max-w-full overflow-hidden rounded-xl border border-sp-border bg-white shadow-sp-sm"
            style={{ width: canvasWidth }}
          >
            <canvas ref={canvasRef} className="block" data-testid="designer-canvas" />
            <div
              ref={overlayRef}
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              data-testid="designer-overlay"
              role="application"
              aria-label="서명 영역 드래그 캔버스"
            >
              {/* 기존 region 들 */}
              {currentPageRegions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedRegionId(region.id);
                  }}
                  className={`absolute border-2 ${
                    selectedRegionId === region.id
                      ? 'border-sp-accent bg-sp-accent/20'
                      : region.autoReplicateRowSourceId
                        ? 'border-emerald-400 bg-emerald-50/30'
                        : 'border-amber-500 bg-amber-50/30'
                  }`}
                  style={{
                    left: `${region.rect.x * 100}%`,
                    top: `${region.rect.y * 100}%`,
                    width: `${region.rect.w * 100}%`,
                    height: `${region.rect.h * 100}%`,
                  }}
                  aria-label={`영역 ${region.id} 편집`}
                  data-testid={`region-${region.id}`}
                />
              ))}
              {/* 진행 중인 drag preview */}
              {drag && drag.pageIndex === currentPage && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-sp-accent bg-sp-accent/10"
                  style={normalizeDragToStyle(drag)}
                  data-testid="drag-preview"
                />
              )}
            </div>
            {isLoadingPage && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-xs text-sp-muted">
                페이지 렌더 중...
              </div>
            )}
          </div>

          {toast && (
            <p
              role="status"
              className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                toast.tone === 'error'
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : toast.tone === 'warn'
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-700'
              }`}
              data-testid="designer-toast"
            >
              {toast.message}
            </p>
          )}
        </div>

        {/* 사이드 패널 */}
        <aside className="rounded-xl border border-sp-border bg-sp-surface/40 p-4">
          {selectedRegion ? (
            <RegionEditPanel
              region={selectedRegion}
              participants={participants}
              onUpdate={(patch) => updateRegion(selectedRegion.id, patch)}
              onDelete={() => deleteRegion(selectedRegion.id)}
            />
          ) : (
            <div className="space-y-2 text-xs leading-relaxed text-sp-muted">
              <p className="font-sp-bold text-sp-text">사각형 편집</p>
              <p>
                사각형을 클릭하면 참여자와 서명 종류를 변경할 수 있어요. Pattern 2 자동복제가 어긋난
                위치가 있으면 개별 사각형을 드래그해 다시 그리거나, 삭제 후 그려 주세요.
              </p>
              <div className="mt-3 rounded-lg border border-sp-border bg-sp-card p-2">
                <p className="font-sp-bold text-sp-text">색상 안내</p>
                <ul className="mt-1 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border-2 border-amber-500 bg-amber-50" />
                    수동 사각형
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border-2 border-emerald-400 bg-emerald-50" />
                    자동복제 사각형
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded border-2 border-sp-accent bg-sp-accent/20" />
                    선택됨
                  </li>
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function RegionEditPanel({
  region,
  participants,
  onUpdate,
  onDelete,
}: {
  readonly region: SignatureRegion;
  readonly participants: readonly SignatureParticipant[];
  readonly onUpdate: (
    patch: Partial<Pick<SignatureRegion, 'participantId' | 'signatureKind'>>,
  ) => void;
  readonly onDelete: () => void;
}) {
  const participant = participants.find((p) => p.id === region.participantId);
  const allowedKinds: readonly SignatureKind[] =
    participant?.requiredSignatureKinds && participant.requiredSignatureKinds.length > 0
      ? participant.requiredSignatureKinds
      : ['recipient'];
  return (
    <div className="space-y-3 text-xs text-sp-text">
      <p className="font-sp-bold text-sm text-sp-text">사각형 편집</p>
      <label className="block">
        <span className="block text-xs font-sp-semibold text-sp-muted">참여자</span>
        <select
          value={region.participantId}
          onChange={(event) => onUpdate({ participantId: event.target.value })}
          className="mt-1 w-full rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-xs"
          aria-label="참여자 선택"
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
              {p.studentNumber !== undefined ? ` (${p.studentNumber})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-sp-semibold text-sp-muted">서명 종류</span>
        <select
          value={region.signatureKind}
          onChange={(event) => onUpdate({ signatureKind: event.target.value as SignatureKind })}
          className="mt-1 w-full rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-xs"
          aria-label="서명 종류 선택"
        >
          {allowedKinds.map((kind) => (
            <option key={kind} value={kind}>
              {SIGNATURE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      {region.autoReplicateRowSourceId && (
        <p className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">
          이 사각형은 Pattern 2 자동복제로 만들어졌어요. 위치가 어긋나면 삭제 후 직접 그려 주세요.
        </p>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-sp-bold text-red-700 hover:bg-red-100"
        data-testid="region-delete"
      >
        이 사각형 삭제
      </button>
    </div>
  );
}

function normalizeDrag(drag: DragState): PdfRegionRect {
  const x = Math.min(drag.startX, drag.currentX);
  const y = Math.min(drag.startY, drag.currentY);
  const w = Math.abs(drag.currentX - drag.startX);
  const h = Math.abs(drag.currentY - drag.startY);
  return { x, y, w, h };
}

function normalizeDragToStyle(drag: DragState): React.CSSProperties {
  const r = normalizeDrag(drag);
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
}

function pickDefaultKind(participant: SignatureParticipant): SignatureKind {
  return participant.requiredSignatureKinds[0] ?? 'recipient';
}

function generateRegionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `region-${crypto.randomUUID()}`;
  }
  return `region-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
