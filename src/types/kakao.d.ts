/** 카카오 JavaScript SDK 타입 (최소한의 선언) */
interface KakaoShareLink {
  mobileWebUrl?: string;
  webUrl?: string;
}

interface KakaoShareContent {
  title: string;
  description?: string;
  imageUrl?: string;
  link: KakaoShareLink;
}

interface KakaoShareButton {
  title: string;
  link: KakaoShareLink;
}

interface KakaoShareFeedParams {
  objectType: 'feed';
  content: KakaoShareContent;
  buttons?: KakaoShareButton[];
}

interface KakaoShare {
  sendDefault(params: KakaoShareFeedParams): void;
}

interface KakaoSDK {
  init(key: string): void;
  isInitialized(): boolean;
  Share: KakaoShare;
}

interface Window {
  Kakao?: KakaoSDK;
}
