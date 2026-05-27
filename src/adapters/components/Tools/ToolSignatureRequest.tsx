import { useEffect, useMemo, useState } from 'react';
import { ToolLayout } from './ToolLayout';
import type {
  SignatureKind,
  SignatureMappingTarget,
  SignatureMappingTargetType,
  SignatureParticipant,
  SignatureParticipantLocalAccessSecret,
  SignatureParticipantStatus,
  SignatureRequest,
  SignatureParticipantRole,
  SignatureTemplateKind,
  SignatureTemplateMapping,
  SignatureTemplateSourceType,
  SignatureTextFieldKey,
} from '@domain/entities/SignatureRequest';
import {
  getParticipantSignatureStatus,
  getSignatureRequestProgress,
} from '@domain/rules/signatureRequestRules';
import type { CreateSignatureRequestDraftInput } from '@adapters/stores/useSignatureRequestStore';
import { useSignatureRequestStore } from '@adapters/stores/useSignatureRequestStore';

interface ToolSignatureRequestProps {
  readonly onBack: () => void;
  readonly isFullscreen: boolean;
}

interface TemplateKindOption {
  readonly value: SignatureTemplateKind;
  readonly label: string;
  readonly description: string;
}

interface TextMappingDraft {
  readonly id: string;
  readonly key: SignatureTextFieldKey;
  readonly label: string;
  readonly targetType: SignatureMappingTargetType;
  readonly targetValue: string;
  readonly sheetName?: string;
  readonly required: boolean;
}

interface SignatureSlotDraft {
  readonly id: string;
  readonly kind: SignatureKind;
  readonly label: string;
  readonly targetType: SignatureMappingTargetType;
  readonly targetValue: string;
  readonly sheetName?: string;
  readonly required: boolean;
}

interface BuildDraftInputParams {
  readonly title: string;
  readonly description?: string;
  readonly templateKind: SignatureTemplateKind;
  readonly sourceType: SignatureTemplateSourceType;
  readonly templateUrl: string;
  readonly textFields: readonly TextMappingDraft[];
  readonly signatureSlots: readonly SignatureSlotDraft[];
  readonly rosterText: string;
  readonly uniqueLinksEnabled: boolean;
  readonly pinEnabled: boolean;
  readonly tokenFactory?: (participant: SignatureParticipant, index: number) => string;
  readonly pinFactory?: (participant: SignatureParticipant, index: number) => string;
}

type GoogleResultSyncStatusTone = 'muted' | 'warning' | 'success';

export interface GoogleResultSyncStatusView {
  readonly label: string;
  readonly description: string;
  readonly tone: GoogleResultSyncStatusTone;
  readonly canOpenResultFile: boolean;
}

export interface SignatureParticipantStatusView {
  readonly participantId: string;
  readonly displayName: string;
  readonly status: SignatureParticipantStatus;
  readonly statusLabel: string;
  readonly submitted: number;
  readonly required: number;
  readonly missingSignatureLabels: readonly string[];
}

export interface SignatureRequestStatusView {
  readonly totalParticipants: number;
  readonly signedParticipants: number;
  readonly partialParticipants: number;
  readonly unsignedParticipants: number;
  readonly submittedSignatures: number;
  readonly requiredSignatures: number;
  readonly percentage: number;
  readonly participantRows: readonly SignatureParticipantStatusView[];
}

const TEMPLATE_KIND_OPTIONS: readonly TemplateKindOption[] = [
  {
    value: 'training-register',
    label: '여러 명이 한 문서에 서명',
    description: '교직원 연수, 협의회처럼 같은 문서에 여러 명이 차례로 서명하는 경우.',
  },
  {
    value: 'absence-form',
    label: '학생 + 학부모 함께 서명',
    description: '결석계처럼 한 양식에 학생 본인과 학부모 서명을 모두 받습니다.',
  },
  {
    value: 'notice-form',
    label: '학부모만 서명',
    description: '가정통신문 확인서 등 학부모 서명만 받는 경우.',
  },
  {
    value: 'general-register',
    label: '한 명만 서명',
    description: '동의서·확인서 등 한 사람의 서명만 받는 양식.',
  },
  {
    value: 'custom',
    label: '직접 구성',
    description: '필드와 서명 위치를 처음부터 사용자가 지정합니다.',
  },
];

const TARGET_TYPE_LABELS: Record<SignatureMappingTargetType, string> = {
  'docs-placeholder': 'Docs 치환자 ({{이름}} 형식)',
  'sheets-cell': '시트 셀',
  'sheets-named-range': 'Sheets 이름 지정 범위',
  'generated-table-column': '자동 생성 표 열',
};

const SIGNATURE_KIND_LABELS: Record<SignatureKind, string> = {
  recipient: '대상자 서명',
  student: '학생 서명',
  parent: '학부모 서명',
  guardian: '보호자 서명',
  teacher: '교사 서명',
};

const PARTICIPANT_STATUS_LABELS: Record<SignatureParticipantStatus, string> = {
  unsigned: '미서명',
  partiallySigned: '일부 서명',
  signed: '완료',
};

const REQUEST_STATUS_LABELS: Record<SignatureRequest['status'], string> = {
  draft: '초안',
  active: '진행 중',
  closed: '마감',
  archived: '보관됨',
};

const ROSTER_PLACEHOLDER =
  '예: 1 홍길동\n2 김민서\n김교사\n(번호가 있으면 학생, 없으면 교직원으로 처리됩니다)';

export function ToolSignatureRequest({ onBack, isFullscreen }: ToolSignatureRequestProps) {
  const load = useSignatureRequestStore((state) => state.load);
  const drafts = useSignatureRequestStore((state) => state.drafts);
  const isSaving = useSignatureRequestStore((state) => state.isSaving);
  const createDraft = useSignatureRequestStore((state) => state.createDraft);

  const [title, setTitle] = useState('');
  const [templateKind, setTemplateKind] = useState<SignatureTemplateKind>('training-register');
  const [sourceType, setSourceType] = useState<SignatureTemplateSourceType>('google-sheets');
  const [templateUrl, setTemplateUrl] = useState('');
  const [description, setDescription] = useState('');
  const [textFields, setTextFields] = useState<readonly TextMappingDraft[]>(() =>
    buildDefaultTextFields('training-register', 'google-sheets'),
  );
  const [signatureSlots, setSignatureSlots] = useState<readonly SignatureSlotDraft[]>(() =>
    buildDefaultSignatureSlots('training-register', 'google-sheets'),
  );
  const [rosterText, setRosterText] = useState('');
  const [uniqueLinksEnabled, setUniqueLinksEnabled] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedKind = useMemo(
    () => TEMPLATE_KIND_OPTIONS.find((option) => option.value === templateKind),
    [templateKind],
  );

  const participants = useMemo(
    () => parseSignatureRosterLines(rosterText, templateKind),
    [rosterText, templateKind],
  );

  const mapping = useMemo(
    () => buildSignatureTemplateMapping(textFields, signatureSlots),
    [textFields, signatureSlots],
  );

  const requiredSignatureKinds = useMemo(
    () => [...new Set(signatureSlots.filter((slot) => slot.required).map((slot) => slot.kind))],
    [signatureSlots],
  );

  const handleKindChange = (nextKind: SignatureTemplateKind) => {
    setTemplateKind(nextKind);
    setTextFields(buildDefaultTextFields(nextKind, sourceType));
    setSignatureSlots(buildDefaultSignatureSlots(nextKind, sourceType));
  };

  const handleSourceTypeChange = (nextType: SignatureTemplateSourceType) => {
    setSourceType(nextType);
    setTextFields((current) => retargetTextFields(current, nextType));
    setSignatureSlots((current) => retargetSignatureSlots(current, nextType));
  };

  const handleSave = async () => {
    setMessage(null);
    setError(null);
    if (!title.trim()) {
      setError('서명받기 제목을 먼저 입력해 주세요. 예: 3학년 결석계 서명 (5월)');
      return;
    }
    if (!templateUrl.trim()) {
      setError('Google 문서 또는 스프레드시트 URL을 먼저 입력해 주세요.');
      return;
    }
    if (participants.length === 0) {
      setError('서명 대상 명단을 한 명 이상 입력해 주세요.');
      return;
    }
    const draftInput = buildSignatureRequestDraftInput({
      title,
      description,
      templateKind,
      sourceType,
      templateUrl,
      textFields,
      signatureSlots,
      rosterText,
      uniqueLinksEnabled,
      pinEnabled,
    });
    await createDraft(draftInput);
    setMessage(
      '이 기기에 저장했습니다. 공개 링크와 QR 발급은 다음 버전에서 지원됩니다. 지금은 명단·매핑·1차 정책 검토에만 사용해 주세요.',
    );
  };

  const handleCopyMissingList = async (request: SignatureRequest) => {
    setMessage(null);
    setError(null);
    const text = buildMissingSignatureListText(request);
    if (!text) {
      setMessage('미서명 대상자가 없습니다.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setError(
        '이 브라우저에서는 클립보드 복사를 사용할 수 없습니다. 미서명 명단을 직접 선택해 복사해 주세요.',
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setMessage('미서명 명단을 복사했습니다. 카카오톡·문자·메일에 붙여 넣어 안내해 주세요.');
    } catch {
      setError('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
    }
  };

  return (
    <ToolLayout title="서명받기" emoji="✍️" onBack={onBack} isFullscreen={isFullscreen} disableZoom>
      <div className="h-full overflow-y-auto">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-sp-semibold text-sp-accent">누가 서명하나요?</p>
                  <h2 className="mt-1 text-xl font-sp-bold text-sp-text">
                    선생님이 만든 Google 양식 그대로, 이름·서명만 자동으로 받아 채웁니다
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                    학교마다 양식이 다르기 때문에 고정 서식 없이, 선생님이 쓰시는 Google
                    Docs/Sheets를 그대로 가져옵니다. 이름·서명이 들어갈 위치만 한 번 지정하면
                    됩니다.
                  </p>
                </div>
                <span className="rounded-full border border-sp-accent/30 bg-sp-accent/10 px-3 py-1 text-xs font-sp-semibold text-sp-accent">
                  이 기기에서 초안 저장
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {TEMPLATE_KIND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleKindChange(option.value)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      templateKind === option.value
                        ? 'border-sp-accent bg-sp-accent/10 text-sp-text shadow-sp-sm'
                        : 'border-sp-border bg-sp-surface/60 text-sp-muted hover:border-sp-accent/50 hover:text-sp-text'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-sp-bold">{option.label}</span>
                      {templateKind === option.value && (
                        <span className="material-symbols-outlined text-icon text-sp-accent">
                          check_circle
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">{option.description}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <SectionTitle
                step="1"
                title="Google 양식 등록"
                description="교사가 직접 만든 원본 문서 또는 스프레드시트 URL을 붙여 넣습니다."
              />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <LabeledInput label="요청 제목">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
                    placeholder="예: 3학년 결석계 서명 (5월)"
                  />
                </LabeledInput>
                <LabeledInput label="양식 종류">
                  <select
                    value={sourceType}
                    onChange={(event) =>
                      handleSourceTypeChange(event.target.value as SignatureTemplateSourceType)
                    }
                    className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
                  >
                    <option value="google-sheets">Google Sheets</option>
                    <option value="google-docs">Google Docs</option>
                  </select>
                </LabeledInput>
                <div className="md:col-span-2">
                  <LabeledInput label="Google Docs/Sheets URL">
                    <input
                      value={templateUrl}
                      onChange={(event) => setTemplateUrl(event.target.value)}
                      className="w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
                      placeholder="https://docs.google.com/..."
                    />
                  </LabeledInput>
                </div>
                <div className="md:col-span-2">
                  <LabeledInput label="교사용 메모">
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="min-h-20 w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
                      placeholder="예: 5월 결석계 취합, 학부모 서명 필수"
                    />
                  </LabeledInput>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <SectionTitle
                step="2"
                title="필드와 서명 이미지 위치 매핑"
                description="가장 정확도가 높은 방식으로 치환자, 셀, 이름 범위, 자동 생성 표 열을 지정합니다."
              />
              <MappingEditor
                title="텍스트 필드"
                rows={textFields}
                onChange={setTextFields}
                onAdd={() =>
                  setTextFields((current) => [
                    ...current,
                    createTextFieldDraft(
                      `text-custom-${current.length + 1}`,
                      'custom',
                      `사용자 필드 ${current.length + 1}`,
                      sourceType,
                    ),
                  ])
                }
              />
              <SignatureSlotEditor
                rows={signatureSlots}
                onChange={setSignatureSlots}
                onAdd={() =>
                  setSignatureSlots((current) => [
                    ...current,
                    createSignatureSlotDraft(
                      `slot-custom-${current.length + 1}`,
                      'recipient',
                      `서명 ${current.length + 1}`,
                      sourceType,
                    ),
                  ])
                }
              />
            </section>

            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <SectionTitle
                step="3"
                title="명단과 접근 방식"
                description="한 줄에 한 명씩 입력합니다. 번호가 있으면 학생으로, 번호가 없으면 교직원으로 처리합니다."
              />
              <textarea
                value={rosterText}
                onChange={(event) => setRosterText(event.target.value)}
                className="mt-4 min-h-36 w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
                placeholder={ROSTER_PLACEHOLDER}
              />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ToggleRow
                  title="개인별 고유 링크 생성"
                  description="한 명마다 다른 고유 링크를 만들어 다른 사람에게 잘못 공유될 위험을 줄입니다."
                  checked={uniqueLinksEnabled}
                  onChange={setUniqueLinksEnabled}
                />
                <ToggleRow
                  title="PIN 확인 사용"
                  description="PIN을 켜면 이 기기에만 저장된 초안 파일에 각자의 번호가 담깁니다. 서버에는 번호 자체가 아닌 암호화된 값만 올라갑니다."
                  checked={pinEnabled}
                  onChange={setPinEnabled}
                />
              </div>
              {uniqueLinksEnabled && pinEnabled && (
                <p className="mt-3 rounded-xl border border-sp-border bg-sp-surface/60 px-3 py-2 text-xs leading-relaxed text-sp-muted">
                  두 옵션을 모두 켜면 학생은 개인 링크(URL에 토큰 자동 포함)로 접속한 뒤 교사가 따로
                  안내한 PIN을 입력해야 합니다. PIN은 명단과 별도 채널로 전달하세요.
                </p>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <h3 className="text-base font-sp-bold text-sp-text">현재 구성 미리보기</h3>
              <div className="mt-4 space-y-3 text-sm">
                <PreviewRow label="양식" value={selectedKind?.label ?? '직접 설정'} />
                <PreviewRow label="출처" value={sourceType === 'google-docs' ? 'Docs' : 'Sheets'} />
                <PreviewRow label="대상자" value={`${participants.length}명`} />
                <PreviewRow label="필드" value={`${mapping.textFields.length}개`} />
                <PreviewRow label="서명칸" value={`${mapping.signatureSlots.length}개`} />
                <PreviewRow
                  label="필요 서명"
                  value={
                    requiredSignatureKinds.map((kind) => SIGNATURE_KIND_LABELS[kind]).join(', ') ||
                    '없음'
                  }
                />
              </div>
              <div className="mt-4 max-h-52 space-y-2 overflow-y-auto rounded-xl bg-sp-surface/60 p-3">
                {participants.length === 0 ? (
                  <p className="text-xs text-sp-muted">명단을 입력하면 대상자가 표시됩니다.</p>
                ) : (
                  participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-sp-card px-3 py-2"
                    >
                      <span className="text-sm font-sp-semibold text-sp-text">
                        {participant.displayName}
                      </span>
                      <span className="text-xs text-sp-muted">
                        {participant.requiredSignatureKinds
                          .map((kind) => SIGNATURE_KIND_LABELS[kind])
                          .join(' · ')}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {error && (
                <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
              {message && (
                <p className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {message}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="mt-4 w-full rounded-xl bg-sp-accent px-4 py-3 text-sm font-sp-bold text-white shadow-sp-sm transition-opacity disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '이 기기에 저장'}
              </button>
            </section>

            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <h3 className="text-base font-sp-bold text-sp-text">저장된 초안 · 제출 현황</h3>
              <div className="mt-4 space-y-2">
                {drafts.length === 0 ? (
                  <p className="rounded-xl bg-sp-surface/60 p-3 text-xs leading-relaxed text-sp-muted">
                    아직 저장된 서명받기 초안이 없습니다. 초안을 저장하면 미서명/일부 서명/완료
                    현황과 Google 결과 반영 상태가 표시됩니다.
                  </p>
                ) : (
                  drafts
                    .slice(0, 5)
                    .map((draft) => (
                      <SavedDraftCard
                        key={draft.request.id}
                        request={draft.request}
                        onCopyMissingList={() => void handleCopyMissingList(draft.request)}
                      />
                    ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-sp-border bg-sp-card p-5 shadow-sp-sm">
              <h3 className="text-base font-sp-bold text-sp-text">현재 버전 안내</h3>
              <p className="mt-2 text-xs leading-relaxed text-sp-muted">
                1차 버전은 전자 확인 기록으로 충분한 학교 업무를 대상으로 하며, 법적 전자서명 효력을
                보장하지 않습니다. Google Sheets 셀 안 이미지 삽입은 사설/단기 서명 URL로는
                안정적으로 보장하지 않고, Docs 이미지 삽입과 Sheets 텍스트·상태 반영부터 안전하게
                연결합니다.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill label="법적 전자서명 효력 보장 제외" />
                <StatusPill label="자동 리마인드 제외" />
                <StatusPill label="Sheets 셀 이미지 자동 삽입은 공개 URL 검증 시에만" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </ToolLayout>
  );
}

export function buildSignatureRequestDraftInput({
  title,
  description,
  templateKind,
  sourceType,
  templateUrl,
  textFields,
  signatureSlots,
  rosterText,
  uniqueLinksEnabled,
  pinEnabled,
  tokenFactory = defaultAccessToken,
  pinFactory = defaultPin,
}: BuildDraftInputParams): CreateSignatureRequestDraftInput {
  const participants = parseSignatureRosterLines(rosterText, templateKind);
  return {
    title,
    description: description?.trim() || undefined,
    templateKind,
    templateSource: {
      type: sourceType,
      url: templateUrl.trim(),
    },
    mapping: buildSignatureTemplateMapping(textFields, signatureSlots),
    participants,
    participantAccessSecrets: buildParticipantAccessSecrets(
      participants,
      uniqueLinksEnabled,
      pinEnabled,
      tokenFactory,
      pinFactory,
    ),
    access: {
      uniqueLinksEnabled,
      pinEnabled,
    },
    status: 'draft',
  };
}

export function parseSignatureRosterLines(
  rosterText: string,
  templateKind: SignatureTemplateKind,
): readonly SignatureParticipant[] {
  return rosterText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(\d+)[\s.,\-번]*(.+)$/);
      const studentNumber = match?.[1] ? Number(match[1]) : undefined;
      const displayName = (match?.[2] ?? line).trim();
      const role = inferParticipantRole(displayName, studentNumber);
      return {
        id: createParticipantId(index, displayName),
        displayName,
        role,
        studentNumber,
        requiredSignatureKinds: inferRequiredSignatureKinds(templateKind, role),
      };
    });
}

export function buildSignatureTemplateMapping(
  textFields: readonly TextMappingDraft[],
  signatureSlots: readonly SignatureSlotDraft[],
): SignatureTemplateMapping {
  return {
    textFields: textFields.map((field) => ({
      id: field.id,
      key: field.key,
      label: field.label,
      required: field.required,
      target: createMappingTarget(field),
    })),
    signatureSlots: signatureSlots.map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      label: slot.label,
      required: slot.required,
      target: createMappingTarget(slot),
    })),
  };
}

export function buildDefaultTextFields(
  templateKind: SignatureTemplateKind,
  sourceType: SignatureTemplateSourceType,
): readonly TextMappingDraft[] {
  const common = [
    createTextFieldDraft('field-name', 'recipientName', '이름', sourceType),
    createTextFieldDraft('field-submitted-at', 'submittedAt', '제출 시각', sourceType),
  ];
  if (templateKind === 'absence-form') {
    return [
      createTextFieldDraft('field-class', 'className', '학년반', sourceType),
      ...common,
      createTextFieldDraft('field-absence-period', 'absencePeriod', '결석 기간', sourceType),
      createTextFieldDraft('field-absence-reason', 'absenceReason', '결석 사유', sourceType),
    ];
  }
  if (templateKind === 'training-register' || templateKind === 'notice-form') {
    return [createTextFieldDraft('field-class', 'className', '소속/학급', sourceType), ...common];
  }
  return common;
}

export function buildDefaultSignatureSlots(
  templateKind: SignatureTemplateKind,
  sourceType: SignatureTemplateSourceType,
): readonly SignatureSlotDraft[] {
  if (templateKind === 'absence-form') {
    return [
      createSignatureSlotDraft('slot-student', 'student', '학생 서명', sourceType),
      createSignatureSlotDraft('slot-parent', 'parent', '학부모 서명', sourceType),
    ];
  }
  if (templateKind === 'notice-form') {
    return [createSignatureSlotDraft('slot-parent', 'parent', '학부모 서명', sourceType)];
  }
  return [createSignatureSlotDraft('slot-recipient', 'recipient', '서명', sourceType)];
}

export function buildSignatureRequestStatusView(
  request: SignatureRequest,
): SignatureRequestStatusView {
  const progress = getSignatureRequestProgress(request);
  const participantRows = request.participants.map((participant) => {
    const participantProgress = getParticipantSignatureStatus(participant, request.submissions);
    return {
      participantId: participant.id,
      displayName: participant.displayName,
      status: participantProgress.status,
      statusLabel: PARTICIPANT_STATUS_LABELS[participantProgress.status],
      submitted: participantProgress.submitted,
      required: participantProgress.required,
      missingSignatureLabels: getMissingSignatureLabels(request, participant),
    };
  });

  return {
    totalParticipants: request.participants.length,
    signedParticipants: progress.signedParticipants,
    partialParticipants: progress.partialParticipants,
    unsignedParticipants: progress.unsignedParticipants,
    submittedSignatures: progress.submittedSignatures,
    requiredSignatures: progress.requiredSignatures,
    percentage: progress.percentage,
    participantRows,
  };
}

export function buildMissingSignatureListText(request: SignatureRequest): string {
  const statusView = buildSignatureRequestStatusView(request);
  const missingRows = statusView.participantRows.filter((row) => row.status !== 'signed');
  if (missingRows.length === 0) return '';

  return [
    `${request.title} 미서명 명단`,
    ...missingRows.map((row) => {
      const missing = row.missingSignatureLabels.join(', ') || '확인 필요';
      return `- ${row.displayName}: ${missing}`;
    }),
  ].join('\n');
}

export function getGoogleResultSyncStatusView(
  request: SignatureRequest,
): GoogleResultSyncStatusView {
  if (request.status === 'draft') {
    return {
      label: '초안 준비 중',
      description: '공개 링크와 Google 결과 파일을 만들기 전입니다.',
      tone: 'muted',
      canOpenResultFile: false,
    };
  }

  if (!request.resultFileUrl) {
    return {
      label: '결과 파일 미연결',
      description: '원본 Google 양식 복사본을 만든 뒤 텍스트·상태·서명 이미지를 반영합니다.',
      tone: 'warning',
      canOpenResultFile: false,
    };
  }

  const progress = getSignatureRequestProgress(request);
  if (progress.submittedSignatures === 0) {
    return {
      label: '결과 파일 생성됨',
      description: '제출된 서명이 생기면 이름, 제출 시각, 상태부터 동기화합니다.',
      tone: 'muted',
      canOpenResultFile: true,
    };
  }

  if (request.status === 'closed' || progress.percentage === 100) {
    return {
      label: '결과 반영 완료',
      description: '필요 서명 기준으로 결과 파일에 반영할 제출 기록이 모두 모였습니다.',
      tone: 'success',
      canOpenResultFile: true,
    };
  }

  return {
    label: '부분 반영 필요',
    description: '일부 제출 기록만 모였습니다. 미서명 명단을 복사해 수동 안내할 수 있습니다.',
    tone: 'warning',
    canOpenResultFile: true,
  };
}

function buildParticipantAccessSecrets(
  participants: readonly SignatureParticipant[],
  uniqueLinksEnabled: boolean,
  pinEnabled: boolean,
  tokenFactory: (participant: SignatureParticipant, index: number) => string,
  pinFactory: (participant: SignatureParticipant, index: number) => string,
): readonly SignatureParticipantLocalAccessSecret[] {
  if (!uniqueLinksEnabled && !pinEnabled) return [];
  return participants.map((participant, index) => ({
    participantId: participant.id,
    uniqueLinkToken: uniqueLinksEnabled ? tokenFactory(participant, index) : undefined,
    pin: pinEnabled ? pinFactory(participant, index) : undefined,
  }));
}

function createTextFieldDraft(
  id: string,
  key: SignatureTextFieldKey,
  label: string,
  sourceType: SignatureTemplateSourceType,
): TextMappingDraft {
  return {
    id,
    key,
    label,
    targetType: defaultTargetType(sourceType),
    targetValue: defaultTargetValue(label, sourceType),
    required: true,
  };
}

function createSignatureSlotDraft(
  id: string,
  kind: SignatureKind,
  label: string,
  sourceType: SignatureTemplateSourceType,
): SignatureSlotDraft {
  return {
    id,
    kind,
    label,
    targetType: defaultTargetType(sourceType),
    targetValue: defaultTargetValue(label, sourceType),
    required: true,
  };
}

function retargetTextFields(
  fields: readonly TextMappingDraft[],
  sourceType: SignatureTemplateSourceType,
): readonly TextMappingDraft[] {
  return fields.map((field) => ({
    ...field,
    targetType: defaultTargetType(sourceType),
    targetValue: defaultTargetValue(field.label, sourceType),
    sheetName: undefined,
  }));
}

function retargetSignatureSlots(
  slots: readonly SignatureSlotDraft[],
  sourceType: SignatureTemplateSourceType,
): readonly SignatureSlotDraft[] {
  return slots.map((slot) => ({
    ...slot,
    targetType: defaultTargetType(sourceType),
    targetValue: defaultTargetValue(slot.label, sourceType),
    sheetName: undefined,
  }));
}

function defaultTargetType(sourceType: SignatureTemplateSourceType): SignatureMappingTargetType {
  return sourceType === 'google-docs' ? 'docs-placeholder' : 'generated-table-column';
}

function defaultTargetValue(label: string, sourceType: SignatureTemplateSourceType): string {
  return sourceType === 'google-docs' ? `{{${label}}}` : label;
}

function createMappingTarget(draft: TextMappingDraft | SignatureSlotDraft): SignatureMappingTarget {
  return {
    type: draft.targetType,
    value: draft.targetValue,
    sheetName: draft.sheetName,
  };
}

function inferParticipantRole(
  displayName: string,
  studentNumber: number | undefined,
): SignatureParticipantRole {
  if (studentNumber !== undefined) return 'student';
  if (displayName.includes('교사') || displayName.includes('선생님')) return 'teacher';
  return 'staff';
}

function inferRequiredSignatureKinds(
  templateKind: SignatureTemplateKind,
  role: SignatureParticipantRole,
): readonly SignatureKind[] {
  if (templateKind === 'absence-form') return ['student', 'parent'];
  if (templateKind === 'notice-form') return ['parent'];
  if (role === 'teacher') return ['teacher'];
  return ['recipient'];
}

function getMissingSignatureLabels(
  request: SignatureRequest,
  participant: SignatureParticipant,
): readonly string[] {
  const submittedKinds = new Set(
    request.submissions
      .filter((submission) => submission.participantId === participant.id)
      .map((submission) => submission.signatureKind),
  );
  return [...new Set(participant.requiredSignatureKinds)]
    .filter((kind) => !submittedKinds.has(kind))
    .map((kind) => SIGNATURE_KIND_LABELS[kind]);
}

function createParticipantId(index: number, displayName: string): string {
  const safeName = displayName.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
  return `participant-${index + 1}-${safeName || 'unknown'}`;
}

function defaultAccessToken(_participant: SignatureParticipant, index: number): string {
  return `sig-${index + 1}-${createRandomSegment()}`;
}

function defaultPin(_participant: SignatureParticipant, index: number): string {
  return String(100000 + ((index + Math.floor(Math.random() * 900000)) % 900000));
}

function createRandomSegment(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

function SectionTitle({
  step,
  title,
  description,
}: {
  readonly step: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sp-accent text-sm font-sp-bold text-white">
        {step}
      </span>
      <div>
        <h3 className="text-base font-sp-bold text-sp-text">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-sp-muted">{description}</p>
      </div>
    </div>
  );
}

function LabeledInput({
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

function MappingEditor({
  title,
  rows,
  onChange,
  onAdd,
}: {
  readonly title: string;
  readonly rows: readonly TextMappingDraft[];
  readonly onChange: (rows: readonly TextMappingDraft[]) => void;
  readonly onAdd: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-sp-border bg-sp-surface/50 p-4">
      <EditorHeader title={title} onAdd={onAdd} />
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-xl bg-sp-card p-3 md:grid-cols-3">
            <input
              value={row.label}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-text outline-none focus:border-sp-accent"
              aria-label={`${row.label} 라벨`}
            />
            <TargetTypeSelect
              value={row.targetType}
              onChange={(targetType) =>
                onChange(rows.map((item) => (item.id === row.id ? { ...item, targetType } : item)))
              }
            />
            <input
              value={row.targetValue}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, targetValue: event.target.value } : item,
                  ),
                )
              }
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-text outline-none focus:border-sp-accent"
              aria-label={`${row.label} 위치`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SignatureSlotEditor({
  rows,
  onChange,
  onAdd,
}: {
  readonly rows: readonly SignatureSlotDraft[];
  readonly onChange: (rows: readonly SignatureSlotDraft[]) => void;
  readonly onAdd: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-sp-border bg-sp-surface/50 p-4">
      <EditorHeader title="서명 이미지 슬롯" onAdd={onAdd} />
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-xl bg-sp-card p-3 md:grid-cols-4">
            <select
              value={row.kind}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, kind: event.target.value as SignatureKind }
                      : item,
                  ),
                )
              }
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-text outline-none focus:border-sp-accent"
            >
              {Object.entries(SIGNATURE_KIND_LABELS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={row.label}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-text outline-none focus:border-sp-accent"
              aria-label={`${row.label} 라벨`}
            />
            <TargetTypeSelect
              value={row.targetType}
              onChange={(targetType) =>
                onChange(rows.map((item) => (item.id === row.id ? { ...item, targetType } : item)))
              }
            />
            <input
              value={row.targetValue}
              onChange={(event) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id ? { ...item, targetValue: event.target.value } : item,
                  ),
                )
              }
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-text outline-none focus:border-sp-accent"
              aria-label={`${row.label} 위치`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorHeader({ title, onAdd }: { readonly title: string; readonly onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-sp-bold text-sp-text">{title}</h4>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg border border-sp-border px-3 py-1 text-xs font-sp-semibold text-sp-muted hover:border-sp-accent hover:text-sp-accent"
      >
        추가
      </button>
    </div>
  );
}

function TargetTypeSelect({
  value,
  onChange,
}: {
  readonly value: SignatureMappingTargetType;
  readonly onChange: (value: SignatureMappingTargetType) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as SignatureMappingTargetType)}
      className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-text outline-none focus:border-sp-accent"
    >
      {Object.entries(TARGET_TYPE_LABELS).map(([targetType, label]) => (
        <option key={targetType} value={targetType}>
          {label}
        </option>
      ))}
    </select>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-sp-border bg-sp-surface/60 p-3 text-left transition-colors hover:border-sp-accent/50"
    >
      <span>
        <span className="block text-sm font-sp-bold text-sp-text">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-sp-muted">{description}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-sp-accent' : 'bg-sp-border'
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-sp-card transition-all ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </span>
    </button>
  );
}

function PreviewRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sp-border/70 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-sp-muted">{label}</span>
      <span className="text-right text-xs font-sp-bold text-sp-text">{value}</span>
    </div>
  );
}

function SavedDraftCard({
  request,
  onCopyMissingList,
}: {
  readonly request: SignatureRequest;
  readonly onCopyMissingList: () => void;
}) {
  const statusView = buildSignatureRequestStatusView(request);
  const syncStatus = getGoogleResultSyncStatusView(request);
  const visibleRows = statusView.participantRows.slice(0, 4);
  const remainingRows = statusView.participantRows.length - visibleRows.length;

  return (
    <div className="rounded-xl bg-sp-surface/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-sp-bold text-sp-text">{request.title}</p>
          <p className="mt-1 text-xs text-sp-muted">
            {statusView.totalParticipants}명 · {statusView.submittedSignatures}/
            {statusView.requiredSignatures}개 서명 제출
          </p>
        </div>
        <StatusPill label={REQUEST_STATUS_LABELS[request.status]} />
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-sp-border/70">
        <div
          className="h-full rounded-full bg-sp-accent"
          style={{ width: `${statusView.percentage}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <StatusCount label="미서명" value={statusView.unsignedParticipants} />
        <StatusCount label="일부" value={statusView.partialParticipants} />
        <StatusCount label="완료" value={statusView.signedParticipants} />
      </div>

      <div className="mt-3 space-y-2">
        {visibleRows.map((row) => (
          <div
            key={row.participantId}
            className="flex items-center justify-between gap-2 rounded-lg bg-sp-card px-3 py-2"
          >
            <span className="min-w-0 text-xs font-sp-semibold text-sp-text">{row.displayName}</span>
            <span className="text-right text-xs text-sp-muted">
              {row.statusLabel} · {row.submitted}/{row.required}
            </span>
          </div>
        ))}
        {remainingRows > 0 && (
          <p className="text-xs text-sp-muted">
            외 {remainingRows}명은 미서명 명단 복사로 확인할 수 있습니다.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-sp-border bg-sp-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-sp-bold text-sp-text">Google 결과 동기화</p>
            <p className="mt-1 text-xs leading-relaxed text-sp-muted">{syncStatus.description}</p>
          </div>
          <StatusPill label={syncStatus.label} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-sp-muted">
          Sheets 셀 이미지 자동 삽입은 공개 URL 검증 시에만 안전하게 연결합니다.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCopyMissingList}
          className="rounded-lg border border-sp-border px-3 py-2 text-xs font-sp-semibold text-sp-muted hover:border-sp-accent hover:text-sp-accent"
        >
          미서명 명단 복사
        </button>
        {syncStatus.canOpenResultFile && request.resultFileUrl ? (
          <a
            href={request.resultFileUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-sp-border px-3 py-2 text-center text-xs font-sp-semibold text-sp-muted hover:border-sp-accent hover:text-sp-accent"
          >
            결과 파일 열기
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="공개 링크가 발급되고 첫 서명이 접수되면 결과 파일이 만들어집니다."
            className="rounded-lg border border-sp-border px-3 py-2 text-xs font-sp-semibold text-sp-muted opacity-60"
          >
            결과 파일 준비 전
          </button>
        )}
      </div>
    </div>
  );
}

function StatusCount({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg bg-sp-card px-2 py-2">
      <p className="font-sp-bold text-sp-text">{value}</p>
      <p className="mt-1 text-sp-muted">{label}</p>
    </div>
  );
}

function StatusPill({ label }: { readonly label: string }) {
  return (
    <span className="rounded-full border border-sp-border bg-sp-surface px-3 py-1 text-xs font-sp-semibold text-sp-muted">
      {label}
    </span>
  );
}
