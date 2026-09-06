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
          <h2 className="text-xl font-semibold">ตรวจสอบอีเมลของคุณ</h2>
          <p className="text-sm text-muted-foreground">
            หากอีเมลนี้ลงทะเบียนสำหรับเข้าใช้พอร์ทัลไว้แล้ว เราได้ส่งลิงก์เข้าสู่ระบบให้แล้ว
            ลิงก์จะหมดอายุใน 15 นาทีและใช้ได้เพียงครั้งเดียว
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
