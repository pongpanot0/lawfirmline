'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProductTour } from './use-product-tour';
import type { TourStep } from './types';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const TOOLTIP_WIDTH = 320;
const GAP = 14;

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Clamp the tooltip's top-left so it never runs off-screen, on any viewport down to 320px. */
function placeTooltip(spot: Rect, placement: TourStep['placement'], vw: number, vh: number) {
  const estHeight = 160;
  const candidates: Record<string, [number, number]> = {
    bottom: [spot.top + spot.height + GAP, spot.left],
    top: [spot.top - GAP - estHeight, spot.left],
    right: [spot.top, spot.left + spot.width + GAP],
    left: [spot.top, spot.left - GAP - TOOLTIP_WIDTH],
  };
  const order = [placement ?? 'bottom', 'bottom', 'top', 'right', 'left'];
  let [top, left] = candidates[order.find((p) => candidates[p]) as string] ?? candidates.bottom;
  left = Math.min(Math.max(16, left), vw - TOOLTIP_WIDTH - 16);
  top = Math.min(Math.max(16, top), vh - estHeight - 16);
  return { top, left };
}

export function ProductTour({ steps, storageKey }: { steps: TourStep[]; storageKey: string }) {
  const { open, step, target, stepIndex, isFirst, isLast, visibleStepCount, next, prev, skip } =
    useProductTour(steps, storageKey);
  const [spot, setSpot] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !target) {
      setSpot(null);
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const update = () => setSpot(measure(target));
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, target, stepIndex]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev, skip]);

  if (!open || !step || !spot || typeof document === 'undefined') return null;

  const box = { top: spot.top - PAD, left: spot.left - PAD, width: spot.width + PAD * 2, height: spot.height + PAD * 2 };
  const { top: ttop, left: tleft } = placeTooltip(box, step.placement, window.innerWidth, window.innerHeight);

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-hidden={false}>
      <div
        className="absolute rounded-xl ring-2 ring-primary transition-[top,left,width,height] duration-200"
        style={{ ...box, position: 'fixed', boxShadow: '0 0 0 9999px rgba(15,23,42,.65)' }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        tabIndex={-1}
        className="fixed z-[101] w-[320px] rounded-xl border border-border bg-card p-4 shadow-lg outline-none"
        style={{ top: ttop, left: tleft }}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <p id="tour-step-title" className="text-sm font-semibold">
            {step.title}
          </p>
          <button
            type="button"
            aria-label="ปิดคำแนะนำ"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={skip}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            ขั้นตอน {stepIndex + 1} จาก {visibleStepCount}
          </span>
          <div className="flex gap-2">
            {!isFirst && (
              <Button size="sm" variant="ghost" onClick={prev}>
                ก่อนหน้า
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? 'เสร็จสิ้น' : 'ถัดไป'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
