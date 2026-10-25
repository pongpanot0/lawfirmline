import { PrismaService } from '../prisma/prisma.module';

export const DEFAULT_EMAIL_REPLY_HOURS = 24;

export interface AwaitingThreadInput {
  id: string;
  replyDismissedAt: Date | null;
}
export interface LatestMessage {
  id: string;
  threadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromAddress: string | null;
  receivedAt: Date;
}

/** Lower-cased addresses that count as "us": firm members' logins and the firm's connected mailboxes. */
export async function loadInternalAddresses(prisma: PrismaService, firmId: string): Promise<Set<string>> {
  const [members, mailboxes] = await Promise.all([
    prisma.firmMember.findMany({ where: { firmId }, select: { user: { select: { email: true } } } }),
    prisma.mailboxConnection.findMany({ where: { firmId }, select: { mailboxAddress: true } }),
  ]);
  return new Set([...members.map((m) => m.user.email), ...mailboxes.map((m) => m.mailboxAddress)].map((a) => a.trim().toLowerCase()));
}

/** Latest message per thread in ONE query (newest first, first seen wins). */
export async function loadLatestMessages(prisma: PrismaService, threadIds: string[]): Promise<Map<string, LatestMessage>> {
  if (threadIds.length === 0) return new Map();
  // DISTINCT ON in Postgres: Prisma's `distinct` dedupes in memory, which loaded every
  // message of every thread on each reminder run.
  const rows = await prisma.$queryRaw<LatestMessage[]>`
    SELECT DISTINCT ON ("threadId") "id", "threadId", "direction"::text AS "direction", "fromAddress", "receivedAt"
    FROM "EmailMessage"
    WHERE "threadId" = ANY(${threadIds}::text[])
    ORDER BY "threadId", "receivedAt" DESC`;
  return new Map(rows.map((r) => [r.threadId, r]));
}

/** The latest inbound message when the thread still waits for our reply, else null (see spec R "Definition"). */
export function awaitingMessage(thread: AwaitingThreadInput, latest: LatestMessage | undefined, internal: Set<string>): LatestMessage | null {
  if (!latest || latest.direction !== 'INBOUND') return null;
  if (latest.fromAddress && internal.has(latest.fromAddress.trim().toLowerCase())) return null;
  if (thread.replyDismissedAt && thread.replyDismissedAt >= latest.receivedAt) return null;
  return latest;
}
