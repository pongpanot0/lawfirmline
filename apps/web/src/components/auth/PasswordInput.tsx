'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';

/** `className` styles the wrapper (spacing), so the toggle stays centred on the field. */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const d = useDashboardT();
  return (
    <div className={`relative ${className ?? ''}`}>
      <Input {...props} type={visible ? 'text' : 'password'} className="h-11 pr-12" />
      <button type="button" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visible ? d.auth.hidePassword : d.auth.showPassword} aria-pressed={visible}
        onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
