import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  isAIConfigured: vi.fn(),
  getClient: vi.fn(),
  AI_MODEL: 'gpt-4o-mini',
}));

vi.mock('./ai.js', () => ({
  isAIConfigured: mocks.isAIConfigured,
  getClient: mocks.getClient,
  AI_MODEL: mocks.AI_MODEL,
}));

import { generateProductCopy, CURRENCY_LANGUAGE_MAP, type ProductCopyInput } from './product-copy-generator.js';

const BASE_INPUT: ProductCopyInput = {
  productTitle: 'Glow Serum',
  productType: 'beauty',
  productDescription: 'A hydrating vitamin C serum for radiant skin',
  avgPrice: 45,
  margin: 0.62,
  repeatBuyerPct: 0.18,
  adFitnessScore: 82,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateProductCopy', () => {
  // ── Demo mode ────────────────────────────────────────────────
  it('returns 3 hardcoded demo variants with correct angles when AI is not configured', async () => {
    mocks.isAIConfigured.mockReturnValue(false);

    const variants = await generateProductCopy(BASE_INPUT);

    expect(variants).toHaveLength(3);
    const angles = variants.map((v) => v.angle);
    expect(angles).toContain('benefit');
    expect(angles).toContain('pain_point');
    expect(angles).toContain('urgency');
    // Each variant should have headline, primaryText, description
    for (const v of variants) {
      expect(v.headline).toBeTruthy();
      expect(v.primaryText).toBeTruthy();
      expect(v.description).toBeTruthy();
    }
  });

  // ── AI mode ──────────────────────────────────────────────────
  it('calls OpenAI with correct prompt containing product details', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'Glow like never before', primaryText: 'Radiant skin starts here', description: 'Shop now' },
              { angle: 'pain_point', headline: 'Dull skin?', primaryText: 'Fix it with vitamin C', description: 'Try today' },
              { angle: 'urgency', headline: 'Selling fast', primaryText: 'Only a few left in stock', description: 'Limited' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await generateProductCopy(BASE_INPUT);

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0]![0];
    const userMsg = call.messages.find((m: { role: string }) => m.role === 'user')?.content;
    expect(userMsg).toContain('Glow Serum');
    expect(userMsg).toContain('beauty');
    expect(userMsg).toContain('$45');
    expect(userMsg).toContain('62%');
  });

  it('truncates headline to max 40 characters', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const longHeadline = 'This is an extremely long headline that definitely exceeds forty characters and should be cut';
    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: longHeadline, primaryText: 'Text', description: 'Desc' },
              { angle: 'pain_point', headline: 'Short', primaryText: 'Text', description: 'Desc' },
              { angle: 'urgency', headline: 'Also short', primaryText: 'Text', description: 'Desc' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    const variants = await generateProductCopy(BASE_INPUT);

    expect(variants[0]!.headline.length).toBeLessThanOrEqual(40);
  });

  it('truncates description to max 30 characters', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const longDesc = 'This description is way too long for a CTA line';
    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'H1', primaryText: 'Text', description: longDesc },
              { angle: 'pain_point', headline: 'H2', primaryText: 'Text', description: 'OK' },
              { angle: 'urgency', headline: 'H3', primaryText: 'Text', description: 'OK' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    const variants = await generateProductCopy(BASE_INPUT);

    expect(variants[0]!.description.length).toBeLessThanOrEqual(30);
  });

  it('throws meaningful error on JSON parse failure from AI', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [{ message: { content: 'This is not valid JSON at all' } }],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await expect(generateProductCopy(BASE_INPUT)).rejects.toThrow(
      /Failed to parse AI copy response/,
    );
  });

  it('throws when AI returns fewer than 3 variants', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'H', primaryText: 'P', description: 'D' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await expect(generateProductCopy(BASE_INPUT)).rejects.toThrow(
      /Expected \d+ copy variants, got 1/,
    );
  });

  it('includes repeat buyer context when repeatBuyerPct > 10%', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'H1', primaryText: 'P1', description: 'D1' },
              { angle: 'pain_point', headline: 'H2', primaryText: 'P2', description: 'D2' },
              { angle: 'urgency', headline: 'H3', primaryText: 'P3', description: 'D3' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await generateProductCopy({ ...BASE_INPUT, repeatBuyerPct: 0.25 });

    const userMsg = mockCreate.mock.calls[0]![0].messages.find(
      (m: { role: string }) => m.role === 'user',
    )?.content;
    expect(userMsg).toContain('Repeat buyer rate: 25%');
  });

  it('does not include repeat buyer context when repeatBuyerPct <= 10%', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'H1', primaryText: 'P1', description: 'D1' },
              { angle: 'pain_point', headline: 'H2', primaryText: 'P2', description: 'D2' },
              { angle: 'urgency', headline: 'H3', primaryText: 'P3', description: 'D3' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await generateProductCopy({ ...BASE_INPUT, repeatBuyerPct: 0.08 });

    const userMsg = mockCreate.mock.calls[0]![0].messages.find(
      (m: { role: string }) => m.role === 'user',
    )?.content;
    expect(userMsg).not.toContain('Repeat buyer rate');
  });

  // ── Language support ─────────────────────────────────────────
  it('returns Spanish demo variants when language is "es" and AI is not configured', async () => {
    mocks.isAIConfigured.mockReturnValue(false);

    const variants = await generateProductCopy({ ...BASE_INPUT, language: 'es' });

    expect(variants).toHaveLength(3);
    // Spanish demo copy should contain Spanish words
    expect(variants[0]!.description).toBe('Comprar ahora');
    expect(variants[1]!.description).toBe('Pruébalo hoy');
    expect(variants[2]!.description).toBe('Stock limitado');
  });

  it('returns Portuguese demo variants when language is "pt" and AI is not configured', async () => {
    mocks.isAIConfigured.mockReturnValue(false);

    const variants = await generateProductCopy({ ...BASE_INPUT, language: 'pt' });

    expect(variants).toHaveLength(3);
    expect(variants[0]!.description).toBe('Compre agora');
  });

  it('falls back to English demo when language is unknown and AI is not configured', async () => {
    mocks.isAIConfigured.mockReturnValue(false);

    const variants = await generateProductCopy({ ...BASE_INPUT, language: 'zh' });

    expect(variants).toHaveLength(3);
    expect(variants[0]!.description).toBe('Shop now');
  });

  it('includes Spanish language instruction in AI prompt when language is "es"', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'H1', primaryText: 'P1', description: 'D1' },
              { angle: 'pain_point', headline: 'H2', primaryText: 'P2', description: 'D2' },
              { angle: 'urgency', headline: 'H3', primaryText: 'P3', description: 'D3' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await generateProductCopy({ ...BASE_INPUT, language: 'es', currencySymbol: '$' });

    const call = mockCreate.mock.calls[0]![0];
    // System prompt should mention Spanish
    const sysMsg = call.messages.find((m: { role: string }) => m.role === 'system')?.content;
    expect(sysMsg).toContain('Spanish');
    // User prompt should also include language instruction
    const userMsg = call.messages.find((m: { role: string }) => m.role === 'user')?.content;
    expect(userMsg).toContain('Spanish');
  });

  it('does not include language instruction in prompts when language is "en"', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { angle: 'benefit', headline: 'H1', primaryText: 'P1', description: 'D1' },
              { angle: 'pain_point', headline: 'H2', primaryText: 'P2', description: 'D2' },
              { angle: 'urgency', headline: 'H3', primaryText: 'P3', description: 'D3' },
            ]),
          },
        },
      ],
    });
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    await generateProductCopy({ ...BASE_INPUT, language: 'en' });

    const call = mockCreate.mock.calls[0]![0];
    const sysMsg = call.messages.find((m: { role: string }) => m.role === 'system')?.content;
    // Should NOT contain language-specific instruction for English
    expect(sysMsg).not.toContain('CRITICAL LANGUAGE RULE: Write ALL copy');
  });
});

describe('CURRENCY_LANGUAGE_MAP', () => {
  it('maps CLP to Spanish', () => {
    const info = CURRENCY_LANGUAGE_MAP.CLP;
    expect(info).toBeDefined();
    expect(info!.language).toBe('es');
    expect(info!.symbol).toBe('$');
  });

  it('maps BRL to Portuguese', () => {
    const info = CURRENCY_LANGUAGE_MAP.BRL;
    expect(info).toBeDefined();
    expect(info!.language).toBe('pt');
    expect(info!.symbol).toBe('R$');
  });

  it('maps USD to English', () => {
    const info = CURRENCY_LANGUAGE_MAP.USD;
    expect(info).toBeDefined();
    expect(info!.language).toBe('en');
  });
});
