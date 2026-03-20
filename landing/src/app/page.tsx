import MigrationBanner from '@/components/MigrationBanner';
import Hero from '@/components/Hero';
import Screenshot from '@/components/Screenshot';
import Features from '@/components/Features';
import Testimonials from '@/components/Testimonials';
import MidCTA from '@/components/MidCTA';
import Anywhere from '@/components/Anywhere';
import TrustAndUtility from '@/components/TrustAndUtility';
import InstallGuide from '@/components/InstallGuide';
import FAQ from '@/components/FAQ';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main>
      <MigrationBanner />
      <Hero />
      <Screenshot />
      <Features />
      <Testimonials />
      <MidCTA />
      <Anywhere />
      <TrustAndUtility />
      <InstallGuide />
      <FAQ />
      <Footer />
    </main>
  );
}
