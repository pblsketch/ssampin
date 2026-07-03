import { useMemo, useRef, useState } from 'react';
import type { MiniApp, MiniAppIcon, MiniAppValidationError } from '@domain/entities/MiniApp';
import {
  validateMiniApp,
  MINIAPP_NAME_MAX,
  MINIAPP_DESC_MAX,
  MINIAPP_MAX_COUNT,
  MINIAPP_HTML_MAX_BYTES,
} from '@domain/entities/MiniApp';
import { formatMiniAppValidationError } from '@usecases/miniapp/RegisterMiniApp';
import { useMiniAppStore } from '@adapters/stores/useMiniAppStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { Notice } from '@adapters/components/common/Notice';

/**
 * 미니앱 등록 모달.
 *
 * 흐름: HTML 파일 선택(드롭/클릭) → 실사 미리보기(sandboxed iframe) → 이름·설명·아이콘 입력
 * (카드 미리보기 동시 표시) → 저장. 등록은 {@link useMiniAppStore.register}에 위임하고,
 * 실패 사유(유효성/개수·크기 상한/데스크톱 전용 등)는 usecase·repository가 던지는 한국어
 * 메시지를 그대로 토스트로 보여준다.
 */

const MINIAPP_HTML_MAX_MB = Math.floor(MINIAPP_HTML_MAX_BYTES / (1024 * 1024));
const DEFAULT_EMOJI = '🧩';

interface EmojiCategory {
  readonly label: string;
  readonly emojis: readonly string[];
}

/** 아이콘 선택용 이모지 — 교사 도구 맥락에 맞춰 카테고리로 묶어 넉넉히 제공한다. */
const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  { label: '게임·운', emojis: ['🎲', '🎯', '🎰', '🃏', '🎳', '🎱'] },
  { label: '시간', emojis: ['⏱️', '⏰', '⌛', '⏳'] },
  { label: '데이터·수', emojis: ['📊', '📈', '📉', '🧮', '🔢', '📐'] },
  { label: '미술·창작', emojis: ['🎨', '🖍️', '✏️', '🖌️', '✂️'] },
  { label: '알림·소통', emojis: ['🔔', '📣', '📢', '💬'] },
  { label: '시상·성취', emojis: ['🏆', '🥇', '🥈', '🥉', '⭐', '🌟', '🎖️', '👑'] },
  { label: '놀이·조작', emojis: ['🎮', '🕹️', '🧩', '🪀', '🪁'] },
  { label: '학습·과제', emojis: ['📚', '📝', '📋', '✅', '🔤', '📖', '🗂️', '📌'] },
  { label: '축하·이벤트', emojis: ['🎉', '🎈', '🎊', '🌈', '🥳', '🎁'] },
  { label: '방향·순환', emojis: ['🔀', '🔁', '🔄', '➡️', '⬅️'] },
];
const ICON_EXT_WHITELIST = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const ICON_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
const EXAMPLE_PROMPT = `우리 반 수업에서 쓸 [주제] 웹앱을 만들어줘.
(예: 발표 순서 뽑기, 모둠 짜기, 초시계, 칭찬 점수판)

이렇게 만들어 주면 좋겠어:
· 컴퓨터를 잘 몰라도 바로 쓰게, HTML 파일 하나로 완성해줘.
· 스마트폰에서도, 교실 큰 화면(TV·빔)에서도 잘 보이게.
· 글씨는 크고 색은 산뜻하게, 버튼 몇 개로 누구나 쉽게.
· 학생 이름 같은 개인정보는 저장하거나 밖으로 내보내지 않게.`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface SelectedHtml {
  fileName: string;
  bytes: Uint8Array;
  text: string;
}

interface SelectedImageIcon {
  fileName: string;
  bytes: Uint8Array;
  ext: string;
  previewUrl: string;
}

type IconMode = 'emoji' | 'image';

interface MiniAppRegisterModalProps {
  onClose: () => void;
  /** 지정 시 "수정" 모드 — 기존 앱 메타를 프리필하고 저장 시 update로 위임. HTML 교체는 선택. */
  editApp?: MiniApp;
}

export function MiniAppRegisterModal({ onClose, editApp }: MiniAppRegisterModalProps) {
  const isEdit = editApp != null;
  const registerApp = useMiniAppStore((s) => s.register);
  const updateApp = useMiniAppStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);
  const existingCount = useSettingsStore((s) => s.settings.miniApps?.length ?? 0);
  // 개수 상한은 신규 등록에만 적용(수정은 개수가 늘지 않음).
  const atCapacity = !isEdit && existingCount >= MINIAPP_MAX_COUNT;

  // 수정 모드에서 이미지 아이콘을 새로 안 고르면 유지할 기존 파일명.
  const existingImageFileName = editApp?.icon.kind === 'image' ? editApp.icon.fileName : null;

  const [guideOpen, setGuideOpen] = useState(false);
  const [html, setHtml] = useState<SelectedHtml | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState(editApp?.name ?? '');
  const [description, setDescription] = useState(editApp?.description ?? '');
  const [iconMode, setIconMode] = useState<IconMode>(
    editApp?.icon.kind === 'image' ? 'image' : 'emoji',
  );
  const [emojiValue, setEmojiValue] = useState(
    editApp?.icon.kind === 'emoji' ? editApp.icon.value : DEFAULT_EMOJI,
  );
  const [imageIcon, setImageIcon] = useState<SelectedImageIcon | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const htmlInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const icon: MiniAppIcon = useMemo(
    () =>
      iconMode === 'emoji'
        ? { kind: 'emoji', value: emojiValue }
        : // 새 이미지를 골랐으면 그 파일명, 아니면(수정 모드) 기존 파일명 유지.
          { kind: 'image', fileName: imageIcon?.fileName ?? existingImageFileName ?? '' },
    [iconMode, emojiValue, imageIcon, existingImageFileName],
  );

  const validationErrors = validateMiniApp({ name, description, icon });
  const nameError: MiniAppValidationError | undefined = submitAttempted
    ? validationErrors.find((e) => e === 'name-empty' || e === 'name-too-long')
    : undefined;
  const descError = validationErrors.includes('desc-too-long');

  const handleHtmlFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.html') && !lower.endsWith('.htm')) {
      showToast('HTML 파일(.html)만 등록할 수 있어요.', 'error');
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength > MINIAPP_HTML_MAX_BYTES) {
      showToast(`HTML 파일은 최대 ${MINIAPP_HTML_MAX_MB}MB까지 등록할 수 있어요.`, 'error');
      return;
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    setHtml({ fileName: file.name, bytes, text });
    setName((cur) =>
      cur.trim().length > 0
        ? cur
        : file.name.replace(/\.(html|htm)$/i, '').slice(0, MINIAPP_NAME_MAX),
    );
  };

  const handleIconFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ICON_EXT_WHITELIST.has(ext)) {
      showToast('아이콘은 PNG · JPG · WEBP · GIF · SVG만 지원해요.', 'error');
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const reader = new FileReader();
    reader.onload = () => {
      setImageIcon({
        fileName: file.name,
        bytes,
        ext,
        previewUrl: typeof reader.result === 'string' ? reader.result : '',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    // 신규 등록은 파일 필수, 수정은 선택(교체 안 하면 기존 유지).
    if (!isEdit && !html) {
      showToast('앱 HTML 파일을 먼저 선택해 주세요.', 'error');
      return;
    }
    if (atCapacity) {
      showToast(`앱은 최대 ${MINIAPP_MAX_COUNT}개까지 등록할 수 있어요.`, 'error');
      return;
    }
    if (iconMode === 'image' && !imageIcon && !existingImageFileName) {
      showToast('아이콘 이미지를 선택해 주세요.', 'error');
      return;
    }
    if (validationErrors.length > 0) {
      showToast(formatMiniAppValidationError(validationErrors[0]!), 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && editApp) {
        await updateApp({
          id: editApp.id,
          name: name.trim(),
          description,
          icon,
          htmlBytes: html?.bytes, // 없으면 기존 파일 유지
          iconBytes: imageIcon?.bytes,
          iconExt: imageIcon?.ext,
        });
        showToast(`"${name.trim()}" 앱을 수정했어요.`, 'success');
      } else {
        await registerApp({
          name: name.trim(),
          description,
          icon,
          htmlBytes: html!.bytes,
          iconBytes: imageIcon?.bytes,
          iconExt: imageIcon?.ext,
        });
        showToast(`"${name.trim()}" 앱을 등록했어요.`, 'success');
      }
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '저장에 실패했어요.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 수정 모드는 파일 없이도 저장 가능(메타만 변경). 신규는 파일 필수.
  const canSubmit = !submitting && !atCapacity && (isEdit || html !== null);
  const safeClose = submitting ? () => {} : onClose;

  return (
    <Modal
      isOpen
      onClose={safeClose}
      title={isEdit ? '미니앱 수정' : '미니앱 등록'}
      srOnlyTitle
      size="xl"
      closeOnBackdrop={!submitting}
      closeOnEsc={!submitting}
    >
      <div className="flex flex-col max-h-[calc(100vh-48px)]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border shrink-0">
          <div>
            <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
              <span aria-hidden="true">🧩</span>
              {isEdit ? '미니앱 수정' : '미니앱 등록'}
            </h3>
            <p className="text-detail text-sp-muted mt-0.5">
              {isEdit
                ? '이름·설명·아이콘을 바꾸거나, 원하면 앱 파일도 교체할 수 있어요.'
                : 'AI로 만든 HTML 앱 파일을 올리면 쌤도구에서 바로 실행할 수 있어요.'}
            </p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={safeClose} />
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4">
            <AiGuidePanel open={guideOpen} onToggle={() => setGuideOpen((v) => !v)} />
          </div>

          {atCapacity && (
            <div className="px-5 pt-4">
              <Notice variant="warning">
                최대 개수({MINIAPP_MAX_COUNT}개)에 도달했어요. 기존 앱을 삭제한 뒤 다시 시도해
                주세요.
              </Notice>
            </div>
          )}

          <div className="px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 좌: HTML 파일 + 실사 미리보기 */}
            <div>
              <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
                {isEdit ? '앱 파일 교체 (선택)' : '앱 파일 (.html)'}
              </p>
              {!html ? (
                <HtmlDropZone
                  isEdit={isEdit}
                  dragOver={dragOver}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void handleHtmlFiles(e.dataTransfer.files);
                  }}
                  onClick={() => htmlInputRef.current?.click()}
                />
              ) : (
                <div>
                  <div className="rounded-xl overflow-hidden border border-sp-border bg-white h-56">
                    <iframe
                      sandbox="allow-scripts"
                      srcDoc={html.text}
                      title="앱 미리보기"
                      className="w-full h-full border-0"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-detail text-sp-muted truncate">
                      {html.fileName} · {formatBytes(html.bytes.byteLength)}
                    </span>
                    <button
                      type="button"
                      onClick={() => htmlInputRef.current?.click()}
                      className="text-detail text-sp-accent hover:text-sp-accent/80 shrink-0"
                    >
                      다른 파일 선택
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={htmlInputRef}
                type="file"
                accept=".html,.htm"
                className="sr-only"
                onChange={(e) => {
                  void handleHtmlFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* 우: 이름·설명·아이콘 + 카드 미리보기 */}
            <div className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="miniapp-name"
                  className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
                >
                  이름
                </label>
                <input
                  id="miniapp-name"
                  type="text"
                  value={name}
                  maxLength={MINIAPP_NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 우리 반 발표 순서 뽑기"
                  className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm"
                />
                <div className="flex items-center justify-between mt-1">
                  {nameError ? (
                    <p className="text-detail text-red-400">
                      {formatMiniAppValidationError(nameError)}
                    </p>
                  ) : (
                    <span />
                  )}
                  <p className="text-detail text-sp-muted">
                    {name.length}/{MINIAPP_NAME_MAX}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="miniapp-desc"
                  className="block text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2"
                >
                  설명 (선택)
                </label>
                <textarea
                  id="miniapp-desc"
                  value={description}
                  maxLength={MINIAPP_DESC_MAX}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="어떤 앱인지 한 줄로 소개해 주세요"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm resize-none"
                />
                <p
                  className={`text-detail mt-1 text-right ${descError ? 'text-red-400' : 'text-sp-muted'}`}
                >
                  {description.length}/{MINIAPP_DESC_MAX}
                </p>
              </div>

              <IconPicker
                iconMode={iconMode}
                onChangeMode={setIconMode}
                emojiValue={emojiValue}
                onChangeEmoji={setEmojiValue}
                imageIcon={imageIcon}
                onPickImage={() => iconInputRef.current?.click()}
                onClearImage={() => setImageIcon(null)}
              />
              <input
                ref={iconInputRef}
                type="file"
                accept={ICON_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  void handleIconFile(e.target.files);
                  e.target.value = '';
                }}
              />

              <div>
                <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
                  이렇게 보여요
                </p>
                <CardPreviewMock
                  name={name.trim() || '앱 이름'}
                  description={description}
                  icon={icon}
                  imagePreviewUrl={imageIcon?.previewUrl}
                />
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-sp-card border border-sp-border text-xs text-sp-text leading-relaxed">
              <span className="flex-shrink-0" aria-hidden="true">
                💬
              </span>
              <div className="flex-1 min-w-0">
                앱마다 디자인이 다를 수 있어요. 쌤핀은 안전하게 격리 실행해요 (PC·학생정보 미접근).
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-sp-border bg-sp-bg/30 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-icon-sm animate-spin">
                  progress_activity
                </span>
                {isEdit ? '저장 중...' : '등록 중...'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-icon-sm">
                  {isEdit ? 'check' : 'add'}
                </span>
                {isEdit ? '저장' : '등록하기'}
              </>
            )}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────
// AI로 앱 만들기 — 접이식 3단계 안내 + 복사 가능한 예시 프롬프트
// ──────────────────────────────────────────────────────────

function AiGuidePanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const showToast = useToastStore((s) => s.show);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPT);
      showToast('예시 프롬프트를 복사했어요', 'success');
    } catch {
      showToast('복사에 실패했어요', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-sp-border bg-sp-bg/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-sp-semibold text-sp-text flex items-center gap-2">
          <span aria-hidden="true">✨</span>
          AI로 앱 만들기
        </span>
        <span
          className={`material-symbols-outlined text-icon-md text-sp-muted transition-transform duration-sp-base ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-sp-muted leading-relaxed">
          <ol className="space-y-1.5 list-decimal list-inside marker:text-sp-muted/60">
            <li>
              <strong className="text-sp-text font-sp-semibold">만들기</strong> — 예시 프롬프트를
              Gemini 등 AI 챗봇에 붙여넣고 원하는 대로 바꿔보세요.
            </li>
            <li>
              <strong className="text-sp-text font-sp-semibold">저장</strong> — AI가 준 코드를
              index.html 파일 하나로 저장하세요.
            </li>
            <li>
              <strong className="text-sp-text font-sp-semibold">올리기</strong> — 아래에서 방금
              저장한 파일을 선택하면 끝이에요.
            </li>
          </ol>
          <div className="rounded-lg bg-sp-card border border-sp-border p-3">
            <p className="text-sp-text/90 select-text whitespace-pre-line leading-relaxed">
              {EXAMPLE_PROMPT}
            </p>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="mt-2 inline-flex items-center gap-1 text-sp-accent hover:text-sp-accent/80 text-detail font-sp-semibold"
            >
              <span className="material-symbols-outlined text-icon-sm">content_copy</span>
              프롬프트 복사
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// HTML 드롭존 (파일 미선택 상태)
// ──────────────────────────────────────────────────────────

function HtmlDropZone({
  isEdit = false,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  isEdit?: boolean;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`h-56 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors ${
        dragOver
          ? 'border-sp-accent bg-sp-accent/5'
          : 'border-sp-border bg-sp-bg/30 hover:border-sp-accent/40'
      }`}
    >
      <span className="material-symbols-outlined text-icon-xl text-sp-muted" aria-hidden="true">
        {isEdit ? 'sync' : 'upload_file'}
      </span>
      <p className="text-sm font-sp-semibold text-sp-text">
        {isEdit ? '앱 파일을 바꾸려면 여기에 새 HTML' : 'HTML 파일을 드래그하거나 클릭해서 선택'}
      </p>
      <p className="text-detail text-sp-muted px-6">
        {isEdit
          ? `교체하지 않으면 기존 파일 그대로 실행돼요 (최대 ${MINIAPP_HTML_MAX_MB}MB)`
          : `AI로 만든 index.html 파일 하나 (최대 ${MINIAPP_HTML_MAX_MB}MB)`}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 아이콘 선택 — 이모지(기본) / 이미지 업로드
// ──────────────────────────────────────────────────────────

function IconPicker({
  iconMode,
  onChangeMode,
  emojiValue,
  onChangeEmoji,
  imageIcon,
  onPickImage,
  onClearImage,
}: {
  iconMode: IconMode;
  onChangeMode: (mode: IconMode) => void;
  emojiValue: string;
  onChangeEmoji: (v: string) => void;
  imageIcon: SelectedImageIcon | null;
  onPickImage: () => void;
  onClearImage: () => void;
}) {
  return (
    <div>
      <p className="text-detail font-sp-semibold uppercase tracking-wider text-sp-muted mb-2">
        아이콘
      </p>
      <div className="inline-flex rounded-lg border border-sp-border bg-sp-bg/60 p-0.5 gap-0.5 mb-2.5">
        <button
          type="button"
          onClick={() => onChangeMode('emoji')}
          className={`px-3 py-1.5 rounded-md text-xs transition-all duration-sp-base ease-sp-out ${
            iconMode === 'emoji'
              ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
              : 'font-sp-medium text-sp-muted hover:text-sp-text'
          }`}
        >
          이모지
        </button>
        <button
          type="button"
          onClick={() => onChangeMode('image')}
          className={`px-3 py-1.5 rounded-md text-xs transition-all duration-sp-base ease-sp-out ${
            iconMode === 'image'
              ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
              : 'font-sp-medium text-sp-muted hover:text-sp-text'
          }`}
        >
          이미지
        </button>
      </div>

      {iconMode === 'emoji' ? (
        <div>
          <div className="p-2.5 bg-sp-bg rounded-lg ring-1 ring-sp-border max-h-52 overflow-y-auto space-y-2.5">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className="text-[10px] font-sp-semibold uppercase tracking-wider text-sp-muted/70 mb-1 px-0.5">
                  {cat.label}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => onChangeEmoji(e)}
                      aria-pressed={emojiValue === e}
                      aria-label={`아이콘 ${e} 선택`}
                      className={`aspect-square flex items-center justify-center rounded-md text-lg transition-colors ${
                        emojiValue === e
                          ? 'bg-sp-accent/20 ring-2 ring-sp-accent'
                          : 'hover:bg-sp-border'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <label htmlFor="miniapp-icon-custom" className="text-detail text-sp-muted shrink-0">
              직접 입력
            </label>
            <input
              id="miniapp-icon-custom"
              type="text"
              value={emojiValue}
              onChange={(e) => onChangeEmoji(e.target.value)}
              maxLength={8}
              placeholder="이모지를 붙여넣어도 돼요"
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted focus:outline-none focus:ring-2 focus:ring-sp-accent text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-sp-bg ring-1 ring-sp-border flex items-center justify-center overflow-hidden shrink-0">
            {imageIcon ? (
              <img
                src={imageIcon.previewUrl}
                alt="아이콘 미리보기"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-icon-md text-sp-muted">image</span>
            )}
          </div>
          <button
            type="button"
            onClick={onPickImage}
            className="px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors"
          >
            {imageIcon ? '다른 이미지 선택' : '이미지 선택'}
          </button>
          {imageIcon && (
            <button
              type="button"
              onClick={onClearImage}
              className="text-detail text-sp-muted hover:text-red-400 transition-colors"
            >
              제거
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 카드 미리보기 목업 — 실제 그리드 카드와 동일한 톤(bg-sp-card rounded-2xl)
// ──────────────────────────────────────────────────────────

function CardPreviewMock({
  name,
  description,
  icon,
  imagePreviewUrl,
}: {
  name: string;
  description: string;
  icon: MiniAppIcon;
  imagePreviewUrl?: string;
}) {
  return (
    <div className="bg-sp-card rounded-2xl p-4 border border-sp-border max-w-[180px]">
      {icon.kind === 'emoji' ? (
        <div className="text-3xl mb-2 leading-none" aria-hidden="true">
          {icon.value}
        </div>
      ) : (
        <div className="w-9 h-9 rounded-xl bg-sp-bg mb-2 overflow-hidden flex items-center justify-center">
          {imagePreviewUrl ? (
            <img src={imagePreviewUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-icon-lg text-sp-muted">widgets</span>
          )}
        </div>
      )}
      <h4 className="text-sm font-bold text-sp-text truncate">{name}</h4>
      {description && <p className="text-xs text-sp-muted mt-0.5 line-clamp-2">{description}</p>}
    </div>
  );
}
