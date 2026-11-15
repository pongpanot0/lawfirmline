import type { Lang } from '@/lib/marketing/i18n';
import { Fragment } from 'react';
export function BalancedHeading({ text }: { text: string; lang?: Lang }) {
  return (
    <>
      {text.split('|').map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className="inline-block max-w-full">{part}</span>
        </Fragment>
      ))}
    </>
  );
}
