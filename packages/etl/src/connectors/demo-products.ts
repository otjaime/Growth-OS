// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Product Catalog Generator
// Creates deterministic Shopify product catalog for demo mode.
// ──────────────────────────────────────────────────────────────

import type { RawRecord } from '../types.js';
import { createContext, pick } from './demo-generator.js';
import type { DemoContext } from './demo-generator.js';

const DEMO_PRODUCTS: Array<{
  title: string;
  type: string;
  price: number;
  description: string;
}> = [
  // Apparel (55% margin)
  { title: 'Classic Cotton Tee', type: 'apparel', price: 35, description: 'Premium 100% cotton crew neck t-shirt. Pre-shrunk, comfortable fit for everyday wear.' },
  { title: 'Slim Fit Chinos', type: 'apparel', price: 68, description: 'Modern slim-fit chinos in stretch cotton twill. Perfect for work or weekend.' },
  { title: 'Merino Wool Sweater', type: 'apparel', price: 95, description: 'Lightweight merino wool pullover sweater. Temperature regulating and wrinkle resistant.' },
  { title: 'Performance Hoodie', type: 'apparel', price: 75, description: 'Technical fleece hoodie with moisture-wicking fabric. Ideal for training or lounging.' },
  { title: 'Linen Button-Down', type: 'apparel', price: 58, description: 'Relaxed-fit linen shirt with a natural texture. Breathable and effortlessly stylish.' },

  // Beauty (65% margin)
  { title: 'Hydrating Face Serum', type: 'beauty', price: 48, description: 'Hyaluronic acid serum with vitamin C. Deeply hydrates and brightens skin in 2 weeks.' },
  { title: 'Retinol Night Cream', type: 'beauty', price: 55, description: 'Anti-aging night cream with encapsulated retinol. Reduces fine lines while you sleep.' },
  { title: 'Mineral Sunscreen SPF50', type: 'beauty', price: 32, description: 'Lightweight zinc oxide sunscreen. No white cast, reef-safe, suitable for all skin types.' },
  { title: 'Volumizing Mascara', type: 'beauty', price: 28, description: 'Buildable volume mascara with a curved brush. Clump-free formula lasts all day.' },
  { title: 'Organic Lip Balm Set', type: 'beauty', price: 18, description: 'Set of 4 organic lip balms in assorted flavors. Beeswax and shea butter formula.' },

  // Home (50% margin)
  { title: 'Bamboo Cutting Board', type: 'home', price: 42, description: 'Premium bamboo cutting board with juice groove. Knife-friendly and naturally antimicrobial.' },
  { title: 'Ceramic Pour-Over Set', type: 'home', price: 65, description: 'Handcrafted ceramic pour-over coffee dripper with carafe. Brews the perfect cup every time.' },
  { title: 'Scented Soy Candle', type: 'home', price: 34, description: 'Hand-poured soy wax candle with essential oils. 60+ hour burn time, cotton wick.' },
  { title: 'Linen Throw Blanket', type: 'home', price: 78, description: 'Stonewashed linen throw in neutral tones. Softens with every wash, European craftsmanship.' },
  { title: 'Indoor Herb Garden Kit', type: 'home', price: 45, description: 'Self-watering herb garden with LED grow light. Includes basil, cilantro, and mint seeds.' },

  // Electronics (30% margin)
  { title: 'Wireless Earbuds Pro', type: 'electronics', price: 89, description: 'Active noise canceling earbuds with 8h battery. IPX5 waterproof, premium sound quality.' },
  { title: 'USB-C Hub Adapter', type: 'electronics', price: 45, description: '7-in-1 USB-C hub with HDMI 4K, SD card, and USB 3.0 ports. Aluminum build.' },
  { title: 'Portable Power Bank', type: 'electronics', price: 38, description: '10,000mAh power bank with fast charging. Slim design fits in any pocket or bag.' },
  { title: 'Smart LED Desk Lamp', type: 'electronics', price: 52, description: 'Adjustable LED desk lamp with wireless charging base. 5 color temperatures, touch controls.' },
  { title: 'Mechanical Keyboard', type: 'electronics', price: 110, description: 'Compact 75% mechanical keyboard with hot-swappable switches. RGB backlit, aluminum frame.' },

  // Food (40% margin)
  { title: 'Artisan Coffee Beans', type: 'food', price: 22, description: 'Single-origin Ethiopian coffee beans, medium roast. Notes of blueberry and dark chocolate.' },
  { title: 'Organic Matcha Powder', type: 'food', price: 35, description: 'Ceremonial grade matcha from Uji, Japan. Stone-ground, vibrant green, smooth taste.' },
  { title: 'Mixed Nut Butter', type: 'food', price: 16, description: 'Blend of almond, cashew, and macadamia nuts. No added sugar, stone-ground texture.' },
  { title: 'Dark Chocolate Truffles', type: 'food', price: 28, description: 'Handcrafted 70% dark chocolate truffles. Assorted flavors including sea salt and espresso.' },
  { title: 'Superfood Granola', type: 'food', price: 14, description: 'Gluten-free granola with goji berries, chia seeds, and coconut flakes. Lightly sweetened with honey.' },
];

const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600',
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600',
];

/**
 * Generate deterministic Shopify product catalog records for demo mode.
 */
export function generateShopifyProducts(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? createContext();

  return DEMO_PRODUCTS.map((product, i) => {
    const imageIdx = i % PLACEHOLDER_IMAGES.length;
    const imageUrl = PLACEHOLDER_IMAGES[imageIdx]!;

    return {
      source: 'shopify',
      entity: 'products',
      externalId: `prod_${String(i + 1).padStart(4, '0')}`,
      cursor: undefined,
      payload: {
        id: `gid://shopify/Product/${1000 + i}`,
        title: product.title,
        descriptionText: product.description,
        productType: product.type,
        status: 'ACTIVE',
        onlineStoreUrl: `https://demo-store.myshopify.com/products/${product.title.toLowerCase().replace(/\s+/g, '-')}`,
        images: [{ url: imageUrl, altText: product.title }],
        variants: [
          {
            id: `gid://shopify/ProductVariant/${2000 + i}`,
            title: 'Default',
            price: String(product.price),
            inventoryQuantity: pick([50, 100, 200, 500, 1000], c.rng),
          },
        ],
        imageUrl,
      } as Record<string, unknown>,
    };
  });
}
