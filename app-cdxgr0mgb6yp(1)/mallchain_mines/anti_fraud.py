import time
from collections import defaultdict
from hashlib import sha256
import requests

MALLCHAIN_REST = 'http://localhost:1317'

def _fetch_fraud_weights():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/fraud-weights", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

FRAUD_RISK_WEIGHTS = None
HARD_BLOCK_SIGNALS = None
FRAUD_THRESHOLD = None

def _get_fraud_weights():
    weights = _fetch_fraud_weights()
    return weights

def _get_hard_block_signals():
    weights = _get_fraud_weights()
    if weights:
        return weights.get("hard_block_signals", ["self_farm", "bot_pattern"])
    return ["self_farm", "bot_pattern"]

def _get_fraud_threshold():
    weights = _get_fraud_weights()
    if weights:
        return weights.get("threshold", 1.5)
    return 1.5

class FraudDetector:
    def __init__(self):
        self.device_fingerprints = {}
        self.ip_reputation_cache = {}
        self.suspicious_ips = set()
        self.velocity_tracker = defaultdict(list)
        self._hard_block_signals = None
        self._fraud_threshold = None
        
    def _load_weights(self):
        if self._hard_block_signals is None:
            self._hard_block_signals = _get_hard_block_signals()
            weights = _get_fraud_weights()
            if weights:
                self._risk_weights = weights.get("risk_weights", {})
                self._fraud_threshold = weights.get("threshold", 1.5)
            else:
                self._risk_weights = {}
                self._fraud_threshold = 1.5
        
    def evaluate_miner_action(self, miner_id, campaign, device_fp, ip_address, user_agent):
        self._load_weights()
        risk_score = 0.0
        triggered_rules = []
        
        if self._check_hard_block_signals(miner_id, campaign, device_fp, ip_address, user_agent):
            return {"decision": "BLOCK", "risk_score": 2.0, "hard_blocked": True, "rules": ["self_farm_hard_block"]}
        
        if self._check_duplicate_device(device_fp, miner_id):
            risk_score += self._risk_weights.get("device_fingerprint_duplicate", 0.8)
            triggered_rules.append("device_fingerprint_duplicate")
        
        if self._check_ip_reputation(ip_address):
            risk_score += self._risk_weights.get("ip_reputation_suspicious", 0.6)
            triggered_rules.append("ip_reputation_suspicious")
        
        if self._check_velocity_spike(miner_id):
            risk_score += self._risk_weights.get("velocity_spike", 0.7)
            triggered_rules.append("velocity_spike")
        
        if risk_score >= self._fraud_threshold:
            decision = "BLOCK"
        elif risk_score >= 0.8:
            decision = "REVIEW"
        else:
            decision = "APPROVE"
        
        return {
            "decision": decision,
            "risk_score": risk_score,
            "rules": triggered_rules,
            "hard_blocked": False,
        }
    
    def _check_hard_block_signals(self, miner_id, campaign, device_fp, ip_address, user_agent):
        if self._detect_self_farm(miner_id, campaign):
            return True
        if self._detect_bot_pattern(miner_id, device_fp, user_agent):
            return True
        return False
    
    def _detect_self_farm(self, miner_id, campaign):
        return miner_id == campaign.creator_id
    
    def _detect_bot_pattern(self, miner_id, device_fp, user_agent):
        bot_patterns = ["headless", "selenium", "puppeteer", "bot", "crawler"]
        ua_lower = user_agent.lower() if user_agent else ""
        return any(p in ua_lower for p in bot_patterns) or device_fp == "unknown"
    
    def _check_duplicate_device(self, device_fp, miner_id):
        if device_fp in self.device_fingerprints:
            return self.device_fingerprints[device_fp] != miner_id
        self.device_fingerprints[device_fp] = miner_id
        return False
    
    def _check_ip_reputation(self, ip_address):
        if ip_address in self.suspicious_ips:
            return True
        return False
    
    def _check_velocity_spike(self, miner_id):
        now = time.time()
        self.velocity_tracker[miner_id] = [t for t in self.velocity_tracker[miner_id] if now - t < 3600]
        self.velocity_tracker[miner_id].append(now)
        return len(self.velocity_tracker[miner_id]) > 50

class CampaignQualityScorer:
    def __init__(self):
        self.seven_days_ago = 604800
    
    def _fetch_platform_list(self):
        try:
            res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/platforms", timeout=5)
            if res.ok:
                return res.json().get("platforms", [])
        except Exception:
            pass
        return ["youtube.com", "tiktok.com", "instagram.com", "twitter.com", "x.com", "facebook.com", "threads.net", "snapchat.com"]
    
    def _fetch_new_creator_rules(self):
        try:
            res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/new-creator-rules", timeout=5)
            if res.ok:
                return res.json()
        except Exception:
            pass
        return None
        
    def score_campaign(self, campaign, creator_account_age_seconds):
        rules = self._fetch_new_creator_rules()
        new_creator_days_threshold = 7
        large_budget_threshold = 5000
        if rules:
            new_creator_days_threshold = rules.get("days_threshold", 7)
            large_budget_threshold = rules.get("large_budget_mlpts", 5000)
        
        self.seven_days_ago = new_creator_days_threshold * 86400
        
        score = 0
        issues = []
        
        if creator_account_age_seconds < self.seven_days_ago and campaign.budget_mlpts > large_budget_threshold:
            score += 0.7
            issues.append("Large budget for new creator")
        
        if not campaign.content_url or not self._is_valid_url(campaign.content_url):
            score += 0.9
            issues.append("Invalid or missing content URL")
        
        if score >= 1.5:
            return {"status": "REJECT", "score": score, "issues": issues}
        if score >= 1.0:
            return {"status": "REVIEW", "score": score, "issues": issues}
        return {"status": "APPROVE", "score": score, "issues": issues}
    
    def _is_valid_url(self, url):
        platforms = self._fetch_platform_list()
        return any(p in url.lower() for p in platforms)

class CreatorReputation:
    def __init__(self):
        self.creator_scores = defaultdict(int)
        self._level_thresholds = None
    
    def _fetch_level_thresholds(self):
        try:
            res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/reputation-thresholds", timeout=5)
            if res.ok:
                return res.json().get("thresholds", [])
        except Exception:
            pass
        return None
    
    def get_level(self, creator_id):
        thresholds = self._fetch_level_thresholds()
        score = self.creator_scores[creator_id]
        if thresholds:
            for level_info in sorted(thresholds, key=lambda t: t.get("min_score", 0)):
                if score >= level_info.get("min_score", 0):
                    return level_info.get("level", 1)
        return 1