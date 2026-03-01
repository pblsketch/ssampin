import Hero from '@/components/Hero';
import Screenshot from '@/components/Screenshot';
import Features from '@/components/Features';
import ClassroomTools from '@/components/ClassroomTools';
import MealAndWeather from '@/components/MealAndWeather';
import WidgetMode from '@/components/WidgetMode';
import PinGuard from '@/components/PinGuard';
import ShareSchedule from '@/components/ShareSchedule';
import ExportFormats from '@/components/ExportFormats';
import InstallGuide from '@/components/InstallGuide';
import FAQ from '@/components/FAQ';
import Feedback from '@/components/Feedback';
import BottomCTA from '@/components/BottomCTA';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main>
      <Hero />
      <Screenshot />
      <Features />
      <ClassroomTools />
      <MealAndWeather />
      <WidgetMode />
      <PinGuard />
      <ShareSchedule />
      <ExportFormats />
      <InstallGuide />
      <FAQ />
      <Feedback />
      <BottomCTA />
      <Footer />
    </main>
  );
}
