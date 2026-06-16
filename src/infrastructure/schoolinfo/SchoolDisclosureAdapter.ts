/**
 * ISchoolDisclosurePort 구현 — 실제 통신은 Electron 메인(safeFetch + openApi.do)에 IPC 위임.
 * 데스크톱 앱이 아니면(브라우저) 명확한 안내 에러.
 *
 * 인증키(SCHOOLINFO_API_KEY)는 빌드 환경변수(VITE_SCHOOLINFO_API_KEY)로 주입한다 — 코드 평문 금지.
 */
import type { ISchoolDisclosurePort } from '@domain/ports/ISchoolDisclosurePort';

/** 빌드 env 주입(.env: VITE_SCHOOLINFO_API_KEY). 미설정 시 빈 문자열 → 호출 시 안내 에러. */
const SCHOOLINFO_API_KEY =
  (import.meta.env as Record<string, string | undefined>).VITE_SCHOOLINFO_API_KEY ?? '';

function api() {
  const e = typeof window !== 'undefined' ? window.electronAPI?.schoolinfoDisclosure : undefined;
  if (!e) {
    throw new Error('이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.');
  }
  return e;
}

export class SchoolDisclosureAdapter implements ISchoolDisclosurePort {
  async getAreaDisclosure(params: {
    apiType: string;
    schulKndCode: string;
    sidoCode: string;
    sggCode: string;
    pbanYr: string;
  }): Promise<readonly Record<string, unknown>[]> {
    if (!SCHOOLINFO_API_KEY) {
      throw new Error('학교알리미 인증키가 설정되지 않았어요. (앱 빌드 설정 필요)');
    }
    const r = await api().getAreaDisclosure({ ...params, apiKey: SCHOOLINFO_API_KEY });
    if (r.status === 'error') throw new Error(r.message);
    return r.list;
  }
}
