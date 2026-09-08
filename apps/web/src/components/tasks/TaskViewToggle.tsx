'use client';

import { useEffect, useState } from 'react';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export type TaskLayout = 'list' | 'board';

const STORAGE_KEY = 'lawfirm_task_layout';

/**
 * Remembers which view a lawyer chose, per browser.
 *
 * The list is the default because it answers "what do I do next"; the board is
 * kept for the times someone wants to see where everything stands.
 */
export function useTaskLayout(): [TaskLayout, (layout: TaskLayout) => void] {
  const [layout, setLayout] = useState<TaskLayout>('list');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'board' || stored === 'list') setLayout(stored);
    } catch {
      // Private browsing, or storage turned off: the default view is fine.
    }
  }, []);

  const choose = (next: TaskLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  };

  return [layout, choose];
}

export function TaskViewToggle({
  layout,
  onChange,
}: {
  layout: TaskLayout;
  onChange: (layout: TaskLayout) => void;
}) {
  const d = useDashboardT();
  const options: Array<{ value: TaskLayout; label: string }> = [
    { value: 'list', label: d.todos.viewList },
    { value: 'board', label: d.todos.viewBoard },
  ];

  return (
    <div className="inline-flex rounded-lg border border-border p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={layout === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1 text-xs ${
            layout === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
