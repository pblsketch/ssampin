/**
 * 압핀(www.sgpap.com) 포트 구현.
 *
 * sgpap.com 은 CORS 미지원이라 렌더러 직접 fetch 가 불가능하다.
 * - Electron: 메인('appin:fetch' IPC, safeFetch 경유)이 바이트만 대신 받아 넘긴다.
 * - 브라우저 dev: Vite '/appin-api' 프록시.
 * 인코딩은 여기서 처리한다 — 정적 파일(h/g/t)은 EUC-KR, php 응답(getupdir/dnele)은 UTF-8.
 * 격자 파싱·시간표 변환은 domain/rules/appinRules 가 담당한다.
 */
import type { IAppinPort } from '@domain/ports/IAppinPort';
import type { AppinSchool, AppinElements, AppinFileMeta } from '@domain/entities/AppinTimetable';
import { AppinError } from '@domain/entities/AppinTimetable';

/** 통신 위임 인터페이스 (테스트에서 픽스처로 대체) */
export interface AppinTransport {
  fetchBytes(path: string, init?: { method?: 'GET' | 'POST'; body?: string }): Promise<ArrayBuffer>;
}

function createDefaultTransport(): AppinTransport {
  return {
    async fetchBytes(path, init): Promise<ArrayBuffer> {
      const ipc = typeof window !== 'undefined' ? window.electronAPI?.appin : undefined;
      if (ipc) {
        const r = await ipc.fetch({ path, method: init?.method, body: init?.body });
        if (r.status === 'error') throw new AppinError('NETWORK_ERROR', r.message);
        return r.body;
      }
      // 브라우저 dev: vite 프록시
      const res = await fetch(
        `/appin-api${path}`,
        init?.method === 'POST'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
              body: init.body ?? '',
            }
          : undefined,
      );
      if (!res.ok) throw new AppinError('NETWORK_ERROR', `HTTP ${res.status}`);
      return res.arrayBuffer();
    },
  };
}

/** Apache 디렉터리 인덱스에서 파일명·수정일·크기 추출 */
const DIR_ROW_RE =
  /<a href="([^"?/][^"]*\.[a-zA-Z0-9]+)">[^<]*<\/a>\s*<\/td>\s*<td[^>]*>\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})?\s*<\/td>\s*<td[^>]*>\s*([\d.kKMGB-]+)/g;

export class AppinApiClient implements IAppinPort {
  private readonly eucKr = new TextDecoder('euc-kr');
  private readonly utf8 = new TextDecoder('utf-8');

  constructor(private readonly transport: AppinTransport = createDefaultTransport()) {}

  private async postForm(path: string, params: Record<string, string>): Promise<string> {
    // URLSearchParams 는 UTF-8 퍼센트 인코딩 — getupdir 는 UTF-8 이어야 매칭된다.
    const body = new URLSearchParams(params).toString();
    const buf = await this.transport.fetchBytes(path, { method: 'POST', body });
    return this.utf8.decode(new Uint8Array(buf));
  }

  async resolveSchool(city: string, name: string): Promise<AppinSchool | null> {
    const trimmedCity = city.trim();
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const raw = await this.postForm('/tm/getupdir.php', { hgsj: trimmedCity, hgm: trimmedName });
    // 미매칭: `1&nothing`, 매칭: `1&<webdir>&<num>&<yyyymmdd>&1`
    if (/nothing/i.test(raw)) return null;
    const parts = raw.split('&');
    const webdir = parts[1]?.trim();
    if (!webdir) return null;
    return { webdir, name: trimmedName, city: trimmedCity, date: parts[3]?.trim() || undefined };
  }

  async getElements(webdir: string): Promise<AppinElements> {
    const raw = await this.postForm('/tm/dnele.php', { webdir });
    // `<status>&<학급>&<교사번호>&<특별실>&<버전>` (교차검증 확정)
    const f = raw.split('&');
    const csv = (s?: string): string[] => (s ? s.split(',').filter((x) => x !== '') : []);
    return { elements: csv(f[1]), teacherNumbers: csv(f[2]), movementRooms: csv(f[3]) };
  }

  async getWeekFileText(webdir: string, filename: string): Promise<string> {
    const path = `/tm/${encodeURIComponent(webdir)}/${encodeURIComponent(filename)}`;
    const buf = await this.transport.fetchBytes(path);
    return this.eucKr.decode(new Uint8Array(buf));
  }

  async listFiles(webdir: string): Promise<readonly AppinFileMeta[]> {
    const buf = await this.transport.fetchBytes(`/tm/${encodeURIComponent(webdir)}/`);
    const html = this.utf8.decode(new Uint8Array(buf));
    const out: AppinFileMeta[] = [];
    DIR_ROW_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DIR_ROW_RE.exec(html)) !== null) {
      out.push({
        name: m[1]!,
        modified: m[2] ? `${m[2].replace(' ', 'T')}:00` : null,
        size: m[3]!,
      });
    }
    return out;
  }
}
