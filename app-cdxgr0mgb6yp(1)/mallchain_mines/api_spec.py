API_ENDPOINTS = {
    "creator": {
        "POST /campaigns": {
            "description": "Create a new engagement campaign",
            "request": {
                "creator_id": "string (wallet address)",
                "platform": "enum: youtube|tiktok|instagram|x|facebook|threads|snapchat",
                "task_type": "string (platform-specific)",
                "content_url": "string (validated URL)",
                "budget_mlpts": "float > 0",
                "video_length": "enum: short|medium|long (optional, for video platforms)"
            },
            "response": {
                "campaign_id": "string",
                "status": "enum: draft|active|review|rejected",
                "expected_actions": "int",
                "cost_per_action": "float",
                "validation_errors": "array (if any)"
            }
        },
        "GET /campaigns/{campaign_id}": {
            "description": "Get campaign details",
            "response": {
                "campaign_id": "string",
                "platform": "string",
                "task_type": "string",
                "content_url": "string",
                "budget_mlpts": "float",
                "remaining_pool_mlpts": "float",
                "actions_completed": "int",
                "status": "string"
            }
        },
        "POST /campaigns/{campaign_id}/preview": {
            "description": "Calculate campaign preview without creating",
            "request": {
                "platform": "string",
                "task_type": "string",
                "budget_mlpts": "float",
                "wallet_balance": "float",
                "creator_level": "int"
                "video_length": "string (optional)"
            },
            "response": {
                "expected_actions": "int",
                "cost_per_action": "float",
                "estimated_duration_days": "int",
                "validation": {"valid": "bool", "errors": "array"}
            }
        },
        "POST /campaigns/{campaign_id}/publish": {
            "description": "Publish campaign to blockchain",
            "request": {"accepted_terms_hash": "string (SHA-256)"},
            "response": {
                "status": "active",
                "tx_hash": "string (blockchain tx)",
                "pool_locked": "bool"
            }
        },
        "GET /miners/me/wallet": {
            "description": "Get creator's MLPTS wallet balance",
            "response": {
                "wallet_address": "string",
                "mlpts_balance": "float",
                "creator_level": "int",
                "completed_actions": "int",
                "spent_total": "float"
            }
        }
    },
    "miner": {
        "GET /tasks": {
            "description": "Get available tasks (platform filter)",
            "query": {
                "platform": "string (optional)",
                "limit": "int (default 20)"
            },
            "response": {
                "tasks": [
                    {
                        "campaign_id": "string",
                        "platform": "string",
                        "task_type": "string",
                        "reward_mlpts": "float",
                        "slots_remaining": "int",
                        "creator_handle": "string"
                    }
                ]
            }
        },
        "POST /tasks/{campaign_id}/complete": {
            "description": "Submit task completion with screenshot",
            "request": {"screenshot_base64": "string"},
            "response": {
                "success": "bool",
                "reward_mlpts": "float",
                "new_wallet_balance": "float",
                "verification": "enum: auto_approved|manual_review|rejected"
            }
        },
        "GET /miners/{miner_id}/wallet": {
            "description": "Get miner's wallet and stats",
            "response": {
                "wallet_balance_mlpts": "float",
                "total_earned_mlpts": "float",
                "conversion_tier": "enum: basic|bronze|silver|gold|diamond",
                "daily_converted_mlc": "float",
                "weekly_converted_mlc": "float"
            }
        },
        "POST /miners/{miner_id}/convert": {
            "description": "Convert MLPTS to MallCoins",
            "request": {"amount_mlpts": "float"},
            "response": {
                "success": "bool",
                "tier": "string",
                "rate": "int (MLPTS/MLC)",
                "fee_mlpts": "float",
                "net_mlpts": "float",
                "mlc_issued": "int",
                "errors": "array"
            }
        }
    },
    "admin": {
        "GET /admin/pending-reviews": {
            "description": "Get pending manual review items",
            "response": {
                "reviews": [
                    {
                        "review_id": "string",
                        "miner_id": "string",
                        "campaign_id": "string",
                        "screenshot_phash": "string",
                        "confidence_score": "float",
                        "submitted_at": "ISO timestamp"
                    }
                ]
            }
        },
        "POST /admin/reviews/{review_id}/adjudicate": {
            "description": "Approve or reject a review",
            "request": {"decision": "APPROVE|REJECT", "note": "string (optional)"},
            "response": {"status": "updated"}
        }
    }
}