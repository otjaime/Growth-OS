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

// ── WBR Slack Message ──────────────────────────────────────

export interface WBRSlackPayload {
  weekLabel: string;
  revenue: number;
  revenueChange: number;
  orders: number;
  ordersChange: number;
  cac: number;
  mer: number;
  cmPct: number;
  alertCount: number;
  criticalAlerts: string[];
  pendingSuggestions: number;
  runningExperiments: number;
  dashboardUrl: string;
}

function arrow(change: number): string {
  return change >= 0 ? ':chart_with_upwards_trend:' : ':chart_with_downwards_trend:';
}

function pctStr(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${(change * 100).toFixed(1)}%`;
}

export async function sendWBRToSlack(payload: WBRSlackPayload): Promise<boolean> {
  if (!isSlackConfigured()) return false;

  const kpiLine = [
    `*Revenue*: $${(payload.revenue / 1000).toFixed(1)}K ${arrow(payload.revenueChange)} ${pctStr(payload.revenueChange)} WoW`,
    `*Orders*: ${payload.orders} ${arrow(payload.ordersChange)} ${pctStr(payload.ordersChange)} WoW`,
    `*CAC*: $${payload.cac.toFixed(0)}`,
    `*MER*: ${payload.mer.toFixed(2)}x`,
    `*CM%*: ${(payload.cmPct * 100).toFixed(1)}%`,
  ].join('\n');

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `:bar_chart: Weekly Business Review — ${payload.weekLabel}`, emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: kpiLine },
    },
  ];

  if (payload.criticalAlerts.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:rotating_light: *${payload.criticalAlerts.length} Critical Alert${payload.criticalAlerts.length !== 1 ? 's' : ''}*\n${payload.criticalAlerts.map((a) => `• ${a}`).join('\n')}`,
      },
    });
  } else if (payload.alertCount > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:warning: ${payload.alertCount} alert${payload.alertCount !== 1 ? 's' : ''} this week` }],
    });
  }

  const statusParts: string[] = [];
  if (payload.runningExperiments > 0) {
    statusParts.push(`:test_tube: ${payload.runningExperiments} experiment${payload.runningExperiments !== 1 ? 's' : ''} running`);
  }
  if (payload.pendingSuggestions > 0) {
    statusParts.push(`:bulb: ${payload.pendingSuggestions} suggestion${payload.pendingSuggestions !== 1 ? 's' : ''} pending`);
  }
  if (statusParts.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: statusParts.join('  •  ') }],
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `<${payload.dashboardUrl}/wbr|:arrow_right: View full WBR in Growth OS>` },
  });

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

// ── Autopilot Slack Notifications ─────────────────────────

export interface AutopilotPendingPayload {
  total: number;
  critical: number;
  warning: number;
  info: number;
  dashboardUrl: string;
}

export async function sendAutopilotPendingToSlack(
  payload: AutopilotPendingPayload,
): Promise<boolean> {
  if (!isSlackConfigured() || payload.total === 0) return false;

  const severityParts: string[] = [];
  if (payload.critical > 0) severityParts.push(`${payload.critical} critical`);
  if (payload.warning > 0) severityParts.push(`${payload.warning} warning`);
  if (payload.info > 0) severityParts.push(`${payload.info} info`);

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:bell: *Autopilot — ${payload.total} diagnosis${payload.total !== 1 ? 'es' : ''} pending approval*\n${severityParts.join(', ')}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${payload.dashboardUrl}/autopilot|:arrow_right: Review in Growth OS>`,
      },
    },
  ];

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

export interface AutopilotActionsPayload {
  total: number;
  actions: ReadonlyArray<{
    actionType: string;
    adName: string;
    before: string;
    after: string;
  }>;
  dashboardUrl: string;
}

export async function sendAutopilotActionsToSlack(
  payload: AutopilotActionsPayload,
): Promise<boolean> {
  if (!isSlackConfigured() || payload.total === 0) return false;

  const actionLines = payload.actions
    .slice(0, 10) // Cap at 10 to avoid Slack block limits
    .map((a) => `• *${a.actionType}* on _${a.adName}_ — ${a.before} :arrow_right: ${a.after}`)
    .join('\n');

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:zap: *Autopilot executed ${payload.total} action${payload.total !== 1 ? 's' : ''}*`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: actionLines },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${payload.dashboardUrl}/autopilot|:arrow_right: View details & undo in Growth OS>`,
      },
    },
  ];

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

export interface AutopilotDigestPayload {
  period: string;
  actionsAutoCount: number;
  actionsManualCount: number;
  netBudgetChange: number;
  adsPaused: number;
  adsReactivated: number;
  pendingApprovals: number;
  circuitBreakerTripped: boolean;
  dashboardUrl: string;
}

export async function sendAutopilotDigestToSlack(
  payload: AutopilotDigestPayload,
): Promise<boolean> {
  if (!isSlackConfigured()) return false;

  const totalActions = payload.actionsAutoCount + payload.actionsManualCount;

  const statLines = [
    `*Actions*: ${totalActions} (${payload.actionsAutoCount} auto, ${payload.actionsManualCount} manual)`,
    `*Ads paused*: ${payload.adsPaused} | *Reactivated*: ${payload.adsReactivated}`,
    `*Net budget change*: ${payload.netBudgetChange >= 0 ? '+' : ''}$${payload.netBudgetChange.toFixed(2)}/day`,
    `*Pending approvals*: ${payload.pendingApprovals}`,
  ];

  if (payload.circuitBreakerTripped) {
    statLines.push(':rotating_light: *Circuit breaker is TRIPPED* — auto mode suspended');
  }

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `:robot_face: Autopilot Daily Digest — ${payload.period}`, emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: statLines.join('\n') },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${payload.dashboardUrl}/autopilot|:arrow_right: View full autopilot report in Growth OS>`,
      },
    },
  ];

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
