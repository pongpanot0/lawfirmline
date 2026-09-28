'use client';

import * as React from 'react';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn } from '@/lib/utils';

type FieldProps = { label: string; hint?: string; error?: string; containerClassName?: string };

function Field({ id, label, hint, error, required, className, children }: FieldProps & {
  id: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return <div className={cn('space-y-1.5', className)}>
    <label htmlFor={id} className="block text-sm font-medium">{label}{required && <span aria-hidden="true" className="ml-1 text-destructive">*</span>}</label>
    {children}
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

function describedBy(id: string, hint?: string, error?: string, existing?: string) {
  return [existing, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}

export function TextField({ label, hint, error, containerClassName, className, id: suppliedId, ...props }:
  FieldProps & React.ComponentProps<typeof Input>) {
  const generatedId = React.useId();
  const id = suppliedId ?? generatedId;
  return <Field id={id} label={label} hint={hint} error={error} required={props.required} className={containerClassName}>
    <Input {...props} id={id} className={cn('h-10', className)} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy(id, hint, error, props['aria-describedby'])} />
  </Field>;
}

export function TextareaField({ label, hint, error, containerClassName, id: suppliedId, ...props }:
  FieldProps & React.ComponentProps<typeof Textarea>) {
  const generatedId = React.useId();
  const id = suppliedId ?? generatedId;
  return <Field id={id} label={label} hint={hint} error={error} required={props.required} className={containerClassName}>
    <Textarea {...props} id={id} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy(id, hint, error, props['aria-describedby'])} />
  </Field>;
}

export function SelectField({ label, hint, error, containerClassName, id: suppliedId, className, children, ...props }:
  FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = React.useId();
  const id = suppliedId ?? generatedId;
  return <Field id={id} label={label} hint={hint} error={error} required={props.required} className={containerClassName}>
    <select {...props} id={id} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy(id, hint, error, props['aria-describedby'])}
      className={cn('h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}>{children}</select>
  </Field>;
}

/** Values are Gregorian wall-clock strings. Convert to an instant with lib/bangkok at the API boundary. */
export function DateField(props: Omit<React.ComponentProps<typeof TextField>, 'type'>) {
  return <TextField {...props} type="date" />;
}

export function DateTimeField(props: Omit<React.ComponentProps<typeof TextField>, 'type'>) {
  return <TextField {...props} type="datetime-local" />;
}
