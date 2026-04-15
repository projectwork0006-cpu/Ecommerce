/**
 * API client for all backend endpoints.
 * Update BASE_URL to your deployed API Gateway URL.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

// ─── Mock Data (for local development without a live AWS backend) ─────────────
const MOCK_PRODUCTS = [
  { product_id: "PROD-001", product_name: "Wireless Noise-Cancelling Headphones", category: "Electronics", price: 149.99, vendor_id: "VENDOR-001", sales_count: 1240, popularity_score: 87, image_url: "https://picsum.photos/seed/prod001/400/400", description: "Premium ANC headphones with 30hr battery." },
  { product_id: "PROD-002", product_name: "USB-C Charging Hub 7-in-1", category: "Electronics", price: 49.99, vendor_id: "VENDOR-002", sales_count: 2150, popularity_score: 92, image_url: "https://picsum.photos/seed/prod002/400/400", description: "Expands your laptop with HDMI, 3x USB-A, SD, and PD charging." },
  { product_id: "PROD-003", product_name: "Ergonomic Mesh Office Chair", category: "Furniture", price: 329.00, vendor_id: "VENDOR-003", sales_count: 780, popularity_score: 78, image_url: "https://picsum.photos/seed/prod003/400/400", description: "Lumbar support, breathable mesh for all-day comfort." },
  { product_id: "PROD-004", product_name: "Mechanical Keyboard TKL RGB", category: "Electronics", price: 89.99, vendor_id: "VENDOR-001", sales_count: 1890, popularity_score: 91, image_url: "https://picsum.photos/seed/prod004/400/400", description: "Cherry MX switches with per-key RGB lighting." },
  { product_id: "PROD-005", product_name: "Adjustable Standing Desk 60\"", category: "Furniture", price: 549.00, vendor_id: "VENDOR-004", sales_count: 430, popularity_score: 72, image_url: "https://picsum.photos/seed/prod005/400/400", description: "Electric height-adjustable with memory presets." },
  { product_id: "PROD-006", product_name: "Webcam 4K Ultra HD", category: "Electronics", price: 119.99, vendor_id: "VENDOR-002", sales_count: 1560, popularity_score: 85, image_url: "https://picsum.photos/seed/prod006/400/400", description: "4K 30fps, auto-focus, built-in HDR, plug-and-play." },
  { product_id: "PROD-007", product_name: "Portable Bluetooth Speaker", category: "Electronics", price: 79.99, vendor_id: "VENDOR-005", sales_count: 2340, popularity_score: 94, image_url: "https://picsum.photos/seed/prod007/400/400", description: "360° sound, IP67 waterproof, 24hr battery." },
  { product_id: "PROD-008", product_name: "Leather Laptop Backpack 15.6\"", category: "Bags", price: 64.99, vendor_id: "VENDOR-006", sales_count: 3200, popularity_score: 96, image_url: "https://picsum.photos/seed/prod008/400/400", description: "PU leather, anti-theft zipper, USB charging port." },
  { product_id: "PROD-009", product_name: "Smart LED Desk Lamp", category: "Home", price: 39.99, vendor_id: "VENDOR-007", sales_count: 1100, popularity_score: 80, image_url: "https://picsum.photos/seed/prod009/400/400", description: "Touch control, 5 color modes, wireless Qi charging base." },
  { product_id: "PROD-010", product_name: "Wireless Ergonomic Mouse", category: "Electronics", price: 44.99, vendor_id: "VENDOR-001", sales_count: 2800, popularity_score: 93, image_url: "https://picsum.photos/seed/prod010/400/400", description: "Vertical design, 2.4GHz + Bluetooth, silent clicks." },
  { product_id: "PROD-011", product_name: "Running Shoes Pro X", category: "Footwear", price: 124.99, vendor_id: "VENDOR-008", sales_count: 980, popularity_score: 82, image_url: "https://picsum.photos/seed/prod011/400/400", description: "Carbon-fiber plate, foam cushion, reflective details." },
  { product_id: "PROD-012", product_name: "Yoga Mat Non-Slip 6mm", category: "Sports", price: 29.99, vendor_id: "VENDOR-009", sales_count: 4100, popularity_score: 97, image_url: "https://picsum.photos/seed/prod012/400/400", description: "TPE eco-friendly, alignment lines, carrying strap." },
  { product_id: "PROD-013", product_name: "Stainless Steel Water Bottle 1L", category: "Sports", price: 24.99, vendor_id: "VENDOR-009", sales_count: 5600, popularity_score: 98, image_url: "https://picsum.photos/seed/prod013/400/400", description: "Double-wall insulation, BPA-free, leak-proof lid." },
  { product_id: "PROD-014", product_name: "Premium Coffee Grinder Burr", category: "Kitchen", price: 89.00, vendor_id: "VENDOR-010", sales_count: 760, popularity_score: 79, image_url: "https://picsum.photos/seed/prod014/400/400", description: "40 grind settings, stainless burrs, quiet motor." },
  { product_id: "PROD-015", product_name: "Smart Watch Series 5", category: "Electronics", price: 249.99, vendor_id: "VENDOR-011", sales_count: 1650, popularity_score: 89, image_url: "https://picsum.photos/seed/prod015/400/400", description: "AMOLED display, GPS, heart-rate monitor, 14-day battery." },
];

const CO_OCCURRENCE = {
  "PROD-001": ["PROD-002", "PROD-010", "PROD-004"],
  "PROD-004": ["PROD-010", "PROD-001", "PROD-002"],
  "PROD-012": ["PROD-013", "PROD-011"],
  "PROD-013": ["PROD-012", "PROD-011"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function filterAndSort(products, filters) {
  let result = [...products];
  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }
  if (filters.category) result = result.filter((p) => p.category === filters.category);
  if (filters.vendor_id) result = result.filter((p) => p.vendor_id === filters.vendor_id);
  if (filters.min_price) result = result.filter((p) => p.price >= parseFloat(filters.min_price));
  if (filters.max_price) result = result.filter((p) => p.price <= parseFloat(filters.max_price));

  const sortBy = filters.sort_by || "popularity_score";
  const asc = filters.sort_order === "asc";
  result.sort((a, b) => {
    const diff = (a[sortBy] || 0) - (b[sortBy] || 0);
    return asc ? diff : -diff;
  });
  return result;
}

// ─── API Functions ─────────────────────────────────────────────────────────────

export async function searchProducts(filters = {}) {
  try {
    const queryString = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""))
    ).toString();
    const res = await fetch(`${BASE_URL}/search?${queryString}`);
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    // Fallback to mock
    await sleep(300);
    const products = filterAndSort(MOCK_PRODUCTS, filters);
    const categories = [...new Set(MOCK_PRODUCTS.map((p) => p.category))];
    return {
      success: true,
      total: products.length,
      count: products.length,
      products,
      facets: {
        categories: categories.map((c) => ({ name: c, count: MOCK_PRODUCTS.filter((p) => p.category === c).length })),
        price_range: { min: 24.99, max: 549.0 },
      },
    };
  }
}

export async function getRecommendations({ product_id, user_id, strategy = "auto", limit = 8 }) {
  try {
    const params = new URLSearchParams({ product_id, strategy, limit });
    if (user_id) params.append("user_id", user_id);
    const res = await fetch(`${BASE_URL}/recommendations?${params}`);
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    await sleep(400);
    const target = MOCK_PRODUCTS.find((p) => p.product_id === product_id);
    if (!target) return { success: true, recommendations: [] };

    const coIds = CO_OCCURRENCE[product_id] || [];
    const fbt = MOCK_PRODUCTS
      .filter((p) => coIds.includes(p.product_id))
      .map((p) => ({ ...p, reason: "Frequently bought together", score: 0.9 }));

    const catRecs = MOCK_PRODUCTS
      .filter((p) => p.category === target.category && p.product_id !== product_id)
      .sort((a, b) => b.popularity_score - a.popularity_score)
      .slice(0, 4)
      .map((p) => ({ ...p, reason: `Popular in ${target.category}`, score: p.popularity_score / 100 }));

    const seen = new Set([product_id]);
    const recommendations = [];
    for (const r of [...fbt, ...catRecs]) {
      if (!seen.has(r.product_id)) {
        seen.add(r.product_id);
        recommendations.push(r);
        if (recommendations.length >= limit) break;
      }
    }

    return { success: true, source: "mock", variant: "advanced", recommendations };
  }
}

export async function logEvent({ user_id, product_id, event_type, session_id }) {
  try {
    await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, product_id, event_type, session_id }),
    });
  } catch {
    console.debug("Event logging (mock mode):", event_type, product_id);
  }
}

export async function logABClick({ experiment_id, variant, user_id, product_id }) {
  try {
    await fetch(`${BASE_URL}/ab/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experiment_id, variant, user_id, product_id }),
    });
  } catch {
    console.debug("A/B click (mock mode):", variant, product_id);
  }
}

export async function getABMetrics({ experiment_id, days = 7 }) {
  try {
    const res = await fetch(`${BASE_URL}/ab/metrics?experiment_id=${experiment_id}&days=${days}`);
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    // Return realistic mock metrics
    return {
      success: true,
      experiment_id,
      period_days: days,
      total_events: 2847,
      metrics: {
        baseline: {
          impressions: 1420,
          clicks: 156,
          purchases: 52,
          unique_users: 890,
          ctr: "10.99%",
          conversion_rate: "33.33%",
        },
        advanced: {
          impressions: 1427,
          clicks: 198,
          purchases: 78,
          unique_users: 904,
          ctr: "13.88%",
          conversion_rate: "39.39%",
        },
      },
      winner: { variant: "advanced", ctr: "13.88%" },
    };
  }
}
