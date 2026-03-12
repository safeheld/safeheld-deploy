import crypto from 'crypto';
import { prisma } from './prisma';
import { logger } from './logger';

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function dispatchWebhooks(
  firmId: string,
  alertType: string,
  eventData: Record<string, unknown>,
): Promise<void> {
  try {
    const webhookSettings = await prisma.alertSetting.findMany({
      where: {
        firmId,
        alertType: alertType as any,
        channel: 'WEBHOOK',
        enabled: true,
        webhookUrl: { not: null },
      },
    });

    if (!webhookSettings.length) return;

    const payload: WebhookPayload = {
      event: alertType,
      timestamp: new Date().toISOString(),
      data: eventData,
    };

    const body = JSON.stringify(payload);

    for (const setting of webhookSettings) {
      if (!setting.webhookUrl) continue;

      try {
        // HMAC signature for webhook verification
        const signature = crypto
          .createHmac('sha256', firmId)
          .update(body)
          .digest('hex');

        const response = await fetch(setting.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Safeheld-Signature': signature,
            'X-Safeheld-Event': alertType,
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        logger.info(
          { firmId, alertType, webhookUrl: setting.webhookUrl, status: response.status },
          'Webhook dispatched',
        );
      } catch (err) {
        logger.error(
          { err, firmId, alertType, webhookUrl: setting.webhookUrl },
          'Webhook delivery failed',
        );
      }
    }
  } catch (err) {
    logger.error({ err, firmId, alertType }, 'Failed to dispatch webhooks');
  }
}
