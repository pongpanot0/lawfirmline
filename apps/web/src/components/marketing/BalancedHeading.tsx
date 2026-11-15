import { Fragment } from 'react';
export function BalancedHeading({ text }: { text: string }) {
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
