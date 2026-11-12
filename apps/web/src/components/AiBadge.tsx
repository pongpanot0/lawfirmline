import { Sparkles } from "lucide-react";

export function AiBadge() {
  return (
    <span
      title="สร้างผ่าน AI"
      aria-label="สร้างผ่าน AI"
      className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      ผ่าน AI
    </span>
  );
}
