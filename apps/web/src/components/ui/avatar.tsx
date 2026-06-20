import * as React from 'react';
import { cn } from '@/lib/utils';

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { fallback?: string }
>(({ className, fallback, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary/10 text-primary',
      className,
    )}
    {...props}
  >
    {children ?? (
      <span className="flex h-full w-full items-center justify-center text-xs font-semibold">
        {fallback}
      </span>
    )}
  </div>
));
Avatar.displayName = 'Avatar';

export { Avatar };
