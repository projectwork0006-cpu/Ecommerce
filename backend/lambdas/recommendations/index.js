/**
 * Recommendation Engine Lambda Handler
 * Route: GET /recommendations?product_id=X&user_id=Y&strategy=auto
 *
 * Strategies:
 *   - frequently_bought_together  → co-occurrence matrix
 *   - users_also_viewed           → user activity collaborative filtering
 *   - category_based              → popular products in same category
 *   - auto                        → blend all strategies with weighted scoring
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const PRODUCTS_TABLE    = process.env.PRODUCTS_TABLE    || "Products";
const EVENTS_TABLE      = process.env.EVENTS_TABLE      || "UserEvents";
const CACHE_TABLE       = process.env.CACHE_TABLE       || "RecommendationCache";
const CO_OCCUR_TABLE    = process.env.CO_OCCUR_TABLE    || "CoOccurrenceMatrix";
const AB_LOGS_TABLE     = process.env.AB_LOGS_TABLE     || "ABTestLogs";

// Strategy weights for blended scoring
const STRATEGY_WEIGHTS = {
  frequently_bought_together: 0.45,
  users_also_viewed: 0.30,
  category_based: 0.25,
};

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const params = event.queryStringParameters || {};
    const {
      product_id,
      user_id,
      strategy = "auto",
      limit = "8",
      experiment_id,
    } = params;

    if (!product_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "product_id is required" }),
      };
    }

    const maxResults = Math.min(parseInt(limit, 10), 20);

    // ─── Determine A/B Test Variant ───────────────────────────────────────────
    const variant = getABVariant(user_id);

    // ─── Check Cache First ────────────────────────────────────────────────────
    const cacheKey = `PRODUCT#${product_id}${user_id ? `#USER#${user_id}` : ""}`;
    const effectiveStrategy = variant === "baseline" ? "category_based" : strategy;
    const cached = await getCachedRecommendations(cacheKey, effectiveStrategy);

    if (cached) {
      logImpression({ experiment_id, variant, user_id, product_id, source: "cache" });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          source: "cache",
          variant,
          recommendations: cached.slice(0, maxResults),
        }),
      };
    }

    // ─── Fetch target product ─────────────────────────────────────────────────
    const targetProduct = await getProduct(product_id);
    if (!targetProduct) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Product not found" }),
      };
    }

    // ─── Compute Recommendations ──────────────────────────────────────────────
    let recommendations;

    if (variant === "baseline" || effectiveStrategy === "category_based") {
      recommendations = await getCategoryRecommendations(targetProduct, product_id, maxResults);
    } else {
      recommendations = await getBlendedRecommendations(targetProduct, product_id, user_id, maxResults);
    }

    // ─── Cold-Start Fallback ──────────────────────────────────────────────────
    if (recommendations.length < 3) {
      const fallback = await getGlobalPopularProducts(product_id, maxResults);
      const existingIds = new Set(recommendations.map((r) => r.product_id));
      for (const p of fallback) {
        if (!existingIds.has(p.product_id)) {
          recommendations.push({ ...p, score: p.popularity_score / 100, reason: "Trending globally" });
          if (recommendations.length >= maxResults) break;
        }
      }
    }

    logImpression({ experiment_id, variant, user_id, product_id, source: "realtime" });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        source: "realtime",
        variant,
        recommendations: recommendations.slice(0, maxResults),
      }),
    };
  } catch (error) {
    console.error("Recommendation engine error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Internal server error" }),
    };
  }
};

// ─── Strategy: Frequently Bought Together ────────────────────────────────────

async function getFrequentlyBoughtTogether(product_id, exclude_id) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: CO_OCCUR_TABLE,
      KeyConditionExpression: "product_a = :pid",
      ExpressionAttributeValues: { ":pid": product_id },
      ScanIndexForward: false,
      Limit: 20,
    })
  );

  const coItems = (result.Items || []).filter((i) => i.product_b !== exclude_id);
  const maxCount = coItems[0]?.co_purchase_count || 1;

  const scored = await Promise.all(
    coItems.slice(0, 10).map(async (item) => {
      const product = await getProduct(item.product_b);
      if (!product) return null;
      return {
        ...product,
        score: (item.co_purchase_count / maxCount) * STRATEGY_WEIGHTS.frequently_bought_together,
        reason: "Frequently bought together",
      };
    })
  );

  return scored.filter(Boolean);
}

// ─── Strategy: Users Also Viewed ─────────────────────────────────────────────

async function getUsersAlsoViewed(product_id, current_user_id, exclude_id) {
  // Step 1: Find users who viewed this product
  const viewsResult = await docClient.send(
    new QueryCommand({
      TableName: EVENTS_TABLE,
      IndexName: "ProductEventsIndex",
      KeyConditionExpression: "product_id = :pid",
      FilterExpression: "event_type = :vtype",
      ExpressionAttributeValues: { ":pid": product_id, ":vtype": "view" },
      Limit: 50,
    })
  );

  const similarUsers = [
    ...new Set((viewsResult.Items || [])
      .map((i) => i.user_id)
      .filter((uid) => uid !== current_user_id)),
  ].slice(0, 10);

  if (similarUsers.length === 0) return [];

  // Step 2: Find products those users also viewed
  const productCounts = {};
  await Promise.all(
    similarUsers.map(async (uid) => {
      const userEvents = await docClient.send(
        new QueryCommand({
          TableName: EVENTS_TABLE,
          KeyConditionExpression: "user_id = :uid",
          FilterExpression: "product_id <> :pid AND product_id <> :eid",
          ExpressionAttributeValues: {
            ":uid": uid,
            ":pid": product_id,
            ":eid": exclude_id || "NONE",
          },
          Limit: 20,
        })
      );
      for (const e of userEvents.Items || []) {
        productCounts[e.product_id] = (productCounts[e.product_id] || 0) + e.weight;
      }
    })
  );

  const sorted = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const maxScore = sorted[0]?.[1] || 1;

  const result = await Promise.all(
    sorted.map(async ([pid, count]) => {
      const product = await getProduct(pid);
      if (!product) return null;
      return {
        ...product,
        score: (count / maxScore) * STRATEGY_WEIGHTS.users_also_viewed,
        reason: "Users also viewed",
      };
    })
  );

  return result.filter(Boolean);
}

// ─── Strategy: Category-Based ────────────────────────────────────────────────

async function getCategoryRecommendations(targetProduct, product_id, limit) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: PRODUCTS_TABLE,
      IndexName: "CategoryPopularityIndex",
      KeyConditionExpression: "category = :cat",
      FilterExpression: "product_id <> :pid",
      ExpressionAttributeValues: {
        ":cat": targetProduct.category,
        ":pid": product_id,
      },
      ScanIndexForward: false,
      Limit: limit + 5,
    })
  );

  const maxPopularity = 100;
  return (result.Items || [])
    .filter((p) => p.product_id !== product_id)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      score: (p.popularity_score / maxPopularity) * STRATEGY_WEIGHTS.category_based,
      reason: `Popular in ${targetProduct.category}`,
    }));
}

// ─── Strategy: Blended (Auto) ─────────────────────────────────────────────────

async function getBlendedRecommendations(targetProduct, product_id, user_id, limit) {
  const [fbt, uav, cat] = await Promise.all([
    getFrequentlyBoughtTogether(product_id, product_id),
    getUsersAlsoViewed(product_id, user_id, product_id),
    getCategoryRecommendations(targetProduct, product_id, 10),
  ]);

  // Merge and aggregate scores
  const scoreMap = {};

  const addToMap = (items) => {
    for (const item of items) {
      if (!item || item.product_id === product_id) continue;
      if (!scoreMap[item.product_id]) {
        scoreMap[item.product_id] = { ...item, score: 0 };
      }
      scoreMap[item.product_id].score += item.score;
      // Prefer the most informative reason
      if (item.reason.includes("bought") || item.reason.includes("viewed")) {
        scoreMap[item.product_id].reason = item.reason;
      }
    }
  };

  addToMap(fbt);
  addToMap(uav);
  addToMap(cat);

  return Object.values(scoreMap)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─── Global Popularity Fallback ───────────────────────────────────────────────

async function getGlobalPopularProducts(exclude_id, limit) {
  const result = await docClient.send(
    new ScanCommand({
      TableName: PRODUCTS_TABLE,
      FilterExpression: "product_id <> :pid",
      ExpressionAttributeValues: { ":pid": exclude_id },
      Limit: 50,
    })
  );
  return (result.Items || [])
    .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
    .slice(0, limit);
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

async function getCachedRecommendations(cacheKey, strategy) {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: CACHE_TABLE,
        Key: { cache_key: cacheKey, strategy },
      })
    );
    const item = result.Item;
    if (!item) return null;
    if (item.ttl && item.ttl < Math.floor(Date.now() / 1000)) return null;
    return item.recommendations || null;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getProduct(product_id) {
  const result = await docClient.send(
    new GetCommand({ TableName: PRODUCTS_TABLE, Key: { product_id } })
  );
  return result.Item || null;
}

function getABVariant(user_id) {
  if (!user_id) return "advanced";
  // Deterministic bucketing: even user hash → baseline, odd → advanced
  let hash = 0;
  for (const c of user_id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return hash % 2 === 0 ? "baseline" : "advanced";
}

async function logImpression({ experiment_id, variant, user_id, product_id, source }) {
  if (!experiment_id) return;
  const { PutCommand } = require("@aws-sdk/lib-dynamodb");
  const { v4: uuidv4 } = require("uuid");
  await docClient.send(
    new PutCommand({
      TableName: AB_LOGS_TABLE,
      Item: {
        log_id: `IMP-${Date.now()}-${uuidv4().slice(0, 8)}`,
        experiment_id,
        variant,
        event_type: "impression",
        user_id: user_id || "anonymous",
        product_id,
        source,
        timestamp: new Date().toISOString(),
      },
    })
  ).catch((e) => console.warn("AB log failed:", e.message));
}
