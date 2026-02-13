// ──────────────────────────────────────────────────────────────
// Growth OS — AI Module
// Thin wrapper around OpenAI for LLM-powered analytics
// Gracefully disabled when OPENAI_API_KEY is not configured
// ──────────────────────────────────────────────────────────────

import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const model = process.env.AI_MODEL ?? 'gpt-4o-mini';

export function isAIConfigured(): boolean {
  return apiKey.length > 0;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface WbrAIContext {
  weekLabel: string;
  current: {
    revenue: number;
    revenueNet: number;
    orders: number;
    newCustomers: number;
    spend: number;
    cac: number;
    mer: number;
    cmPct: number;
    aov: number;
    sessions: number;
  };
  previous: {
    revenue: number;
    orders: number;
    newCustomers: number;
    spend: number;
    cac: number;
    cmPct: number;
  };
  channels: Array<{
    name: string;
    currentSpend: number;
    currentRevenue: number;
    previousSpend: number;
    previousRevenue: number;
    currentNewCustomers: number;
  }>;
  alerts: Array<{
    severity: string;
    title: string;
    description: string;
    recommendation: string;
  }>;
  cohort: {
    ltvCacRatio: number;
    paybackDays: number | null;
    ltv90: number;
    d30Retention: number;
  } | null;
}

const SYSTEM_PROMPT = `You are a senior growth analyst writing a Weekly Business Review (WBR) for a DTC e-commerce executive team. Write in a concise, data-driven style suitable for a board presentation.

Rules:
- Use markdown formatting with ## headings for sections
- Include specific numbers (revenue, CAC, MER, etc.) in **bold**
- Be actionable — every insight should lead to a recommendation
- Flag risks with severity (critical vs. monitoring)
- Write in third person ("Revenue was..." not "We saw...")
- Keep it under 500 words total
- Use these sections: What Happened, Key Drivers, Channel Performance, Risks & Alerts, Unit Economics, Next Week Priorities
- For numbers: use $XK for thousands, $XM for millions, round to 1 decimal
- Percentages: show as X.X% with WoW change direction (↑/↓)
- Be honest about bad metrics — don't sugarcoat declines`;

export async function generateWBRNarrative(
  context: WbrAIContext,
): Promise<AsyncIterable<string>> {
  const ai = getClient();

  const dataPrompt = `Here is this week's business data:

**Period**: ${context.weekLabel}

**This Week vs Last Week:**
- Revenue: $${context.current.revenue.toFixed(0)} (prev: $${context.previous.revenue.toFixed(0)})
- Orders: ${context.current.orders} (prev: ${context.previous.orders})
- New Customers: ${context.current.newCustomers} (prev: ${context.previous.newCustomers})
- Ad Spend: $${context.current.spend.toFixed(0)} (prev: $${context.previous.spend.toFixed(0)})
- Blended CAC: $${context.current.cac.toFixed(0)} (prev: $${context.previous.cac.toFixed(0)})
- MER: ${context.current.mer.toFixed(2)}x
- CM%: ${(context.current.cmPct * 100).toFixed(1)}% (prev: ${(context.previous.cmPct * 100).toFixed(1)}%)
- AOV: $${context.current.aov.toFixed(0)}
- Sessions: ${context.current.sessions.toLocaleString()}

**Channel Breakdown:**
${context.channels.map((ch) => `- ${ch.name}: Spend $${ch.currentSpend.toFixed(0)} (prev $${ch.previousSpend.toFixed(0)}) | Revenue $${ch.currentRevenue.toFixed(0)} (prev $${ch.previousRevenue.toFixed(0)}) | New Customers: ${ch.currentNewCustomers}`).join('\n')}

**Active Alerts (${context.alerts.length}):**
${context.alerts.length > 0 ? context.alerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.description}`).join('\n') : '- No alerts this week.'}

**Unit Economics:**
${context.cohort ? `- LTV:CAC Ratio: ${context.cohort.ltvCacRatio.toFixed(1)}x
- Payback Period: ${context.cohort.paybackDays ?? 'N/A'} days
- LTV (90-day): $${context.cohort.ltv90.toFixed(0)}
- D30 Retention: ${(context.cohort.d30Retention * 100).toFixed(1)}%` : '- No cohort data available.'}

Write the Weekly Business Review:`;

  const stream = await ai.chat.completions.create({
    model,
    stream: true,
    temperature: 0.3,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: dataPrompt },
    ],
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
  };
}

export async function generateAlertExplanation(
  alert: { title: string; description: string; severity: string },
  metricsContext: string,
): Promise<string> {
  const ai = getClient();

  const response = await ai.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content: 'You are a growth analytics expert. Given an alert and its context, provide a brief root cause analysis and 2-3 specific actionable recommendations. Keep it under 100 words. Be direct.',
      },
      {
        role: 'user',
        content: `Alert: [${alert.severity}] ${alert.title}\nDescription: ${alert.description}\n\nContext:\n${metricsContext}\n\nProvide root cause analysis and recommendations:`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? 'Unable to generate analysis.';
}

export async function answerDataQuestion(
  question: string,
  dataContext: string,
): Promise<AsyncIterable<string>> {
  const ai = getClient();

  const stream = await ai.chat.completions.create({
    model,
    stream: true,
    temperature: 0.3,
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content: `You are an AI analytics assistant for Growth OS, a DTC e-commerce dashboard. Answer questions about the business data concisely and accurately. Always reference specific numbers. If you can't answer from the data provided, say so. Use markdown formatting.`,
      },
      {
        role: 'user',
        content: `Here is the current business data:\n\n${dataContext}\n\nQuestion: ${question}`,
      },
    ],
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
  };
}
