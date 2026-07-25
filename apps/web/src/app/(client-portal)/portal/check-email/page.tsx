import { Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function PortalCheckEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            If that email is registered for portal access, we&apos;ve sent a sign-in link. It expires in 15 minutes
            and can only be used once.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
