'use client';

import { AlertTriangle, ArrowUpRight, MapPin } from 'lucide-react';

export interface TravelPreview {
  distanceMeters: number;
  durationSeconds: number;
  mapsUrl: string;
  warning?: string;
  fromCache?: boolean;
}

export function TravelPreviewCard({ travel }: { travel: TravelPreview }) {
  const km = (travel.distanceMeters / 1000).toFixed(1);
  const mins = Math.round(travel.durationSeconds / 60);

  return (
    <div className={`rounded-xl border p-4 ${travel.warning ? 'border-warning/40 bg-warning/5' : 'border-border bg-card'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">เดินทางไปศาล</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-brand-600">{mins} นาที</p>
          <p className="text-xs tabular-nums text-muted-foreground">{km} กม. จากสำนักงาน</p>
          {travel.fromCache && (
            <p className="mt-1 text-xs text-muted-foreground">เส้นทางที่บันทึกไว้</p>
          )}
        </div>
        <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      {travel.warning && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {travel.warning}
        </p>
      )}
      {travel.mapsUrl && (
        <a
          href={travel.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-brand-600 hover:underline"
        >
          เปิดใน Google Maps
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </div>
  );
}
