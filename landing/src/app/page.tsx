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

export default function Home() {
  return (
    <main>
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
