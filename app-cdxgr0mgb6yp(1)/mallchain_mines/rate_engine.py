import requests

MALLCHAIN_REST = 'http://localhost:1317'

def _fetch_rates_from_mallchain():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/rates", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

PLATFORM_RATES = None

def get_rate(platform: str, task_type: str, video_length: str = None) -> float:
    platform = platform.lower()
    task_type = task_type.lower()
    
    rates = PLATFORM_RATES
    if rates is None:
        rates = _fetch_rates_from_mallchain()
        if rates is None:
            return 0.0
    
    if platform not in rates:
        raise ValueError(f"Unknown platform: {platform}")
    
    platform_tasks = rates[platform]
    if task_type not in platform_tasks:
        raise ValueError(f"Unknown task type '{task_type}' for platform '{platform}'")
    
    rate = platform_tasks[task_type]
    if isinstance(rate, dict) and video_length:
        video_length = video_length.lower()
        if video_length in rate:
            return rate[video_length]
        if video_length in ["short", "medium", "long"]:
            tier_map = {"short": "short", "medium": "medium", "long": "long"}
            return rate.get(tier_map[video_length], rate.get("short", 0.0))
    
    if isinstance(rate, dict):
        return min(rate.get("short", 0.0), rate.get("medium", 0.0), rate.get("long", 0.0))
    
    return rate

def _fetch_duration_map():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/duration-map", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

def calculate_expected_outcome(platform: str, task_type: str, budget_mlpts: float, video_length: str = None) -> dict:
    rate = get_rate(platform, task_type, video_length)
    
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
        est_duration_days = duration_map.get(platform, 2)
    
    return {
        "expected_actions": int(budget_mlpts / rate) if rate > 0 else 0,
        "cost_per_action": rate,
        "campaign_duration_days": est_duration_days,
        "platform": platform,
        "task_type": task_type,
    }