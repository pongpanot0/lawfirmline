import { LandingPage } from '@/components/landing/LandingPage';
import { LocaleProvider } from '@/components/landing/LocaleProvider';

export default function HomePage() {
  return (
    <LocaleProvider>
      <LandingPage />
    </LocaleProvider>
  );
}
