/**
 * A/B Testing Lambda Handler
 * Routes:
 *   POST /ab/click        → log a recommendation click
 *   GET  /ab/metrics      → retrieve CTR and conversion rates by variant
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);
const AB_LOGS_TABLE = process.env.AB_LOGS_TABLE || "ABTestLogs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const path = event.path || "";

  if (event.httpMethod === "POST" && path.includes("/click")) {
    return handleClick(event);
  }

  if (event.httpMethod === "GET" && path.includes("/metrics")) {
    return handleMetrics(event);
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
};

// ─── Log Click Event ──────────────────────────────────────────────────────────

async function handleClick(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { experiment_id, variant, user_id, product_id, session_id } = body;

    if (!experiment_id || !variant || !product_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "experiment_id, variant, and product_id are required" }),
      };
    }

    await docClient.send(
      new PutCommand({
        TableName: AB_LOGS_TABLE,
        Item: {
          log_id: `CLK-${Date.now()}-${uuidv4().slice(0, 8)}`,
          experiment_id,
          variant,
          event_type: "click",
          user_id: user_id || "anonymous",
          product_id,
          session_id: session_id || null,
          timestamp: new Date().toISOString(),
        },
      })
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ success: true, message: "Click logged" }),
    };
  } catch (error) {
    console.error("Click log error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
}

// ─── Compute Metrics ──────────────────────────────────────────────────────────

async function handleMetrics(event) {
  try {
    const { experiment_id, days = "7" } = event.queryStringParameters || {};

    if (!experiment_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "experiment_id is required" }),
      };
    }

    const cutoff = new Date(Date.now() - parseInt(days, 10) * 86400 * 1000).toISOString();

    const result = await docClient.send(
      new QueryCommand({
        TableName: AB_LOGS_TABLE,
        IndexName: "ExperimentIndex",
        KeyConditionExpression: "experiment_id = :eid AND #ts > :cutoff",
        ExpressionAttributeNames: { "#ts": "timestamp" },
        ExpressionAttributeValues: { ":eid": experiment_id, ":cutoff": cutoff },
      })
    );

    const logs = result.Items || [];
    const metrics = computeMetrics(logs);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        experiment_id,
        period_days: parseInt(days, 10),
        total_events: logs.length,
        metrics,
        winner: determineWinner(metrics),
      }),
    };
  } catch (error) {
    console.error("Metrics error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
}

function computeMetrics(logs) {
  const variants = {};

  for (const log of logs) {
    const v = log.variant;
    if (!variants[v]) {
      variants[v] = { impressions: 0, clicks: 0, purchases: 0, users: new Set() };
    }
    if (log.event_type === "impression") variants[v].impressions++;
    if (log.event_type === "click")      variants[v].clicks++;
    if (log.event_type === "purchase")   variants[v].purchases++;
    if (log.user_id) variants[v].users.add(log.user_id);
  }

  return Object.fromEntries(
    Object.entries(variants).map(([variant, data]) => [
      variant,
      {
        impressions: data.impressions,
        clicks: data.clicks,
        purchases: data.purchases,
        unique_users: data.users.size,
        ctr: data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) + "%" : "0%",
        conversion_rate:
          data.clicks > 0 ? ((data.purchases / data.clicks) * 100).toFixed(2) + "%" : "0%",
      },
    ])
  );
}

function determineWinner(metrics) {
  let bestVariant = null;
  let bestCTR = -1;

  for (const [variant, data] of Object.entries(metrics)) {
    const ctr = parseFloat(data.ctr);
    if (ctr > bestCTR) {
      bestCTR = ctr;
      bestVariant = variant;
    }
  }

  return bestVariant
    ? { variant: bestVariant, ctr: bestCTR.toFixed(2) + "%" }
    : null;
}
