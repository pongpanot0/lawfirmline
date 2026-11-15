import type { Metadata } from 'next';

// Auth screens stay out of search; /register overrides this in its own layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
