// ──────────────────────────────────────────────────────────────
// Growth OS — Channel Mapping
// Maps raw source data to standardized channel slugs
// ──────────────────────────────────────────────────────────────

export interface OrderChannelInput {
  sourceName: string;
  utmSource?: string;
  utmMedium?: string;
  referringSite?: string;
  gclid?: string;
  fbclid?: string;
}

/**
 * Maps Shopify order attributes to a channel slug.
 * Priority: click IDs > UTM params > referring site > source name > fallback
 */
export function mapChannelFromOrder(input: OrderChannelInput): string {
  const { utmSource, utmMedium, referringSite, sourceName, gclid, fbclid } = input;
  const src = (utmSource ?? '').toLowerCase();
  const med = (utmMedium ?? '').toLowerCase();
  const ref = (referringSite ?? '').toLowerCase();

  // Click-ID based mapping (highest priority — auto-tagging by ad platforms)
  if (gclid) return 'google';
  if (fbclid) return 'meta';

  // UTM-based mapping
  if (src) {
    // Meta: facebook, fb, instagram (exact word boundaries to avoid false positives)
    if (src.includes('facebook') || src === 'fb' || src.includes('instagram') || src === 'ig') {
      return 'meta';
    }
    // Google paid
    if (src.includes('google') && (med === 'cpc' || med === 'ppc' || med === 'paid' || med === 'shopping')) {
      return 'google';
    }
    // Google organic
    if (src.includes('google') && (med === 'organic' || med === '' || med === 'surfaces')) {
      return 'organic';
    }
    // Email
    if (src.includes('klaviyo') || src.includes('mailchimp') || med === 'email') {
      return 'email';
    }
    // Affiliates
    if (src.includes('affiliate') || med === 'referral') {
      return 'affiliate';
    }
    // Any other recognized UTM source (not direct)
    return 'other';
  }

  // Referring site based
  if (ref) {
    if (ref.includes('facebook.com') || ref.includes('instagram.com')) return 'meta';
    if (ref.includes('google.com') && med === 'cpc') return 'google';
    if (ref.includes('google.com')) return 'organic';
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
