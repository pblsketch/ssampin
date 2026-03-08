import { useState, useRef, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import { ToolLayout } from './ToolLayout';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

interface ToolQRCodeProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type TabMode = 'url' | 'text';
type QRSize = 192 | 256 | 384;
type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

interface HistoryItem {
  value: string;
  mode: TabMode;
  createdAt: number;
}

const STORAGE_KEY = 'ssampin_qrcode-history';
const MAX_HISTORY = 10;
const TEXT_MAX_LENGTH = 300;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryItem[];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `qr-code-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

// ─── 전체화면 QR코드 모드 ─────────────────────────────────────

function FullscreenQR({
  dataUrl,
  value,
  onClose,
}: {
  dataUrl: string;
  value: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white cursor-pointer"
      onClick={onClose}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors z-10"
      >
        <span className="material-symbols-outlined text-[24px]">close</span>
      </button>

      {/* 안내 텍스트 */}
      <p className="text-xl text-gray-800 font-medium mb-6">
        스마트폰 카메라로 스캔하세요 📱
      </p>

      {/* QR코드 */}
      <img
        src={dataUrl}
        alt="QR Code"
        className="max-h-[70vh] max-w-[70vw]"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* URL 표시 */}
      <p className="mt-6 text-lg text-blue-600 underline max-w-[80vw] truncate">
        {value}
      </p>
    </div>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────

export function ToolQRCode({ onBack, isFullscreen }: ToolQRCodeProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'qr' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<TabMode>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState<QRSize>(256);
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>('M');
  const [showOptions, setShowOptions] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentValue = tab === 'url' ? urlInput : textInput;
  const hasInput = currentValue.trim().length > 0;
  const urlValid = tab === 'url' ? isValidUrl(urlInput) : true;

  // QR코드 생성 (디바운스)
  const generateQR = useCallback(
    (value: string, size: QRSize, level: ErrorLevel) => {
      if (!value.trim()) {
        setQrDataUrl(null);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      QRCode.toCanvas(
        canvas,
        value,
        {
          width: size,
          margin: 2,
          errorCorrectionLevel: level,
          color: { dark: '#000000', light: '#ffffff' },
        },
        (err) => {
          if (err) {
            setQrDataUrl(null);
            return;
          }
          setQrDataUrl(canvas.toDataURL('image/png'));
        },
      );
    },
    [],
  );

  // 디바운스된 QR 생성
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      generateQR(currentValue, qrSize, errorLevel);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentValue, qrSize, errorLevel, generateQR]);

  // 히스토리에 추가
  const addToHistory = useCallback(
    (value: string, mode: TabMode) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.value !== trimmed);
        const next = [
          { value: trimmed, mode, createdAt: Date.now() },
          ...filtered,
        ].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    },
    [],
  );

  // 클립보드에 이미지 복사
  const handleCopy = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) return;

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      addToHistory(currentValue, tab);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      // Clipboard API not supported
    }
  }, [currentValue, tab, addToHistory]);

  // PNG 다운로드
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = getFilename();
    link.href = canvas.toDataURL('image/png');
    link.click();

    addToHistory(currentValue, tab);
  }, [currentValue, tab, addToHistory]);

  // 전체화면
  const handleFullscreen = useCallback(() => {
    if (!qrDataUrl) return;
    addToHistory(currentValue, tab);
    setShowFullscreen(true);
  }, [qrDataUrl, currentValue, tab, addToHistory]);

  // 히스토리 항목 클릭
  const handleHistoryClick = useCallback((item: HistoryItem) => {
    if (item.mode === 'url') {
      setTab('url');
      setUrlInput(item.value);
    } else {
      setTab('text');
      setTextInput(item.value);
    }
  }, []);

  // 히스토리 삭제
  const handleHistoryDelete = useCallback((index: number) => {
    setHistory((prev) => {
      const next = prev.filter((_, i) => i !== index);
      saveHistory(next);
      return next;
    });
  }, []);

  // 히스토리 전체 삭제
  const handleHistoryClearAll = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  // 전체화면 QR 오버레이
  if (showFullscreen && qrDataUrl) {
    return (
      <FullscreenQR
        dataUrl={qrDataUrl}
        value={currentValue}
        onClose={() => setShowFullscreen(false)}
      />
    );
  }

  const SIZE_OPTIONS: { label: string; value: QRSize }[] = [
    { label: '소 192px', value: 192 },
    { label: '중 256px', value: 256 },
    { label: '대 384px', value: 384 },
  ];

  const ERROR_OPTIONS: ErrorLevel[] = ['L', 'M', 'Q', 'H'];

  return (
    <ToolLayout title="QR코드" emoji="🔗" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="flex flex-col items-center w-full max-w-xl mx-auto gap-6">
        {/* ─── 탭 ─── */}
        <div className="flex bg-sp-card rounded-xl p-1 border border-sp-border">
          <button
            onClick={() => setTab('url')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'url'
                ? 'bg-sp-accent text-white shadow-sm'
                : 'text-sp-muted hover:text-white'
            }`}
          >
            🔗 URL
          </button>
          <button
            onClick={() => setTab('text')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'text'
                ? 'bg-sp-accent text-white shadow-sm'
                : 'text-sp-muted hover:text-white'
            }`}
          >
            ✏️ 텍스트
          </button>
        </div>

        {/* ─── 입력 영역 ─── */}
        {tab === 'url' ? (
          <div className="w-full space-y-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://padlet.com/... 또는 구글폼 주소 입력"
              className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-xl text-lg text-white placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
            />
            {urlInput.trim() && (
              <p className={`text-sm px-1 ${urlValid ? 'text-green-400' : 'text-amber-400'}`}>
                {urlValid ? '✅ 유효한 URL' : '⚠️ https:// 를 포함해주세요'}
              </p>
            )}
          </div>
        ) : (
          <div className="w-full space-y-2">
            <textarea
              value={textInput}
              onChange={(e) => {
                if (e.target.value.length <= TEXT_MAX_LENGTH) {
                  setTextInput(e.target.value);
                }
              }}
              placeholder="학생들에게 공유할 텍스트를 입력하세요"
              rows={4}
              className="w-full px-4 py-3 bg-sp-card border border-sp-border rounded-xl text-white placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors resize-none"
            />
            <p className="text-sm text-sp-muted text-right px-1">
              {textInput.length}/{TEXT_MAX_LENGTH}
            </p>
          </div>
        )}

        {/* ─── QR코드 표시 ─── */}
        <div className="w-full flex flex-col items-center">
          <div className="bg-sp-card border border-sp-border rounded-2xl p-6 flex flex-col items-center gap-4">
            {hasInput ? (
              <>
                {/* 흰색 배경 패딩 안에 캔버스 */}
                <div className="bg-white rounded-xl p-4">
                  <canvas ref={canvasRef} className="block" />
                </div>
                {/* 미리보기 텍스트 */}
                <p className="text-sm text-sp-muted max-w-[320px] truncate text-center">
                  {currentValue}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-sp-muted">
                <span className="material-symbols-outlined text-[48px] opacity-30">
                  qr_code_2
                </span>
                <p className="text-sm">
                  URL 또는 텍스트를 입력하면 QR코드가 생성됩니다
                </p>
                {/* 숨겨진 캔버스 (생성용) */}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}
          </div>
        </div>

        {/* ─── QR코드 옵션 (접이식) ─── */}
        <button
          onClick={() => setShowOptions((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
            showOptions
              ? 'bg-sp-accent/15 text-sp-accent border border-sp-accent/30'
              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/40'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
          <span>QR코드 옵션</span>
          <span className="material-symbols-outlined text-[16px]">
            {showOptions ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {showOptions && (
          <div className="w-full space-y-4 bg-sp-card border border-sp-border rounded-xl p-4">
            {/* 크기 선택 */}
            <div>
              <p className="text-sm text-sp-muted mb-2">크기</p>
              <div className="flex gap-2">
                {SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setQrSize(opt.value)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                      qrSize === opt.value
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-bg border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* 에러 정정 레벨 */}
            <div>
              <p className="text-sm text-sp-muted mb-2">에러 정정 레벨</p>
              <div className="flex gap-2">
                {ERROR_OPTIONS.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setErrorLevel(lvl)}
                    className={`w-10 h-10 rounded-full text-sm font-bold transition-all ${
                      errorLevel === lvl
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-bg border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/50'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── 버튼 영역 ─── */}
        {hasInput && qrDataUrl && (
          <div className="flex gap-3 w-full justify-center">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/50 transition-all text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copyFeedback ? 'check' : 'content_copy'}
              </span>
              <span>{copyFeedback ? '복사됨 ✓' : '이미지 복사'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/50 transition-all text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span>PNG 저장</span>
            </button>
            <button
              onClick={handleFullscreen}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sp-accent text-white hover:bg-sp-accent/80 transition-all text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">fullscreen</span>
              <span>전체화면</span>
            </button>
          </div>
        )}

        {/* ─── 최근 기록 ─── */}
        {history.length > 0 && (
          <div className="w-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-sp-muted">최근 생성</h3>
              <button
                onClick={handleHistoryClearAll}
                className="text-xs text-sp-muted hover:text-red-400 transition-colors"
              >
                전체 삭제
              </button>
            </div>
            <div className="space-y-1.5">
              {history.map((item, i) => (
                <div
                  key={`${item.createdAt}-${i}`}
                  className="flex items-center gap-3 px-3 py-2 bg-sp-card border border-sp-border rounded-lg hover:border-sp-accent/30 transition-all group cursor-pointer"
                  onClick={() => handleHistoryClick(item)}
                >
                  {/* 아이콘 */}
                  <span className="text-sp-muted text-sm shrink-0">
                    {item.mode === 'url' ? '🔗' : '✏️'}
                  </span>
                  {/* 값 미리보기 */}
                  <span className="text-sm text-white truncate flex-1">
                    {item.value}
                  </span>
                  {/* 시각 */}
                  <span className="text-xs text-sp-muted shrink-0">
                    {formatTime(item.createdAt)}
                  </span>
                  {/* 삭제 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHistoryDelete(i);
                    }}
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
