/**
 * Cache Updater Lambda Handler
 * Triggered by: EventBridge (cron schedule) — runs every 6 hours
 * Purpose: Precompute recommendations for all products and store in DynamoDB cache
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || "Products";
const CACHE_TABLE    = process.env.CACHE_TABLE    || "RecommendationCache";
const CO_OCCUR_TABLE = process.env.CO_OCCUR_TABLE || "CoOccurrenceMatrix";
const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "6", 10);

exports.handler = async () => {
  console.log("Cache updater started at", new Date().toISOString());
  const startTime = Date.now();

  try {
    // Scan all products
    const allProducts = await scanAllProducts();
    console.log(`Processing ${allProducts.length} products...`);

    let updated = 0;
    let failed = 0;

    // Process in batches of 10 to avoid throttling
    const batchSize = 10;
    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (product) => {
          try {
            await updateProductCache(product, allProducts);
            updated++;
          } catch (err) {
            console.error(`Failed to cache ${product.product_id}:`, err.message);
            failed++;
          }
        })
      );

      // Throttle between batches
      if (i + batchSize < allProducts.length) {
        await sleep(200);
      }
    }

    // Also update global popularity cache
    await updateGlobalPopularityCache(allProducts);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = { updated, failed, total: allProducts.length, duration_seconds: duration };
    console.log("Cache update complete:", summary);
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (error) {
    console.error("Cache updater error:", error);
    throw error;
  }
};

async function updateProductCache(product, allProducts) {
  const { product_id, category } = product;
  const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_HOURS * 3600;
  const now = new Date().toISOString();

  // ─── Strategy 1: Frequently Bought Together ───────────────────────────────
  const fbtResult = await docClient.send(
    new QueryCommand({
      TableName: CO_OCCUR_TABLE,
      KeyConditionExpression: "product_a = :pid",
      ExpressionAttributeValues: { ":pid": product_id },
      ScanIndexForward: false,
      Limit: 10,
    })
  );

  const productMap = Object.fromEntries(allProducts.map((p) => [p.product_id, p]));
  const maxFBT = fbtResult.Items?.[0]?.co_purchase_count || 1;

  const fbtRecs = (fbtResult.Items || [])
    .filter((i) => i.product_b !== product_id && productMap[i.product_b])
    .map((i) => ({
      product_id: i.product_b,
      product_name: productMap[i.product_b].product_name,
      price: productMap[i.product_b].price,
      image_url: productMap[i.product_b].image_url,
      category: productMap[i.product_b].category,
      score: i.co_purchase_count / maxFBT,
      reason: "Frequently bought together",
    }))
    .slice(0, 8);

  // ─── Strategy 2: Category-Based ───────────────────────────────────────────
  const catProducts = allProducts
    .filter((p) => p.category === category && p.product_id !== product_id)
    .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
    .slice(0, 8)
    .map((p) => ({
      product_id: p.product_id,
      product_name: p.product_name,
      price: p.price,
      image_url: p.image_url,
      category: p.category,
      score: (p.popularity_score || 0) / 100,
      reason: `Popular in ${category}`,
    }));

  // ─── Write to cache ────────────────────────────────────────────────────────
  const writes = [
    docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        cache_key: `PRODUCT#${product_id}`,
        strategy: "frequently_bought_together",
        recommendations: fbtRecs,
        computed_at: now,
        ttl,
      },
    })),
    docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        cache_key: `PRODUCT#${product_id}`,
        strategy: "category_based",
        recommendations: catProducts,
        computed_at: now,
        ttl,
      },
    })),
  ];

  await Promise.all(writes);
}

async function updateGlobalPopularityCache(allProducts) {
  const top20 = allProducts
    .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
    .slice(0, 20)
    .map((p) => ({
      product_id: p.product_id,
      product_name: p.product_name,
      price: p.price,
      image_url: p.image_url,
      category: p.category,
      score: (p.popularity_score || 0) / 100,
      reason: "Trending globally",
    }));

  const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_HOURS * 3600;

  await docClient.send(
    new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        cache_key: "GLOBAL#POPULAR",
        strategy: "global_popularity",
        recommendations: top20,
        computed_at: new Date().toISOString(),
        ttl,
      },
    })
  );
  console.log("Global popularity cache updated.");
}

async function scanAllProducts() {
  const items = [];
  let lastKey;
  do {
    const result = await docClient.send(
      new ScanCommand({ TableName: PRODUCTS_TABLE, ExclusiveStartKey: lastKey })
    );
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
