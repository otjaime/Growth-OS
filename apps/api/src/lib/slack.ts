// ──────────────────────────────────────────────────────────────
// Growth OS — Slack Integration
// Sends alert notifications via Slack Incoming Webhook
// Gracefully disabled when SLACK_WEBHOOK_URL is not configured
// ──────────────────────────────────────────────────────────────

const webhookUrl = process.env.SLACK_WEBHOOK_URL ?? '';

export function isSlackConfigured(): boolean {
  return webhookUrl.length > 0 && webhookUrl.startsWith('https://');
}

interface SlackAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':rotating_light:',
  warning: ':warning:',
  info: ':information_source:',
};

export async function sendAlertToSlack(
  alerts: SlackAlert[],
  dashboardUrl?: string,
): Promise<boolean> {
  if (!isSlackConfigured() || alerts.length === 0) return false;

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  const headerEmoji = criticalCount > 0 ? ':rotating_light:' : ':warning:';
  const headerText = `${headerEmoji} *Growth OS — ${alerts.length} Alert${alerts.length !== 1 ? 's' : ''}* (${criticalCount} critical, ${warningCount} warning)`;

  const alertBlocks = alerts.map((a) => {
    const emoji = SEVERITY_EMOJI[a.severity] ?? ':grey_question:';
    return `${emoji} *${a.title}*\n${a.description}\n_${a.recommendation}_`;
  }).join('\n\n');

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headerText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: alertBlocks },
    },
  ];

  if (dashboardUrl) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${dashboardUrl}/alerts|View in Growth OS>` },
    });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTestSlackMessage(): Promise<boolean> {
  if (!isSlackConfigured()) return false;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: ':white_check_mark: Growth OS — Slack integration is working!',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
