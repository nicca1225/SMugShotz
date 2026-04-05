# SmugShotz

A microservices-based camera auction platform built for SMU IS213 Enterprise Solution Development.

Users can list cameras for auction, bid on listings, and pay via Stripe. AI-powered condition scoring (Google Cloud Vision) and market price suggestions (SerpAPI/eBay) are built in. Notifications are delivered via Telegram.

---

## Prerequisites

Install the following before starting:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) — for forwarding webhooks locally
- Git

---

## Project Structure

```
smugshotz/
├── frontend/                        # React + Vite frontend
├── gateway/
│   ├── traefik.yml                  # Traefik reverse proxy config
│   └── rabbitmq/                    # Custom RabbitMQ image (delayed-message plugin)
└── services/
    ├── atomic/
    │   ├── camera/                  # Camera metadata service (MySQL)
    │   ├── order/                   # Order service with gRPC (MySQL)
    │   ├── payment/                 # Payment record service (MySQL)
    │   └── price-model/             # AI price suggestion via SerpAPI + eBay
    ├── composite/
    │   ├── create-auction/          # Orchestrates camera + auction + RabbitMQ
    │   ├── process-bid/             # Orchestrates bidding + outbid notifications
    │   ├── process-camera-details/  # AWS S3 upload + Google Cloud Vision scoring
    │   ├── process-payment/         # Stripe checkout + webhook handler
    │   └── process-winner/          # Winner processing + rollback
    └── notification/                # RabbitMQ consumer → Telegram bot
```

External services (OutSystems): **User Service**, **Auction Service**

---

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd smugshotz
```

### 2. Create the `.env` file

Create a `.env` file in the project root with the following keys:

```env
# Database
MYSQL_ROOT_PASSWORD=root

# AWS S3
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=<your-bucket-name>

# Stripe
STRIPE_SECRET_KEY=sk_test_<your-key>
STRIPE_WEBHOOK_SECRET=whsec_<your-secret>
PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/payment/cancel

# SerpAPI (for eBay price model)
SERPAPI_KEY=<your-serpapi-key>

# Telegram
TELEGRAM_BOT_TOKEN=<your-bot-token>

# OutSystems (external)
USER_SERVICE_URL=https://<your-outsystems-domain>/User/rest/User
AUCTION_SERVICE_URL=https://<your-outsystems-domain>/Auction/rest/Auction
```

### 3. Add the Google Cloud Vision credentials

Place your Google Cloud service account JSON key at:

```
services/composite/process-camera-details/keys/esd-project-491106-c75374412546.json
```

The filename must match exactly — it is referenced in the Dockerfile for that service.

### 4. Build and start all services

```bash
docker compose build
docker compose up -d
```

This starts:
- Traefik (reverse proxy) on port 80, dashboard on port 8081
- RabbitMQ on port 5672, management UI on port 15672
- MySQL on port 3307
- All atomic + composite services
- Frontend on port 3000
- Notification consumer (no exposed port)

Wait about 30 seconds for MySQL and RabbitMQ to be healthy before using the app.

### 5. Forward Stripe webhooks (required for payment flow)

In a separate terminal, run:

```bash
stripe listen --forward-to http://localhost/webhook
```

Copy the `whsec_...` secret printed and set it as `STRIPE_WEBHOOK_SECRET` in your `.env`, then restart the process-payment service:

```bash
docker compose up -d --build process-payment
```

---

## Accessing the App

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Traefik dashboard | http://localhost:8081 |
| RabbitMQ management | http://localhost:15672 (guest / guest) |
| MySQL | localhost:3307 (root / root) |

---

## Core User Flows

### Create a listing
1. Sign up / log in
2. Go to **Create Auction**
3. Fill in brand, model, shutter count and upload a camera photo
4. AI analyses the image, scores condition, suggests a price
5. Set your start price, end time and listing title → submit

### Place a bid
1. Browse **Auctions**
2. Click into a listing and place a bid above the current highest

### Win an auction
1. When the auction timer ends, the winner receives a **Telegram message** with a Stripe payment link
2. Click the link and pay to confirm the order

### Rollback (payment failure simulation)
```bash
# Get the order ID for an auction
curl http://localhost/order/auction/<auction_id>

# Trigger rollback manually
curl -X POST http://localhost/rollback \
  -H "Content-Type: application/json" \
  -d '{"order_id": <order_id>, "auction_id": <auction_id>, "reason": "payment_failed"}'
```

Both seller and winner receive Telegram failure notifications.

---

## Rebuilding individual services

After changing source code for any service:

```bash
docker compose build <service-name>
docker compose up -d <service-name>
```

Example:
```bash
docker compose build notification
docker compose up -d notification
```

To rebuild everything:
```bash
docker compose build
docker compose up -d
```

---

## Stopping the project

```bash
docker compose down
```

To also delete all data (MySQL + RabbitMQ volumes):

```bash
docker compose down -v
```
