'use client';

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
    <div className={`rounded-xl border p-4 ${travel.warning ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">เดินทางไปศาล</p>
          <p className="mt-1 text-2xl font-bold text-brand-600">{mins} นาที</p>
          <p className="text-xs text-slate-500">{km} กม. จากสำนักงาน</p>
          {travel.fromCache && (
            <p className="mt-1 text-xs text-slate-400">เส้นทางที่บันทึกไว้</p>
          )}
        </div>
        <span className="text-2xl">🗺️</span>
      </div>
      {travel.warning && (
        <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          ⚠️ {travel.warning}
        </p>
      )}
      {travel.mapsUrl && (
        <a
          href={travel.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-brand-600 hover:underline"
        >
          เปิดใน Google Maps →
        </a>
      )}
    </div>
  );
}
