"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CalendarClock,
  Eye,
  MessageSquare,
  PenLine,
  Plug,
  ShieldCheck,
  Sparkles,
  Terminal,
  Unplug,
} from "lucide-react";
import { hasFirmCapability, type MyMcpConnections } from "@lawfirm/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/lib/confirm-dialog";
import { relativeTimeTh } from "@/lib/relative-time";
import { AiBadge } from "@/components/AiBadge";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AiConnectionsSection() {
  const { token, user } = useAuth();
  const [data, setData] = useState<MyMcpConnections | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await api.getMyMcpConnections(token));
      setError("");
    } catch {
      setError("โหลดการเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setError("คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง");
    }
  };
  const revoke = async (id: string, name: string) => {
    if (
      !token ||
      !(await confirmDialog(
        `ยกเลิกการเชื่อมต่อ ${name}?\n${name} จะอ่านหรือบันทึกข้อมูลใน Samnuan ไม่ได้อีก ถ้าต้องการใช้ต่อต้องเชื่อมต่อใหม่`,
        { action: "ยกเลิกการเชื่อมต่อ", cancel: "ไม่ยกเลิก", danger: true },
      ))
    )
      return;
    setBusy(true);
    try {
      await api.revokeMyMcpConnection(token, id);
      await load();
    } catch {
      setError("ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <Card>
        <CardContent className="p-6">
          {error ? (
            <p role="alert">
              {error}{" "}
              <button className="underline" onClick={() => void load()}>
                ลองใหม่อีกครั้ง
              </button>
            </p>
          ) : (
            "กำลังโหลดการเชื่อมต่อ..."
          )}
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-6">
      <Card className="bg-muted/50 shadow-sm">
        <CardContent className="space-y-6 p-6">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold">
                ใช้ Claude หรือ Codex ทำงานกับคดีใน Samnuan
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                เชื่อมต่อครั้งเดียว แล้วสั่งงานจากแชท AI ได้เลย — ค้นคดี
                อ่านเอกสาร สร้างงาน ลงโน้ต และลงเวลา AI
                เห็นเฉพาะคดีที่คุณรับผิดชอบหรือมีงานอยู่
              </p>
            </div>
          </div>
          {!data.enabled ? (
            <p>
              เจ้าของสำนักงานยังไม่ได้เปิดให้เชื่อมต่อ AI —
              ขอให้เจ้าของสำนักงานเปิดที่{" "}
              {hasFirmCapability(user?.firmRole, "manageAiConnections") ? (
                <Link
                  className="text-primary underline"
                  href="/settings?view=office"
                >
                  ตั้งค่าสำนักงาน › AI ของทนาย
                </Link>
              ) : (
                "ตั้งค่าสำนักงาน › AI ของทนาย"
              )}
            </p>
          ) : (
            <ol className="ml-3 space-y-6 border-l pl-6">
              <li className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border bg-background text-sm font-semibold"
                >
                  1
                </span>
                <h3 className="font-semibold">คัดลอกที่อยู่สำหรับเชื่อมต่อ</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    aria-label="ที่อยู่สำหรับเชื่อมต่อ"
                    readOnly
                    value={data.mcpUrl}
                    className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm"
                  />
                  <Button onClick={() => void copy(data.mcpUrl, "url")}>
                    {copied === "url" ? "คัดลอกแล้ว" : "คัดลอกที่อยู่"}
                  </Button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  ใช้วางในแอป AI ตามขั้นที่ 2
                </p>
              </li>
              <li className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border bg-background text-sm font-semibold"
                >
                  2
                </span>
                <h3 className="font-semibold">ตั้งค่าในแอป AI ที่ใช้</h3>
                <div
                  className="mt-2 grid grid-cols-3 rounded-md border bg-background p-1"
                  role="group"
                  aria-label="เลือกแอป AI"
                >
                  {["Claude (เว็บและแอป)", "Claude Code", "Codex"].map(
                    (label, i) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={tab === i}
                        onClick={() => setTab(i)}
                        className={`min-h-11 rounded px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === i ? "bg-muted font-semibold" : ""}`}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
                <div className="mt-3 space-y-2 rounded-md border bg-background p-4 text-sm">
                  {tab === 0 ? (
                    <>
                      <p>1) ใน Claude ไปที่ Settings › Connectors</p>
                      <p>2) กด Add custom connector แล้ววางที่อยู่</p>
                      <p>3) กด Connect</p>
                    </>
                  ) : (
                    (tab === 1
                      ? [
                          `claude mcp add --transport http samnuan ${data.mcpUrl}`,
                        ]
                      : [
                          `codex mcp add samnuan --url ${data.mcpUrl}`,
                          "codex mcp login samnuan",
                        ]
                    ).map((command, i) => (
                      <div
                        className="flex flex-wrap items-center gap-2"
                        key={command}
                      >
                        <code className="min-w-0 flex-1 break-all rounded bg-muted p-3">
                          {command}
                        </code>
                        <Button
                          variant="outline"
                          onClick={() => void copy(command, `command${i}`)}
                        >
                          {copied === `command${i}`
                            ? "คัดลอกแล้ว"
                            : "คัดลอกคำสั่ง"}
                        </Button>
                      </div>
                    ))
                  )}
                  {tab === 1 && (
                    <p>พิมพ์ /mcp แล้วเลือก samnuan เพื่อเข้าสู่ระบบ</p>
                  )}
                </div>
              </li>
              <li className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border bg-background text-sm font-semibold"
                >
                  3
                </span>
                <h3 className="font-semibold">เข้าสู่ระบบและกดอนุญาต</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  หน้า Samnuan จะเปิดขึ้นให้ยืนยันว่าอนุญาตให้ AI
                  เข้าถึงข้อมูลของคุณ
                </p>
              </li>
            </ol>
          )}
        </CardContent>
      </Card>
      {data.enabled && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-display">AI ทำอะไรได้บ้าง</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: "อ่าน",
                    desc: "คดี เอกสาร นัด และงานที่คุณรับผิดชอบหรือมีงานอยู่ — ไม่เห็นงานของคนอื่น",
                    icon: Eye,
                  },
                  {
                    title: "บันทึก",
                    desc: "สร้างและปิดงาน ลงโน้ตในคดี ลงเวลา — ติดป้ายให้ทีมเห็น",
                    icon: PenLine,
                  },
                  {
                    title: "เสนอวันนัดศาล",
                    desc: "เข้าปฏิทินเมื่อคุณกดรับในหน้าคดีแล้วเท่านั้น",
                    icon: CalendarClock,
                  },
                  {
                    title: "ทำไม่ได้",
                    desc: "แก้หรือลบข้อมูล อัปโหลดเอกสาร",
                    icon: Ban,
                  },
                ].map(({ title, desc, icon: Icon }) => (
                  <div
                    key={title}
                    className="rounded-lg border bg-muted/30 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Icon
                          aria-hidden
                          className={`h-5 w-5 ${title === "ทำไม่ได้" ? "text-slate-500" : "text-primary"}`}
                        />
                        {title}
                      </h3>
                      {title === "บันทึก" && <AiBadge />}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="flex items-start gap-3 rounded-md border p-3 text-sm text-muted-foreground">
                <ShieldCheck
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-primary"
                />
                ข้อมูลที่ AI อ่านจะส่งไปยังผู้ให้บริการ AI ตามบัญชีของคุณ
                (Anthropic หรือ OpenAI) ใช้ตามนโยบายของสำนักงาน
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display">
                แอปที่เชื่อมต่ออยู่ ({data.connections.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                AI จะเข้าถึงข้อมูลไม่ได้ทันทีเมื่อยกเลิกการเชื่อมต่อ
              </p>
            </CardHeader>
            <CardContent>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              {data.connections.length === 0 ? (
                <p>ยังไม่มีแอปที่เชื่อมต่อ — เริ่มเชื่อมต่อตามขั้นตอนด้านบน</p>
              ) : (
                <ul className="divide-y">
                  {data.connections.map((c) => {
                    const Icon = /claude/i.test(c.clientName)
                      ? MessageSquare
                      : /codex/i.test(c.clientName)
                        ? Terminal
                        : Plug;
                    return (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center gap-3 py-4"
                      >
                        <span className="rounded-md border p-2">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong>{c.clientName}</strong>{" "}
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                            เชื่อมต่ออยู่
                          </span>
                          <p className="text-sm text-muted-foreground">
                            เชื่อมต่อเมื่อ {formatDate(c.createdAt)} · ใช้ล่าสุด{" "}
                            {relativeTimeTh(
                              c.lastUsedAt,
                              new Date(),
                              "ยังไม่เคยใช้",
                            )}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={busy}
                          aria-label={`ยกเลิกการเชื่อมต่อ ${c.clientName}`}
                          onClick={() => void revoke(c.id, c.clientName)}
                        >
                          <Unplug aria-hidden className="mr-2 h-4 w-4" />
                          ยกเลิกการเชื่อมต่อ
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-sm text-muted-foreground">
                การเชื่อมต่อที่ไม่ได้ใช้ 90 วันจะหมดอายุ ต้องเข้าสู่ระบบใหม่
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
