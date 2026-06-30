import requests

MALLCHAIN_REST = 'http://localhost:1317'

def _fetch_conversion_config():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/conversion-config", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

WEEKLY_CAP_MLC = None
DAILY_CAP_MLC = None
MIN_CONVERSION_MLPTS = None
CONVERSION_RATES = None

from .rate_engine import get_rate, calculate_expected_outcome, PLATFORM_RATES

def _fetch_duration_map():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/duration-map", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

def get_conversion_tier(wallet_balance_mlpts):
    config = _fetch_conversion_config()
    if config:
        tiers = config.get("tiers", [])
        for tier_info in sorted(tiers, key=lambda t: t.get("min_balance", 0), reverse=True):
            if wallet_balance_mlpts >= tier_info.get("min_balance", 0):
                return tier_info.get("tier", "basic")
    return "basic"

def calculate_conversion(mlpts_to_convert, wallet_balance, daily_converted_mlc=0, weekly_converted_mlc=0):
    config = _fetch_conversion_config()
    
    tier = get_conversion_tier(wallet_balance)
    
    rate = None
    daily_cap = None
    weekly_cap = None
    min_mlpts = None
    
    if config:
        tiers = config.get("tiers", [])
        tier_info = next((t for t in tiers if t.get("tier") == tier), None)
        if tier_info:
            rate = tier_info.get("rate")
            daily_cap = tier_info.get("daily_cap")
            weekly_cap = tier_info.get("weekly_cap")
            min_mlpts = tier_info.get("min_mlpts")
    
    if rate is None:
        rate = 145
    if daily_cap is None:
        daily_cap = 500
    if weekly_cap is None:
        weekly_cap = 2000
    
    can_proceed = True
    errors = []
    
    if mlpts_to_convert < min_mlpts:
        errors.append({"type": "below_minimum", "message": f"Minimum conversion is {min_mlpts} MLPTS"})
        can_proceed = False
    
    if mlpts_to_convert > wallet_balance:
        errors.append({"type": "insufficient_balance", "message": "Insufficient MLPTS balance"})
        can_proceed = False
    
    estimated_mlc = int((mlpts_to_convert * 0.97) / rate) if can_proceed else 0
    
    if estimated_mlc + daily_converted_mlc > daily_cap:
        errors.append({"type": "daily_cap_exceeded", "message": "Would exceed daily MLC cap"})
        can_proceed = False
    
    if estimated_mlc + weekly_converted_mlc > weekly_cap:
        errors.append({"type": "weekly_cap_exceeded", "message": "Would exceed weekly MLC cap"})
        can_proceed = False
    
    return {
        "can_proceed": can_proceed,
        "tier": tier,
        "rate": rate,
        "mlpts_input": mlpts_to_convert,
        "fee_amount": mlpts_to_convert * 0.03,
        "net_mlpts": mlpts_to_convert * 0.97,
        "estimated_mlc": estimated_mlc,
        "errors": errors,
        "daily_remaining": daily_cap - (daily_converted_mlc + estimated_mlc) if can_proceed else 0,
        "weekly_remaining": weekly_cap - (weekly_converted_mlc + estimated_mlc) if can_proceed else 0,
    }

def calculate_campaign_preview(platform, task_type, budget_mlpts, video_length=None, wallet_balance=None, creator_level=1):
    rate = get_rate(platform, task_type, video_length)
    expected_actions = int(budget_mlpts / rate) if rate > 0 else 0
    
    duration_map = _fetch_duration_map()
    if duration_map is None:
        duration_map = {
            "youtube": {"short": 3, "medium": 5, "long": 7},
            "tiktok": 2,
            "instagram": 1,
            "x": 1,
            "facebook": 2,
            "threads": 1,
            "snapchat": 1,
        }
    
    if platform == "youtube" and video_length:
        est_duration_days = duration_map.get("youtube", {}).get(video_length, 4)
    else:
        est_duration_days = duration_map.get(platform, 2) if isinstance(duration_map) else 2
    
    validation = None
    if wallet_balance is not None:
        validation = validate_creator_budget(wallet_balance, budget_mlpts, creator_level)
    
    return {
        "expected_actions": expected_actions,
        "cost_per_action": rate,
        "estimated_duration_days": est_duration_days,
        "platform": platform,
        "task_type": task_type,
        "validation": validation,
    }