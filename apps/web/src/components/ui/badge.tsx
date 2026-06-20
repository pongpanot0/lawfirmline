import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        destructive: 'border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
        muted: 'border-transparent bg-muted text-muted-foreground',
        new: 'border-transparent bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
        drafting: 'border-transparent bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
        filed: 'border-transparent bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
        hearing: 'border-transparent bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
        judgment: 'border-transparent bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        closed: 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
