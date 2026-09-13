# Mallchain Backend API Endpoint Reference Guide

## Overview

This comprehensive reference documents all API endpoints available in the Mallchain backend. Each endpoint includes HTTP method, authentication requirements, request/response examples, error codes, rate limiting, and pagination details where applicable.

**Base URL**: `http://localhost:4000` (development) | `https://api.mallchain.io` (production)

**API Version**: 1.0

---

## Table of Contents

1. [Health & Status Endpoints](#health--status-endpoints)
2. [Authentication Endpoints](#authentication-endpoints)
3. [Wallet & Balance Endpoints](#wallet--balance-endpoints)
4. [Transaction Endpoints](#transaction-endpoints)
5. [Blockchain Data Endpoints](#blockchain-data-endpoints)
6. [Marketplace Endpoints](#marketplace-endpoints)
7. [Staking Endpoints](#staking-endpoints)
8. [Governance Endpoints](#governance-endpoints)
9. [Mallpoints Endpoints](#mallpoints-endpoints)
10. [Admin Endpoints](#admin-endpoints)

---

## Health & Status Endpoints

### GET /api/health

Returns comprehensive health status of the backend and its dependencies.

**Authentication**: None (Public)

**Request**:
```bash
GET /api/health HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "status": "healthy",
  "backend": {
    "status": "alive",
    "uptime": 3600000,
    "version": "1.0.0"
  },
  "blockchain": {
    "status": "connected",
    "chainId": "mallchain-testnet-1",
    "latestHeight": 1234567,
    "latestBlockTime": "2024-05-10T12:34:56Z",
    "syncStatus": "synced"
  },
  "database": {
    "status": "connected",
    "type": "mongodb",
    "responseTime": 5
  },
  "redis": {
    "status": "connected",
    "responseTime": 3
  },
  "timestamp": "2024-05-10T12:35:00Z"
}
```

**Error Responses**:
- **503 Service Unavailable**: One or more critical dependencies are down
```json
{
  "status": "unhealthy",
  "errors": [
    "blockchain_unreachable",
    "redis_unavailable"
  ],
  "timestamp": "2024-05-10T12:35:00Z"
}
```

**Rate Limit**: Unlimited (health checks)

**Notes**: 
- This endpoint should be called periodically by load balancers
- Returns 503 if blockchain or MongoDB are unavailable
- Useful for monitoring and alerting

---

### GET /api/ready

Readiness probe for Kubernetes/container orchestration.

**Authentication**: None (Public)

**Request**:
```bash
GET /api/ready HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "ready": true,
  "message": "Service is ready to accept traffic",
  "dependencies": {
    "blockchain": "ready",
    "database": "ready",
    "redis": "ready"
  }
}
```

**Error Response** (503 Service Unavailable):
```json
{
  "ready": false,
  "message": "Service cannot accept traffic",
  "reason": "blockchain_initializing",
  "retryAfter": 5
}
```

**Rate Limit**: Unlimited

**Notes**: 
- Used for startup probe in Kubernetes
- Returns immediately if service is ready
- No external checks performed

---

### GET /api/live

Liveness probe - indicates if the process is running.

**Authentication**: None (Public)

**Request**:
```bash
GET /api/live HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "status": "alive",
  "timestamp": "2024-05-10T12:35:00Z"
}
```

**Rate Limit**: Unlimited

**Notes**:
- Lightweight check with no external calls
- Always returns 200 if backend process is running
- Used for basic liveness checks

---

## Authentication Endpoints

### POST /api/auth/register

Register a new user account.

**Authentication**: None (Public)

**Request**:
```bash
POST /api/auth/register HTTP/1.1
Host: localhost:4000
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

**Request Schema**:
- `username` (string, required): 3-30 alphanumeric characters, unique
- `email` (string, required): Valid email, unique
- `password` (string, required): Minimum 8 characters, must contain uppercase, lowercase, number, special char
- `confirmPassword` (string, required): Must match password

**Response** (201 Created):
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "createdAt": "2024-05-10T12:35:00Z"
  }
}
```

**Error Responses**:

**400 Bad Request** - Validation error:
```json
{
  "success": false,
  "error": "validation_error",
  "details": {
    "password": "Password must be at least 8 characters"
  }
}
```

**409 Conflict** - Username or email already exists:
```json
{
  "success": false,
  "error": "user_exists",
  "message": "Username or email already registered"
}
```

**Rate Limit**: 5 requests per 15 minutes per IP

---

### POST /api/auth/login

Authenticate user and return JWT token.

**Authentication**: None (Public)

**Request**:
```bash
POST /api/auth/login HTTP/1.1
Host: localhost:4000
Content-Type: application/json

{
  "username": "john_doe",
  "password": "SecurePass123!"
}
```

**Request Schema**:
- `username` (string, required): Username or email
- `password` (string, required): User password

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ1c2VybmFtZSI6ImpvaG5fZG9lIiwiaWF0IjoxNjE1ODY4MDAwLCJleHAiOjE2MTU5NTQ0MDB9.signature",
    "expiresIn": 86400,
    "user": {
      "userId": "507f1f77bcf86cd799439011",
      "username": "john_doe",
      "email": "john@example.com"
    }
  }
}
```

**Token Details**:
- JWT token expires in 24 hours (86400 seconds)
- Token should be stored in localStorage on frontend
- Include token in Authorization header for protected endpoints: `Authorization: Bearer {token}`

**Error Responses**:

**401 Unauthorized** - Invalid credentials:
```json
{
  "success": false,
  "error": "invalid_credentials",
  "message": "Username or password is incorrect"
}
```

**400 Bad Request** - Missing fields:
```json
{
  "success": false,
  "error": "missing_fields",
  "message": "Username and password are required"
}
```

**Rate Limit**: 10 requests per 15 minutes per IP

---

### POST /api/auth/logout

Logout the current user.

**Authentication**: Required (Bearer Token)

**Request**:
```bash
POST /api/auth/logout HTTP/1.1
Host: localhost:4000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Rate Limit**: 20 requests per 15 minutes per user

---

### GET /api/auth/me

Get current authenticated user information.

**Authentication**: Required (Bearer Token)

**Request**:
```bash
GET /api/auth/me HTTP/1.1
Host: localhost:4000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "profile": {
      "avatar": "https://api.mallchain.io/avatars/john_doe.jpg",
      "bio": "Blockchain enthusiast",
      "location": "San Francisco"
    },
    "stats": {
      "totalTransactions": 150,
      "totalVolume": 50000,
      "joinedDate": "2024-01-15T10:00:00Z"
    }
  }
}
```

**Error Response**:

**401 Unauthorized** - Invalid or expired token:
```json
{
  "success": false,
  "error": "invalid_token",
  "message": "Invalid or expired token"
}
```

**Rate Limit**: 100 requests per minute per user

---

## Wallet & Balance Endpoints

### GET /api/wallets/:address/balances

Get wallet balance for a specific address.

**Authentication**: None (Public)

**Parameters**:
- `:address` (path, required): Mallchain address (format: mall1...)

**Request**:
```bash
GET /api/wallets/mall1xyz123abc.../balances HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "address": "mall1xyz123abc...",
    "balances": {
      "mallcoin": {
        "amount": "1500000",
        "denom": "umlcn",
        "displayAmount": 1500,
        "displayDenom": "MLCN"
      },
      "mallpoints": {
        "amount": "5000",
        "denom": "points",
        "displayAmount": 5000,
        "displayDenom": "POINTS"
      }
    },
    "staked": {
      "amount": "500000",
      "denom": "umlcn",
      "displayAmount": 500,
      "displayDenom": "MLCN"
    },
    "delegations": {
      "validator1": "250000",
      "validator2": "250000"
    },
    "locked": {
      "amount": "100000",
      "reason": "vault_lock",
      "unlocksAt": "2024-05-17T12:35:00Z"
    },
    "totalValue": {
      "usd": 45000,
      "currency": "USD"
    },
    "lastUpdated": "2024-05-10T12:35:00Z"
  }
}
```

**Error Responses**:

**404 Not Found** - Address not found:
```json
{
  "success": false,
  "error": "address_not_found",
  "message": "Address does not exist or has no balance"
}
```

**400 Bad Request** - Invalid address format:
```json
{
  "success": false,
  "error": "invalid_address",
  "message": "Address must be in format mall1..."
}
```

**Rate Limit**: 60 requests per minute per IP

**Caching**: Response is cached for 30 seconds (Redis)

---

### GET /api/wallets/:address/transactions

Get transaction history for a wallet.

**Authentication**: None (Public)

**Parameters**:
- `:address` (path, required): Mallchain address
- `status` (query, optional): Filter by status - `all`, `confirmed`, `pending`, `failed` (default: `all`)
- `page` (query, optional): Page number (default: 1)
- `limit` (query, optional): Results per page, max 100 (default: 20)

**Request**:
```bash
GET /api/wallets/mall1xyz.../transactions?status=confirmed&page=1&limit=20 HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "address": "mall1xyz...",
    "transactions": [
      {
        "hash": "A1B2C3D4E5F6...",
        "type": "send",
        "from": "mall1abc...",
        "to": "mall1def...",
        "amount": "100",
        "denom": "umlcn",
        "displayAmount": 100,
        "displayDenom": "MLCN",
        "status": "confirmed",
        "timestamp": "2024-05-10T10:30:00Z",
        "blockHeight": 1234567,
        "gasUsed": 50000,
        "memo": "Payment for services"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

**Rate Limit**: 60 requests per minute per IP

**Pagination**: Supports cursor-based and offset-based pagination

---

## Transaction Endpoints

### POST /api/tx

Create and broadcast a new transaction.

**Authentication**: Required (Bearer Token)

**Request**:
```bash
POST /api/tx HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "type": "transfer",
  "to": "mall1def...",
  "amount": "100",
  "memo": "Payment for services",
  "gas": 50000,
  "gasPrice": "0.1umlcn"
}
```

**Request Schema**:
- `type` (string, required): Transaction type - `transfer`, `stake`, `unstake`, `vote`, `delegate`
- `to` (string, required): Recipient address
- `amount` (string, required): Amount in smallest unit (umlcn)
- `memo` (string, optional): Transaction memo
- `gas` (number, optional): Gas limit (default: 200000)
- `gasPrice` (string, optional): Gas price (default: "0.1umlcn")

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Transaction created and broadcasted",
  "data": {
    "txHash": "A1B2C3D4E5F6...",
    "txId": "TX-1234567890",
    "from": "mall1abc...",
    "to": "mall1def...",
    "amount": "100",
    "denom": "umlcn",
    "status": "pending",
    "estimatedFee": "5000",
    "timestamp": "2024-05-10T12:35:00Z",
    "blockHeight": null,
    "confirmations": 0
  }
}
```

**Error Responses**:

**400 Bad Request** - Invalid transaction:
```json
{
  "success": false,
  "error": "invalid_transaction",
  "message": "Invalid recipient address format"
}
```

**402 Payment Required** - Insufficient balance:
```json
{
  "success": false,
  "error": "insufficient_balance",
  "message": "Balance too low for this transaction"
}
```

**429 Too Many Requests** - Rate limit exceeded:
```json
{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Try again later.",
  "retryAfter": 60
}
```

**Rate Limit**: 40 requests per minute per user for transactions

**Broadcasting**: Transaction is immediately broadcasted to the blockchain

---

### GET /api/tx/:txHash

Get transaction details by hash.

**Authentication**: None (Public)

**Parameters**:
- `:txHash` (path, required): Transaction hash

**Request**:
```bash
GET /api/tx/A1B2C3D4E5F6... HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "txHash": "A1B2C3D4E5F6...",
    "status": "confirmed",
    "from": "mall1abc...",
    "to": "mall1def...",
    "amount": "100",
    "denom": "umlcn",
    "fee": "5000",
    "gas": 50000,
    "gasUsed": 48750,
    "blockHeight": 1234567,
    "timestamp": "2024-05-10T12:35:00Z",
    "confirmations": 10,
    "memo": "Payment for services",
    "rawTx": {...}
  }
}
```

**Rate Limit**: 100 requests per minute per IP

**Caching**: Response is cached for 60 seconds

---

### GET /api/tx/history

Get recent transactions for authenticated user.

**Authentication**: Required (Bearer Token)

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page, max 100 (default: 20)
- `status` (optional): Filter by status - `all`, `confirmed`, `pending`, `failed`

**Request**:
```bash
GET /api/tx/history?page=1&limit=20&status=confirmed HTTP/1.1
Host: localhost:4000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "transactions": [
    {
      "hash": "A1B2C3D4E5F6...",
      "type": "send",
      "from": "mall1abc...",
      "to": "mall1def...",
      "amount": "100",
      "denom": "umlcn",
      "displayAmount": 100,
      "displayDenom": "MLCN",
      "status": "confirmed",
      "timestamp": "2024-05-10T12:35:00Z",
      "blockHeight": 1234567
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Rate Limit**: 60 requests per minute per user

---

## Blockchain Data Endpoints

### GET /api/blockchain/block/:height

Get blockchain block details.

**Authentication**: None (Public)

**Parameters**:
- `:height` (path, required): Block height

**Request**:
```bash
GET /api/blockchain/block/1234567 HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "height": "1234567",
    "hash": "ABCD1234...",
    "timestamp": "2024-05-10T12:35:00Z",
    "proposer": "mallvaloper1xyz...",
    "transactions": 42,
    "gasUsed": 2500000,
    "gasLimit": 10000000,
    "validatorsVoted": 67,
    "chainId": "mallchain-testnet-1",
    "version": "1.0.0",
    "appVersion": "1"
  }
}
```

**Rate Limit**: 60 requests per minute per IP

---

### GET /api/blockchain/blocks/latest

Get latest blockchain blocks.

**Authentication**: None (Public)

**Query Parameters**:
- `limit` (optional): Number of blocks to return, max 100 (default: 10)

**Request**:
```bash
GET /api/blockchain/blocks/latest?limit=10 HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "latestHeight": 1234570,
    "blocks": [
      {
        "height": "1234570",
        "hash": "ABCD1234...",
        "timestamp": "2024-05-10T12:35:15Z",
        "transactions": 35,
        "proposer": "mallvaloper1xyz..."
      }
    ]
  }
}
```

**Rate Limit**: 120 requests per minute per IP

**WebSocket Support**: Subscribe to real-time block updates via Socket.IO event `block:new`

---

### GET /api/validators

Get list of active validators.

**Authentication**: None (Public)

**Query Parameters**:
- `limit` (optional): Max 100 (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Request**:
```bash
GET /api/validators?limit=50&offset=0 HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "validators": [
      {
        "operatorAddress": "mallvaloper1xyz...",
        "consensusPubkey": {
          "@type": "/cosmos.crypto.ed25519.PubKey",
          "key": "..."
        },
        "jailed": false,
        "status": "BOND_STATUS_BONDED",
        "tokens": "500000000",
        "delegatorShares": "500000000.000000000000000000",
        "description": {
          "moniker": "Validator Name",
          "identity": "",
          "website": "https://validator.com",
          "securityContact": "",
          "details": "Validator description"
        },
        "unbondingHeight": 0,
        "unbondingTime": "1970-01-01T00:00:00Z",
        "commission": {
          "commissionRates": {
            "rate": "0.100000000000000000",
            "maxRate": "0.200000000000000000",
            "maxChangeRate": "0.010000000000000000"
          },
          "updateTime": "2024-01-01T00:00:00Z"
        },
        "minSelfDelegation": "1000000"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0
    }
  }
}
```

**Rate Limit**: 60 requests per minute per IP

**Caching**: Response is cached for 5 minutes

---

## Marketplace Endpoints

### GET /api/market

List all marketplace items.

**Authentication**: None (Public)

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page, max 100 (default: 20)
- `category` (optional): Filter by category
- `minPrice` (optional): Minimum price filter
- `maxPrice` (optional): Maximum price filter
- `sort` (optional): Sort by - `newest`, `price_asc`, `price_desc`, `popular`

**Request**:
```bash
GET /api/market?page=1&limit=20&category=electronics&sort=price_asc HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "Premium Laptop",
        "description": "High-performance laptop for developers",
        "category": "electronics",
        "price": "500000",
        "priceUsd": 5000,
        "seller": "mall1abc...",
        "image": "https://api.mallchain.io/items/507f1f77bcf86cd799439011.jpg",
        "rating": 4.8,
        "reviews": 42,
        "condition": "new",
        "listed": "2024-05-01T10:00:00Z",
        "stock": 5
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 500,
      "totalPages": 25
    }
  }
}
```

**Rate Limit**: 60 requests per minute per IP

**Caching**: Cached for 30 seconds

---

### POST /api/market

Create a new marketplace listing.

**Authentication**: Required (Bearer Token)

**Request**:
```bash
POST /api/market HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "title": "Premium Laptop",
  "description": "High-performance laptop for developers",
  "category": "electronics",
  "price": "500000",
  "condition": "new",
  "stock": 5,
  "images": ["data:image/jpeg;base64,..."]
}
```

**Request Schema**:
- `title` (string, required): 5-100 characters
- `description` (string, required): 20-2000 characters
- `category` (string, required): Valid category ID
- `price` (string, required): Price in smallest unit (umlcn)
- `condition` (string, optional): `new`, `like_new`, `used`, `refurbished`
- `stock` (number, optional): Available quantity (default: 1)
- `images` (array, optional): Base64 encoded images

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Listing created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Premium Laptop",
    "slug": "premium-laptop",
    "seller": "mall1abc...",
    "status": "active",
    "createdAt": "2024-05-10T12:35:00Z"
  }
}
```

**Rate Limit**: 20 requests per hour per user

---

### POST /api/market/:itemId/buy

Purchase an item from marketplace.

**Authentication**: Required (Bearer Token)

**Parameters**:
- `:itemId` (path, required): Item ID

**Request**:
```bash
POST /api/market/507f1f77bcf86cd799439011/buy HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "quantity": 1,
  "shippingAddress": "123 Main St, City, State 12345"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Purchase successful",
  "data": {
    "orderId": "ORD-1234567890",
    "itemId": "507f1f77bcf86cd799439011",
    "quantity": 1,
    "totalPrice": "500000",
    "status": "pending_payment",
    "txHash": "A1B2C3D4E5F6...",
    "createdAt": "2024-05-10T12:35:00Z"
  }
}
```

**Rate Limit**: 60 requests per minute per user

---

## Staking Endpoints

### GET /api/staking/:address

Get staking information for an address.

**Authentication**: None (Public)

**Parameters**:
- `:address` (path, required): Mallchain address

**Request**:
```bash
GET /api/staking/mall1abc... HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "address": "mall1abc...",
    "stakes": [
      {
        "stakeId": "STAKE-12345",
        "amount": "500000",
        "denom": "umlcn",
        "displayAmount": 500,
        "displayDenom": "MLCN",
        "stakedAt": "2024-01-15T10:00:00Z",
        "unlocksAt": "2024-07-15T10:00:00Z",
        "status": "active",
        "rewardsEarned": "25000",
        "rewardsUnclaimed": "5000"
      }
    ],
    "totalStaked": "500000",
    "totalRewards": "25000",
    "totalUnclaimedRewards": "5000",
    "nextRewardDistribution": "2024-05-12T00:00:00Z"
  }
}
```

**Rate Limit**: 60 requests per minute per IP

---

### POST /api/staking/stake

Stake tokens for rewards.

**Authentication**: Required (Bearer Token)

**Request**:
```bash
POST /api/staking/stake HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "amount": "500000",
  "validator": "mallvaloper1xyz...",
  "duration": 180
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Stake created successfully",
  "data": {
    "stakeId": "STAKE-12345",
    "amount": "500000",
    "validator": "mallvaloper1xyz...",
    "stakedAt": "2024-05-10T12:35:00Z",
    "unlocksAt": "2024-11-10T12:35:00Z",
    "estimatedRewards": "25000",
    "txHash": "A1B2C3D4E5F6..."
  }
}
```

**Rate Limit**: 10 requests per hour per user

---

### POST /api/staking/:stakeId/unstake

Unstake tokens and claim rewards.

**Authentication**: Required (Bearer Token)

**Parameters**:
- `:stakeId` (path, required): Stake ID

**Request**:
```bash
POST /api/staking/STAKE-12345/unstake HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Unstake successful",
  "data": {
    "stakeId": "STAKE-12345",
    "principalReturned": "500000",
    "rewardsClaimed": "25000",
    "totalUnstaked": "525000",
    "txHash": "A1B2C3D4E5F6...",
    "status": "completed"
  }
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "stake_locked",
  "message": "Stake cannot be unstaked yet. Unlocks in 45 days.",
  "unlocksAt": "2024-06-24T12:35:00Z"
}
```

**Rate Limit**: 10 requests per hour per user

---

## Governance Endpoints

### GET /api/governance

Get active governance proposals.

**Authentication**: None (Public)

**Query Parameters**:
- `status` (optional): Filter by status - `active`, `passed`, `rejected`, `pending`
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page, max 100 (default: 20)

**Request**:
```bash
GET /api/governance?status=active&page=1&limit=20 HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "proposals": [
      {
        "proposalId": "1",
        "title": "Increase validator commission to 5%",
        "description": "Proposal to increase validator commission rates...",
        "status": "active",
        "votingPower": {
          "yes": 6700000,
          "no": 1500000,
          "abstain": 800000
        },
        "createdAt": "2024-05-01T10:00:00Z",
        "votingEndsAt": "2024-05-15T10:00:00Z",
        "threshold": "0.5"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45
    }
  }
}
```

**Rate Limit**: 60 requests per minute per IP

---

### POST /api/governance/:proposalId/vote

Cast a vote on a governance proposal.

**Authentication**: Required (Bearer Token)

**Parameters**:
- `:proposalId` (path, required): Proposal ID

**Request**:
```bash
POST /api/governance/1/vote HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "option": "yes"
}
```

**Request Schema**:
- `option` (string, required): Vote option - `yes`, `no`, `abstain`

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Vote cast successfully",
  "data": {
    "proposalId": "1",
    "voter": "mall1abc...",
    "option": "yes",
    "votingPower": "1000000",
    "txHash": "A1B2C3D4E5F6...",
    "timestamp": "2024-05-10T12:35:00Z"
  }
}
```

**Rate Limit**: 20 requests per hour per user

---

## Mallpoints Endpoints

### GET /api/mallpoints/:address

Get mallpoints balance and details for an address.

**Authentication**: None (Public)

**Parameters**:
- `:address` (path, required): Mallchain address

**Request**:
```bash
GET /api/mallpoints/mall1abc... HTTP/1.1
Host: localhost:4000
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "address": "mall1abc...",
    "balance": "5000",
    "totalEarned": "8000",
    "totalSpent": "3000",
    "level": "gold",
    "tasksCompleted": 15,
    "streakDays": 7,
    "badges": ["early_adopter", "active_trader"],
    "lastUpdated": "2024-05-10T12:35:00Z"
  }
}
```

**Rate Limit**: 60 requests per minute per IP

---

### POST /api/mallpoints/redeem

Redeem mallpoints for mallcoins.

**Authentication**: Required (Bearer Token)

**Request**:
```bash
POST /api/mallpoints/redeem HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "points": "1000"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Redemption successful",
  "data": {
    "pointsRedeemed": "1000",
    "mlcnReceived": "1000",
    "txHash": "A1B2C3D4E5F6...",
    "remainingPoints": "4000",
    "timestamp": "2024-05-10T12:35:00Z"
  }
}
```

**Rate Limit**: 10 requests per day per user

---

## Admin Endpoints

### GET /api/admin/metrics

Get system metrics and statistics (Admin only).

**Authentication**: Required (API Key in Authorization header)

**Request**:
```bash
GET /api/admin/metrics HTTP/1.1
Host: localhost:4000
Authorization: Bearer admin_api_key_xyz...
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 5000,
      "active24h": 1250,
      "active7d": 3400
    },
    "transactions": {
      "total": 125000,
      "last24h": 8500,
      "avgValue": "850"
    },
    "blockchain": {
      "height": 1234567,
      "syncStatus": "synced",
      "avgBlockTime": 3.2
    },
    "api": {
      "requestsPerSecond": 450,
      "avgResponseTime": 125,
      "errorRate": 0.02
    }
  }
}
```

**Rate Limit**: 100 requests per minute per API key

---

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "message": "Optional success message",
  "data": { }
}
```

### Error Response
```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "details": { }
}
```

---

## Rate Limiting

All endpoints have rate limits applied per IP address or authenticated user. Rate limit information is returned in response headers:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the limit resets

Example:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1715338560
```

When rate limit is exceeded, response is 429 Too Many Requests.

---

## Authentication

### Bearer Token Authentication

Include JWT token in Authorization header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key Authentication (Admin endpoints)

Include API key in Authorization header:
```
Authorization: Bearer your_api_key_here
```

---

## Error Codes

| Code | HTTP Status | Meaning | Solution |
|------|-------------|---------|----------|
| `invalid_request` | 400 | Request format is invalid | Check request format |
| `unauthorized` | 401 | Authentication required or invalid | Provide valid token |
| `forbidden` | 403 | Insufficient permissions | Check user roles/permissions |
| `not_found` | 404 | Resource not found | Verify resource ID/path |
| `conflict` | 409 | Resource already exists | Use unique identifier |
| `validation_error` | 400 | Input validation failed | Fix request parameters |
| `rate_limit_exceeded` | 429 | Too many requests | Wait before retrying |
| `internal_error` | 500 | Server error | Retry later or contact support |
| `service_unavailable` | 503 | Service temporarily unavailable | Retry later |

---

## WebSocket Real-Time Events

Connect to Socket.IO server for real-time updates:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  transports: ['websocket', 'polling']
});

// Subscribe to wallet updates
socket.emit('subscribe:wallet', 'mall1abc...');
socket.on('wallet:update', (data) => {
  console.log('Wallet updated:', data);
});

// Subscribe to market updates
socket.emit('subscribe:market');
socket.on('market:feed', (events) => {
  console.log('Market activity:', events);
});

// Subscribe to new blocks
socket.emit('subscribe:blocks');
socket.on('block:new', (block) => {
  console.log('New block:', block);
});

// Price updates
socket.emit('subscribe:price');
socket.on('price:current', (prices) => {
  console.log('Price update:', prices);
});
```

---

## CORS Policy

All endpoints support CORS from allowed origins. Configure allowed origins in backend via `CORS_ORIGINS` environment variable.

Development: `http://localhost:5173`
Production: Configure via environment variables

---

## Pagination

Endpoints support pagination with `page` and `limit` query parameters. Response includes pagination metadata:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 500,
    "totalPages": 25
  }
}
```

---

## Document Version

- **Version**: 1.0
- **Last Updated**: 2024-05-10
- **API Version**: Mallchain v1.0
- **Status**: Production Ready
