import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

MALLCHAIN_REST = 'http://localhost:1317'

PLATFORM_LOGOS = {
    "facebook": "https://cdn-icons-png.flaticon.com/512/124/124010.png",
    "twitter": "https://cdn-icons-png.flaticon.com/512/733/733547.png",
    "telegram": "https://cdn-icons-png.flaticon.com/512/2111/2111644.png",
    "whatsapp": "https://cdn-icons-png.flaticon.com/512/3670/3670051.png",
    "facebook_pages": "https://cdn-icons-png.flaticon.com/512/124/124010.png",
    "fb": "https://cdn-icons-png.flaticon.com/512/124/124010.png",
    "x": "https://cdn-icons-png.flaticon.com/512/733/733547.png",
    "tg": "https://cdn-icons-png.flaticon.com/512/2111/2111644.png",
    "wa": "https://cdn-icons-png.flaticon.com/512/3670/3670051.png",
}

class MockPool:
    def __init__(self): self.campaigns = {}
    def create_campaign(self, **kwargs):
        campaign_id = f"camp_{len(self.campaigns) + 1}"
        platform = kwargs.get("platform", "").lower()
        logo = PLATFORM_LOGOS.get(platform, PLATFORM_LOGOS.get(platform.replace("_", ""), ""))
        return MockCampaign(campaign_id, logo)
    def lock_budget_on_chain(self, *args): pass

class MockCampaign:
    def __init__(self, campaign_id="test_campaign", platform_logo=""):
        self.campaign_id = campaign_id
        self.status = "active"
        self.platform_logo = platform_logo or "https://cdn-icons-png.flaticon.com/512/124/124010.png"
    def to_dict(self):
        return {"campaign_id": self.campaign_id, "status": self.status, "platform_logo": self.platform_logo}

class MockMinerFeed:
    def get_platform_filter_tasks(self, platform=None, limit=20):
        if platform:
            p = platform.lower()
            logo = PLATFORM_LOGOS.get(p, PLATFORM_LOGOS.get(p.replace("_", ""), PLATFORM_LOGOS["facebook"]))
            return [{"platform_logo": logo, "platform": p, "task_id": f"task_{p}_1", "title": f"Mallcoin task for {p.capitalize()}", "points": 50, "status": "active"}]
        return []
    def get_miner_wallet(self, miner_id): return {"wallet": 1000, "pending": 0, "approved": 0, "tasks_completed": 0}

class MockFraudDetector:
    def evaluate_miner_action(self, **kwargs): return {"decision": "allow", "risk_score": 0}

pool = MockPool()
miner_feed = MockMinerFeed()
fraud_detector = MockFraudDetector()

def calculate_conversion(mlpts_to_convert, wallet_balance):
    rate = 150
    fee = mlpts_to_convert * 0.03
    return {
        "tier": "basic",
        "rate": rate,
        "fee_amount": round(fee, 2),
        "net_mlpts": round(mlpts_to_convert - fee),
        "estimated_mlc": round((mlpts_to_convert - fee) / rate, 4),
    }

@app.route("/api/mines/user-points/<address>", methods=["GET"])
def get_user_points(address):
    return jsonify({"ok": True, "data": {"user_points": {"address": address, "points": 0, "tasks_completed": 0}}})

@app.route("/api/mines/leaderboard", methods=["GET"])
def get_leaderboard():
    return jsonify({"ok": True, "data": []})

@app.route("/api/mines/conversion-window", methods=["GET"])
def get_conversion_window():
    return jsonify({"ok": True, "data": {"conversion_window": {"is_open": False, "current_month": 0}}})

@app.route("/api/mines/economics", methods=["GET"])
def api_mines_economics():
    return jsonify({
        "ok": True,
        "data": {
            "total_supply": 0,
            "monthly_mined": 0,
            "weekly_mined": 0,
            "daily_mined": 0,
            "hourly_mined": 0,
        }
    })

@app.route("/api/mines/sync", methods=["POST"])
def api_mines_sync():
    data = request.json or {}
    address = data.get("address")
    points = data.get("points")
    tasks_completed = data.get("tasks_completed")
    if not address:
        return jsonify({"ok": False, "error": "Missing address"}), 400
    return jsonify({
        "ok": True,
        "data": {
            "address": address,
            "points": points,
            "tasks_completed": tasks_completed,
            "synced": True
        }
    })

@app.route("/api/mines/user/<address>/sync", methods=["GET", "POST"])
def api_user_sync(address):
    if request.method == "GET":
        return jsonify({
            "ok": True,
            "data": {
                "address": address,
                "points": 0,
                "tasks_completed": 0,
                "pending": 0,
                "approved_for_conversion": 0,
                "last_sync": None
            }
        })
    data = request.json or {}
    return jsonify({"ok": True, "data": {"address": address, "synced": True}})

@app.route("/api/mines/badge/<address>", methods=["GET"])
def api_badge_status(address):
    return jsonify({
        "ok": True,
        "data": {
            "address": address,
            "has_badge": False,
            "badge_level": "none",
            "next_badge_threshold": 5000
        }
    })

@app.route("/api/mines/tx/create", methods=["POST"])
def api_tx_create():
    import time
    data = request.json or {}
    return jsonify({
        "ok": True,
        "data": {
            "tx_id": f"tx_{int(time.time() * 1000)}",
            "type": data.get("type"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "status": "created"
        }
    })

@app.route("/api/mines/campaigns/active", methods=["GET"])
def api_mines_active_campaigns():
    platform = request.args.get("platform")
    if platform:
        p = platform.lower()
        logo = PLATFORM_LOGOS.get(p, PLATFORM_LOGOS["facebook"])
        return jsonify({
            "ok": True,
            "user_points": [{"platform": p, "platform_logo": logo, "task_id": f"task_{p}_auto", "title": f"Mallcoin task for {p.capitalize()}", "points": 50, "status": "active"}]
        })
    return jsonify({"ok": True, "user_points": []})

@app.route("/api/mines/campaigns/creator/<creator_id>", methods=["GET"])
def api_mines_creator_campaigns(creator_id):
    return jsonify({"ok": True, "data": []})

@app.route("/api/mines/balance/deduct", methods=["POST"])
def api_mines_deduct():
    return jsonify({"ok": True, "data": {"success": True}})

@app.route("/api/mines/balance/credit", methods=["POST"])
def api_mines_credit():
    return jsonify({"ok": True, "data": {"success": True}})

@app.route("/api/mines/submissions/me", methods=["GET"])
def api_mines_submissions():
    return jsonify({"ok": True, "data": []})

@app.route("/api/mines/submissions/pending", methods=["GET"])
def api_mines_pending():
    return jsonify({"ok": True, "data": []})

@app.route("/api/mines/verify-task", methods=["POST"])
def api_mines_verify():
    return jsonify({"ok": True, "data": {"eligible": True}})

@app.route("/api/miners/<miner_id>/wallet", methods=["GET"])
def get_miner_wallet(miner_id):
    return jsonify(miner_feed.get_miner_wallet(miner_id))

@app.route("/api/miners/<miner_id>/convert", methods=["POST"])
def convert_mlpts(miner_id):
    data = request.json or {}
    wallet = miner_feed.get_miner_wallet(miner_id)
    result = calculate_conversion(
        mlpts_to_convert=data.get("amount_mlpts"),
        wallet_balance=wallet["wallet"],
    )
    return jsonify(result)

@app.route("/api/tasks/<campaign_id>/complete", methods=["POST"])
def complete_task(campaign_id):
    if campaign_id not in pool.campaigns:
        return jsonify({"error": "Campaign not found"}), 404
    return jsonify({"success": True, "message": "Submitted for review"})

@app.route("/api/campaigns/preview", methods=["POST"])
def preview_campaign():
    data = request.json or {}
    return jsonify({
        "expected_actions": 150,
        "cost_per_action": 10,
        "estimated_duration_days": 7,
        "validation": {"valid": True, "errors": []}
    })

@app.route("/api/campaigns", methods=["POST"])
def create_campaign():
    data = request.json or {}
    campaign_id = f"camp_{len(pool.campaigns) + 1}"
    platform = data.get("platform", "").lower()
    platform_logo = PLATFORM_LOGOS.get(platform, PLATFORM_LOGOS.get("facebook"))
    pool.campaigns[campaign_id] = {
        "creator_id": data.get("creator_id"),
        "platform": platform,
        "platform_logo": platform_logo,
        "task_type": data.get("task_type"),
        "content_url": data.get("content_url"),
        "budget_mlpts": data.get("budget_mlpts"),
        "status": "active",
        "campaign_id": campaign_id,
    }
    return jsonify(pool.campaigns[campaign_id])

@app.route("/api/mines/profile/me", methods=["GET"])
def get_profile_me():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return jsonify({
        "ok": True,
        "data": {
            "id": "miner_" + token[:8],
            "username": "demo_user",
            "email": "demo@example.com",
            "role": "user",
            "creator_level": "1",
            "mlpts_balance": 1000,
            "mallcoin_balance": 50.5,
            "streak_count": 5,
            "tasks_completed": 12,
            "rank_points": 1200,
            "fraud_strikes": 0,
            "fraud_status": "clear",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
        }
    })

@app.route("/api/auth/login-username", methods=["POST"])
def login_username():
    data = request.json or {}
    return jsonify({
        "token": "demo_token_" + data.get("username", "user"),
        "user": {
            "id": "user_" + data.get("username", "user"),
            "username": data.get("username"),
            "role": "user",
            "mlpts_balance": 1000,
            "mallcoin_balance": 50.5,
        }
    })

@app.route("/api/auth/register-username", methods=["POST"])
def register_username():
    data = request.json or {}
    return jsonify({
        "token": "new_token_" + data.get("username", "user"),
        "user": {
            "id": "user_" + data.get("username", "user"),
            "username": data.get("username"),
            "role": "user",
            "mlpts_balance": 0,
            "mallcoin_balance": 0,
        }
    })

@app.route("/api/mines/social-tasks/mallcoin", methods=["GET", "POST"])
def social_tasks_mallcoin():
    if request.method == "POST":
        data = request.json or {}
        platform = data.get("platform", "facebook").lower()
        task_id = f"task_{platform}_{len(pool.campaigns) + 1}"
        return jsonify({
            "ok": True,
            "data": {
                "task_id": task_id,
                "platform": platform,
                "platform_logo": PLATFORM_LOGOS.get(platform, PLATFORM_LOGOS["facebook"]),
                "title": data.get("title", f"Mallcoin task for {platform.capitalize()}"),
                "points": data.get("points", 50),
                "status": "active",
                "content_url": data.get("content_url"),
            }
        })
    return jsonify({
        "ok": True,
        "data": [
            {"task_id": "task_fb_1", "platform": "facebook", "platform_logo": PLATFORM_LOGOS["facebook"], "title": "Share Mallcoin post on Facebook", "points": 50, "status": "active"},
            {"task_id": "task_twitter_1", "platform": "twitter", "platform_logo": PLATFORM_LOGOS["twitter"], "title": "Retweet Mallcoin announcement", "points": 30, "status": "active"},
            {"task_id": "task_telegram_1", "platform": "telegram", "platform_logo": PLATFORM_LOGOS["telegram"], "title": "Join Mallcoin Telegram channel", "points": 25, "status": "active"},
            {"task_id": "task_whatsapp_1", "platform": "whatsapp", "platform_logo": PLATFORM_LOGOS["whatsapp"], "title": "Share Mallcoin in WhatsApp group", "points": 40, "status": "active"},
            {"task_id": "task_fb_pages_1", "platform": "facebook_pages", "platform_logo": PLATFORM_LOGOS["facebook_pages"], "title": "Create Facebook Page post for Mallcoin", "points": 100, "status": "active"},
        ]
    })

@app.route("/api/mines/validator/submission", methods=["POST"])
def submit_for_validation():
    data = request.json or {}
    submission_id = f"sub_{int(time.time() * 1000)}"
    return jsonify({
        "ok": True,
        "data": {
            "submission_id": submission_id,
            "status": "pending",
            "validator_votes": {"yes": 0, "no": 0, "total": 0},
            "votes_needed": 6
        }
    })

@app.route("/api/mines/validator/<submission_id>/vote", methods=["POST"])
def validator_vote(submission_id):
    data = request.json or {}
    vote = data.get("vote")  # "yes" or "no"
    validator_id = data.get("validator_id")
    return jsonify({
        "ok": True,
        "data": {
            "submission_id": submission_id,
            "status": "pending",
            "validator_votes": {"yes": 3, "no": 2, "total": 5},
            "votes_needed": 6,
            "vote_recorded": True
        }
    })

@app.route("/api/mines/validator/<submission_id>", methods=["GET"])
def get_validation_status(submission_id):
    import random
    yes_votes = random.randint(0, 5)
    no_votes = random.randint(0, 5)
    total = yes_votes + no_votes
    status = "verified" if yes_votes > no_votes and total >= 6 else "rejected" if no_votes > yes_votes and total >= 6 else "pending"
    return jsonify({
        "ok": True,
        "data": {
            "submission_id": submission_id,
            "status": status,
            "validator_votes": {"yes": yes_votes, "no": no_votes, "total": total},
            "votes_needed": 6,
            "winner": "yes" if yes_votes > no_votes else "no" if no_votes > yes_votes else None,
            "mlpts_awarded": yes_votes > no_votes
        }
    })

@app.route("/api/mines/validator/channels", methods=["GET"])
def get_validator_channels():
    return jsonify({
        "ok": True,
        "data": [
            {"channel_id": "mallcoin", "name": "Mallcoin Social Tasks", "description": "Validate Mallcoin social media submissions"},
            {"channel_id": "mlc", "name": "MLC Token Campaigns", "description": "Validate MLC token related tasks"}
        ]
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000, debug=False)