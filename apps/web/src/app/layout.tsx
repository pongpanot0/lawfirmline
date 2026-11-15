import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Thai, Trirong } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { LocaleProvider } from '@/components/landing/LocaleProvider';
import { FacebookPixel } from '@/components/FacebookPixel';
import { GoogleTagManager } from '@/components/GoogleTagManager';
import { ActionFeedback } from '@/components/feedback/ActionFeedback';
import { AiWorkingIndicator } from '@/components/feedback/AiWorkingIndicator';
import { ThaiValidity } from '@/components/ui/ThaiValidity';
import { ConfirmHost } from '@/components/ui/ConfirmHost';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-inter', preload: false });
const notoThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-noto-thai' });
const trirong = Trirong({ subsets: ['thai', 'latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-trirong', preload: false });

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'samnuan.com';
const title = 'Samnuan — ระบบจัดการสำนักงานกฎหมาย';
const description =
  'รวมข้อมูลคดี เอกสาร และตารางนัดไว้ในที่เดียว ให้ทีมติดตามงานร่วมกัน พร้อมช่องทางให้ลูกความตรวจสอบความคืบหน้าได้ด้วยตนเอง';

export const metadata: Metadata = {
  metadataBase: new URL(`https://${rootDomain}`),
  title,
  description,
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'Samnuan',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/marketing/og.png'],
  },
  icons: {
    icon: { url: '/brand/samnuan-balance-favicon.png', type: 'image/png', sizes: '32x32' },
    apple: { url: '/brand/samnuan-balance-icon.png', type: 'image/png', sizes: '256x256' },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable} ${trirong.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>{children}<ActionFeedback /></AuthProvider>
          </LocaleProvider>
          <AiWorkingIndicator />
          <ThaiValidity />
          <ConfirmHost />
          <FacebookPixel />
          <GoogleTagManager />
        </ThemeProvider>
      </body>
    </html>
  );
}
