import type { Metadata } from 'next';

const title = 'สมัครใช้ Samnuan ฟรี 30 วัน | Samnuan';
const description = 'สมัครใช้ Samnuan เพื่อจัดการคดี เอกสาร และนัดศาลของทีม ทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต';

// openGraph/twitter are replaced wholesale by Next's merge, so repeat the shared fields here.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/register' },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url: '/register',
    siteName: 'Samnuan',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
