import { ShortLinkClient, validateCustomCode } from './ShortLinkClient';

/** 라이브 세션 숏코드 (4시간 만료) */
export class LiveSessionClient {
  private readonly shortLinkClient: ShortLinkClient;

  constructor() {
    this.shortLinkClient = new ShortLinkClient();
  }

  /**
   * 터널 URL을 등록하고 숏코드를 반환한다.
   * 실패해도 null을 반환 (터널 자체 기능에 영향 없음).
   */
  async registerSession(tunnelUrl: string): Promise<{ shortUrl: string; code: string } | null> {
    try {
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      const shortUrl = await this.shortLinkClient.createShortLink(tunnelUrl, undefined, expiresAt);
      const parts = shortUrl.split('/s/');
      const code = parts[1] ?? '';
      return { shortUrl, code };
    } catch {
      return null;
    }
  }

  /**
   * 커스텀 코드로 숏코드를 변경한다.
   * 실패 시 에러 메시지를 throw한다.
   */
  async setCustomCode(tunnelUrl: string, customCode: string): Promise<{ shortUrl: string; code: string }> {
    const validation = validateCustomCode(customCode);
    if (!validation.valid) {
      throw new Error(validation.error ?? '유효하지 않은 코드입니다');
    }
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const shortUrl = await this.shortLinkClient.createShortLink(tunnelUrl, customCode, expiresAt);
    return { shortUrl, code: customCode };
  }
}
