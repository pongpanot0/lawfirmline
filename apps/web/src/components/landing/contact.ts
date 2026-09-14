/** Demo / sales contact — LINE OA when configured, mailto fallback so the link never dies. */
export const demoHref =
  process.env.NEXT_PUBLIC_LINE_OA_URL ?? 'mailto:hello@samnuan.co?subject=Samnuan Demo';
