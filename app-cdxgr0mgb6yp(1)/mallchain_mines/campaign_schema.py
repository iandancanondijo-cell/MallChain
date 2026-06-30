import requests

MALLCHAIN_REST = 'http://localhost:1317'

def _fetch_creator_levels():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/creator-levels", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

PLATFORM_RATE_MAP = None

CREATOR_LEVELS = None

class Campaign:
    def __init__(self, campaign_id, creator_id, platform, task_type, content_url, budget_mlpts, video_length=None):
        self.campaign_id = campaign_id
        self.creator_id = creator_id
        self.platform = platform
        self.task_type = task_type
        self.content_url = content_url
        self.budget_mlpts = budget_mlpts
        self.remaining_pool_mlpts = budget_mlpts
        self.video_length = video_length
        self.status = "draft"
        self.actions_completed = 0
        self.expected_actions = 0
        self.cost_per_action = 0
        self.created_at = None
        self.published_at = None
        self.completed_at = None
        self.accepted_terms_hash = None
        self.on_chain_tx_hash = None
        self.on_chain_address = None
        
    def to_dict(self):
        return {
            "campaign_id": self.campaign_id,
            "creator_id": self.creator_id,
            "platform": self.platform,
            "task_type": self.task_type,
            "content_url": self.content_url,
            "budget_mlpts": self.budget_mlpts,
            "remaining_pool_mlpts": self.remaining_pool_mlpts,
            "actions_completed": self.actions_completed,
            "status": self.status,
            "expected_actions": self.expected_actions,
            "cost_per_action": self.cost_per_action,
        }

class CampaignPool:
    def __init__(self):
        self.campaigns = {}
        self._rate_map_cache = None
        self._creator_levels_cache = None
        
    def _get_rate_map(self):
        if self._rate_map_cache is None:
            try:
                res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/rates", timeout=5)
                if res.ok:
                    self._rate_map_cache = res.json()
            except Exception:
                pass
        return self._rate_map_cache
    
    def _get_creator_levels(self):
        if self._creator_levels_cache is None:
            try:
                res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/creator-levels", timeout=5)
                if res.ok:
                    self._creator_levels_cache = res.json()
            except Exception:
                pass
        return self._creator_levels_cache
        
    def create_campaign(self, creator_id, platform, task_type, content_url, budget_mlpts, video_length=None):
        rate_map = self._get_rate_map()
        rate_key = f"{task_type}"
        if platform == "youtube" and task_type == "view" and video_length:
            rate_key = f"view_{video_length}"
        
        rate = 0
        if rate_map:
            rate = rate_map.get(platform, {}).get(rate_key, 0)
            if rate == 0 and task_type in rate_map.get(platform, {}):
                rate = rate_map[platform][task_type]
        
        expected_actions = int(budget_mlpts / rate) if rate > 0 else 0
        
        campaign_id = f"c_{platform[:3]}_{len(self.campaigns) + 1}"
        campaign = Campaign(
            campaign_id=campaign_id,
            creator_id=creator_id,
            platform=platform,
            task_type=task_type,
            content_url=content_url,
            budget_mlpts=budget_mlpts,
            video_length=video_length
        )
        campaign.expected_actions = expected_actions
        campaign.cost_per_action = rate
        
        self.campaigns[campaign_id] = campaign
        return campaign
    
    def deduct_from_pool(self, campaign_id, mlpts_amount):
        if campaign_id not in self.campaigns:
            return False
        
        campaign = self.campaigns[campaign_id]
        if campaign.remaining_pool_mlpts < mlpts_amount:
            return False
        
        campaign.remaining_pool_mlpts -= mlpts_amount
        campaign.actions_completed += 1
        
        if campaign.remaining_pool_mlpts <= 0:
            campaign.status = "completed"
            campaign.completed_at = None
        
        return True
    
    def lock_budget_on_chain(self, campaign_id, wallet_address):
        if campaign_id not in self.campaigns:
            return False
        
        campaign = self.campaigns[campaign_id]
        campaign.status = "active"
        campaign.on_chain_address = wallet_address
        return True

def validate_creator_budget(wallet_balance, budget_requested, creator_level=1):
    errors = []
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/creator-levels", timeout=5)
        level_info = res.json().get(str(creator_level), {}) if res.ok else {}
    except Exception:
        level_info = {}
    
    if budget_requested > wallet_balance:
        errors.append({
            "type": "insufficient_funds",
            "message": "You do not have enough MLPTS in your wallet to pay this amount",
            "shortfall": budget_requested - wallet_balance,
            "available_balance": wallet_balance
        })
    
    max_budget = level_info.get("max_budget", float("inf"))
    if budget_requested > max_budget:
        errors.append({
            "type": "level_limit",
            "message": f"Budget exceeds level limit of {max_budget} MLPTS",
            "max_allowed": max_budget
        })
    
    return {"valid": len(errors) == 0, "errors": errors}