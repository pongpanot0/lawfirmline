'use client';

import { useEffect } from 'react';
import { redirect } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Suspense } from 'react';
import ExternalWorkPage from './external-work';
import { PageLoading } from '@/components/ui/misc';

export default function WorkPage() {
  return <Suspense><WorkContent /></Suspense>;
}

function WorkContent() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading />;

  if (!user) {
    redirect('/login');
  }

  if (user.firmRole === 'EXTERNAL') {
    return <ExternalWorkPage />;
  }

  redirect('/todos');
}
