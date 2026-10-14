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
  const rows = await prisma.emailMessage.findMany({
    where: { threadId: { in: threadIds } },
    distinct: ['threadId'],
    orderBy: [{ threadId: 'asc' }, { receivedAt: 'desc' }],
    select: { id: true, threadId: true, direction: true, fromAddress: true, receivedAt: true },
  });
  return new Map(rows.map((r) => [r.threadId, r as LatestMessage]));
}

/** The latest inbound message when the thread still waits for our reply, else null (see spec R "Definition"). */
export function awaitingMessage(thread: AwaitingThreadInput, latest: LatestMessage | undefined, internal: Set<string>): LatestMessage | null {
  if (!latest || latest.direction !== 'INBOUND') return null;
  if (latest.fromAddress && internal.has(latest.fromAddress.trim().toLowerCase())) return null;
  if (thread.replyDismissedAt && thread.replyDismissedAt >= latest.receivedAt) return null;
  return latest;
}
