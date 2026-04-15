# ShopIQ — Architecture & Deployment Guide

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SHOPIQ SYSTEM ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────┐
    │              CLIENT LAYER                         │
    │  React SPA  ──┬── AWS Amplify / S3 + CloudFront  │
    │               │                                   │
    │    Pages:     ├── /search (SearchPage)            │
    │               ├── /product/:id (ProductPage)      │
    │               └── /ab-dashboard (ABDashboard)     │
    └──────────────────────┬───────────────────────────-┘
                           │ HTTPS
    ┌──────────────────────▼───────────────────────────-┐
    │           AUTH LAYER — Amazon Cognito              │
    │   User Pool + App Client → JWT Tokens              │
    └──────────────────────┬────────────────────────────┘
                           │ Authorized Requests
    ┌──────────────────────▼────────────────────────────┐
    │          API GATEWAY (REST API)                    │
    │                                                    │
    │  GET  /search               →  SearchFn            │
    │  GET  /recommendations      →  RecommendationFn    │
    │  POST /events               →  ActivityTrackerFn   │
    │  POST /ab/click             →  ABTestingFn         │
    │  GET  /ab/metrics           →  ABTestingFn         │
    └───┬───────┬──────────┬──────────────┬─────────────┘
        │       │          │              │
   ┌────▼──┐ ┌──▼────┐ ┌──▼──────┐ ┌────▼────────┐
   │Search │ │Recs   │ │Activity │ │ AB Testing  │
   │Lambda │ │Lambda │ │Tracker  │ │ Lambda      │
   └──┬────┘ └──┬────┘ └──┬──────┘ └─────┬───────┘
      │         │          │              │
      │    ┌────▼──────────┴──────────────▼──┐
      │    │     DYNAMODB TABLES              │
      │    │                                  │
      │    │  ┌─────────────────────────────┐ │
      │    │  │  Products                   │ │
      └────┼─►│  ├── CategoryPopularityGSI  │ │
           │  │  └── VendorPriceGSI         │ │
           │  └─────────────────────────────┘ │
           │  ┌─────────────────────────────┐ │
           │  │  UserEvents                 │ │
           │  │  └── ProductEventsGSI       │ │
           │  └─────────────────────────────┘ │
           │  ┌─────────────────────────────┐ │
           │  │  RecommendationCache (TTL)   │ │
           │  └─────────────────────────────┘ │
           │  ┌─────────────────────────────┐ │
           │  │  CoOccurrenceMatrix         │ │
           │  └─────────────────────────────┘ │
           │  ┌─────────────────────────────┐ │
           │  │  ABTestLogs                 │ │
           │  │  └── ExperimentGSI          │ │
           │  └─────────────────────────────┘ │
           └─────────────────────────────────-┘

    ┌─────────────────────────────────────────────────┐
    │         SCHEDULED + MONITORING                   │
    │                                                  │
    │  EventBridge (every 6h) ──► CacheUpdater Lambda  │
    │            │                     │               │
    │            │            Updates RecommendationCache│
    │            │                                     │
    │  CloudWatch Alarms:                              │
    │   • Lambda Errors > 5 in 5min → SNS → Email      │
    │   • p95 Latency > 3s         → SNS → Email       │
    │   • Recommendation Volume    → Dashboard         │
    └─────────────────────────────────────────────────┘
```

---

## DynamoDB Table Summary

| Table | Partition Key | Sort Key | GSIs |
|---|---|---|---|
| `Products` | `product_id` | — | `CategoryPopularityIndex`, `VendorPriceIndex` |
| `UserEvents` | `user_id` | `event_id` | `ProductEventsIndex` |
| `RecommendationCache` | `cache_key` | `strategy` | — |
| `CoOccurrenceMatrix` | `product_a` | `product_b` | — |
| `ABTestLogs` | `log_id` | — | `ExperimentIndex` |

---

## Lambda Function Summary

| Function | Trigger | Purpose |
|---|---|---|
| `SearchFunction` | `GET /search` | Keyword search, filters, pagination |
| `RecommendationFunction` | `GET /recommendations` | 3-strategy engine + cache lookup |
| `ActivityTrackerFunction` | `POST /events` | Log views, cart-adds, purchases |
| `ABTestingFunction` | `POST /ab/click`, `GET /ab/metrics` | Click logging + CTR/conversion reporting |
| `CacheUpdaterFunction` | EventBridge (6h) | Precompute all product recommendations |

---

## Recommendation Strategies

### 1. Frequently Bought Together
- Queries `CoOccurrenceMatrix` with `product_a = product_id`
- Sorted by `co_purchase_count` descending
- Score = `co_purchase_count / max_count × 0.45`

### 2. Users Also Viewed
- Finds users who viewed the target product via `ProductEventsIndex`
- Collects all products those users interacted with (weighted by event type)
- Score = `summed_weight / max_weight × 0.30`

### 3. Category-Based
- Queries `CategoryPopularityIndex` for same-category products
- Sorted by `popularity_score` descending
- Score = `popularity_score / 100 × 0.25`

### Blended (Auto)
- All three strategies run in parallel
- Scores summed per product across strategies
- Sorted by total score descending

### Cold-Start Fallback
- If < 3 recommendations found
- Falls back to global popularity (`GLOBAL#POPULAR` cache key)

---

## A/B Testing Design

| Aspect | Detail |
|---|---|
| Bucketing | Deterministic: `hash(user_id) % 2` |
| Baseline variant | Category + global popularity only |
| Advanced variant | Co-occurrence + user activity + category blended |
| Tracked events | `impression`, `click`, `purchase` |
| Metrics | CTR = clicks/impressions, Conversion = purchases/clicks |
| Storage | `ABTestLogs` table + `ExperimentIndex` GSI |

---

## Deployment Instructions

### Prerequisites
```bash
npm install -g aws-sam-cli
aws configure  # Set your AWS credentials
```

### Deploy Backend (SAM)
```bash
cd infrastructure/
sam build
sam deploy --guided --stack-name shopiq-dev --parameter-overrides Environment=dev AlertEmail=you@example.com
```

### Seed Sample Data
```bash
cd backend/sample-data/
node seed.js --table Products-dev
```

### Deploy Frontend (Amplify)
```bash
cd frontend/
npm install
echo "VITE_API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev" > .env
npm run build
# Drag dist/ folder to Amplify Console, or use:
amplify init && amplify publish
```

---

## Environment Variables (Lambda)

| Variable | Description |
|---|---|
| `PRODUCTS_TABLE` | DynamoDB Products table name |
| `EVENTS_TABLE` | DynamoDB UserEvents table name |
| `CACHE_TABLE` | DynamoDB RecommendationCache table name |
| `CO_OCCUR_TABLE` | DynamoDB CoOccurrenceMatrix table name |
| `AB_LOGS_TABLE` | DynamoDB ABTestLogs table name |
| `CACHE_TTL_HOURS` | Cache TTL in hours (default: 6) |

---

## API Reference

### `GET /search`
| Param | Type | Description |
|---|---|---|
| `q` | string | Keyword search term |
| `category` | string | Filter by category |
| `vendor_id` | string | Filter by vendor |
| `min_price` | number | Minimum price |
| `max_price` | number | Maximum price |
| `sort_by` | string | `price`, `popularity_score`, `sales_count` |
| `sort_order` | string | `asc` or `desc` |
| `limit` | number | Page size (max 100) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "success": true,
  "total": 150,
  "products": [...],
  "facets": {
    "categories": [{ "name": "Electronics", "count": 45 }],
    "price_range": { "min": 9.99, "max": 999 }
  }
}
```

### `GET /recommendations`
| Param | Type | Description |
|---|---|---|
| `product_id` | string | **Required.** Target product |
| `user_id` | string | Optional. Enables user-based recs |
| `strategy` | string | `auto`, `category_based`, `frequently_bought_together` |
| `limit` | number | Max results (default 8) |
| `experiment_id` | string | Optional. Enables A/B impression logging |

### `POST /events`
```json
{ "user_id": "USER-001", "product_id": "PROD-001", "event_type": "view" }
```

### `POST /ab/click`
```json
{ "experiment_id": "EXP-001", "variant": "advanced", "user_id": "USER-001", "product_id": "PROD-003" }
```

### `GET /ab/metrics?experiment_id=EXP-001&days=7`
Returns CTR, conversion rate, and winner per variant.
