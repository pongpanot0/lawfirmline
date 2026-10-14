/** Fills `{{key}}` from vars. Unknown or empty keys stay as `{{key}}` and are listed once in `missing`. */
export function fillPlaceholders(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const filled = text.replace(/\{\{([^{}]+)\}\}/g, (whole, key: string) => {
    const value = vars[key];
    if (value) return value;
    missing.add(key);
    return whole;
  });
  return { text: filled, missing: [...missing] };
}
