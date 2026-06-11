/**
 * 서명받기 Supabase Edge Function 클라이언트
 *
 * RLS가 모든 테이블 직접 접근을 차단하므로,
 * 모든 데이터 조작은 anon key로 Edge Function을 경유한다.
 * (AssignmentSupabaseClient 패턴 동일)
 *
 * 엔드포인트 계약(T4 Edge Functions):
 *  - sig-publish        {ownerTeacherId,title,headerText?,columns,members[],trustMode,accessCode?}
 *                       → {sessionId,adminKey,shortLinkCode}
 *  - sig-get-public     {sessionId|shortLinkCode}
 *                       → {title,headerText,columns,members:[{memberRef,name,affiliation}],trustMode}
 *  - sig-submit         {sessionId,memberRef,signerName,rowData,signaturePngBase64,accessCode?}
 *                       → {entryId,signaturePublicUrl,signedAt}
 *  - sig-status         {sessionId,adminKey} → SignatureStatusRow[]
 *  - sig-delete-session {sessionId,adminKey} → {ok}
 */
import type { ColumnDef } from '@domain/entities/SignatureRoster';
import type { SignatureSessionPublic, TrustMode } from '@domain/entities/SignatureSession';
import type { SignatureStatusRow } from '@domain/entities/SignatureEntry';
import type {
  ISignaturePort,
  CreateSignatureSessionInput,
  CreateSignatureSessionResult,
  PublishSignatureSessionResult,
  SubmitSignatureInput,
  SubmitSignatureResult,
} from '@domain/ports/ISignaturePort';

/** Edge Function 에러 응답 */
interface ErrorResponse {
  error: string;
}

/**
 * Edge Function HTTP 에러 — status code를 보존한다.
 * 공개 페이지가 409(중복)·403(접근코드/마감) 등을 분기해 한국어 가드를 띄우기 위함.
 */
export class SignatureHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SignatureHttpError';
    this.status = status;
  }
}

/** sig-publish 응답 */
interface SigPublishResponse {
  sessionId: string;
  adminKey: string;
  shortLinkCode: string;
}

/** sig-get-public 응답 (members는 memberRef 키 사용) */
interface SigGetPublicResponse {
  /** 단축 링크/UUID 어느 쪽으로 조회하든 서버가 실제 세션 UUID를 돌려준다 */
  sessionId: string;
  title: string;
  headerText?: string | null;
  columns: ColumnDef[];
  members: Array<{
    memberRef: string;
    name: string;
    affiliation?: string;
  }>;
  trustMode: TrustMode;
}

/**
 * 공개 페이지 조회 결과 — 도메인 SignatureSessionPublic + 실제 세션 UUID.
 *
 * 단축 링크 코드로 진입했더라도 제출(submitSignature)은 UUID sessionId가 필요하므로
 * 서버가 회신한 sessionId를 함께 노출한다.
 */
export interface PublicSessionResolved extends SignatureSessionPublic {
  readonly sessionId: string;
}

/** `/sign/{ref}`의 ref가 UUID인지 단축코드인지 판별 */
const SIG_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIG_SHORT_CODE_PATTERN = /^[A-Za-z0-9]{6,12}$/;

/** sig-submit 응답 */
interface SigSubmitResponse {
  entryId: string;
  signaturePublicUrl: string;
  signedAt: string;
}

/** sig-status 응답 행 (Edge Function이 camelCase로 매핑) */
interface SigStatusRow {
  memberRef: string;
  name: string;
  affiliation?: string;
  signed: boolean;
  signedAt?: string;
  /** 서명 완료자만 — 시트/Excel 서명 셀(=IMAGE / addImage) 주입 대상 */
  signaturePublicUrl?: string;
}

/** sig-status 전체 응답 (members 배열 래핑 + 집계 메타) */
interface SigStatusResponse {
  sessionId: string;
  status: string;
  totalCount: number;
  signedCount: number;
  members: SigStatusRow[];
}

/**
 * draft 세션 보관용 메모리 캐시.
 *
 * ISignaturePort.createSession은 draft를 만들고,
 * publishSession(sessionId)은 sessionId만 받는다.
 * 하지만 sig-publish Edge Function은 title/columns/members 전체를 받으므로,
 * createSession 시점의 입력을 임시 보관했다가 publish 시점에 전달한다.
 * (Edge Function이 draft 영속화를 하지 않는 MVP 계약 대응)
 */
interface DraftSession {
  readonly input: CreateSignatureSessionInput;
}

export class SignatureSupabaseClient implements ISignaturePort {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  /** publish 전 draft 입력 캐시 (sessionId → 입력) */
  private readonly drafts = new Map<string, DraftSession>();

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  /**
   * Edge Function 호출 헬퍼 (anon key 인증)
   */
  private async invoke<T>(functionName: string, body: unknown): Promise<T> {
    if (!this.baseUrl || !this.anonKey) {
      throw new Error('Supabase is not configured');
    }
    const url = `${this.baseUrl}/functions/v1/${functionName}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as ErrorResponse;
      throw new SignatureHttpError(err.error ?? `Edge Function error: ${res.status}`, res.status);
    }

    return res.json() as Promise<T>;
  }

  /**
   * 세션 생성 (draft 상태).
   *
   * 실제 영속화는 publish 시점의 sig-publish가 담당하므로,
   * 여기서는 로컬 임시 sessionId를 발급하고 입력을 캐시한다.
   */
  async createSession(input: CreateSignatureSessionInput): Promise<CreateSignatureSessionResult> {
    const draftId = `draft_${crypto.randomUUID()}`;
    this.drafts.set(draftId, { input });
    return { sessionId: draftId };
  }

  /**
   * 세션 공개 — sig-publish 호출, 관리 키/단축 링크 발급.
   * createSession에서 캐시한 입력을 계약 형태로 전달한다.
   */
  async publishSession(sessionId: string): Promise<PublishSignatureSessionResult> {
    const draft = this.drafts.get(sessionId);
    if (!draft) {
      throw new Error(`Draft session not found: ${sessionId}`);
    }
    const { input } = draft;

    const res = await this.invoke<SigPublishResponse>('sig-publish', {
      ownerTeacherId: input.ownerTeacherId,
      title: input.title,
      headerText: input.headerText,
      columns: input.columns,
      members: input.rosterSnapshot.map((m) => ({
        memberRef: m.id,
        name: m.name,
        affiliation: m.affiliation,
        fields: m.fields,
      })),
      trustMode: input.trustMode,
      // accessCodeEnabled=true면 서버가 필수 검증 — 평문은 전송 즉시 해시로만 저장된다.
      accessCode: input.accessCode,
    });

    // 실제 서버 sessionId로 캐시 키 갱신 (이후 status/delete에서 동일 인스턴스 사용 시 메모리 누수 방지)
    this.drafts.delete(sessionId);

    return {
      sessionId: res.sessionId,
      adminKey: res.adminKey,
      shortLinkCode: res.shortLinkCode,
    };
  }

  /**
   * 공개 페이지용 세션 조회 — sig-get-public 호출.
   * 계약의 members[memberRef] → 도메인 SignaturePublicMember[id] 매핑.
   */
  async getPublicSession(sessionId: string): Promise<SignatureSessionPublic> {
    const res = await this.invoke<SigGetPublicResponse>('sig-get-public', {
      sessionId,
    });
    return mapPublicResponse(res);
  }

  /**
   * 공개 페이지(`/sign/{ref}`) 전용 조회 — ref가 UUID면 sessionId, 단축코드면 shortLinkCode로 호출.
   * 익명 참석자 진입점이며, 제출에 필요한 실제 세션 UUID(sessionId)를 함께 반환한다.
   */
  async getPublicSessionByRef(ref: string): Promise<PublicSessionResolved> {
    const trimmed = ref.trim();
    const body = SIG_UUID_PATTERN.test(trimmed)
      ? { sessionId: trimmed }
      : SIG_SHORT_CODE_PATTERN.test(trimmed)
        ? { shortLinkCode: trimmed }
        : null;
    if (!body) {
      throw new SignatureHttpError('잘못된 링크입니다', 400);
    }
    const res = await this.invoke<SigGetPublicResponse>('sig-get-public', body);
    return {
      sessionId: res.sessionId,
      ...mapPublicResponse(res),
    };
  }

  /**
   * 공개 제출 — sig-submit 호출.
   * raw 서명은 png base64만 전송한다 (data URL prefix 제거).
   */
  async submitSignature(input: SubmitSignatureInput): Promise<SubmitSignatureResult> {
    const res = await this.invoke<SigSubmitResponse>('sig-submit', {
      sessionId: input.sessionId,
      memberRef: input.memberRef,
      signerName: input.signerName,
      rowData: input.rowData,
      signaturePngBase64: stripDataUrlPrefix(input.signatureImage),
      accessCode: input.accessCode,
    });

    return {
      entryId: res.entryId,
      signaturePublicUrl: res.signaturePublicUrl,
      signedAt: res.signedAt,
    };
  }

  /**
   * 교사 현황 보드 조회 — sig-status 호출 (관리 키 검증).
   */
  async getStatus(sessionId: string, adminKey: string): Promise<readonly SignatureStatusRow[]> {
    const res = await this.invoke<SigStatusResponse>('sig-status', {
      sessionId,
      adminKey,
    });
    return (res.members ?? []).map(mapStatusRow);
  }

  /**
   * 세션 삭제 — sig-delete-session 호출 (관리 키 검증).
   */
  async deleteSession(sessionId: string, adminKey: string): Promise<void> {
    await this.invoke<{ ok: boolean }>('sig-delete-session', {
      sessionId,
      adminKey,
    });
  }

  /**
   * 현황 폴링 (MVP: 10초 간격)
   * AssignmentSupabaseClient.startPolling 패턴 동일.
   * @returns stopPolling 함수
   */
  startStatusPolling(
    sessionId: string,
    adminKey: string,
    onUpdate: (rows: readonly SignatureStatusRow[]) => void,
    intervalMs = 10_000,
  ): () => void {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const rows = await this.getStatus(sessionId, adminKey);
        onUpdate(rows);
      } catch {
        // 폴링 에러는 무시 (다음 폴링에서 재시도)
      }
    };

    // 즉시 1회 호출 후 반복
    void poll();
    timerId = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };
  }
}

/**
 * sig-get-public 응답 → 도메인 SignatureSessionPublic 매핑.
 * (members[memberRef] → SignaturePublicMember[id], null headerText → undefined)
 */
function mapPublicResponse(res: SigGetPublicResponse): SignatureSessionPublic {
  return {
    title: res.title,
    headerText: res.headerText ?? undefined,
    columns: res.columns,
    members: res.members.map((m) => ({
      id: m.memberRef,
      name: m.name,
      affiliation: m.affiliation,
    })),
    trustMode: res.trustMode,
  };
}

/**
 * sig-status 응답 행 → 도메인 SignatureStatusRow 매핑.
 * signaturePublicUrl은 서명 완료자만 채워지며(빈 값이면 undefined), 시트/Excel 서명 셀 주입에 쓰인다.
 */
function mapStatusRow(row: SigStatusRow): SignatureStatusRow {
  return {
    memberRef: row.memberRef,
    name: row.name,
    affiliation: row.affiliation,
    signed: row.signed,
    signedAt: row.signedAt,
    signaturePublicUrl: row.signaturePublicUrl || undefined,
  };
}

/**
 * data URL prefix(`data:image/png;base64,`) 제거 → 순수 base64 반환.
 * 이미 prefix가 없으면 그대로 반환.
 */
function stripDataUrlPrefix(image: string): string {
  const commaIdx = image.indexOf('base64,');
  return commaIdx >= 0 ? image.slice(commaIdx + 'base64,'.length) : image;
}
