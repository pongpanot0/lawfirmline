import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { Card, CardContent } from '@/components/ui/card';

/** Frame for the signed-out client portal screens: sign in, link sent, link check, invite, set password. */
export function PortalAuthCard({ title, description, children }: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-5 sm:p-8">
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <SamnuanLogo />
            <span className="text-sm text-muted-foreground">พอร์ทัลลูกค้า</span>
          </div>
          <h1 className="text-2xl font-semibold leading-relaxed">{title}</h1>
          {description && <div className="mb-6 mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>}
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
