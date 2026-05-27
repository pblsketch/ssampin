import { useEffect, useMemo, useState } from 'react';
import type { SignatureKind } from '@domain/entities/SignatureRequest';
import {
  disabledSignaturePublicClient,
  type SignaturePublicLoadResult,
  type SignaturePublicRequestClient,
  type SignaturePublicRequestView,
  type SignaturePublicSubmissionDraft,
  type SignaturePublicSubmitResult,
} from './SignatureRequestPublicClient';

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
  const [signatureImageDataUrl, setSignatureImageDataUrl] = useState('');
  const [submitResult, setSubmitResult] = useState<SignaturePublicSubmitResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    Boolean(signatureImageDataUrl) &&
    (route.token || Boolean(selectedParticipantId));

  const handleCreateSignaturePreview = () => {
    setSignatureImageDataUrl(createSignaturePreviewDataUrl(signerName || '서명'));
  };

  const handleSubmit = async () => {
    setSubmitResult(null);
    if (!isReadyToSubmit) {
      setSubmitResult({
        status: 'rejected',
        message: '이름, 대상자, 서명 이미지를 모두 입력해 주세요.',
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
        signatureImageDataUrl,
      });
      const result = await client.submitSignature(draft);
      setSubmitResult(result);
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
                선생님이 보내 주신 링크로 본인 확인이 되었습니다. 아래 정보를 입력하고 서명해
                주세요.
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-sp-bold">서명</h2>
                  <p className="mt-1 text-xs text-sp-muted">
                    아래 영역에 손가락 또는 마우스로 서명한 뒤 제출 버튼을 눌러 주세요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateSignaturePreview}
                  className="rounded-xl border border-sp-border bg-sp-card px-4 py-2 text-sm font-sp-semibold text-sp-text"
                >
                  서명 이미지 만들기
                </button>
              </div>
              <div className="mt-4 flex h-36 items-center justify-center rounded-xl bg-white text-center text-sm text-sp-muted">
                {signatureImageDataUrl ? (
                  <img src={signatureImageDataUrl} alt="캡처된 서명" className="max-h-28" />
                ) : (
                  '여기에 손가락 또는 마우스로 서명합니다'
                )}
              </div>
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
                  ? '서명이 접수되었습니다.'
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

function createSignaturePreviewDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120"><rect width="360" height="120" fill="white"/><path d="M35 78 C95 20, 130 105, 185 54 S285 40, 325 72" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round"/><text x="35" y="108" fill="#6b7280" font-size="14">${escapeSvgText(label)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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
