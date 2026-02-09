// ──────────────────────────────────────────────────────────────
// Growth OS — Channel Mapping
// Maps raw source data to standardized channel slugs
// ──────────────────────────────────────────────────────────────

export interface OrderChannelInput {
  sourceName: string;
  utmSource?: string;
  utmMedium?: string;
  referringSite?: string;
}

/**
 * Maps Shopify order attributes to a channel slug.
 * Priority: UTM params > referring site > source name > fallback
 */
export function mapChannelFromOrder(input: OrderChannelInput): string {
  const { utmSource, utmMedium, referringSite, sourceName } = input;
  const src = (utmSource ?? '').toLowerCase();
  const med = (utmMedium ?? '').toLowerCase();
  const ref = (referringSite ?? '').toLowerCase();

  // UTM-based mapping (highest priority)
  if (src) {
    if (src.includes('facebook') || src.includes('fb') || src.includes('instagram') || src.includes('ig')) {
      return 'meta';
    }
    if (src.includes('google') && (med === 'cpc' || med === 'ppc')) {
      return 'google';
    }
    if (src.includes('google') && med === 'organic') {
      return 'organic';
    }
    if (src.includes('klaviyo') || src.includes('mailchimp') || med === 'email') {
      return 'email';
    }
    if (src.includes('affiliate') || med === 'referral') {
      return 'affiliate';
    }
  }

  // Referring site based
  if (ref) {
    if (ref.includes('facebook.com') || ref.includes('instagram.com')) return 'meta';
    if (ref.includes('google.com') && med !== 'cpc') return 'organic';
    if (ref.includes('google.com') && med === 'cpc') return 'google';
  }

  // Source name based
  if (sourceName === 'pos') return 'direct';
  if (sourceName === 'shopify_draft_order') return 'direct';

  return 'direct';
}

/**
 * Maps GA4 sessionDefaultChannelGroup to our channel slugs
 */
export function mapGA4ChannelToSlug(ga4Channel: string): string {
  const ch = ga4Channel.toLowerCase();
  if (ch.includes('paid social')) return 'meta'; // Assumption: most paid social = Meta
  if (ch.includes('paid search') || ch.includes('paid shopping')) return 'google';
  if (ch.includes('organic search') || ch.includes('organic social')) return 'organic';
  if (ch.includes('email')) return 'email';
  if (ch.includes('referral')) return 'affiliate';
  if (ch.includes('direct')) return 'direct';
  return 'other';
}
