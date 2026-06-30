from mallchain_mines import (
    CampaignPool,
    calculate_campaign_preview,
    calculate_conversion,
    MinerFeed,
    FraudDetector,
    CampaignQualityScorer,
    CreatorReputation,
    check_task_eligibility,
)

def demo_creator_flow():
    pool = CampaignPool()
    reporter_creator = CreatorReputation()
    
    print("=== CREATOR FLOW ===")
    
    preview = calculate_campaign_preview(
        platform="youtube",
        task_type="view",
        video_length="short",
        budget_mlpts=3000,
        wallet_balance=5000,
        creator_level=2
    )
    
    print(f"Campaign Preview for YouTube Short View:")
    print(f"  Budget: 3000 MLPTS")
    print(f"  Expected Views: {preview['expected_actions']}")
    print(f"  Cost per View: {preview['cost_per_action']} MLPTS")
    print(f"  Duration: ~{preview['estimated_duration_days']} days")
    
    campaign = pool.create_campaign(
        creator_id="creator_youtube123",
        platform="youtube",
        task_type="view",
        content_url="https://youtube.com/shorts/abc123",
        budget_mlpts=3000,
        video_length="short"
    )
    
    pool.lock_budget_on_chain(campaign.campaign_id, "wallet_creator_xyz")
    reporter_creator.add_successful_campaign(campaign.creator_id, 0.95, True)
    
    print(f"Campaign created: {campaign.campaign_id}")
    print(f"Status: {campaign.status}")
    print()

def demo_miner_flow():
    pool = CampaignPool()
    miner_feed = MinerFeed(pool)
    fraud_detector = FraudDetector()
    
    print("=== MINER FLOW ===")
    
    campaign = pool.create_campaign(
        creator_id="creator_abc",
        platform="youtube",
        task_type="view",
        content_url="https://youtube.com/watch/xyz",
        budget_mlpts=2000,
        video_length="long"
    )
    pool.lock_budget_on_chain(campaign.campaign_id, "wallet_creator_abc")
    
    fraud_check = fraud_detector.evaluate_miner_action(
        miner_id="miner_xyz",
        campaign=campaign,
        device_fp="device_fp_123",
        ip_address="192.168.1.100",
        user_agent="Mozilla/5.0 (Mobile)"
    )
    print(f"Fraud check result: {fraud_check['decision']} (score: {fraud_check['risk_score']})")
    
    eligibility = check_task_eligibility("miner_xyz", campaign, miner_feed)
    print(f"Task eligible: {eligibility['eligible']}")
    
    if eligibility['eligible']:
        result = miner_feed.record_completion("miner_xyz", campaign.campaign_id, 2.5)
        print(f"Task completed! Earned {campaign.cost_per_action} MLPTS")
        print(f"Wallet balance: {result['new_balance']} MLPTS")
    
    tasks = miner_feed.get_platform_filter_tasks(platform="youtube")
    print(f"Available YouTube tasks: {len(tasks)}")
    print()

def demo_conversion():
    print("=== MLPTS → MALLCOIN CONVERSION ===")
    
    result = calculate_conversion(
        mlpts_to_convert=1500,
        wallet_balance=2000,
        daily_converted_mlc=50,
        weekly_converted_mlc=200
    )
    
    print(f"Converting 1500 MLPTS:")
    print(f"  Tier: {result['tier'].title()}")
    print(f"  Rate: {result['rate']} MLPTS per MLC")
    print(f"  Fee (3%): {result['fee_amount']:.1f} MLPTS")
    print(f"  Net: {result['net_mlpts']:.1f} MLPTS")
    print(f"  Estimated MLC: {result['estimated_mlc']}")
    print(f"  Daily remaining: {result['daily_remaining']} MLC")
    print(f"  Weekly remaining: {result['weekly_remaining']} MLC")
    print()

if __name__ == "__main__":
    demo_creator_flow()
    demo_miner_flow()
    demo_conversion()