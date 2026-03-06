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

import { generateProductCopy, type ProductCopyInput } from './product-copy-generator.js';

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
      /Expected 3 copy variants, got 1/,
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
    expect(userMsg).toContain('25% of buyers come back');
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
    expect(userMsg).not.toContain('buyers come back');
  });
});
