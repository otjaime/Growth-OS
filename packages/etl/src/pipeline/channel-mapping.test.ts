// ──────────────────────────────────────────────────────────────
// Growth OS — Channel Mapping Unit Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { mapChannelFromOrder, mapGA4ChannelToSlug } from './channel-mapping.js';

describe('mapChannelFromOrder', () => {
  // UTM-based
  it('maps facebook UTM to meta', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'facebook', utmMedium: 'cpc' })).toBe('meta');
  });

  it('maps fb UTM to meta', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'fb', utmMedium: 'paid' })).toBe('meta');
  });

  it('maps instagram UTM to meta', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'instagram' })).toBe('meta');
  });

  it('maps google cpc to google', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'google', utmMedium: 'cpc' })).toBe('google');
  });

  it('maps google ppc to google', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'google', utmMedium: 'ppc' })).toBe('google');
  });

  it('maps google organic to organic', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'google', utmMedium: 'organic' })).toBe('organic');
  });

  it('maps klaviyo to email', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'klaviyo' })).toBe('email');
  });

  it('maps email medium to email', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'newsletter', utmMedium: 'email' })).toBe('email');
  });

  it('maps affiliate source to affiliate', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'affiliate_partner' })).toBe('affiliate');
  });

  it('maps referral medium to affiliate', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', utmSource: 'blog', utmMedium: 'referral' })).toBe('affiliate');
  });

  // Referring site based
  it('maps facebook.com referrer to meta', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', referringSite: 'https://facebook.com/post' })).toBe('meta');
  });

  it('maps instagram.com referrer to meta', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', referringSite: 'https://instagram.com/p/123' })).toBe('meta');
  });

  it('maps google.com referrer to organic', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', referringSite: 'https://google.com/search' })).toBe('organic');
  });

  // Source name based
  it('maps pos to direct', () => {
    expect(mapChannelFromOrder({ sourceName: 'pos' })).toBe('direct');
  });

  it('maps draft order to direct', () => {
    expect(mapChannelFromOrder({ sourceName: 'shopify_draft_order' })).toBe('direct');
  });

  // Fallback
  it('defaults to direct for unknown sources', () => {
    expect(mapChannelFromOrder({ sourceName: 'web' })).toBe('direct');
  });

  // Priority test: UTM beats referrer
  it('prefers UTM over referring site', () => {
    expect(mapChannelFromOrder({
      sourceName: 'web',
      utmSource: 'google',
      utmMedium: 'cpc',
      referringSite: 'https://facebook.com',
    })).toBe('google');
  });

  // Click ID based (auto-tagging)
  it('maps gclid to google (auto-tagging)', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', gclid: 'CjwKCAjw...' })).toBe('google');
  });

  it('maps gclid to google even with google.com referrer', () => {
    expect(mapChannelFromOrder({
      sourceName: 'web',
      referringSite: 'https://www.google.com/',
      gclid: 'CjwKCAjw...',
    })).toBe('google');
  });

  it('maps fbclid to meta (auto-tagging)', () => {
    expect(mapChannelFromOrder({ sourceName: 'web', fbclid: 'IwAR3...' })).toBe('meta');
  });

  it('gclid takes priority over UTM source', () => {
    expect(mapChannelFromOrder({
      sourceName: 'web',
      utmSource: 'newsletter',
      utmMedium: 'email',
      gclid: 'CjwKCAjw...',
    })).toBe('google');
  });

  it('google.com referrer without gclid maps to organic', () => {
    expect(mapChannelFromOrder({
      sourceName: 'web',
      referringSite: 'https://www.google.com/',
    })).toBe('organic');
  });
});

describe('mapGA4ChannelToSlug', () => {
  it('maps Paid Social to meta', () => {
    expect(mapGA4ChannelToSlug('Paid Social')).toBe('meta');
  });

  it('maps Paid Search to google', () => {
    expect(mapGA4ChannelToSlug('Paid Search')).toBe('google');
  });

  it('maps Paid Shopping to google', () => {
    expect(mapGA4ChannelToSlug('Paid Shopping')).toBe('google');
  });

  it('maps Organic Search to organic', () => {
    expect(mapGA4ChannelToSlug('Organic Search')).toBe('organic');
  });

  it('maps Organic Social to organic', () => {
    expect(mapGA4ChannelToSlug('Organic Social')).toBe('organic');
  });

  it('maps Email to email', () => {
    expect(mapGA4ChannelToSlug('Email')).toBe('email');
  });

  it('maps Referral to affiliate', () => {
    expect(mapGA4ChannelToSlug('Referral')).toBe('affiliate');
  });

  it('maps Direct to direct', () => {
    expect(mapGA4ChannelToSlug('Direct')).toBe('direct');
  });

  it('maps unknown to other', () => {
    expect(mapGA4ChannelToSlug('Cross-network')).toBe('other');
  });
});
