import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { LocaleProvider } from '@/components/landing/LocaleProvider';
import { FacebookPixel } from '@/components/FacebookPixel';
import './globals.css';

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'samnuan.com';
const title = 'Samnuan — ระบบจัดการสำนักงานกฎหมาย';
const description =
  'จัดการคดี นัดหมายศาล เอกสาร และการแจ้งเตือนลูกความในระบบเดียว — ไม่พลาดนัดศาล ลดงาน Admin';

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
    icon: '/brand/samnuan-icon.png',
    apple: '/brand/samnuan-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>{children}</AuthProvider>
          </LocaleProvider>
          <FacebookPixel />
        </ThemeProvider>
      </body>
    </html>
  );
}
