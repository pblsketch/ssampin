import { SITE_URL, GITHUB_URL, EDZIP_URL, VERSION, DOWNLOAD_URL } from '@/config';

/**
 * 사이트 전체가 공유하는 구조화 데이터(JSON-LD).
 *
 * 두 가지 규칙을 지킨다.
 *
 * 1. `@id` 를 고정한다. 같은 실체(쌤핀이라는 조직, 이 웹사이트, 이 앱)는 어느 페이지에서든
 *    같은 `@id` 로 부른다. 페이지마다 Organization 을 새로 선언하면 검색엔진과 AI 안에서
 *    "쌤핀"이 여러 실체로 쪼개진다.
 * 2. 화면에 보이는 것만 선언한다. 제품 정보·FAQ·이동경로는 그 내용이 실제로 보이는
 *    페이지에서만 붙인다. 예전에는 이 넷이 전부 layout 에 있어서 개인정보처리방침
 *    페이지까지 홈의 FAQ 8문항을 신고했다 — 화면과 다른 구조화 데이터는 스팸 판정 대상이다.
 */

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#app`;
export const AUTHOR_ID = `${SITE_URL}/about#author`;

const CONTACT_EMAIL = 'pblsketch@gmail.com';

export const authorJsonLd = {
  '@type': 'Person',
  '@id': AUTHOR_ID,
  name: '박준일',
  alternateName: 'PBL Sketch',
  url: `${SITE_URL}/about`,
  sameAs: ['https://github.com/pblsketch'],
};

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: '쌤핀',
  alternateName: ['SsamPin', '쌤핀 (SsamPin)'],
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/icon.png`,
    width: 256,
    height: 256,
  },
  description:
    '한국 중·고등학교 교사를 위한 무료 교실 관리 대시보드 「쌤핀」을 만드는 1인 개발 프로젝트.',
  email: CONTACT_EMAIL,
  founder: authorJsonLd,
  // 같은 실체가 서 있는 공식 표면들. "이 이름과 주소가 전부 한 실체"라는 선언이라,
  // 모델이 쌤핀을 다른 서비스와 섞지 않게 하는 근거가 된다.
  sameAs: [GITHUB_URL, 'https://github.com/pblsketch', EDZIP_URL],
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: '쌤핀 (SsamPin)',
  url: SITE_URL,
  inLanguage: 'ko-KR',
  description: '교사를 위한 올인원 교실 관리 대시보드 앱',
  publisher: { '@id': ORGANIZATION_ID },
};

/** 제품 자체의 정보. 제품을 소개하는 홈에서만 선언한다. */
export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: '쌤핀 (SsamPin)',
  description:
    '시간표, 학급 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에서 관리하는 교사용 데스크톱 대시보드.',
  applicationCategory: 'EducationApplication',
  operatingSystem: 'Windows 10, Windows 11, macOS',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
  },
  softwareVersion: VERSION,
  author: { '@id': AUTHOR_ID },
  publisher: { '@id': ORGANIZATION_ID },
  downloadUrl: DOWNLOAD_URL,
  screenshot: `${SITE_URL}/images/dashboard.png`,
  inLanguage: 'ko-KR',
  featureList: '시간표 관리, 좌석 배치, 일정 관리, 급식 정보, 날씨, 쌤도구, PIN 잠금, 위젯 모드',
  releaseNotes: `${GITHUB_URL}/releases`,
  isAccessibleForFree: true,
};

export interface BreadcrumbEntry {
  readonly name: string;
  /** 사이트 루트 기준 경로. 홈은 '/'. */
  readonly path: string;
}

/**
 * 페이지의 실제 위치를 반영한 이동경로를 만든다.
 * 예전에는 모든 페이지가 "쌤핀 홈" 한 단계짜리 이동경로를 똑같이 신고해서,
 * 도움말 문서 50편의 계층이 검색엔진에 전혀 전달되지 않았다.
 */
export function buildBreadcrumbJsonLd(entries: readonly BreadcrumbEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.path === '/' ? SITE_URL : `${SITE_URL}${entry.path}`,
    })),
  };
}

/** JSON-LD 를 <script> 로 심을 때 쓰는 공통 헬퍼. */
export function jsonLdScriptProps(data: unknown) {
  return {
    type: 'application/ld+json' as const,
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
  };
}
