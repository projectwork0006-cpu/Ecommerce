/**
 * User Activity Tracker Lambda Handler
 * Route: POST /events
 * Logs: view, add_to_cart, purchase events
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE || "UserEvents";
const CO_OCCUR_TABLE = process.env.CO_OCCUR_TABLE || "CoOccurrenceMatrix";
const TTL_DAYS = 90; // Events expire after 90 days

const VALID_EVENT_TYPES = new Set(["view", "add_to_cart", "purchase"]);
const EVENT_WEIGHTS = { view: 1, add_to_cart: 3, purchase: 10 };

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    const { user_id, product_id, event_type, session_id } = body;

    // ─── Validation ─────────────────────────────────────────────────────────
    if (!user_id || !product_id || !event_type) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields: user_id, product_id, event_type" }),
      };
    }

    if (!VALID_EVENT_TYPES.has(event_type)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Invalid event_type. Must be one of: ${[...VALID_EVENT_TYPES].join(", ")}`,
        }),
      };
    }

    const timestamp = new Date().toISOString();
    const event_id = `EVT-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const ttl = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;

    // ─── Write Event ─────────────────────────────────────────────────────────
    await docClient.send(
      new PutCommand({
        TableName: EVENTS_TABLE,
        Item: {
          user_id,
          event_id,
          product_id,
          event_type,
          timestamp,
          session_id: session_id || null,
          weight: EVENT_WEIGHTS[event_type],
          ttl,
        },
      })
    );

    console.log(`Event logged: ${event_type} | user=${user_id} | product=${product_id}`);

    // ─── Update co-occurrence matrix for purchases ────────────────────────────
    if (event_type === "purchase") {
      await updateCoOccurrenceMatrix(user_id, product_id, session_id).catch((err) =>
        console.warn("Co-occurrence update failed (non-fatal):", err.message)
      );
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        event_id,
        message: "Event logged successfully",
      }),
    };
  } catch (error) {
    console.error("Activity tracker error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Internal server error" }),
    };
  }
};

/**
 * When a user purchases a product, find other recent purchases
 * in the same session and increment co-occurrence counts.
 */
async function updateCoOccurrenceMatrix(userId, purchasedProductId, sessionId) {
  // Get other products purchased by the same user recently (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  const result = await docClient.send(
    new QueryCommand({
      TableName: EVENTS_TABLE,
      KeyConditionExpression: "user_id = :uid",
      FilterExpression: "event_type = :etype AND #ts > :cutoff AND product_id <> :pid",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: {
        ":uid": userId,
        ":etype": "purchase",
        ":cutoff": thirtyDaysAgo,
        ":pid": purchasedProductId,
      },
    })
  );

  const relatedProducts = [...new Set((result.Items || []).map((i) => i.product_id))].slice(0, 10);

  // Update co-occurrence for each pair (bidirectional)
  const updates = relatedProducts.flatMap((relatedId) => [
    incrementCoOccurrence(purchasedProductId, relatedId),
    incrementCoOccurrence(relatedId, purchasedProductId),
  ]);

  await Promise.allSettled(updates);
}

async function incrementCoOccurrence(productA, productB) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  await docClient.send(
    new UpdateCommand({
      TableName: CO_OCCUR_TABLE,
      Key: { product_a: productA, product_b: productB },
      UpdateExpression:
        "SET co_purchase_count = if_not_exists(co_purchase_count, :zero) + :one, last_updated = :ts",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":one": 1,
        ":ts": new Date().toISOString(),
      },
    })
  );
}
