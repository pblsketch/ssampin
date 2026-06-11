import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SignatureSupabaseClient,
  SignatureHttpError,
  type PublicSessionResolved,
} from '@infrastructure/supabase/SignatureSupabaseClient';
import type { SignaturePublicMember } from '@domain/entities/SignatureSession';
import type { ColumnDef } from '@domain/entities/SignatureRoster';
import { SIGNATURE_LEGAL_DISCLAIMER } from '../signature/signatureLegalCopy';
import { extractSignatureRef } from '../signature/signatureRoute';
import { matchesSignatureName } from './signatureNameSearch';
import { StudentSignaturePad, type SignaturePadHandle } from './StudentSignaturePad';

/**
 * 서명받기 참석자 공개 페이지 — `/sign/{id|shortLinkCode}`.
 *
 * 익명(OAuth 불필요) 참석자가 anon key + Edge Function(SignatureSupabaseClient)만으로
 * 본인을 명단에서 골라 서명을 제출한다. Google/교사 전용 코드는 import하지 않는다.
 *
 * 흐름:
 *   load → ①소속 필터 → ②이름(memberRef) 선택 → ③접근코드(옵션) → ④서명 캔버스 → ⑤제출 → 완료
 */

// anon 전용 클라이언트 — DI container(교사/Google 의존)를 거치지 않고 직접 생성.
const signatureClient = new SignatureSupabaseClient();

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; session: PublicSessionResolved };

type Step = 'member' | 'accessCode' | 'sign' | 'done';

const ALL_AFFILIATIONS = '__all__';

export function StudentSignatureApp() {
  const ref = useMemo(() => extractSignatureRef(), []);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!ref) {
      setLoad({ kind: 'error', message: '잘못된 링크입니다. 주소를 다시 확인해 주세요.' });
      return;
    }
    void (async () => {
      try {
        const session = await signatureClient.getPublicSessionByRef(ref);
        if (!cancelled) setLoad({ kind: 'ready', session });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof SignatureHttpError && err.status === 404
            ? '세션을 찾을 수 없거나 이미 마감되었습니다.'
            : '연결을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        setLoad({ kind: 'error', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (load.kind === 'loading') {
    return (
      <SignatureShell>
        {<CenteredNotice icon="hourglass_empty" text="연결을 준비 중입니다…" />}
      </SignatureShell>
    );
  }
  if (load.kind === 'error') {
    return (
      <SignatureShell>
        <CenteredNotice icon="link_off" text={load.message} tone="error" />
      </SignatureShell>
    );
  }
  return <SignatureFlow session={load.session} />;
}

// ── 메인 플로우 ───────────────────────────────────────────────────────────────

/** 명단이 이 인원을 넘으면 검색창을 노출한다 (소규모 명단은 한눈에 보이므로 불필요). */
const SEARCH_THRESHOLD = 8;

function SignatureFlow({ session }: { session: PublicSessionResolved }) {
  const [step, setStep] = useState<Step>('member');
  const [affiliation, setAffiliation] = useState<string>(ALL_AFFILIATIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [rowData, setRowData] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const padRef = useRef<SignaturePadHandle>(null);
  const accessCodeEnabled = session.trustMode.accessCodeEnabled;

  const affiliations = useMemo(() => distinctAffiliations(session.members), [session.members]);
  // 가나다순 정렬 — 100명 규모에서도 본인 위치를 예측할 수 있게.
  const sortedMembers = useMemo(
    () => [...session.members].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [session.members],
  );
  // 소속 칩 + 이름 검색(초성 지원) 동시 적용.
  const filteredMembers = useMemo(
    () =>
      sortedMembers.filter(
        (m) =>
          (affiliation === ALL_AFFILIATIONS || (m.affiliation ?? '') === affiliation) &&
          matchesSignatureName(m.name, searchQuery),
      ),
    [sortedMembers, affiliation, searchQuery],
  );
  const showSearch = session.members.length > SEARCH_THRESHOLD;
  const selectedMember = useMemo(
    () => session.members.find((m) => m.id === selectedMemberId) ?? null,
    [session.members, selectedMemberId],
  );

  // signature 컬럼은 캔버스가 담당하므로 입력 폼에서 제외. builtin 이름 컬럼도 멤버 선택으로 대체.
  const inputColumns = useMemo(() => collectInputColumns(session.columns), [session.columns]);

  const goAfterMember = useCallback(() => {
    setError(null);
    setStep(accessCodeEnabled ? 'accessCode' : 'sign');
  }, [accessCodeEnabled]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!selectedMember) {
      setError('본인 이름을 먼저 선택해 주세요.');
      setStep('member');
      return;
    }
    if (accessCodeEnabled && accessCode.trim().length === 0) {
      setError('접근 코드를 입력해 주세요.');
      setStep('accessCode');
      return;
    }
    const png = padRef.current?.exportPng() ?? null;
    if (!png) {
      setError('서명을 입력해 주세요. 화면에 직접 서명을 그려 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await signatureClient.submitSignature({
        sessionId: session.sessionId,
        memberRef: selectedMember.id,
        signerName: selectedMember.name,
        rowData,
        signatureImage: png,
        accessCode: accessCodeEnabled ? accessCode.trim() : undefined,
      });
      setStep('done');
    } catch (err) {
      setError(toSubmitErrorMessage(err));
      if (err instanceof SignatureHttpError && err.status === 409) {
        setStep('done'); // 중복은 완료 화면에서 안내 (재시도 불가)
      }
    } finally {
      setSubmitting(false);
    }
  }, [selectedMember, accessCodeEnabled, accessCode, rowData, session.sessionId]);

  if (step === 'done') {
    return (
      <SignatureShell title={session.title}>
        <DoneScreen duplicate={error?.includes('이미 서명') ?? false} message={error} />
      </SignatureShell>
    );
  }

  return (
    <SignatureShell title={session.title} headerText={session.headerText}>
      <ol className="flex items-center justify-center gap-2 text-xs text-sp-muted" aria-hidden>
        <StepDot active={step === 'member'} label="이름" />
        {accessCodeEnabled && <StepDot active={step === 'accessCode'} label="코드" />}
        <StepDot active={step === 'sign'} label="서명" />
      </ol>

      {step === 'member' && (
        <StepCard
          title="본인 이름을 선택하세요"
          subtitle={
            showSearch ? '이름을 검색하면 빨라요. 초성(ㅎㄱㄷ)으로도 찾을 수 있어요.' : undefined
          }
        >
          {showSearch && (
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-sp-muted">
                search
              </span>
              <input
                type="search"
                inputMode="search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 검색 (예: 길동, ㅎㄱㄷ)"
                aria-label="이름 검색"
                className="w-full rounded-lg border border-sp-border bg-sp-surface py-3 pl-10 pr-3 text-base text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
              />
            </div>
          )}

          {affiliations.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="소속 필터">
              <AffiliationChip
                label="전체"
                active={affiliation === ALL_AFFILIATIONS}
                onClick={() => setAffiliation(ALL_AFFILIATIONS)}
              />
              {affiliations.map((aff) => (
                <AffiliationChip
                  key={aff}
                  label={aff}
                  active={affiliation === aff}
                  onClick={() => setAffiliation(aff)}
                />
              ))}
            </div>
          )}

          {filteredMembers.length === 0 ? (
            <div className="rounded-lg bg-sp-surface p-4 text-center text-sm text-sp-muted">
              {searchQuery.trim()
                ? `'${searchQuery.trim()}' 검색 결과가 없어요. 철자를 확인하거나 소속을 '전체'로 바꿔 보세요.`
                : '표시할 이름이 없습니다.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMemberId(m.id);
                      goAfterMember();
                    }}
                    className="min-h-[52px] rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5 text-sm font-semibold text-sp-text transition hover:border-sp-accent"
                  >
                    {m.name}
                    {/* 동명이인 구분 — 소속 필터가 '전체'일 때만 소속을 함께 표시 */}
                    {affiliation === ALL_AFFILIATIONS && (m.affiliation ?? '') !== '' && (
                      <span className="mt-0.5 block text-[11px] font-normal text-sp-muted">
                        {m.affiliation}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {showSearch && (
                <p className="text-center text-[11px] text-sp-muted">
                  {filteredMembers.length}명 표시 중 · 가나다순
                </p>
              )}
            </>
          )}
        </StepCard>
      )}

      {step === 'accessCode' && (
        <StepCard title="접근 코드를 입력하세요" subtitle="선생님이 안내한 코드를 입력해 주세요.">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="접근 코드"
            autoFocus
            className="rounded-lg border border-sp-border bg-sp-surface px-3 py-3 text-center text-lg tracking-widest text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
          />
          {error && <ErrorText>{error}</ErrorText>}
          <PrimaryButton
            onClick={() => {
              if (accessCode.trim().length === 0) {
                setError('접근 코드를 입력해 주세요.');
                return;
              }
              setError(null);
              setStep('sign');
            }}
          >
            다음
          </PrimaryButton>
        </StepCard>
      )}

      {step === 'sign' && (
        <StepCard
          title="서명해 주세요"
          subtitle={selectedMember ? `${selectedMember.name} 님` : undefined}
        >
          {inputColumns.length > 0 && (
            <div className="flex flex-col gap-3">
              {inputColumns.map((col) => (
                <label key={col.key} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-sp-text">{col.label}</span>
                  <input
                    type={col.type === 'number' ? 'number' : 'text'}
                    value={rowData[col.key] ?? ''}
                    onChange={(e) => setRowData((prev) => ({ ...prev, [col.key]: e.target.value }))}
                    className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                  />
                </label>
              ))}
            </div>
          )}

          <StudentSignaturePad ref={padRef} onStrokeStart={() => setError(null)} />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                padRef.current?.clear();
                setError(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-sp-border px-3 py-2 text-xs text-sp-muted transition hover:text-sp-text"
            >
              <span className="material-symbols-outlined text-[18px]">ink_eraser</span>
              지우기
            </button>
            <span className="text-[11px] text-sp-muted">손가락 또는 펜으로 서명</span>
          </div>

          {error && <ErrorText>{error}</ErrorText>}

          <PrimaryButton onClick={handleSubmit} disabled={submitting}>
            {submitting ? '제출 중…' : '서명 제출'}
          </PrimaryButton>

          <p className="text-center text-[11px] leading-5 text-sp-muted">
            {SIGNATURE_LEGAL_DISCLAIMER}
          </p>
        </StepCard>
      )}
    </SignatureShell>
  );
}

// ── 완료 화면 ─────────────────────────────────────────────────────────────────

function DoneScreen({ duplicate, message }: { duplicate: boolean; message: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-sp-border bg-sp-card p-8 text-center">
      <span
        className={`material-symbols-outlined text-[56px] ${duplicate ? 'text-amber-400' : 'text-emerald-400'}`}
      >
        {duplicate ? 'info' : 'check_circle'}
      </span>
      <h2 className="text-xl font-bold text-sp-text">
        {duplicate ? '이미 서명하셨습니다' : '서명이 등록되었습니다'}
      </h2>
      {duplicate ? (
        <p className="text-sm text-sp-muted">{message ?? '중복 제출은 허용되지 않습니다.'}</p>
      ) : (
        <p className="text-sm leading-6 text-sp-muted">{SIGNATURE_LEGAL_DISCLAIMER}</p>
      )}
    </div>
  );
}

// ── 레이아웃 / 프리미티브 ──────────────────────────────────────────────────────

function SignatureShell({
  children,
  title,
  headerText,
}: {
  children: React.ReactNode;
  title?: string;
  headerText?: string;
}) {
  return (
    <div className="min-h-screen bg-sp-bg px-5 py-8 text-sp-text">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header className="text-center">
          <span className="material-symbols-outlined text-[40px] text-sp-accent">draw</span>
          <h1 className="mt-1 text-xl font-bold">{title ?? '서명받기'}</h1>
          {headerText && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-sp-muted">{headerText}</p>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function StepCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-sp-border bg-sp-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-sp-text">{title}</h2>
        {subtitle && <p className="text-xs text-sp-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-rose-400" role="alert">
      {children}
    </p>
  );
}

function AffiliationChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        active
          ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
          : 'border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text'
      }`}
    >
      {label}
    </button>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1">
      <span
        className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-sp-accent' : 'bg-sp-border'}`}
      />
      <span className={active ? 'text-sp-text' : ''}>{label}</span>
    </li>
  );
}

function CenteredNotice({ icon, text, tone }: { icon: string; text: string; tone?: 'error' }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-sp-border bg-sp-card p-8 text-center">
      <span
        className={`material-symbols-outlined text-[40px] ${tone === 'error' ? 'text-rose-400' : 'text-sp-muted'}`}
      >
        {icon}
      </span>
      <p className="text-sm text-sp-muted">{text}</p>
    </div>
  );
}

// ── 순수 헬퍼 ─────────────────────────────────────────────────────────────────

function distinctAffiliations(members: readonly SignaturePublicMember[]): string[] {
  const set = new Set<string>();
  for (const m of members) {
    const aff = (m.affiliation ?? '').trim();
    if (aff.length > 0) set.add(aff);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 입력 폼에 노출할 컬럼 — signature/datetime/builtin 제외 (이름은 멤버 선택으로 대체). */
function collectInputColumns(columns: readonly ColumnDef[]): ColumnDef[] {
  return [...columns]
    .filter((c) => c.type !== 'signature' && c.type !== 'datetime' && !c.builtin)
    .sort((a, b) => a.order - b.order);
}

function toSubmitErrorMessage(err: unknown): string {
  if (err instanceof SignatureHttpError) {
    if (err.status === 409) return '이미 서명하셨습니다. 중복 제출은 허용되지 않습니다.';
    if (err.status === 403) return err.message; // 접근 코드 오류/마감 등 서버 한국어 메시지
    if (err.status === 404) return '세션을 찾을 수 없거나 이미 마감되었습니다.';
    if (err.status === 429) return '제출 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    return err.message;
  }
  return '제출에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}
