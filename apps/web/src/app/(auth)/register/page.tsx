'use client';

import Link from 'next/link';
import { Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">LexFlow</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Self-signup is currently disabled. If you need access, please ask your firm administrator to invite you.
          </p>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
