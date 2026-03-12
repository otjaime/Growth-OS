// ──────────────────────────────────────────────────────────────
// Growth OS — Shipping Zone Resolver
// Fetches Shopify shipping zones and maps them to Meta's geo
// targeting format (regions/provinces). Falls back to country-level
// targeting if shipping zones can't be resolved.
// ──────────────────────────────────────────────────────────────

import { prisma, decrypt } from '@growth-os/database';
import pino from 'pino';

const log = pino({ name: 'shipping-zone-resolver' });

export interface ShippingZoneTargeting {
  countries: string[];
  regions?: Array<{ key: string; name: string }>;
}

interface ShopifyShippingZone {
  id: number;
  name: string;
  countries: Array<{
    id: number;
    name: string;
    code: string;
    provinces: Array<{
      id: number;
      name: string;
      code: string;
    }>;
  }>;
}

/**
 * Map of Shopify province codes to Meta Ads API geo_location region keys.
 * Meta requires numeric keys from their targeting search API.
 * This is a curated map for common DTC markets.
 *
 * Chile (CL) — Meta region keys from /search?type=adgeolocation&location_types=["region"]
 */
const PROVINCE_TO_META_REGION: Record<string, { key: string; name: string }> = {
  // Chile
  'CL-RM': { key: '3873', name: 'Santiago Metropolitan' },
  'CL-VS': { key: '3874', name: 'Valparaíso' },
  'CL-BI': { key: '3866', name: 'Biobío' },
  'CL-ML': { key: '3871', name: 'Maule' },
  'CL-AR': { key: '3865', name: 'Araucanía' },
  'CL-LR': { key: '3870', name: "O'Higgins" },
  'CL-CO': { key: '3867', name: 'Coquimbo' },
  'CL-LL': { key: '3869', name: 'Los Lagos' },
  'CL-AN': { key: '3864', name: 'Antofagasta' },
  'CL-AT': { key: '3863', name: 'Atacama' },
  'CL-LI': { key: '3868', name: 'Los Ríos' },
  'CL-NB': { key: '3872', name: 'Ñuble' },
  'CL-TA': { key: '3876', name: 'Tarapacá' },
  'CL-AP': { key: '3862', name: 'Arica y Parinacota' },
  'CL-AI': { key: '3861', name: 'Aysén' },
  'CL-MA': { key: '3875', name: 'Magallanes' },

  // Mexico
  'MX-CMX': { key: '484', name: 'Ciudad de México' },
  'MX-JAL': { key: '492', name: 'Jalisco' },
  'MX-NLE': { key: '497', name: 'Nuevo León' },
  'MX-MEX': { key: '494', name: 'Estado de México' },
  'MX-PUE': { key: '500', name: 'Puebla' },
  'MX-GUA': { key: '489', name: 'Guanajuato' },

  // Colombia
  'CO-DC': { key: '2720', name: 'Bogotá' },
  'CO-ANT': { key: '2706', name: 'Antioquia' },
  'CO-VAC': { key: '2737', name: 'Valle del Cauca' },

  // Argentina
  'AR-C': { key: '258', name: 'Buenos Aires (Ciudad)' },
  'AR-B': { key: '257', name: 'Buenos Aires (Provincia)' },
  'AR-X': { key: '269', name: 'Córdoba' },

  // Brazil
  'BR-SP': { key: '547', name: 'São Paulo' },
  'BR-RJ': { key: '543', name: 'Rio de Janeiro' },
  'BR-MG': { key: '538', name: 'Minas Gerais' },

  // US (top states)
  'US-CA': { key: '3847', name: 'California' },
  'US-NY': { key: '3875', name: 'New York' },
  'US-TX': { key: '3886', name: 'Texas' },
  'US-FL': { key: '3852', name: 'Florida' },
};

// In-memory cache for resolved shipping zones (keyed by orgId)
const shippingZoneCache = new Map<string, { targeting: ShippingZoneTargeting; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Resolve Shopify shipping zones to Meta geo targeting.
 *
 * Strategy:
 * 1. Check in-memory cache
 * 2. Fetch shipping zones from Shopify REST API
 * 3. Extract countries + provinces
 * 4. Map provinces to Meta region keys
 * 5. Return targeting spec (or null for graceful fallback to country-level)
 */
export async function resolveShippingZoneTargeting(
  organizationId: string,
): Promise<ShippingZoneTargeting | null> {
  // Check cache
  const cached = shippingZoneCache.get(organizationId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.targeting;
  }

  try {
    // Get Shopify credentials
    const cred = await prisma.connectorCredential.findFirst({
      where: { organizationId, connectorType: 'shopify' },
      select: { encryptedData: true, iv: true, authTag: true, metadata: true },
    });

    if (!cred) {
      log.info({ organizationId }, 'No Shopify credentials found — using country-level targeting');
      return null;
    }

    const meta = (cred.metadata ?? {}) as Record<string, string>;
    const shopDomain = meta.shopDomain;
    if (!shopDomain) {
      log.warn({ organizationId }, 'No Shopify shop domain in credentials');
      return null;
    }

    let accessToken: string;
    try {
      const decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
      accessToken = decrypted.accessToken ?? '';
    } catch {
      log.warn({ organizationId }, 'Failed to decrypt Shopify credentials');
      return null;
    }

    if (!accessToken) return null;

    // Fetch shipping zones from Shopify REST API
    const resp = await fetch(
      `https://${shopDomain}/admin/api/2024-01/shipping_zones.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken },
      },
    );

    if (!resp.ok) {
      // 403 means the app doesn't have read_shipping scope — graceful fallback
      if (resp.status === 403) {
        log.info({ organizationId }, 'Shopify read_shipping scope not granted — using country-level targeting');
      } else {
        log.warn({ organizationId, status: resp.status }, 'Failed to fetch Shopify shipping zones');
      }
      return null;
    }

    const body = await resp.json() as { shipping_zones?: ShopifyShippingZone[] };
    const zones = body.shipping_zones;
    if (!zones || zones.length === 0) {
      log.info({ organizationId }, 'No shipping zones configured in Shopify');
      return null;
    }

    // Extract unique countries and provinces from all zones
    const countrySet = new Set<string>();
    const provinceKeys: Array<{ key: string; name: string }> = [];
    const seenRegionKeys = new Set<string>();

    for (const zone of zones) {
      for (const country of zone.countries) {
        countrySet.add(country.code);

        for (const province of country.provinces) {
          // Build Shopify-style province code: {COUNTRY}-{PROVINCE}
          const provinceCode = `${country.code}-${province.code}`;
          const metaRegion = PROVINCE_TO_META_REGION[provinceCode];

          if (metaRegion && !seenRegionKeys.has(metaRegion.key)) {
            provinceKeys.push(metaRegion);
            seenRegionKeys.add(metaRegion.key);
          }
        }
      }
    }

    const countries = [...countrySet];

    // If we found specific regions, return region-level targeting
    // If the store ships to ALL provinces in a country (no specific provinces listed),
    // that means country-wide shipping — return country-level only
    const targeting: ShippingZoneTargeting = {
      countries,
      ...(provinceKeys.length > 0 ? { regions: provinceKeys } : {}),
    };

    // Cache the result
    shippingZoneCache.set(organizationId, { targeting, cachedAt: Date.now() });

    log.info(
      { organizationId, countries, regionCount: provinceKeys.length },
      'Resolved shipping zone targeting',
    );

    return targeting;
  } catch (err) {
    log.warn({ organizationId, err }, 'Error resolving shipping zones — falling back to country-level');
    return null;
  }
}
