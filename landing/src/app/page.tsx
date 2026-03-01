import Hero from '@/components/Hero';
import Screenshot from '@/components/Screenshot';
import Features from '@/components/Features';
import WidgetMode from '@/components/WidgetMode';
import ShareSchedule from '@/components/ShareSchedule';
import ExportFormats from '@/components/ExportFormats';
import InstallGuide from '@/components/InstallGuide';
import FAQ from '@/components/FAQ';
import BottomCTA from '@/components/BottomCTA';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main>
      <Hero />
      <Screenshot />
      <Features />
      <WidgetMode />
      <ShareSchedule />
      <ExportFormats />
      <InstallGuide />
      <FAQ />
      <BottomCTA />
      <Footer />
    </main>
  );
}
