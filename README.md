# 🛍️ E-Commerce Product Search & Recommendation System

A full-stack AWS-native product search and recommendation platform built with API Gateway, Lambda, DynamoDB, React, and Cognito.

## Project Structure

```
├── backend/                    # AWS Lambda functions & infrastructure
│   ├── lambdas/
│   │   ├── search/             # Product search handler
│   │   ├── recommendations/    # Recommendation engine
│   │   ├── activity-tracker/   # User event logging
│   │   ├── cache-updater/      # Scheduled cache refresh
│   │   └── ab-testing/         # A/B test impression & click logger
│   ├── schemas/                # DynamoDB table definitions
│   └── sample-data/            # Seed data scripts
├── infrastructure/             # CloudFormation / SAM templates
├── frontend/                   # React application
└── docs/                       # Architecture diagrams & reports
```

## Quick Start

See individual README files in each directory for setup instructions.

## Architecture Overview

- **Frontend**: React + AWS Amplify
- **Auth**: Amazon Cognito
- **API**: API Gateway REST APIs
- **Compute**: AWS Lambda (Node.js 18.x)
- **Database**: Amazon DynamoDB (with GSIs)
- **Caching**: DynamoDB cache table
- **Monitoring**: CloudWatch + SNS Alerts
- **Scheduling**: EventBridge (cron) → Lambda
