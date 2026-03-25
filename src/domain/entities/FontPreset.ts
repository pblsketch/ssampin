import type { FontFamily } from './Settings';

export type FontCategory = 'modern' | 'classic' | 'friendly';

export interface FontPreset {
  readonly id: FontFamily;
  readonly name: string;
  readonly nameEn: string;
  readonly cssFamily: string;
  readonly googleFontsUrl: string | null;
  readonly cdnUrl: string | null;
  readonly customCss: string | null;
  readonly weights: readonly number[];
  readonly description: string;
  readonly preview: string;
  readonly category: FontCategory;
  readonly isNew?: boolean;
}

export const FONT_CATEGORIES: readonly { id: FontCategory; label: string }[] = [
  { id: 'modern', label: '모던' },
  { id: 'classic', label: '클래식' },
  { id: 'friendly', label: '친근한' },
];

export const FONT_PRESETS: readonly FontPreset[] = [
  {
    id: 'noto-sans',
    name: 'Noto Sans KR',
    nameEn: 'Noto Sans KR',
    cssFamily: "'Noto Sans KR', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap',
    cdnUrl: null,
    customCss: null,
    weights: [300, 400, 500, 700],
    description: '깔끔한 기본 고딕체',
    preview: '가나다라 ABC 123',
    category: 'classic',
  },
  {
    id: 'pretendard',
    name: '프리텐다드',
    nameEn: 'Pretendard',
    cssFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
    googleFontsUrl: null,
    cdnUrl: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
    customCss: null,
    weights: [300, 400, 500, 700],
    description: '모던하고 세련된 서체',
    preview: '가나다라 ABC 123',
    category: 'modern',
  },
  {
    id: 'ibm-plex',
    name: 'IBM Plex Sans KR',
    nameEn: 'IBM Plex Sans KR',
    cssFamily: "'IBM Plex Sans KR', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;700&display=swap',
    cdnUrl: null,
    customCss: null,
    weights: [300, 400, 500, 700],
    description: '정돈된 기술적 서체',
    preview: '가나다라 ABC 123',
    category: 'modern',
  },
  {
    id: 'nanum-gothic',
    name: '나눔고딕',
    nameEn: 'Nanum Gothic',
    cssFamily: "'Nanum Gothic', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap',
    cdnUrl: null,
    customCss: null,
    weights: [400, 700],
    description: '부드러운 한글 고딕체',
    preview: '가나다라 ABC 123',
    category: 'classic',
  },
  {
    id: 'nanum-square',
    name: '나눔스퀘어',
    nameEn: 'NanumSquare',
    cssFamily: "'NanumSquare', sans-serif",
    googleFontsUrl: null,
    cdnUrl: 'https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css',
    customCss: null,
    weights: [300, 400, 700, 800],
    description: '깔끔한 네모꼴 서체',
    preview: '가나다라 ABC 123',
    category: 'classic',
  },
  {
    id: 'gowun-dodum',
    name: '고운돋움',
    nameEn: 'Gowun Dodum',
    cssFamily: "'Gowun Dodum', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap',
    cdnUrl: null,
    customCss: null,
    weights: [400],
    description: '둥글고 친근한 서체',
    preview: '가나다라 ABC 123',
    category: 'friendly',
  },
  {
    id: 'suit',
    name: 'SUIT',
    nameEn: 'SUIT',
    cssFamily: "'SUIT Variable', 'SUIT', sans-serif",
    googleFontsUrl: null,
    cdnUrl: 'https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css',
    customCss: null,
    weights: [300, 400, 500, 700],
    description: '한영 밸런스 좋은 모던 서체',
    preview: '가나다라 ABC 123',
    category: 'modern',
  },
  {
    id: 'wanted-sans',
    name: '원티드 산스',
    nameEn: 'Wanted Sans',
    cssFamily: "'Wanted Sans Variable', 'Wanted Sans', sans-serif",
    googleFontsUrl: null,
    cdnUrl: 'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.1/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css',
    customCss: null,
    weights: [300, 400, 500, 600, 700],
    description: '모던하고 따뜻한 차세대 고딕',
    preview: '가나다라 ABC 123',
    category: 'modern',
    isNew: true,
  },
  {
    id: 'paperlogy',
    name: '페이퍼로지',
    nameEn: 'Paperlogy',
    cssFamily: "'Paperlogy', sans-serif",
    googleFontsUrl: null,
    cdnUrl: 'https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/Paperlogy.css',
    customCss: null,
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    description: '교육자료·PPT에 최적화된 서체',
    preview: '가나다라 ABC 123',
    category: 'modern',
    isNew: true,
  },
  {
    id: 'kakao-big',
    name: '카카오 큰글씨',
    nameEn: 'Kakao Big Sans',
    cssFamily: "'Kakao Big Sans', sans-serif",
    googleFontsUrl: null,
    cdnUrl: null,
    customCss: "@font-face { font-family: 'Kakao Big Sans'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2506-1@1.0/KakaoBigSans-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; } @font-face { font-family: 'Kakao Big Sans'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2506-1@1.0/KakaoBigSans-Bold.woff2') format('woff2'); font-weight: 700; font-display: swap; }",
    weights: [400, 700],
    description: '디지털 최적화 서체',
    preview: '가나다라 ABC 123',
    category: 'friendly',
    isNew: true,
  },
  {
    id: 'spoqa-han-sans',
    name: '스포카 한 산스',
    nameEn: 'Spoqa Han Sans Neo',
    cssFamily: "'Spoqa Han Sans Neo', sans-serif",
    googleFontsUrl: null,
    cdnUrl: 'https://spoqa.github.io/spoqa-han-sans/css/SpoqaHanSansNeo.css',
    customCss: null,
    weights: [300, 400, 500, 700],
    description: '숫자 고정폭, 데이터 표시에 최적',
    preview: '가나다라 ABC 123',
    category: 'classic',
    isNew: true,
  },
  {
    id: 'custom',
    name: '내 폰트',
    nameEn: 'Custom Font',
    cssFamily: "'SsampinCustomFont', sans-serif",
    googleFontsUrl: null,
    cdnUrl: null,
    customCss: null,
    weights: [400, 700],
    description: '직접 업로드한 폰트',
    preview: '가나다라 ABC 123',
    category: 'friendly',
  },
];

export function getFontPreset(id: FontFamily): FontPreset {
  return FONT_PRESETS.find((p) => p.id === id) ?? FONT_PRESETS[0]!;
}
