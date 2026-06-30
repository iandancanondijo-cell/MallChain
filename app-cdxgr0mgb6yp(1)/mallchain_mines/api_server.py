from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from .campaign_schema import CampaignPool, validate_creator_budget, CREATOR_LEVELS
from .budget_calculator import calculate_campaign_preview, calculate_conversion
from .miner_feed import MinerFeed, check_task_eligibility
from .proof_of_completion import run_platform_validation, check_screenshot_reuse, register_screenshot
from .anti_fraud import FraudDetector

app = Flask(__name__)
CORS(app)

MALLCHAIN_REST = 'http://localhost:1317'

pool = CampaignPool()
miner_feed = MinerFeed(pool)
fraud_detector = FraudDetector()

@app.route("/api/mines/user-points/<address>", methods=["GET"])
def get_user_points(address):
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/user_points/{address}", timeout=5)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Blockchain module unavailable"}), 503

@app.route("/api/mines/leaderboard", methods=["GET"])
def get_leaderboard():
    try:
        limit = int(request.args.get("limit", 20))
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/user_points?pagination.limit={limit}", timeout=5)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Blockchain module unavailable"}), 503

@app.route("/api/mines/conversion-window", methods=["GET"])
def get_conversion_window():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/conversion_window", timeout=5)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Blockchain module unavailable"}), 503

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    platform = request.args.get("platform")
    limit = int(request.args.get("limit", 20))
    tasks = miner_feed.get_platform_filter_tasks(platform=platform, limit=limit)
    return jsonify({"tasks": tasks})

@app.route("/api/campaigns/preview", methods=["POST"])
def preview_campaign():
    data = request.json
    preview = calculate_campaign_preview(
        platform=data.get("platform"),
        task_type=data.get("task_type"),
        budget_mlpts=data.get("budget_mlpts"),
        video_length=data.get("video_length"),
        wallet_balance=data.get("wallet_balance"),
        creator_level=data.get("creator_level", 1)
    )
    return jsonify(preview)

@app.route("/api/campaigns", methods=["POST"])
def create_campaign():
    data = request.json
    preview = calculate_campaign_preview(
        platform=data.get("platform"),
        task_type=data.get("task_type"),
        budget_mlpts=data.get("budget_mlpts"),
        wallet_balance=data.get("wallet_balance", 100000),
    )
    
    if preview.get("validation") and not preview["validation"]["valid"]:
        return jsonify({"status": "rejected", "validation_errors": preview["validation"]["errors"]})
    
    campaign = pool.create_campaign(
        creator_id=data.get("creator_id"),
        platform=data.get("platform"),
        task_type=data.get("task_type"),
        content_url=data.get("content_url"),
        budget_mlpts=data.get("budget_mlpts"),
        video_length=data.get("video_length")
    )
    
    return jsonify(campaign.to_dict())

@app.route("/api/mines/campaigns/active", methods=["GET"])
def api_mines_active_campaigns():
    platform = request.args.get("platform")
    tasks = miner_feed.get_platform_filter_tasks(platform=platform)
    return jsonify({"ok": True, "data": tasks})

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

@app.route("/api/mines/economics", methods=["GET"])
def api_mines_economics():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/user_points?pagination.limit=1000", timeout=5)
        if res.ok:
            data = res.json()
            points_list = data.get("data", {}).get("user_points", []) if isinstance(data, dict) else data
            total_supply = sum(int(p.get("points", 0)) for p in points_list)
            if total_supply > 0:
                return jsonify({
                    "ok": True,
                    "data": {
                        "total_supply": total_supply,
                        "monthly_mined": total_supply,
                        "weekly_mined": int(total_supply * 0.1 / 4),
                        "daily_mined": int(total_supply * 0.1 / 4 / 7),
                        "hourly_mined": int(total_supply * 0.1 / 4 / 7 / 24),
                    }
                })
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Blockchain module unavailable"}), 503

@app.route("/api/mines/sync", methods=["POST"])
def api_mines_sync():
    data = request.json
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
    data = request.json
    return jsonify({"ok": True, "data": {"address": address, "synced": True}})

@app.route("/api/mines/badge/<address>", methods=["GET"])
def api_badge_status(address):
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/user_points/{address}/badge", timeout=5)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
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
    data = request.json
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

@app.route("/api/miners/<miner_id>/wallet", methods=["GET"])
def get_miner_wallet(miner_id):
    return jsonify(miner_feed.get_miner_wallet(miner_id))

@app.route("/api/miners/<miner_id>/convert", methods=["POST"])
def convert_mlpts(miner_id):
    data = request.json
    wallet = miner_feed.get_miner_wallet(miner_id)
    result = calculate_conversion(
        mlpts_to_convert=data.get("amount_mlpts"),
        wallet_balance=wallet["wallet"],
    )
    return jsonify(result)

@app.route("/api/tasks/<campaign_id>/complete", methods=["POST"])
def complete_task(campaign_id):
    data = request.json
    screenshot = data.get("screenshot_base64", "")
    
    if campaign_id not in pool.campaigns:
        return jsonify({"error": "Campaign not found"}), 404
    
    reuse = check_screenshot_reuse(screenshot)
    if reuse["reused"]:
        return jsonify({"success": False, "error": "Screenshot previously used"}), 400
    
    return jsonify({"success": True, "message": "Submitted for review"})

@app.route("/api/mines/export", methods=["GET"])
def api_mines_export():
    import json
    try:
        # Export campaigns and user points from in-memory structures
        campaigns_data = [c.to_dict() if hasattr(c, 'to_dict') else c for c in pool.campaigns.values()]
        miner_data = {addr: {
            "wallet": w.get("wallet", 0),
            "earned_total": w.get("earned_total", 0),
            "completed_tasks": len(w.get("completed", []))
        } for addr, w in miner_feed.miner_actions.items()}
        
        export = {
            "timestamp": int(__import__('time').time()),
            "campaigns": campaigns_data,
            "miner_wallets": miner_data,
            "total_supply": sum(d["wallet"] for d in miner_data.values()),
        }
        return jsonify({"ok": True, "data": export})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/mines/import", methods=["POST"])
def api_mines_import():
    try:
        data = request.json or {}
        campaigns = data.get("campaigns", [])
        miner_wallets = data.get("miner_wallets", {})
        
        # Import campaigns into pool
        for campaign_data in campaigns:
            if isinstance(campaign_data, dict) and "creator_id" in campaign_data:
                campaign_id = campaign_data.get("id", f"imported_{int(__import__('time').time())}")
                pool.campaigns[campaign_id] = type("Campaign", (), {
                    "to_dict": lambda self=campaign_data: campaign_data,
                    "creator_id": campaign_data.get("creator_id"),
                    "campaign_id": campaign_id,
                    **campaign_data
                })()
        
        # Import miner wallets into miner_actions
        for addr, wallet in miner_wallets.items():
            miner_feed.miner_actions[addr] = {
                "wallet": wallet.get("wallet", 0),
                "earned_total": wallet.get("earned_total", 0),
                "completed": []
            }
        
        return jsonify({
            "ok": True,
            "data": {
                "imported_campaigns": len(campaigns),
                "imported_wallets": len(miner_wallets),
            }
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/mines/rates", methods=["GET"])
def api_mines_rates():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/rates", timeout=5)
        if res.ok:
            return jsonify(res.json())
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Configuration unavailable"}), 503

@app.route("/api/mines/creator-levels", methods=["GET"])
def api_mines_creator_levels():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/creator-levels", timeout=5)
        if res.ok:
            return jsonify(res.json())
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Configuration unavailable"}), 503

@app.route("/api/mines/conversion-tiers", methods=["GET"])
def api_mines_conversion_tiers():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/conversion-config", timeout=5)
        if res.ok:
            return jsonify({"tiers": res.json().get("tiers", [])})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Configuration unavailable"}), 503

@app.route("/api/mines/tier-info/<address>", methods=["GET"])
def api_mines_tier_info(address):
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/user_points/{address}", timeout=5)
        if res.ok:
            points = int(res.json().get("points", 0))
            res2 = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/conversion-config", timeout=5)
            tiers = []
            if res2.ok:
                tiers = res2.json().get("tiers", [])
            for tier_info in sorted(tiers, key=lambda t: t.get("min_balance", 0), reverse=True):
                if points >= tier_info.get("min_balance", 0):
                    return jsonify({"ok": True, "data": tier_info})
            return jsonify({"ok": True, "data": {"tier": "basic", "rate": 145, "daily_cap": 500, "weekly_cap": 2000}})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Configuration unavailable"}), 503

# ENTRY POINTS FOR MALLCHAIN WRITE OPERATIONS
@app.route("/api/mines/campaigns/publish", methods=["POST"])
def api_mines_publish_campaign():
    try:
        data = request.json
        res = requests.post(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/campaigns/publish", json=data, timeout=10)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Blockchain publish unavailable"}), 503

@app.route("/api/mines/transactions", methods=["POST"])
def api_mines_create_transaction():
    try:
        data = request.json
        res = requests.post(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/transactions", json=data, timeout=10)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Transaction service unavailable"}), 503

@app.route("/api/mines/conversions", methods=["POST"])
def api_mines_create_conversion():
    try:
        data = request.json
        res = requests.post(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/conversions", json=data, timeout=10)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Conversion service unavailable"}), 503

@app.route("/api/mines/wallets/<address>/credit", methods=["POST"])
def api_mines_credit_wallet(address):
    try:
        data = request.json
        res = requests.post(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/wallets/{address}/credit", json=data, timeout=10)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Wallet credit unavailable"}), 503

@app.route("/api/mines/wallets/<address>/deduct", methods=["POST"])
def api_mines_deduct_wallet(address):
    try:
        data = request.json
        res = requests.post(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/wallets/{address}/deduct", json=data, timeout=10)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Wallet deduction unavailable"}), 503

@app.route("/api/mines/tasks/complete", methods=["POST"])
def api_mines_complete_task():
    try:
        data = request.json
        res = requests.post(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/tasks/complete", json=data, timeout=10)
        if res.ok:
            return jsonify({"ok": True, "data": res.json()})
    except Exception:
        pass
    return jsonify({"ok": False, "error": "Task completion unavailable"}), 503

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000, debug=False)