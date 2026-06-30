# Mallchain Mines - Proof-of-Engagement Economy

## Overview
Mines is a decentralized engagement marketplace where Creators spend MLPTS to buy engagement and Miners earn MLPTS by completing tasks. MLPTS can be converted to MallCoins via the main Mallchain app.

## Architecture
- **Mines Frontend:** `http://localhost:5176` - Campaign creation, task mining, wallet view
- **Mines Backend:** `http://localhost:4000` - Flask API with `/api/mines/*` endpoints + blockchain proxy
- **Main Mallchain:** `http://localhost:5173` - Wallet management, conversion, auth

## Blockchain Integration
The Mines frontend fetches wallet data directly from Mallchain blockchain via:
- `/api/mines/user-points/{address}` → `/marketplace/mallpoints/v1/user_points/{address}`
- `/api/mines/leaderboard` → `/marketplace/mallpoints/v1/user_points` (paginated)
- `/api/mines/conversion-window` → `/marketplace/mallpoints/v1/conversion_window`

## Authentication Flow
Mines receives auth via postMessage from the main Mallchain app. Wallet data comes from blockchain, not local Supabase.

## Key Routes
- `/wallet` - Full wallet page with MLPTS/MallCoin balance, leaderboard, transactions
- `/convert` - Redirects to main Mallchain for MLPTS→MallCoin conversion
- `/buy-mlpts` - Purchase MLPTS with draft preservation
- `/mining` - View available tasks and complete mining
- `/creator` - Create and manage campaigns

| Platform | View | Like | Comment | Share/Follow | Subscribe |
|----------|------|------|---------|--------------|-----------|
| YouTube Short | 0.8 | 2 | 4 | 6 | 8 |
| YouTube Medium | 1.5 | - | - | - | - |
| YouTube Long | 2.5 | - | - | - | - |
| TikTok | 0.5 | 1 | 3 | 5 | - |
| Instagram | - | 1 | 3 | 5 | 6 |
| X | - | 1 | 4 | 3 | 6 |
| Facebook | - | 1 | 2.5 | 4 | 5 |

## Conversion Tiers

| Tier | Wallet Range | Rate (MLPTS/MLC) |
|------|--------------|------------------|
| Basic | 0-999 | 145 |
| Bronze | 1,000-4,999 | 130 |
| Silver | 5,000-19,999 | 105 |
| Gold | 20,000-99,999 | 80 |
| Diamond | 100,000+ | 60 |

## Module Structure
- `rate_engine.py` - Rate lookups and expected outcome calculation
- `budget_calculator.py` - Campaign preview and MLPTS→MallCoin conversion
- `campaign_schema.py` - Campaign state machine and pool management
- `miner_feed.py` - Task feed, eligibility checks, wallet crediting
- `anti_fraud.py` - Fraud detection (self-farm hard block, velocity, device/IP checks)
- `proof_of_completion.py` - Screenshot OCR, pHash, EXIF validation
- `api_server.py` - Flask REST API endpoints