'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TourStep } from './types';
import { resolveTarget } from './resolve-target';

/** Dispatched by a "help"/"restart tour" button — any mounted tour picks it up. */
export const TOUR_RESTART_EVENT = 'samnuan:start-tour';

export function restartTour() {
  window.dispatchEvent(new Event(TOUR_RESTART_EVENT));
}

interface UseProductTourResult {
  open: boolean;
  stepIndex: number;
  step: TourStep | null;
  target: HTMLElement | null;
  isFirst: boolean;
  isLast: boolean;
  visibleStepCount: number;
  next: () => void;
  prev: () => void;
  skip: () => void;
}

/** Steps whose selector isn't on the page right now are dropped, not just skipped visually. */
function resolveVisibleSteps(steps: TourStep[]): { step: TourStep; target: HTMLElement }[] {
  return steps
    .map((step) => ({ step, target: resolveTarget(step.selector) }))
    .filter((s): s is { step: TourStep; target: HTMLElement } => s.target !== null);
}

export function useProductTour(steps: TourStep[], storageKey: string): UseProductTourResult {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [resolved, setResolved] = useState<{ step: TourStep; target: HTMLElement }[]>([]);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // localStorage unavailable (private mode) — the tour just won't remember dismissal.
    }
  }, [storageKey]);

  const begin = useCallback(() => {
    // Layout (sidebar, dashboard cards) can still be mounting — give it a beat.
    const tryResolve = (attemptsLeft: number) => {
      const found = resolveVisibleSteps(steps);
      if (found.length === steps.length || attemptsLeft <= 0) {
        setResolved(found);
        setStepIndex(0);
        setOpen(found.length > 0);
      } else {
        setTimeout(() => tryResolve(attemptsLeft - 1), 200);
      }
    };
    // Mounted app-wide in AppShell, so a page's own data fetch may still be
    // in flight — retry for a few seconds before giving up on this route.
    tryResolve(20);
  }, [steps]);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(storageKey) === '1';
    } catch {
      dismissed = false;
    }
    if (!dismissed) begin();

    const onRestart = () => begin();
    window.addEventListener(TOUR_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, onRestart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= resolved.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [resolved.length, finish]);

  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const current = resolved[stepIndex] ?? null;

  return {
    open,
    stepIndex,
    step: current?.step ?? null,
    target: current?.target ?? null,
    isFirst: stepIndex === 0,
    isLast: stepIndex === resolved.length - 1,
    visibleStepCount: resolved.length,
    next,
    prev,
    skip: finish,
  };
}
