/**
 * Seed Script — loads sample data into DynamoDB tables
 * Usage: node seed.js [--table <table-suffix>] [--region <region>]
 *
 * Requires AWS credentials configured (AWS CLI or environment variables)
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const data = require("./seed-products.json");

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const REGION  = getArg("--region")  || "us-east-1";
const SUFFIX  = getArg("--suffix")  || "dev";

const TABLE_PRODUCTS   = getArg("--table") || `Products-${SUFFIX}`;
const TABLE_CO_OCCUR   = `CoOccurrenceMatrix-${SUFFIX}`;
const TABLE_EVENTS     = `UserEvents-${SUFFIX}`;

const client    = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function batchWrite(tableName, items) {
  const CHUNK = 25; // DynamoDB BatchWrite limit
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((Item) => ({ PutRequest: { Item } })),
        },
      })
    );
    console.log(`  → Wrote ${Math.min(i + CHUNK, items.length)}/${items.length} items to ${tableName}`);
  }
}

async function seed() {
  console.log("\n🌱 ShopIQ Seed Script");
  console.log(`   Region : ${REGION}`);
  console.log(`   Suffix : ${SUFFIX}`);
  console.log("─".repeat(50));

  // Products
  console.log(`\n📦 Seeding ${TABLE_PRODUCTS}...`);
  await batchWrite(TABLE_PRODUCTS, data.products);

  // Co-occurrence matrix
  console.log(`\n🔗 Seeding ${TABLE_CO_OCCUR}...`);
  await batchWrite(TABLE_CO_OCCUR, data.co_occurrences.map((c) => ({
    ...c,
    last_updated: new Date().toISOString(),
  })));

  // User Events
  console.log(`\n👤 Seeding ${TABLE_EVENTS}...`);
  const ttl = Math.floor(Date.now() / 1000) + 90 * 86400;
  await batchWrite(TABLE_EVENTS, data.user_events.map((e) => ({
    ...e,
    weight: { view: 1, add_to_cart: 3, purchase: 10 }[e.event_type] || 1,
    ttl,
  })));

  console.log("\n✅ Seed complete!\n");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
