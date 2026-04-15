/**
 * Product Search Lambda Handler
 * Route: GET /search
 * Supports: keyword search, filters (category, vendor, price range), sort
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || "Products";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const params = event.queryStringParameters || {};
    const {
      q = "",
      category,
      vendor_id,
      min_price,
      max_price,
      sort_by = "popularity_score",
      sort_order = "desc",
      limit = "20",
      offset = "0",
    } = params;

    let products = [];

    // ─── Strategy: query GSI when filtering by category or vendor ────────────
    if (category && !vendor_id) {
      products = await queryByCategoryGSI(category);
    } else if (vendor_id && !category) {
      products = await queryByVendorGSI(vendor_id);
    } else {
      // Full scan (use ElasticSearch in production for large catalogs)
      products = await scanAllProducts();
    }

    // ─── In-memory filtering ──────────────────────────────────────────────────
    if (q) {
      const query = q.toLowerCase();
      products = products.filter(
        (p) =>
          p.product_name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }

    if (category) {
      products = products.filter((p) => p.category === category);
    }

    if (vendor_id) {
      products = products.filter((p) => p.vendor_id === vendor_id);
    }

    if (min_price) {
      products = products.filter((p) => p.price >= parseFloat(min_price));
    }

    if (max_price) {
      products = products.filter((p) => p.price <= parseFloat(max_price));
    }

    // ─── Sorting ──────────────────────────────────────────────────────────────
    const validSortFields = ["price", "popularity_score", "sales_count", "product_name"];
    const sortField = validSortFields.includes(sort_by) ? sort_by : "popularity_score";
    const direction = sort_order === "asc" ? 1 : -1;

    products.sort((a, b) => {
      if (typeof a[sortField] === "string") {
        return direction * a[sortField].localeCompare(b[sortField]);
      }
      return direction * ((a[sortField] || 0) - (b[sortField] || 0));
    });

    // ─── Pagination ───────────────────────────────────────────────────────────
    const total = products.length;
    const start = parseInt(offset, 10);
    const pageSize = Math.min(parseInt(limit, 10), 100);
    const paginated = products.slice(start, start + pageSize);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        total,
        count: paginated.length,
        offset: start,
        limit: pageSize,
        products: paginated,
        facets: buildFacets(products),
      }),
    };
  } catch (error) {
    console.error("Search error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Internal server error" }),
    };
  }
};

// ─── DynamoDB Helpers ─────────────────────────────────────────────────────────

async function queryByCategoryGSI(category) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: PRODUCTS_TABLE,
      IndexName: "CategoryPopularityIndex",
      KeyConditionExpression: "category = :cat",
      ExpressionAttributeValues: { ":cat": category },
      ScanIndexForward: false, // highest popularity first
    })
  );
  return result.Items || [];
}

async function queryByVendorGSI(vendorId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: PRODUCTS_TABLE,
      IndexName: "VendorPriceIndex",
      KeyConditionExpression: "vendor_id = :vid",
      ExpressionAttributeValues: { ":vid": vendorId },
    })
  );
  return result.Items || [];
}

async function scanAllProducts() {
  const items = [];
  let lastKey = undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: PRODUCTS_TABLE,
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

// ─── Build facets for front-end filter UI ────────────────────────────────────

function buildFacets(products) {
  const categories = {};
  const vendors = {};
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const p of products) {
    if (p.category) categories[p.category] = (categories[p.category] || 0) + 1;
    if (p.vendor_id) vendors[p.vendor_id] = (vendors[p.vendor_id] || 0) + 1;
    if (p.price != null) {
      if (p.price < minPrice) minPrice = p.price;
      if (p.price > maxPrice) maxPrice = p.price;
    }
  }

  return {
    categories: Object.entries(categories).map(([name, count]) => ({ name, count })),
    vendors: Object.entries(vendors).map(([id, count]) => ({ id, count })),
    price_range: {
      min: minPrice === Infinity ? 0 : minPrice,
      max: maxPrice === -Infinity ? 0 : maxPrice,
    },
  };
}
