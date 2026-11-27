import { useId } from 'react';
import { Button, type ButtonProps } from './button';

export function ActionWithHint({ hint, children, type = 'button', size = 'sm', ...props }: ButtonProps & { hint: string }) {
  const hintId = useId();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button type={type} size={size} aria-describedby={hintId} {...props}>{children}</Button>
      <small id={hintId} className="whitespace-nowrap text-xs text-muted-foreground">{hint}</small>
    </div>
  );
}
