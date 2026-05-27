import { useEffect, useMemo, useRef, useState } from 'react';
import type { SignatureKind } from '@domain/entities/SignatureRequest';
import {
  disabledSignaturePublicClient,
  type SignaturePublicLoadResult,
  type SignaturePublicRequestClient,
  type SignaturePublicRequestView,
  type SignaturePublicSubmissionDraft,
  type SignaturePublicSubmitResult,
} from './SignatureRequestPublicClient';
import { SignatureCanvasPad, type SignatureCanvasPadHandle } from './SignatureCanvasPad';

interface SignatureRequestPublicAppProps {
  readonly client?: SignaturePublicRequestClient;
  readonly route?: SignaturePublicRoute;
}

export interface SignaturePublicRoute {
  readonly requestId: string;
  readonly token?: string;
}

const PREVIEW_REQUEST: SignaturePublicRequestView = {
  id: 'preview',
  title: '서명받기',
  description:
    '준비 중인 서명 요청입니다. 선생님이 링크를 발급하면 이 화면에서 서명을 제출할 수 있습니다.',
  participants: [
    {
      id: 'participant-1',
      displayName: '홍길동',
      requiredSignatureKinds: ['student', 'parent'],
    },
    {
      id: 'participant-2',
      displayName: '김교사',
      requiredSignatureKinds: ['recipient'],
    },
  ],
  pinEnabled: true,
  uniqueLinksEnabled: true,
};

const SIGNATURE_KIND_LABELS: Record<SignatureKind, string> = {
  recipient: '대상자 서명',
  student: '학생 서명',
  parent: '학부모 서명',
  guardian: '보호자 서명',
  teacher: '교사 서명',
};

export function SignatureRequestPublicApp({
  client = disabledSignaturePublicClient,
  route = getSignaturePublicRouteFromLocation(window.location),
}: SignatureRequestPublicAppProps) {
  const [loadResult, setLoadResult] = useState<SignaturePublicLoadResult | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [signatureKind, setSignatureKind] = useState<SignatureKind>('recipient');
  const [signerName, setSignerName] = useState('');
  const [pin, setPin] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [submitResult, setSubmitResult] = useState<SignaturePublicSubmitResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canvasRef = useRef<SignatureCanvasPadHandle | null>(null);

  useEffect(() => {
    let alive = true;
    void client.loadRequest({ requestId: route.requestId, token: route.token }).then((result) => {
      if (!alive) return;
      setLoadResult(result);
      if (result.status === 'ready') {
        const resolvedParticipantId =
          result.resolvedParticipantId ?? result.request.participants[0]?.id ?? '';
        setSelectedParticipantId(resolvedParticipantId);
      }
    });
    return () => {
      alive = false;
    };
  }, [client, route.requestId, route.token]);

  const request = loadResult?.status === 'ready' ? loadResult.request : PREVIEW_REQUEST;
  const selectedParticipant = useMemo(
    () => request.participants.find((participant) => participant.id === selectedParticipantId),
    [request.participants, selectedParticipantId],
  );
  const availableSignatureKinds = useMemo<readonly SignatureKind[]>(
    () => selectedParticipant?.requiredSignatureKinds ?? ['recipient'],
    [selectedParticipant?.requiredSignatureKinds],
  );

  useEffect(() => {
    const nextKind = availableSignatureKinds[0] ?? 'recipient';
    if (!availableSignatureKinds.includes(signatureKind)) {
      setSignatureKind(nextKind);
    }
  }, [availableSignatureKinds, signatureKind]);

  const modeLabel = route.token ? '개인 고유 링크' : '명단 선택';
  const isReadyToSubmit =
    Boolean(route.requestId) &&
    Boolean(signerName.trim()) &&
    hasInk &&
    (route.token || Boolean(selectedParticipantId));

  const handleSubmit = async () => {
    setSubmitResult(null);
    const dataUrl = canvasRef.current?.toDataUrl('image/png') ?? null;
    if (!isReadyToSubmit || !dataUrl) {
      setSubmitResult({
        status: 'rejected',
        message: '이름, 대상자, 손글씨 서명을 모두 입력해 주세요.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const draft = createSignaturePublicSubmissionDraft({
        requestId: route.requestId,
        participantId: selectedParticipantId || undefined,
        token: route.token,
        pin: pin.trim() || undefined,
        signatureKind,
        signerName,
        signatureImageDataUrl: dataUrl,
      });
      const result = await client.submitSignature(draft);
      setSubmitResult(result);
      if (result.status === 'accepted') {
        canvasRef.current?.clear();
        setHasInk(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-sp-bg px-4 py-6 text-sp-text">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-sp-border bg-sp-card p-6 shadow-sp-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-sp-semibold text-sp-accent">{modeLabel}</p>
              <h1 className="mt-1 text-2xl font-sp-bold">{request.title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                {request.description ?? '링크를 받은 사람이 직접 서명을 제출하는 화면입니다.'}
              </p>
            </div>
            {(!loadResult || loadResult.status !== 'ready') && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-sp-semibold text-amber-700">
                연결 준비 중
              </span>
            )}
          </div>

          {loadResult && loadResult.status !== 'ready' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              {loadResult.message}
            </div>
          )}

          <div className="mt-6 space-y-5">
            {!route.token && (
              <LabeledField label="서명 대상자 선택">
                <select
                  value={selectedParticipantId}
                  onChange={(event) => setSelectedParticipantId(event.target.value)}
                  className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-3 text-sm outline-none focus:border-sp-accent"
                >
                  <option value="">대상자를 선택하세요</option>
                  {request.participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.displayName}
                    </option>
                  ))}
                </select>
              </LabeledField>
            )}

            {route.token && (
              <div className="rounded-xl border border-sp-border bg-sp-surface/70 p-3 text-sm">
                선생님이 보내신 개인 링크로 접속했습니다. 아래 정보를 입력하고 서명해 주세요.
              </div>
            )}

            <LabeledField label="서명 종류">
              <select
                value={signatureKind}
                onChange={(event) => setSignatureKind(event.target.value as SignatureKind)}
                className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-3 text-sm outline-none focus:border-sp-accent"
              >
                {availableSignatureKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {SIGNATURE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </LabeledField>

            <LabeledField label="이름">
              <input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-3 text-sm outline-none focus:border-sp-accent"
                placeholder="서명자 이름"
              />
            </LabeledField>

            {request.pinEnabled && (
              <LabeledField label="PIN">
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-3 text-sm outline-none focus:border-sp-accent"
                  inputMode="numeric"
                  placeholder="교사가 안내한 PIN"
                />
              </LabeledField>
            )}

            <section className="rounded-2xl border border-dashed border-sp-border bg-sp-surface/60 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-sp-bold">서명</h2>
                <p className="mt-1 text-xs text-sp-muted">
                  손가락(모바일)이나 마우스로 아래 영역에 서명한 뒤 제출 버튼을 누르세요.
                </p>
              </div>
              <SignatureCanvasPad
                ref={canvasRef}
                disabled={isSubmitting}
                onChange={setHasInk}
                ariaLabel="손글씨 서명 입력 캔버스"
              />
            </section>

            {submitResult && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  submitResult.status === 'accepted'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                {submitResult.status === 'accepted'
                  ? '서명이 접수되었습니다. 이 화면을 닫으셔도 됩니다.'
                  : submitResult.message}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-sp-accent px-4 py-3 text-sm font-sp-bold text-white shadow-sp-sm disabled:opacity-50"
            >
              {isSubmitting ? '제출 중...' : '서명 제출'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export function isSignaturePublicRoute(pathname: string, search: string): boolean {
  if (pathname.startsWith('/sign/')) return true;
  const params = new URLSearchParams(search);
  return params.get('tool') === 'signature-request' || params.has('sign');
}

export function getSignaturePublicRouteFromLocation(
  location: Pick<Location, 'pathname' | 'search'>,
): SignaturePublicRoute {
  const params = new URLSearchParams(location.search);
  const pathMatch = location.pathname.match(/\/sign\/([^/?#]+)/);
  const requestId = decodeURIComponent(
    pathMatch?.[1] ?? params.get('id') ?? params.get('sign') ?? '',
  );
  return {
    requestId,
    token: params.get('token') ?? undefined,
  };
}

export function createSignaturePublicSubmissionDraft({
  requestId,
  participantId,
  token,
  pin,
  signatureKind,
  signerName,
  signatureImageDataUrl,
  now = () => new Date().toISOString(),
}: {
  readonly requestId: string;
  readonly participantId?: string;
  readonly token?: string;
  readonly pin?: string;
  readonly signatureKind: SignatureKind;
  readonly signerName: string;
  readonly signatureImageDataUrl: string;
  readonly now?: () => string;
}): SignaturePublicSubmissionDraft {
  return {
    requestId,
    participantId,
    token,
    pin,
    signatureKind,
    signerName: signerName.trim(),
    signatureImageDataUrl,
    submittedAt: now(),
  };
}

function LabeledField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-sp-semibold text-sp-muted">{label}</span>
      {children}
    </label>
  );
}
