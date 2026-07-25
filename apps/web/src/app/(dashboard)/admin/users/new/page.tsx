'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewUserPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/team');
  }, [router]);
  return null;
}
