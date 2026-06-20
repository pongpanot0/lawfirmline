'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Mail } from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, UserItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function TeamPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<UserItem[]>([]);

  useEffect(() => {
    if (!token) return;
    api.getUsers(token).then(setMembers).catch(console.error);
  }, [token]);

  if (user?.role !== Role.ADMIN) {
    return <p className="text-destructive">Access denied. Admin only.</p>;
  }

  const roleVariant = (role: string) => {
    if (role === 'ADMIN') return 'default' as const;
    if (role === 'LAWYER') return 'filed' as const;
    return 'muted' as const;
  };

  return (
    <div>
      <PageHeader
        title="Team Management"
        description="Manage lawyers, paralegals, and admins"
        actions={
          <Button size="sm" onClick={() => router.push('/admin/users/new')} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />Add Member
          </Button>
        }
      />

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {members.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Avatar fallback={`${m.firstName[0]}${m.lastName[0]}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.firstName} {m.lastName}</p>
                  <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    {m.email}
                  </p>
                </div>
                <Badge variant={roleVariant(m.role)}>{m.role}</Badge>
              </div>
              <Link href="/admin/users" className="mt-3 inline-block text-sm text-primary hover:underline">
                Manage
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar fallback={`${m.firstName[0]}${m.lastName[0]}`} />
                      <span className="font-medium">{m.firstName} {m.lastName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span>
                  </TableCell>
                  <TableCell><Badge variant={roleVariant(m.role)}>{m.role}</Badge></TableCell>
                  <TableCell>
                    <Link href="/admin/users" className="text-sm text-primary hover:underline">Manage</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
