/**
 * Resolves a tour step's `selector` to one element on the page. Beyond plain CSS,
 * supports two prefixes so step authors don't need to sprinkle data-tour
 * attributes across every page in the app:
 *   - "text:<string>"        smallest element whose text contains <string>
 *   - "placeholder:<string>" input/textarea whose placeholder contains <string>
 * Ambiguous CSS (e.g. an href that also matches a sidebar link) should still
 * get a real data-tour attribute — text/placeholder matching is a fallback
 * for pages we don't want to touch just to add a tour.
 */
export function resolveTarget(selector: string): HTMLElement | null {
  if (selector.startsWith('text:')) return findByText(selector.slice(5));
  if (selector.startsWith('placeholder:')) return findByPlaceholder(selector.slice(12));
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function findByText(needle: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'main a, main button, main h1, main h2, main h3, main label, main th, main [role="tab"]',
  );
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  candidates.forEach((el) => {
    const text = (el.textContent || '').trim();
    if (text.includes(needle) && text.length < bestLen) {
      best = el;
      bestLen = text.length;
    }
  });
  return best;
}

function findByPlaceholder(needle: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('main input, main textarea');
  for (const el of candidates) {
    if ((el.placeholder || '').includes(needle)) return el;
  }
  return null;
}
