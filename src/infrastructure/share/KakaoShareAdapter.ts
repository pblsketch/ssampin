import { SITE_URL } from '@config/siteUrl';

/**
 * 카카오톡 공유 SDK 래퍼.
 * Electron 환경에서는 사용 불가 — 호출 전 isAvailable()로 체크할 것.
 */
export class KakaoShareAdapter {
  private initialized = false;

  /** Electron이 아니고 Kakao SDK가 로드된 환경인지 확인 */
  isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.electronAPI) return false; // Electron에서는 카카오 SDK 미지원
    return !!window.Kakao;
  }

  /** SDK 초기화 (1회) */
  init(): void {
    const key = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    if (!key || this.initialized) return;
    if (this.isAvailable() && !window.Kakao!.isInitialized()) {
      window.Kakao!.init(key);
      this.initialized = true;
    }
  }

  /** 카카오톡 피드 메시지 공유. 성공 시 true 반환. */
  share(): boolean {
    if (!this.isAvailable()) return false;
    this.init();
    if (!window.Kakao?.Share) return false;

    try {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: '쌤핀 — 선생님을 위한 무료 대시보드',
          description: '시간표, 자리배치, 출결, 수업 도구를 하나로. 무료, 광고 없음.',
          imageUrl: `${SITE_URL}/images/share-thumb.png`,
          link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL },
        },
        buttons: [
          {
            title: '다운로드하기',
            link: { mobileWebUrl: SITE_URL, webUrl: SITE_URL },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** 싱글턴 인스턴스 */
export const kakaoShare = new KakaoShareAdapter();
