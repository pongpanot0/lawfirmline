'use client';

import Link from 'next/link';
import { Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';

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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">LexFlow</span>
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
