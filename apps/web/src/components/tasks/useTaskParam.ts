'use client';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * The open task lives in the URL (`?task=<id>`) so a task can be linked and
 * the browser's back button closes the drawer. Other params are preserved
 * (the case page keeps its `tab`).
 */
export function useTaskParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('task');

  const setParam = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set('task', id);
      else next.delete('task');
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Stable identities: the drawer's key-handling effect depends on `close`.
  const open = useCallback((id: string) => setParam(id), [setParam]);
  const close = useCallback(() => setParam(null), [setParam]);

  return { taskId, open, close };
}
