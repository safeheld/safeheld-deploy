import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';

export interface NotificationPreferences {
  email: {
    breachAlerts: boolean;
    reconSummary: boolean | string;
    remediationReminders: boolean;
    certExpiry: boolean;
    fcaDeadlines: boolean;
    letterExpiry: boolean;
  };
  inApp: {
    breachAlerts: boolean;
    reconSummary: boolean;
    remediationReminders: boolean;
    certExpiry: boolean;
    fcaDeadlines: boolean;
    letterExpiry: boolean;
  };
  frequency: 'realtime' | 'daily' | 'weekly';
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: {
    breachAlerts: true,
    reconSummary: 'daily',
    remediationReminders: true,
    certExpiry: true,
    fcaDeadlines: true,
    letterExpiry: true,
  },
  inApp: {
    breachAlerts: true,
    reconSummary: true,
    remediationReminders: true,
    certExpiry: true,
    fcaDeadlines: true,
    letterExpiry: true,
  },
  frequency: 'realtime',
};

/**
 * Count unread notifications (audit log entries) for the current user.
 * Uses AuditLog as a proxy — "unread" means entries the user hasn't marked read.
 * We track read state via the user's lastNotificationReadAt timestamp stored in preferences.
 */
export async function getUnreadCount(userId: string, firmId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });

  const prefs = (user?.notificationPreferences as Record<string, unknown>) || {};
  const lastReadAt = prefs.lastReadAt ? new Date(prefs.lastReadAt as string) : new Date(0);

  const count = await prisma.auditLog.count({
    where: {
      firmId,
      createdAt: { gt: lastReadAt },
    },
  });

  return count;
}

/**
 * Get paginated notifications (audit log entries) for the user's firm.
 */
export async function getNotifications(
  userId: string,
  firmId: string,
  page: number,
  pageSize: number
): Promise<{ notifications: unknown[]; total: number }> {
  const skip = (page - 1) * pageSize;

  const [notifications, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        details: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where: { firmId } }),
  ]);

  // Determine read state based on user's lastReadAt
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });
  const prefs = (user?.notificationPreferences as Record<string, unknown>) || {};
  const lastReadAt = prefs.lastReadAt ? new Date(prefs.lastReadAt as string) : new Date(0);

  const enriched = notifications.map((n) => ({
    ...n,
    read: new Date(n.createdAt) <= lastReadAt,
  }));

  return { notifications: enriched, total };
}

/**
 * Mark a single notification as read.
 * Since we use AuditLog as proxy, we update lastReadAt to the notification's createdAt
 * if it's newer than the current lastReadAt.
 */
export async function markRead(notificationId: string, userId: string): Promise<void> {
  const notification = await prisma.auditLog.findUnique({
    where: { id: notificationId },
    select: { createdAt: true },
  });

  if (!notification) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });

  const prefs = ((user?.notificationPreferences as Record<string, unknown>) || {});
  const lastReadAt = prefs.lastReadAt ? new Date(prefs.lastReadAt as string) : new Date(0);

  if (notification.createdAt > lastReadAt) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        notificationPreferences: {
          ...prefs,
          lastReadAt: notification.createdAt.toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  logger.debug({ notificationId, userId }, 'Notification marked as read');
}

/**
 * Mark all notifications as read by setting lastReadAt to now.
 */
export async function markAllRead(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });

  const prefs = ((user?.notificationPreferences as Record<string, unknown>) || {});

  await prisma.user.update({
    where: { id: userId },
    data: {
      notificationPreferences: {
        ...prefs,
        lastReadAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  logger.debug({ userId }, 'All notifications marked as read');
}

/**
 * Get notification preferences for the user. Returns defaults if none set.
 */
export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });

  if (!user?.notificationPreferences) {
    // Store defaults and return them
    await prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: DEFAULT_PREFERENCES as unknown as Prisma.InputJsonValue },
    });
    return DEFAULT_PREFERENCES;
  }

  const stored = user.notificationPreferences as Record<string, unknown>;
  return {
    email: (stored.email as NotificationPreferences['email']) || DEFAULT_PREFERENCES.email,
    inApp: (stored.inApp as NotificationPreferences['inApp']) || DEFAULT_PREFERENCES.inApp,
    frequency: (stored.frequency as NotificationPreferences['frequency']) || DEFAULT_PREFERENCES.frequency,
  };
}

/**
 * Update notification preferences for the user.
 */
export async function updatePreferences(
  userId: string,
  prefs: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const current = await getPreferences(userId);

  const merged = {
    email: prefs.email ? { ...current.email, ...prefs.email } : current.email,
    inApp: prefs.inApp ? { ...current.inApp, ...prefs.inApp } : current.inApp,
    frequency: prefs.frequency || current.frequency,
  };

  // Preserve lastReadAt from existing stored prefs
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });
  const stored = (user?.notificationPreferences as Record<string, unknown>) || {};

  await prisma.user.update({
    where: { id: userId },
    data: {
      notificationPreferences: {
        ...merged,
        lastReadAt: stored.lastReadAt || new Date(0).toISOString(),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info({ userId }, 'Notification preferences updated');
  return merged;
}
