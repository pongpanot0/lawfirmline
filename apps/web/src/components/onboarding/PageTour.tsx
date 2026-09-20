'use client';

import { ProductTour } from './ProductTour';
import { PAGE_TOUR_STEPS } from './page-tour-steps';

/** Dynamic routes that get a tour keyed by their static shape, not the live id. */
const DYNAMIC_ROUTE_PATTERNS: [RegExp, string][] = [[/^\/cases\/[^/]+$/, '/cases/:id']];

function tourKeyFor(pathname: string): string | null {
  if (PAGE_TOUR_STEPS[pathname]) return pathname;
  const match = DYNAMIC_ROUTE_PATTERNS.find(([re]) => re.test(pathname));
  return match ? match[1] : null;
}

export function hasTour(pathname: string): boolean {
  return tourKeyFor(pathname) !== null;
}

/** Mounted once in AppShell — looks up the current route's steps, if any, from a shared registry. */
export function PageTour({ pathname }: { pathname: string }) {
  const key = tourKeyFor(pathname);
  const steps = key ? PAGE_TOUR_STEPS[key] : null;
  if (!steps) return null;
  // key={key} forces a clean remount (fresh hook state) when navigating between tour-bearing routes.
  return <ProductTour key={key} steps={steps} storageKey={`samnuan-tour-${key}-v1`} />;
}
