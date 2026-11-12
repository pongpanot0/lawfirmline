"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AppWindow,
  ArrowLeftRight,
  CalendarClock,
  Eye,
  Info,
  PenLine,
} from "lucide-react";
import { mcpVisibilityText, type McpConsentInfo, type McpConsentParams } from "@lawfirm/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentContent />
    </Suspense>
  );
}

function ConsentContent() {
  const { token, loading, logout, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const next = `${pathname}${search ? `?${search}` : ""}`;
  const params = useMemo(
    () =>
      Object.fromEntries(
        new URLSearchParams(search),
      ) as unknown as McpConsentParams,
    [search],
  );
  const [info, setInfo] = useState<McpConsentInfo | null>(null);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    let active = true;
    api
      .getMcpConsent(token, params)
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch((err) => {
        if (active) {
          if (err instanceof ApiError && err.status === 400) setInvalid(true);
          else setError("โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
        }
      });
    return () => {
      active = false;
    };
  }, [token, loading, router, next, params]);
  const submit = async (approve: boolean) => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const result = await (approve
        ? api.approveMcpConsent(token, params)
        : api.denyMcpConsent(token, params));
      window.location.assign(result.redirectUrl);
    } catch {
      setError("ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง");
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12">
      <div className="flex items-center gap-3 font-display text-2xl font-semibold">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-amber-300">
          ส
        </span>
        Samnuan
      </div>
      <Card className="w-full max-w-xl shadow-sm">
        <CardContent className="space-y-6 p-6 sm:p-9">
          {invalid ? (
            <p role="alert">
              ลิงก์นี้ไม่ถูกต้อง กรุณาเริ่มเชื่อมต่อใหม่จากแอป AI
            </p>
          ) : !info ? (
            <p role={error ? "alert" : "status"}>{error || "กำลังโหลด..."}</p>
          ) : (
            <>
              <div className="flex items-center justify-center gap-4">
                <span className="flex items-center gap-2 rounded-lg border px-4 py-2">
                  <AppWindow className="h-4 w-4" aria-hidden />
                  {info.clientName}
                </span>
                <ArrowLeftRight
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex items-center gap-2 rounded-lg border px-4 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-primary font-display text-amber-300">
                    ส
                  </span>
                  Samnuan
                </span>
              </div>
              <h1 className="font-display text-2xl font-semibold">
                {info.clientName} ขอเชื่อมต่อกับ Samnuan
              </h1>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-4">
                <div>
                  <strong>
                    {info.user.firstName} {info.user.lastName}
                  </strong>
                  <p className="text-sm text-muted-foreground">
                    {info.user.email} · {info.user.firmName}
                  </p>
                </div>
                <button
                  className="min-h-11 text-sm text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    logout();
                    router.replace(`/login?next=${encodeURIComponent(next)}`);
                  }}
                >
                  เปลี่ยนบัญชี
                </button>
              </div>
              {!info.firmEnabled ? (
                <p role="alert">
                  สำนักงานของคุณยังไม่เปิดให้เชื่อมต่อ AI —
                  ติดต่อเจ้าของสำนักงาน
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    เมื่ออนุญาต {info.clientName} จะทำสิ่งเหล่านี้แทนคุณได้
                  </p>
                  <ul className="divide-y">
                    {[
                      [
                        Eye,
                        `อ่าน${mcpVisibilityText(user?.firmRole)} รวมเอกสาร นัด และงาน`,
                      ],
                      [PenLine, "สร้างและปิดงาน ลงโน้ตในคดี ลงเวลา และร่างรายการเบิกและหนังสือทวงถาม (คุณตรวจแล้วส่งเองในแอป) และยื่นลาของคุณเอง"],
                      [
                        CalendarClock,
                        "เสนอวันนัดศาล ซึ่งคุณต้องกดรับในแอปก่อน",
                      ],
                    ].map(([Icon, text]) => {
                      const RowIcon = Icon as typeof Eye;
                      return (
                        <li key={text as string} className="flex gap-3 py-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                            <RowIcon className="h-4 w-4" aria-hidden />
                          </span>
                          {text as string}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <Info aria-hidden className="h-5 w-5 shrink-0" />
                    ข้อมูลที่ {info.clientName} อ่านจะส่งไปยังผู้ให้บริการ AI
                    ตามบัญชีของคุณ ยกเลิกการเชื่อมต่อได้ทุกเมื่อที่ ตั้งค่า ›
                    การเชื่อมต่อ
                  </p>
                  {error && (
                    <p role="alert" className="text-destructive">
                      {error}
                    </p>
                  )}
                  <div className="space-y-3">
                    <Button
                      className="w-full"
                      disabled={busy}
                      onClick={() => void submit(true)}
                    >
                      อนุญาตให้ {info.clientName} เชื่อมต่อ
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void submit(false)}
                    >
                      ไม่อนุญาต
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      กดเพื่อกลับไปที่ {info.clientName} โดยไม่เชื่อมต่อ
                    </p>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    หลังกดอนุญาต จะกลับไปที่ {info.redirectHost}
                  </p>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Link className="text-sm text-muted-foreground underline" href="/privacy">
        นโยบายความเป็นส่วนตัว
      </Link>
    </main>
  );
}
