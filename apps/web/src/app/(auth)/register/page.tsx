'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';

export default function RegisterPage() {
  const d = useDashboardT();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher />
          </div>
          <div className="mb-6 flex items-center justify-center gap-2">
            <SamnuanLogo markClassName="h-9 w-9" />
          </div>
          <p className="text-sm text-muted-foreground">
            {d.auth.signupDisabled}
          </p>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {d.auth.haveAccount}{' '}
            <Link href="/login" className="text-primary hover:underline">{d.auth.signIn}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
