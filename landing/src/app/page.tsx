import type { Metadata } from 'next';
import MigrationBanner from '@/components/MigrationBanner';
import LandingNav from '@/components/LandingNav';
import Hero from '@/components/Hero';
import Screenshot from '@/components/Screenshot';
import Features from '@/components/Features';
import Testimonials from '@/components/Testimonials';
import MidCTA from '@/components/MidCTA';
import Anywhere from '@/components/Anywhere';
import TrustAndUtility from '@/components/TrustAndUtility';
import AiBridgeTeaser from '@/components/AiBridgeTeaser';
import InstallGuide from '@/components/InstallGuide';
import FAQ from '@/components/FAQ';
import Footer from '@/components/Footer';
import { SITE_URL } from '@/config';
import { faqJsonLd } from '@/content/faq';
import { softwareApplicationJsonLd, jsonLdScriptProps } from '@/content/structuredData';

// 정본 주소는 페이지마다 각자 선언한다 (루트 레이아웃에서 상속받지 않는다).
export const metadata: Metadata = {
  alternates: {
    canonical: SITE_URL,
    languages: {
      'ko-KR': SITE_URL,
    },
  },
};

export default function Home() {
  return (
    <main>
      {/* 제품 정보와 FAQ 는 그 내용이 실제로 보이는 이 페이지에서만 선언한다.
          FAQ 구조화 데이터는 화면 FAQ 와 같은 원천(content/faq)을 읽으므로 항상 일치한다. */}
      <script {...jsonLdScriptProps(softwareApplicationJsonLd)} />
      <script {...jsonLdScriptProps(faqJsonLd)} />
      <MigrationBanner />
      <LandingNav />
      <Hero />
      <Screenshot />
      <div id="features" className="scroll-mt-20">
        <Features />
      </div>
      <Testimonials />
      <MidCTA />
      <div id="mobile" className="scroll-mt-20">
        <Anywhere />
      </div>
      <TrustAndUtility />
      <div id="ai-bridge" className="scroll-mt-20">
        <AiBridgeTeaser />
      </div>
      <div id="download" className="scroll-mt-20">
        <InstallGuide />
      </div>
      <FAQ />
      <Footer />
    </main>
  );
}
