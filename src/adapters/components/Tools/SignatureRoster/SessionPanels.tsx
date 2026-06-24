/**
 * 서명받기 — 공개 후 단계 패널 (공유·현황 / 등록부 생성).
 *
 * 세션 publish 이후 화면을 담당한다. 현황 필터·정렬은 이 패널 내부 상태.
 * 데이터 조작(폴링·내보내기·삭제)은 부모(ToolSignatureRoster)가 콜백으로 주입한다.
 */
import { useMemo, useState } from 'react';
import type { SignatureStatusRow } from '@domain/entities/SignatureEntry';
import type { ActiveSignatureSession } from '@adapters/stores/useSignatureRosterStore';
import { SIGNATURE_LEGAL_DISCLAIMER } from '../../../../signature/signatureLegalCopy';

type StatusFilter = 'all' | 'signed' | 'unsigned';
type StatusSort = 'order' | 'name' | 'affiliation' | 'signed';
export type SignatureRetentionPreset = '30' | '60' | '90' | 'custom';

interface RetentionControlProps {
  readonly session: ActiveSignatureSession;
  readonly retentionPreset: SignatureRetentionPreset;
  readonly customRetentionDays: string;
  readonly closingSession: boolean;
  readonly deletingSignatureImages: boolean;
  readonly onRetentionPresetChange: (preset: SignatureRetentionPreset) => void;
  readonly onCustomRetentionDaysChange: (value: string) => void;
  readonly onCloseSession: () => void;
  readonly onDeleteSignatureImages: () => void;
}

// ──────────────────────────────────────────────────────────
// 공유·현황 (4단계)
// ──────────────────────────────────────────────────────────

interface SharePanelProps {
  readonly session: ActiveSignatureSession;
  readonly studentUrl: string;
  readonly qrDataUrl: string | null;
  readonly copied: boolean;
  readonly statusRows: readonly SignatureStatusRow[];
  readonly onCopyLink: () => void;
  readonly onGoExport: () => void;
  readonly retentionPreset: SignatureRetentionPreset;
  readonly customRetentionDays: string;
  readonly closingSession: boolean;
  readonly deletingSignatureImages: boolean;
  readonly onRetentionPresetChange: (preset: SignatureRetentionPreset) => void;
  readonly onCustomRetentionDaysChange: (value: string) => void;
  readonly onCloseSession: () => void;
  readonly onDeleteSignatureImages: () => void;
  readonly onDeleteSession: () => void;
}

export function SharePanel({
  session,
  studentUrl,
  qrDataUrl,
  copied,
  statusRows,
  onCopyLink,
  onGoExport,
  retentionPreset,
  customRetentionDays,
  closingSession,
  deletingSignatureImages,
  onRetentionPresetChange,
  onCustomRetentionDaysChange,
  onCloseSession,
  onDeleteSignatureImages,
  onDeleteSession,
}: SharePanelProps) {
  const totalCount = session.members.length;
  const signedCount = statusRows.filter((row) => row.signed).length;
  const sessionClosed = session.status === 'closed';

  return (
    <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold text-sp-accent">4단계 · 공유·현황</p>
          <h3 className="mt-1 text-xl font-bold text-sp-text">
            QR을 보여 주고, 서명이 모이는 걸 지켜봐요
          </h3>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <InfoRow label="제목" value={session.title} />
            <InfoRow label="대상" value={`${totalCount}명`} />
            <InfoRow label="참여 코드" value={session.shortLinkCode} />
            <InfoRow label="완료" value={`${signedCount} / ${totalCount}명`} />
            <InfoRow label="상태" value={sessionClosed ? '마감됨' : '진행 중'} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onGoExport}
              className="rounded-xl bg-sp-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
            >
              등록부 만들기 →
            </button>
            <button
              type="button"
              onClick={onDeleteSession}
              className="rounded-xl border border-red-500/40 px-5 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/10"
            >
              세션 삭제
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-sp-border bg-sp-surface p-5">
          <h4 className="text-lg font-bold text-sp-text">서명 참여 링크</h4>
          <div className="mt-4 space-y-3">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="서명 참여 QR" className="mx-auto rounded-xl bg-white p-2" />
            )}
            <p className="break-all rounded-xl bg-sp-card p-3 text-xs text-sp-muted">
              {studentUrl}
            </p>
            <button
              type="button"
              onClick={onCopyLink}
              className="w-full rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-card"
            >
              {copied ? '복사됨 ✓' : '링크 복사'}
            </button>
          </div>
        </div>
      </div>

      <SessionRetentionControl
        session={session}
        retentionPreset={retentionPreset}
        customRetentionDays={customRetentionDays}
        closingSession={closingSession}
        deletingSignatureImages={deletingSignatureImages}
        onRetentionPresetChange={onRetentionPresetChange}
        onCustomRetentionDaysChange={onCustomRetentionDaysChange}
        onCloseSession={onCloseSession}
        onDeleteSignatureImages={onDeleteSignatureImages}
      />

      <StatusBoard rows={statusRows} totalCount={totalCount} signedCount={signedCount} />
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// 현황 보드 (공유 단계 내부)
// ──────────────────────────────────────────────────────────

function StatusBoard({
  rows,
  totalCount,
  signedCount,
}: {
  readonly rows: readonly SignatureStatusRow[];
  readonly totalCount: number;
  readonly signedCount: number;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusSort, setStatusSort] = useState<StatusSort>('order');
  const [affiliationFilter, setAffiliationFilter] = useState<string>('all');

  const affiliations = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.affiliation) set.add(row.affiliation);
    });
    return [...set];
  }, [rows]);

  const visibleRows = useMemo(
    () => filterAndSortStatus(rows, statusFilter, statusSort, affiliationFilter),
    [rows, statusFilter, statusSort, affiliationFilter],
  );

  return (
    <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sp-accent">서명 현황 (10초마다 자동 갱신)</p>
          <h4 className="mt-1 text-lg font-bold text-sp-text">
            {totalCount}명 중 {signedCount}명 완료
          </h4>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'unsigned', 'signed'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === value
                ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                : 'border-sp-border bg-sp-card text-sp-muted hover:text-sp-text'
            }`}
          >
            {value === 'all' ? '전체' : value === 'signed' ? '완료' : '미서명'}
          </button>
        ))}
        {affiliations.length > 0 && (
          <select
            value={affiliationFilter}
            onChange={(event) => setAffiliationFilter(event.target.value)}
            className="rounded-full border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
          >
            <option value="all">소속 전체</option>
            {affiliations.map((affiliation) => (
              <option key={affiliation} value={affiliation}>
                {affiliation}
              </option>
            ))}
          </select>
        )}
        <select
          value={statusSort}
          onChange={(event) => setStatusSort(event.target.value as StatusSort)}
          className="rounded-full border border-sp-border bg-sp-card px-3 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
        >
          <option value="order">기본 순서</option>
          <option value="name">이름순</option>
          <option value="affiliation">소속순</option>
          <option value="signed">완료순</option>
        </select>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleRows.length === 0 ? (
          <p className="rounded-xl bg-sp-card p-4 text-sm text-sp-muted">
            아직 표시할 현황이 없습니다. 서명이 들어오면 10초마다 자동으로 갱신됩니다.
          </p>
        ) : (
          visibleRows.map((row) => (
            <div
              key={row.memberRef}
              className={`rounded-xl border p-3 ${
                row.signed ? 'border-sp-border bg-sp-card' : 'border-amber-400/40 bg-amber-400/5'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-sp-text">{row.name}</span>
                <span className={`text-lg ${row.signed ? '' : 'opacity-60'}`}>
                  {row.signed ? '✅' : '⬜'}
                </span>
              </div>
              <p className="mt-1 text-xs text-sp-muted">
                {row.affiliation ?? '소속 미지정'}
                {row.signed && row.signedAt ? ` · ${formatSignedAt(row.signedAt)}` : ''}
                {row.signatureImageDeletedAt ? ' · 이미지 삭제됨' : ''}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 등록부 생성 (5단계)
// ──────────────────────────────────────────────────────────

interface ExportPanelProps {
  readonly session: ActiveSignatureSession;
  readonly signedCount: number;
  readonly exporting: boolean;
  readonly exportingExcel: boolean;
  readonly onBackToShare: () => void;
  readonly onExport: () => void;
  readonly onExportExcel: () => void;
  readonly onOpenSheet: () => void;
  readonly retentionPreset: SignatureRetentionPreset;
  readonly customRetentionDays: string;
  readonly closingSession: boolean;
  readonly deletingSignatureImages: boolean;
  readonly onRetentionPresetChange: (preset: SignatureRetentionPreset) => void;
  readonly onCustomRetentionDaysChange: (value: string) => void;
  readonly onCloseSession: () => void;
  readonly onDeleteSignatureImages: () => void;
  readonly onBackupReset: () => void;
  readonly onDeleteSession: () => void;
}

export function ExportPanel({
  session,
  signedCount,
  exporting,
  exportingExcel,
  onBackToShare,
  onExport,
  onExportExcel,
  onOpenSheet,
  retentionPreset,
  customRetentionDays,
  closingSession,
  deletingSignatureImages,
  onRetentionPresetChange,
  onCustomRetentionDaysChange,
  onCloseSession,
  onDeleteSignatureImages,
  onBackupReset,
  onDeleteSession,
}: ExportPanelProps) {
  const totalCount = session.members.length;
  const allSigned = totalCount > 0 && signedCount >= totalCount;

  return (
    <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
      <p className="text-sm font-semibold text-sp-accent">5단계 · 등록부 생성</p>
      <h3 className="mt-1 text-xl font-bold text-sp-text">모인 서명으로 등록부를 만들어요</h3>
      <p className="mt-2 text-sm text-sp-muted">
        현재 {totalCount}명 중 <span className="font-bold text-sp-text">{signedCount}명</span>이
        서명했어요.
        {!allSigned && ' 아직 안 한 사람이 있어도 지금까지 모인 서명으로 등록부를 만들 수 있어요.'}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-sp-border bg-sp-surface p-4">
          <h4 className="text-base font-bold text-sp-text">구글시트 등록부</h4>
          <p className="mt-1 text-xs leading-5 text-sp-muted">
            서명 이미지가 들어간 시트를 내 구글 드라이브에 만들어요. (구글 로그인 필요)
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? '생성하는 중...' : session.sheetUrl ? '시트 다시 생성' : '구글시트 생성'}
            </button>
            {session.sheetUrl && (
              <button
                type="button"
                onClick={onOpenSheet}
                className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text transition hover:bg-sp-card"
              >
                시트 열기
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-sp-border bg-sp-surface p-4">
          <h4 className="text-base font-bold text-sp-text">Excel 파일 (.xlsx)</h4>
          <p className="mt-1 text-xs leading-5 text-sp-muted">
            서명 이미지를 넣은 엑셀 파일을 내 컴퓨터에 저장해요. (구글 로그인 없이 가능)
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={onExportExcel}
              disabled={exportingExcel}
              className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text transition hover:bg-sp-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingExcel ? '내보내는 중...' : 'Excel 내보내기'}
            </button>
          </div>
        </div>
      </div>

      <SessionRetentionControl
        session={session}
        retentionPreset={retentionPreset}
        customRetentionDays={customRetentionDays}
        closingSession={closingSession}
        deletingSignatureImages={deletingSignatureImages}
        onRetentionPresetChange={onRetentionPresetChange}
        onCustomRetentionDaysChange={onCustomRetentionDaysChange}
        onCloseSession={onCloseSession}
        onDeleteSignatureImages={onDeleteSignatureImages}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-sp-border pt-4">
        <button
          type="button"
          onClick={onBackToShare}
          className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
        >
          ← 현황으로 돌아가기
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onBackupReset}
          className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
        >
          세션 닫고 처음으로
        </button>
        <button
          type="button"
          onClick={onDeleteSession}
          className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/10"
        >
          세션 삭제
        </button>
      </div>
      <p className="mt-3 text-xs text-sp-muted">{SIGNATURE_LEGAL_DISCLAIMER}</p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// 공용 헬퍼
// ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sp-muted">{label}</dt>
      <dd className="text-right font-medium text-sp-text">{value}</dd>
    </div>
  );
}

function SessionRetentionControl({
  session,
  retentionPreset,
  customRetentionDays,
  closingSession,
  deletingSignatureImages,
  onRetentionPresetChange,
  onCustomRetentionDaysChange,
  onCloseSession,
  onDeleteSignatureImages,
}: RetentionControlProps) {
  const sessionClosed = session.status === 'closed';
  const imagesDeleted = Boolean(session.signatureImagesDeletedAt);

  return (
    <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sp-accent">서명 이미지 보관</p>
          <h4 className="mt-1 text-lg font-bold text-sp-text">
            {imagesDeleted
              ? '서명 이미지가 삭제되었습니다'
              : sessionClosed
                ? '마감된 세션입니다'
                : '마감 후 자동삭제 기간을 정해 주세요'}
          </h4>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-sp-muted">
            세션을 마감하면 학생은 더 이상 서명할 수 없습니다. 선생님은 보관기간 동안 현황 확인과
            내보내기를 계속 할 수 있습니다.
          </p>
        </div>
        <span className="rounded-full border border-sp-border bg-sp-card px-3 py-1 text-xs font-bold text-sp-muted">
          {sessionClosed ? '마감됨' : '진행 중'}
        </span>
      </div>

      {!sessionClosed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['30', '60', '90'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onRetentionPresetChange(preset)}
              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                retentionPreset === preset
                  ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                  : 'border-sp-border bg-sp-card text-sp-muted hover:text-sp-text'
              }`}
            >
              {preset}일
            </button>
          ))}
          <button
            type="button"
            onClick={() => onRetentionPresetChange('custom')}
            className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
              retentionPreset === 'custom'
                ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                : 'border-sp-border bg-sp-card text-sp-muted hover:text-sp-text'
            }`}
          >
            직접 설정
          </button>
          {retentionPreset === 'custom' && (
            <label className="flex items-center gap-2 text-sm text-sp-text">
              <input
                type="number"
                min={1}
                max={365}
                value={customRetentionDays}
                onChange={(event) => onCustomRetentionDaysChange(event.target.value)}
                className="w-24 rounded-xl border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
              />
              일
            </label>
          )}
          <button
            type="button"
            onClick={onCloseSession}
            disabled={closingSession}
            className="rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {closingSession ? '마감하는 중...' : '세션 마감'}
          </button>
        </div>
      )}

      {sessionClosed && (
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <InfoRow label="마감 시각" value={formatDateTime(session.closedAt)} />
          <InfoRow
            label="자동삭제 예정"
            value={imagesDeleted ? '이미 삭제됨' : formatDateTime(session.signatureCleanupAfter)}
          />
          <InfoRow
            label="이미지 삭제"
            value={imagesDeleted ? formatDateTime(session.signatureImagesDeletedAt) : '보관 중'}
          />
        </div>
      )}

      {sessionClosed && !imagesDeleted && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sp-border pt-4">
          <p className="max-w-2xl text-xs leading-5 text-sp-muted">
            서명 이미지를 지금 삭제하면 구글시트의 서명 칸이 더 이상 보이지 않을 수 있습니다. 서명
            완료 여부와 명단 기록은 유지되지만, 삭제한 이미지는 복구할 수 없습니다.
          </p>
          <button
            type="button"
            onClick={onDeleteSignatureImages}
            disabled={deletingSignatureImages}
            className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingSignatureImages ? '삭제하는 중...' : '서명 이미지만 삭제'}
          </button>
        </div>
      )}
    </div>
  );
}

function filterAndSortStatus(
  rows: readonly SignatureStatusRow[],
  filter: StatusFilter,
  sort: StatusSort,
  affiliationFilter: string,
): SignatureStatusRow[] {
  let result = [...rows];
  if (filter === 'signed') result = result.filter((row) => row.signed);
  if (filter === 'unsigned') result = result.filter((row) => !row.signed);
  if (affiliationFilter !== 'all') {
    result = result.filter((row) => (row.affiliation ?? '') === affiliationFilter);
  }
  result.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ko');
    if (sort === 'affiliation') {
      return (a.affiliation ?? '').localeCompare(b.affiliation ?? '', 'ko');
    }
    if (sort === 'signed') return Number(b.signed) - Number(a.signed);
    return 0;
  });
  return result;
}

function formatSignedAt(signedAt?: string): string {
  if (!signedAt) return '';
  const date = new Date(signedAt);
  if (Number.isNaN(date.getTime())) return signedAt;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
