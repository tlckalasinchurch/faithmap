import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { lineDispatches, notifications, users } from '@/server/db/schema';

export interface NotificationInput {
  userId: string;
  category: string;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  dedupeKey: string;
  sendLine?: boolean;
}

export async function dispatchNotification(
  db: FaithMapDb,
  input: NotificationInput
): Promise<void> {
  await db
    .insert(notifications)
    .values({
      userId: input.userId,
      channel: 'in_app',
      category: input.category,
      title: input.title,
      body: input.body,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing();

  if (!input.sendLine) return;

  const [userRow] = await db
    .select({ id: users.id, lineUserId: users.lineUserId, status: users.status })
    .from(users)
    .where(eq(users.id, input.userId));

  if (!userRow || userRow.status !== 'active') return;

  const lineDedupeKey = `line:${input.dedupeKey}`;
  if (!userRow.lineUserId) {
    await db
      .insert(lineDispatches)
      .values({
        userId: userRow.id,
        lineUserId: 'UNLINKED',
        category: input.category,
        messageText: `${input.title}\n${input.body}`,
        dedupeKey: lineDedupeKey,
        status: 'skipped_unlinked',
      })
      .onConflictDoNothing();
    return;
  }

  const channelToken = process.env.LINE_OA_CHANNEL_ACCESS_TOKEN;
  let status: 'sent' | 'simulated_sent' | 'failed' = 'simulated_sent';
  let providerResponse: Record<string, unknown> = { mode: 'simulated_no_token' };

  if (channelToken) {
    try {
      const resp = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelToken}`,
        },
        body: JSON.stringify({
          to: userRow.lineUserId,
          messages: [{ type: 'text', text: `[FaithMap] ${input.title}\n${input.body}` }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        status = 'sent';
        providerResponse = { status: resp.status };
      } else {
        status = 'failed';
        providerResponse = { status: resp.status, body: await resp.text() };
      }
    } catch (err) {
      status = 'failed';
      providerResponse = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  await db
    .insert(lineDispatches)
    .values({
      userId: userRow.id,
      lineUserId: userRow.lineUserId,
      category: input.category,
      messageText: `[FaithMap] ${input.title}\n${input.body}`,
      dedupeKey: lineDedupeKey,
      status,
      providerResponse,
      dispatchedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function listUserNotifications(db: FaithMapDb, userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(
  db: FaithMapDb,
  userId: string,
  notificationId: string
): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

export async function markAllNotificationsRead(db: FaithMapDb, userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
