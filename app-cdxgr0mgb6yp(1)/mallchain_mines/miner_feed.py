import requests
from .rate_engine import PLATFORM_RATES

MALLCHAIN_REST = 'http://localhost:1317'

TASK_COOLDOWNS = None

def _fetch_task_cooldowns():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/task-cooldowns", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

class MinerFeed:
    def __init__(self, campaign_pool):
        self.campaign_pool = campaign_pool
        self.miner_actions = {}
        
    def get_platform_filter_tasks(self, platform=None, limit=20):
        tasks = []
        for campaign in self.campaign_pool.campaigns.values():
            if campaign.status != "active":
                continue
            if platform and campaign.platform != platform:
                continue
            tasks.append({
                "campaign_id": campaign.campaign_id,
                "platform": campaign.platform,
                "task_type": campaign.task_type,
                "reward_mlpts": campaign.cost_per_action,
                "slots_remaining": int(campaign.remaining_pool_mlpts / campaign.cost_per_action),
                "creator_handle": f"creator_{campaign.creator_id[:4]}",
                "content_url": campaign.content_url,
            })
        return tasks[:limit]
    
    def record_completion(self, miner_id, campaign_id, mlpts_reward):
        if miner_id not in self.miner_actions:
            self.miner_actions[miner_id] = {"completed": [], "earned_mlpts": 0, "wallet": 0}
        
        self.miner_actions[miner_id]["completed"].append(campaign_id)
        self.miner_actions[miner_id]["earned_mlpts"] += mlpts_reward
        self.miner_actions[miner_id]["wallet"] += mlpts_reward
        
        self.campaign_pool.deduct_from_pool(campaign_id, mlpts_reward)
        
        return {
            "success": True,
            "new_balance": self.miner_actions[miner_id]["wallet"],
            "total_earned": self.miner_actions[miner_id]["earned_mlpts"],
        }
    
    def get_miner_wallet(self, miner_id):
        if miner_id not in self.miner_actions:
            return {"wallet": 0, "earned_total": 0, "completed_tasks": 0}
        
        return {
            "wallet": self.miner_actions[miner_id]["wallet"],
            "earned_total": self.miner_actions[miner_id]["earned_mlpts"],
            "completed_tasks": len(self.miner_actions[miner_id]["completed"]),
        }

def check_task_eligibility(miner_id, campaign, miner_feed):
    platform = campaign.platform
    task_type = campaign.task_type
    
    cooldowns = _fetch_task_cooldowns()
    cooldown_seconds = 0
    if cooldowns:
        cooldown_seconds = cooldowns.get(platform, {}).get(task_type, 0)
    
    last_completion = None
    if miner_id in miner_feed.miner_actions:
        for cid in miner_feed.miner_actions[miner_id]["completed"]:
            if cid == campaign.campaign_id:
                last_completion = 0
                break
    
    if last_completion and last_completion < cooldown_seconds:
        return {"eligible": False, "reason": "cooldown_active", "seconds_remaining": cooldown_seconds - last_completion}
    
    if campaign.remaining_pool_mlpts <= 0:
        return {"eligible": False, "reason": "campaign_exhausted"}
    
    return {"eligible": True}

class MinerLeaderboard:
    def __init__(self, miner_actions):
        self.miner_actions = miner_actions
    
    def get_top_earners(self, limit=10):
        sorted_miners = sorted(
            self.miner_actions.items(),
            key=lambda x: x[1].get("earned_mlpts", 0),
            reverse=True
        )
        return [{"miner_id": m[0], "earned_mlpts": m[1].get("earned_mlpts", 0), "tasks": len(m[1].get("completed", []))} for m in sorted_miners[:limit]]