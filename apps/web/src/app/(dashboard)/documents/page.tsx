'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Upload, Search, FileText, Scale, Shield, Gavel } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CaseItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = [
  { id: 'complaint', label: 'Complaint', icon: Gavel },
  { id: 'evidence', label: 'Evidence', icon: FileText },
  { id: 'contracts', label: 'Contracts', icon: Scale },
  { id: 'poa', label: 'Power of Attorney', icon: Shield },
  { id: 'orders', label: 'Court Orders', icon: Gavel },
];

export default function DocumentsPage() {
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState('');

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then((c) => {
      setCases(c);
      if (c[0]) setSelectedCase(c[0].id);
    });
  }, [token]);

  const filtered = cases.filter((c) =>
    !search || c.caseNumber.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader title="Documents" description="Google Drive-inspired document management" />

      <div className="mb-6 grid gap-4 sm:grid-cols-5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card key={cat.id} className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-xs font-medium">{cat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search documents..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {filtered.map((c) => (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}/documents`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.caseNumber} · {c.folderId ?? 'Folder'}</p>
                  </div>
                  <Badge variant="muted">View</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Upload to Case</p>
              <select
                value={selectedCase}
                onChange={(e) => setSelectedCase(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber}</option>)}
              </select>
              <DocumentDropZone
                label="Drag & drop files here"
                onFile={() => {}}
              />
              <Button className="w-full" size="sm" disabled={!selectedCase}>
                <Upload className="h-4 w-4" />Upload Document
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2">Features</p>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li>✓ Folder structure per case</li>
                <li>✓ Version history</li>
                <li>✓ PDF preview</li>
                <li>✓ AI document analysis</li>
              </ul>
              <Link href="/knowledge" className="mt-3 block text-sm text-primary hover:underline">
                View Knowledge Base →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
