'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Plus, Bell, Menu } from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';

interface TopNavbarProps {
  user: { firstName: string; lastName: string; role: Role };
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onMenuClick?: () => void;
}

export function TopNavbar({ user, searchQuery, onSearchChange, onMenuClick }: TopNavbarProps) {
  const router = useRouter();
  const canCreate = user.role === Role.ADMIN || user.role === Role.LAWYER;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur-md sm:gap-4 sm:px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative min-w-0 flex-1 md:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search cases, clients..."
          className="h-9 border-transparent bg-muted/50 pl-9 focus-visible:bg-card"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery) {
              router.push(`/cases?search=${encodeURIComponent(searchQuery)}`);
            }
          }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {canCreate && (
          <>
            <Button size="icon" className="sm:hidden" onClick={() => router.push('/cases/new')} aria-label="New case">
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => router.push('/cases/new')}>
              <Plus className="h-4 w-4" />
              New Case
            </Button>
          </>
        )}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <Link href="/settings">
          <Avatar fallback={`${user.firstName[0]}${user.lastName[0]}`} className="cursor-pointer" />
        </Link>
      </div>
    </header>
  );
}
