/**
 * PhotoRosterImportModal.tsx
 *
 * 나이스 "사진 명렬표"(.hwp / .xlsx) 파일을 넣으면 이름과 얼굴 사진을 읽어
 * 명단에 반영하는 모달. 파일 고르기 → 읽는 중 → 확인 → 결과 4단계를
 * 하나의 모달 안에서 전환한다.
 *
 * ## 확인 단계 설계의 핵심
 *
 * "사진과 이름이 맞습니까?"는 물을 수 없는 질문이다 — 교사는 아직 학생 얼굴을
 * 모르고, 그걸 외우려고 이 기능을 쓰는 것이기 때문이다. 대신 교사가 원본 종이
 * 명렬표만 보면 바로 답할 수 있는 두 가지만 묻는다: 학생 수, 그리고 명렬표
 * 맨 앞 번호 학생의 이름. 둘 다 체크해야 [명단에 반영] 버튼이 열린다.
 *
 * 자동 짝짓기가 실패하면(`pairing.ok === false`) 사진은 버리고 이름만
 * 반영한다 — `photoRosterPairing` 규칙이 이미 안전 쪽으로 판단을 내렸으므로
 * 여기서는 그 판단과 사유를 그대로 보여주기만 한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { compareRosterRows, rosterRowKey, rosterRowLabel } from '@domain/rules/rosterNameCell';
import { useToastStore } from '@adapters/components/common/Toast';
import { photoRosterParser } from '@adapters/di/container';
import {
  ROSTER_PAIR_FAILURE_MESSAGES,
  type PhotoRosterParseResult,
  type RosterFileFormat,
  type RosterPairingResult,
} from '@domain/valueObjects/PhotoRoster';

/* ──────────────── 타입 ──────────────── */

export interface PhotoRosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 어느 명단에 넣는가 */
  ownerKind: 'homeroom' | 'teaching-class';
  ownerKey: string;
  /** 현재 명단 (미리보기 비교용) */
  currentStudentCount: number;
  /** 확인 완료 → 실제 반영. 부모가 명단 병합·사진 저장을 수행한다 */
  /**
   * 확인 완료 → 실제 반영. 부모가 명단 병합·사진 저장을 수행한다.
   *
   * ⚠️ **아직 반영되지 않았으면 `false` 를 돌려줘야 한다.**
   * 이름이 달라 충돌 해결 창이 뜨는 경우, 부모는 그 창만 띄우고 정상 반환한다.
   * 그때 이 창이 "반영했어요"를 띄우면 **아무것도 반영되지 않았는데 완료 화면**이 뜨고,
   * 충돌 창과 두 개가 겹쳐 보인다(이 저장소에 모달 2개 겹침 사고 전례가 있다).
   */
  onConfirm: (result: PhotoRosterParseResult) => Promise<boolean | void>;
  /**
   * `onConfirm` 이 `false` 를 돌려줬을 때(= 충돌 해결 창으로 넘어감) 호출된다.
   *
   * ⚠️ **`onClose` 를 대신 쓰면 안 된다.** `onClose` 는 "사용자가 그만둠"이라
   * 부모가 대기 중인 사진을 버리는데, 이 경우는 아직 진행 중이라 사진이 그대로 필요하다.
   * (실제로 이 둘을 같은 것으로 묶었다가 "이름은 들어가고 사진만 0장" 사고가 났다)
   */
  onHandOff?: () => void;
}

type Step = 'pick' | 'reading' | 'confirm' | 'done';

interface RosterRow {
  /**
   * 이 줄을 가리키는 열쇠.
   *
   * ⚠️ **번호를 열쇠로 쓰면 안 된다.** 수업반은 여러 반이 섞여 `5번`이 둘, `14번`이 셋일 수
   * 있어, 번호를 열쇠로 쓰면 사진이 서로 덮여 **여러 학생에게 같은 얼굴이 보인다.**
   */
  readonly key: string;
  readonly studentNumber: number;
  readonly name: string;
  /** 수업반 명렬표에만 있다 */
  readonly grade?: number;
  readonly classNum?: number;
  readonly photoUrl: string | null;
}

/* ──────────────── 상수 ──────────────── */

/** 사진이 22~28장 들어가는 파일이라 일반 서식(10MB)보다 여유를 둔다 */
const MAX_SIZE_BYTES = 30 * 1024 * 1024;
const ACCEPT = '.hwp,.hwpx,.xlsx,.xls';

const STEP_LABEL: Record<Step, string> = {
  pick: '1단계 · 파일 선택',
  reading: '2단계 · 읽는 중',
  confirm: '3단계 · 확인',
  done: '완료',
};

const OWNER_LABEL: Record<PhotoRosterImportModalProps['ownerKind'], string> = {
  homeroom: '담임 명단',
  'teaching-class': '이 수업반 명단',
};

const FORMAT_LABEL: Record<RosterFileFormat, string> = {
  hwpml: '한글',
  xlsx: '엑셀',
  'hwp-ole2': '한글',
  'xls-biff8': '엑셀',
  hwpx: '한글',
  unknown: '파일',
};

/* ──────────────── 컴포넌트 ──────────────── */

export function PhotoRosterImportModal({
  isOpen,
  onClose,
  ownerKind,
  ownerKey,
  currentStudentCount,
  onConfirm,
  onHandOff,
}: PhotoRosterImportModalProps) {
  const showToast = useToastStore((s) => s.show);

  const [step, setStep] = useState<Step>('pick');
  const [dragOver, setDragOver] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<PhotoRosterParseResult | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(false);
  const [confirmedFirst, setConfirmedFirst] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<ReadonlySet<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const resetAll = useCallback(() => {
    setStep('pick');
    setDragOver(false);
    setPickError(null);
    setParseResult(null);
    setConfirmedCount(false);
    setConfirmedFirst(false);
    setApplying(false);
    setApplyError(null);
    setBrokenPhotos(new Set());
  }, []);

  // 모달을 닫으면 다음에 열릴 때 항상 첫 화면부터 다시 시작한다
  useEffect(() => {
    if (!isOpen) resetAll();
  }, [isOpen, resetAll]);

  /* ── 사진 미리보기 URL — 자동 짝짓기가 성공한 경우에만 만든다 ── */
  const [photoUrls, setPhotoUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (!parseResult || !parseResult.pairing.ok) {
      setPhotoUrls(new Map());
      return;
    }
    const urls = new Map<string, string>();
    for (const pair of parseResult.pairing.pairs) {
      const blob = new Blob([pair.photo.bytes as BlobPart], { type: pair.photo.mimeType });
      urls.set(rosterRowKey(pair), URL.createObjectURL(blob));
    }
    setPhotoUrls(urls);
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, [parseResult]);

  /* ── 파일 처리 ── */
  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setPickError(null);

    if (file.size > MAX_SIZE_BYTES) {
      setPickError('파일 크기가 너무 커요. 30MB 이하 파일만 넣을 수 있어요.');
      return;
    }

    setStep('reading');
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const outcome = photoRosterParser.parse(bytes);

      if (!outcome.ok) {
        setPickError(outcome.guide);
        setStep('pick');
        return;
      }

      setParseResult(outcome.result);
      setConfirmedCount(false);
      setConfirmedFirst(false);
      setBrokenPhotos(new Set());
      setStep('confirm');
    } catch {
      setPickError(
        '파일을 읽는 중 문제가 생겼어요. 나이스에서 사진 명렬표를 다시 내려받아 주세요.',
      );
      setStep('pick');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  /* ── 확인 단계에서 보여줄 행 목록 (학년 → 반 → 번호 순) ── */
  const rows: readonly RosterRow[] = useMemo(() => {
    if (!parseResult) return [];
    const toRow = (
      n: { studentNumber: number; name: string; grade?: number; classNum?: number },
      withPhoto: boolean,
    ): RosterRow => {
      const key = rosterRowKey(n);
      return {
        key,
        studentNumber: n.studentNumber,
        name: n.name,
        ...(n.grade !== undefined ? { grade: n.grade } : {}),
        ...(n.classNum !== undefined ? { classNum: n.classNum } : {}),
        photoUrl: withPhoto ? (photoUrls.get(key) ?? null) : null,
      };
    };
    if (parseResult.pairing.ok) {
      return [...parseResult.pairing.pairs].sort(compareRosterRows).map((p) => toRow(p, true));
    }
    return [...parseResult.names].sort(compareRosterRows).map((n) => toRow(n, false));
  }, [parseResult, photoUrls]);

  const studentCount = rows.length;
  const firstRow = rows[0] ?? null;
  const photoAttachedCount = parseResult?.pairing.ok ? parseResult.pairing.pairs.length : 0;
  const canConfirm = studentCount > 0 && confirmedCount && confirmedFirst;

  const handleApply = useCallback(async () => {
    if (!parseResult || !canConfirm) return;
    setApplying(true);
    setApplyError(null);
    try {
      const applied = await onConfirm(parseResult);
      // false 를 받으면 아직 반영 전이다(충돌 해결 창이 떠 있다) — 완료 화면으로 넘어가지 않고
      // 이 창을 닫아 충돌 창만 남긴다.
      if (applied === false) {
        // 아직 반영 전이다(충돌 해결 창이 떠 있다). 완료 화면으로 넘어가지 않고 이 창만 접는다 —
        // 대기 중인 사진은 그대로 두어야 충돌 해결 뒤에 저장된다.
        (onHandOff ?? onClose)();
        return;
      }
      setStep('done');
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : '명단 반영에 실패했어요. 다시 시도해 주세요.',
      );
      showToast('명단 반영에 실패했어요.', 'error');
    } finally {
      setApplying(false);
    }
  }, [parseResult, canConfirm, onConfirm, onClose, onHandOff, showToast]);

  const handlePickAgain = useCallback(() => {
    setStep('pick');
    setParseResult(null);
    setPickError(null);
  }, []);

  // 파일을 읽는 중이거나 반영을 실행하는 중에는 실수로 닫히지 않게 막는다
  const blockDismiss = step === 'reading' || (step === 'confirm' && applying);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="사진 명렬표 가져오기"
      srOnlyTitle
      size="xl"
      closeOnBackdrop={!blockDismiss}
      closeOnEsc={!blockDismiss}
    >
      <div
        className="flex flex-col max-h-[85vh]"
        data-owner-kind={ownerKind}
        data-owner-key={ownerKey}
      >
        {/* 헤더 */}
        <header className="px-6 py-4 border-b border-sp-border flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-sp-text">사진 명렬표 가져오기</h3>
            <p className="text-xs text-sp-muted mt-0.5">
              {STEP_LABEL[step]} · {OWNER_LABEL[ownerKind]}에 반영합니다
            </p>
          </div>
          <IconButton
            icon="close"
            label="닫기"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={blockDismiss}
          />
        </header>

        <div className="flex-1 overflow-y-auto">
          {step === 'pick' && (
            <PickStep
              dragOver={dragOver}
              pickError={pickError}
              inputRef={inputRef}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onPick={() => inputRef.current?.click()}
              onFilesChosen={(files) => void handleFiles(files)}
            />
          )}

          {step === 'reading' && <ReadingStep />}

          {step === 'confirm' && parseResult && (
            <ConfirmStep
              rows={rows}
              studentCount={studentCount}
              photoAttachedCount={photoAttachedCount}
              format={parseResult.format}
              pairing={parseResult.pairing}
              firstRow={firstRow}
              confirmedCount={confirmedCount}
              confirmedFirst={confirmedFirst}
              onToggleCount={setConfirmedCount}
              onToggleFirst={setConfirmedFirst}
              brokenPhotos={brokenPhotos}
              onPhotoBroken={(key) => setBrokenPhotos((prev) => new Set(prev).add(key))}
              currentStudentCount={currentStudentCount}
            />
          )}

          {step === 'done' && (
            <DoneStep studentCount={studentCount} photoAttachedCount={photoAttachedCount} />
          )}
        </div>

        {/* 푸터 */}
        {step === 'confirm' && (
          <footer className="px-6 py-4 flex items-center justify-between border-t border-sp-border gap-3">
            <button
              onClick={handlePickAgain}
              disabled={applying}
              className="px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              다른 파일 선택
            </button>
            <div className="flex items-center gap-3">
              {applyError && <span className="text-xs text-red-400">{applyError}</span>}
              <button
                onClick={() => void handleApply()}
                disabled={!canConfirm || applying}
                className="px-5 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {applying && (
                  <span
                    className="material-symbols-outlined icon-sm animate-spin"
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                )}
                명단에 반영{studentCount > 0 ? ` (${studentCount}명)` : ''}
              </button>
            </div>
          </footer>
        )}

        {step === 'done' && (
          <footer className="px-6 py-4 flex items-center justify-end border-t border-sp-border">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              닫기
            </button>
          </footer>
        )}
      </div>
    </Modal>
  );
}

/* ──────────────── PickStep ──────────────── */

interface PickStepProps {
  dragOver: boolean;
  pickError: string | null;
  inputRef: RefObject<HTMLInputElement>;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onPick: () => void;
  onFilesChosen: (files: FileList | null) => void;
}

function PickStep({
  dragOver,
  pickError,
  inputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onFilesChosen,
}: PickStepProps) {
  return (
    <div className="px-6 py-8">
      <div
        role="button"
        tabIndex={0}
        aria-label="사진 명렬표 파일 선택 또는 끌어다 놓기"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onPick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onPick();
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-12 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-sp-accent bg-blue-500/10'
            : 'border-sp-border hover:border-sp-accent hover:bg-sp-surface'
        }`}
      >
        <span className="material-symbols-outlined text-sp-muted text-icon-xl" aria-hidden="true">
          upload_file
        </span>
        <div>
          <p className="text-sm font-semibold text-sp-text">
            사진 명렬표 파일을 여기에 끌어다 놓으세요
          </p>
          <p className="text-xs text-sp-muted mt-1">
            나이스 → 사진 명렬표를 한글 또는 엑셀로 내려받아 넣어 주세요
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
          className="mt-2 px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
        >
          파일 선택
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onFilesChosen(e.target.files)}
        />
      </div>

      {pickError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {pickError}
        </div>
      )}

      <p className="mt-4 text-xs text-sp-muted leading-relaxed">
        지원 형식: 나이스에서 최근에 내려받은 한글(.hwp)·엑셀(.xlsx) 사진 명렬표. 예전 방식으로
        저장된 파일이라는 안내가 뜨면, 나이스에서 사진 명렬표를 다시 내려받아 주세요.
      </p>
    </div>
  );
}

/* ──────────────── ReadingStep ──────────────── */

function ReadingStep() {
  return (
    <div className="px-6 py-16 flex flex-col items-center justify-center gap-3 text-center">
      <span
        className="material-symbols-outlined text-sp-accent text-icon-xl animate-spin"
        aria-hidden="true"
      >
        progress_activity
      </span>
      <p className="text-sm text-sp-text font-medium">파일을 읽고 있어요…</p>
      <p className="text-xs text-sp-muted">이름과 사진 위치를 확인하는 중입니다</p>
    </div>
  );
}

/* ──────────────── ConfirmStep ──────────────── */

interface ConfirmStepProps {
  rows: readonly RosterRow[];
  studentCount: number;
  photoAttachedCount: number;
  format: RosterFileFormat;
  pairing: RosterPairingResult;
  firstRow: RosterRow | null;
  confirmedCount: boolean;
  confirmedFirst: boolean;
  onToggleCount: (v: boolean) => void;
  onToggleFirst: (v: boolean) => void;
  brokenPhotos: ReadonlySet<string>;
  onPhotoBroken: (rowKey: string) => void;
  currentStudentCount: number;
}

function ConfirmStep({
  rows,
  studentCount,
  photoAttachedCount,
  format,
  pairing,
  firstRow,
  confirmedCount,
  confirmedFirst,
  onToggleCount,
  onToggleFirst,
  brokenPhotos,
  onPhotoBroken,
  currentStudentCount,
}: ConfirmStepProps) {
  return (
    <div className="px-6 py-4">
      {/* 상태 배너 — 성공 / 사진 없음 / 짝짓기 실패를 서로 다르게 보여준다 */}
      {pairing.ok && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-start gap-2"
        >
          <span
            className="material-symbols-outlined text-emerald-400 text-icon-md shrink-0"
            aria-hidden="true"
          >
            check_circle
          </span>
          <p className="text-sm text-sp-text">
            {FORMAT_LABEL[format]} 파일에서 학생 {studentCount}명과 사진 {photoAttachedCount}장을
            모두 찾았어요.
          </p>
        </div>
      )}

      {!pairing.ok && pairing.reason === 'NO_PHOTOS' && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 flex items-start gap-2"
        >
          <span
            className="material-symbols-outlined text-sp-accent text-icon-md shrink-0"
            aria-hidden="true"
          >
            info
          </span>
          <p className="text-sm text-sp-text">
            사진이 들어 있지 않아요. <span className="text-sp-muted">이름만 가져올게요.</span>
          </p>
        </div>
      )}

      {!pairing.ok && pairing.reason !== 'NO_PHOTOS' && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-2"
        >
          <span
            className="material-symbols-outlined text-amber-400 text-icon-md shrink-0"
            aria-hidden="true"
          >
            warning
          </span>
          <div>
            <p className="text-sm text-sp-text">
              사진 위치를 확실히 읽지 못해 <span className="font-semibold">이름만</span> 가져왔어요.
            </p>
            <p className="text-xs text-sp-muted mt-1">
              {ROSTER_PAIR_FAILURE_MESSAGES[pairing.reason]}
            </p>
            <p className="text-xs text-sp-muted mt-1">
              나중에 [명렬 관리]에서 학생별로 직접 사진을 지정할 수 있어요.
            </p>
          </div>
        </div>
      )}

      {studentCount === 0 ? (
        <div className="rounded-lg border border-sp-border bg-sp-surface px-4 py-6 text-center text-sm text-sp-muted">
          학생 정보를 찾지 못했어요. 다른 파일을 선택해 주세요.
        </div>
      ) : (
        <>
          {/* 격자 미리보기 — 실물 22명(8·8·6)~최대 28명 */}
          <div className="rounded-lg border border-sp-border bg-sp-surface p-4 max-h-[min(46vh,420px)] overflow-y-auto">
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
              {rows.map((row) => (
                <RosterCell
                  key={row.key}
                  row={row}
                  broken={brokenPhotos.has(row.key)}
                  onBroken={() => onPhotoBroken(row.key)}
                />
              ))}
            </div>
          </div>

          {/* 확인 질문 — 교사가 실제로 판별할 수 있는 것만 묻는다 */}
          <div className="mt-4 rounded-lg border border-sp-border bg-sp-surface p-4 flex flex-col gap-3">
            <p className="text-xs text-sp-muted">
              사진과 얼굴이 맞는지는 지금 확인할 방법이 없어서 묻지 않아요. 아래 두 가지만 확인하면
              반영할 수 있어요.
            </p>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedCount}
                onChange={(e) => onToggleCount(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-sp-accent shrink-0"
              />
              <span className="text-sm text-sp-text">
                학생 수 <span className="font-semibold text-sp-accent">{studentCount}명</span>이
                맞습니까?
                {currentStudentCount > 0 && currentStudentCount !== studentCount && (
                  <span className="block text-xs text-sp-muted mt-0.5">
                    현재 명단은 {currentStudentCount}명이에요. 전학 등으로 다를 수 있으니 직접
                    확인해 주세요.
                  </span>
                )}
              </span>
            </label>

            {firstRow && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedFirst}
                  onChange={(e) => onToggleFirst(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-sp-accent shrink-0"
                />
                <span className="text-sm text-sp-text">
                  명렬표 맨 앞,{' '}
                  <span className="font-semibold text-sp-accent">
                    {firstRow.grade !== undefined && firstRow.classNum !== undefined
                      ? `${firstRow.grade}학년 ${firstRow.classNum}반 ${firstRow.studentNumber}번`
                      : `${firstRow.studentNumber}번`}
                  </span>
                  이 <span className="font-semibold text-sp-accent">"{firstRow.name}"</span>인 게
                  맞습니까?
                </span>
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────── RosterCell ──────────────── */

interface RosterCellProps {
  row: RosterRow;
  broken: boolean;
  onBroken: () => void;
}

function RosterCell({ row, broken, onBroken }: RosterCellProps) {
  const showPhoto = row.photoUrl !== null && !broken;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-full aspect-[3/4] rounded-lg overflow-hidden border border-sp-border bg-sp-card flex items-center justify-center">
        {showPhoto ? (
          <img
            src={row.photoUrl ?? undefined}
            alt={rosterRowLabel(row)}
            className="w-full h-full object-cover"
            onError={onBroken}
          />
        ) : (
          <span
            className="material-symbols-outlined text-sp-muted text-icon-xl opacity-40"
            aria-hidden="true"
          >
            person
          </span>
        )}
      </div>
      {/* 수업반은 소속까지 보여야 한다 — `5번`이 두 명이면 잘못 들어간 줄 알게 된다 */}
      <span
        className="text-xs text-sp-text text-center truncate w-full"
        title={rosterRowLabel(row)}
      >
        {rosterRowLabel(row)}
      </span>
    </div>
  );
}

/* ──────────────── DoneStep ──────────────── */

interface DoneStepProps {
  studentCount: number;
  photoAttachedCount: number;
}

function DoneStep({ studentCount, photoAttachedCount }: DoneStepProps) {
  return (
    <div className="px-6 py-12 flex flex-col items-center justify-center gap-3 text-center">
      <span className="material-symbols-outlined text-emerald-400 text-icon-xl" aria-hidden="true">
        check_circle
      </span>
      <p className="text-base font-semibold text-sp-text">명단에 반영했어요</p>
      <p className="text-sm text-sp-muted">
        이름 {studentCount}명{photoAttachedCount > 0 ? `, 사진 ${photoAttachedCount}장` : ''}을
        반영했습니다.
      </p>
      {photoAttachedCount === 0 && (
        <p className="text-xs text-sp-muted max-w-sm">
          사진은 이번에 반영되지 않았어요. [명렬 관리]에서 학생별로 사진을 직접 추가할 수 있어요.
        </p>
      )}
    </div>
  );
}
