#!/bin/bash
set -e

echo "=== Complete Mining Workflow Test ==="
echo

# 1. Login
echo "1. Logging in as admin..."
LOGIN_RESPONSE=$(curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mallchain.com","password":"Mallchain@Admin2026!"}')

if ! echo "$LOGIN_RESPONSE" | grep -q '"user"'; then
  echo "Login failed: $LOGIN_RESPONSE"
  exit 1
fi

echo "✓ Logged in"

# Fetch CSRF token
CSRF_RESPONSE=$(curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt http://localhost:4000/api/csrf-token)
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
echo "  CSRF token obtained"
echo

# Get user ID and initial balance
USER_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
INITIAL_BALANCE=$(echo "$LOGIN_RESPONSE" | grep -o '"mlpts_balance":[0-9.]*' | cut -d':' -f2)
echo "  User ID: $USER_ID"
echo "  Initial MLPTS balance: $INITIAL_BALANCE"
echo

# 2. Create campaign
echo "2. Creating campaign with 100 MLPTS budget..."
CAMPAIGN_RESPONSE=$(curl -s -b /tmp/cookies.txt \
  -X POST http://localhost:4000/api/mines/campaigns \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d "{
    \"creator_id\": \"$USER_ID\",
    \"title\": \"Mining Workflow Test $(date +%s)\",
    \"task_type\": \"survey\",
    \"description\": \"Complete mining workflow test\",
    \"rate_per_task\": 0.5,
    \"budget_remaining\": 100,
    \"max_completions_per_user\": 5
  }")

if ! echo "$CAMPAIGN_RESPONSE" | grep -q '"ok":true'; then
  echo "Campaign creation failed: $CAMPAIGN_RESPONSE"
  exit 1
fi

CAMPAIGN_ID=$(echo "$CAMPAIGN_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
CAMPAIGN_BUDGET=$(echo "$CAMPAIGN_RESPONSE" | grep -o '"budget_remaining":[0-9.]*' | cut -d':' -f2)
echo "✓ Campaign created: $CAMPAIGN_ID"
echo "  Initial budget: $CAMPAIGN_BUDGET MLPTS"
echo

# 3. Create submission
echo "3. Creating submission..."
SUBMISSION_RESPONSE=$(curl -s -b /tmp/cookies.txt \
  -X POST http://localhost:4000/api/mines/submissions \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d "{
    \"campaign_id\": \"$CAMPAIGN_ID\",
    \"title\": \"Workflow Test Submission\",
    \"task_type\": \"survey\",
    \"description\": \"Testing complete workflow\",
    \"proof_url\": \"https://example.com/proof\"
  }")

if ! echo "$SUBMISSION_RESPONSE" | grep -q '"ok":true'; then
  echo "Submission creation failed: $SUBMISSION_RESPONSE"
  exit 1
fi

SUBMISSION_ID=$(echo "$SUBMISSION_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
SUBMISSION_STATUS=$(echo "$SUBMISSION_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✓ Submission created: $SUBMISSION_ID"
echo "  Status: $SUBMISSION_STATUS"
echo

# 4. Verify submission in database
echo "4. Verifying submission in database..."
sleep 1
DB_CHECK=$(mongosh --port 27018 --quiet marketplace --eval "
  const sub = db.tasksubmissions.findOne({_id: ObjectId('$SUBMISSION_ID')});
  if (sub) {
    print('FOUND');
    printjson({
      _id: sub._id.toString(),
      status: sub.status,
      miner_id: sub.miner_id.toString(),
      campaign_id: sub.campaign_id.toString(),
      reward_amount: sub.reward_amount
    });
  } else {
    print('NOT_FOUND');
  }
")

if echo "$DB_CHECK" | grep -q "NOT_FOUND"; then
  echo "✗ SUBMISSION NOT FOUND IN DATABASE!"
  exit 1
fi

echo "✓ Submission persisted in database"
echo "$DB_CHECK" | tail -n +2
echo

# 5. Approve submission
echo "5. Approving submission (reward: 0.5 MLPTS)..."
APPROVE_RESPONSE=$(curl -s -b /tmp/cookies.txt \
  -X POST http://localhost:4000/api/mines/submissions/$SUBMISSION_ID/approve \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"rewardAmount": 0.5}')

if ! echo "$APPROVE_RESPONSE" | grep -q '"ok":true'; then
  echo "Approval failed: $APPROVE_RESPONSE"
  exit 1
fi

APPROVED_STATUS=$(echo "$APPROVE_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
APPROVED_REWARD=$(echo "$APPROVE_RESPONSE" | grep -o '"reward_amount":[0-9.]*' | cut -d':' -f2)
echo "✓ Submission approved"
echo "  Status: $APPROVED_STATUS"
echo "  Reward: $APPROVED_REWARD MLPTS"
echo

# 6. Verify approval in database
echo "6. Verifying approval in database..."
sleep 1
APPROVAL_CHECK=$(mongosh --port 27018 --quiet marketplace --eval "
  const sub = db.tasksubmissions.findOne({_id: ObjectId('$SUBMISSION_ID')});
  const campaign = db.campaigns.findOne({_id: ObjectId('$CAMPAIGN_ID')});
  const user = db.users.findOne({_id: ObjectId('$USER_ID')});
  const walletTx = db.wallettransactions.findOne({reference_id: ObjectId('$SUBMISSION_ID')});

  printjson({
    submission: {
      status: sub.status,
      reward_amount: sub.reward_amount
    },
    campaign: {
      budget_remaining: campaign.budget_remaining,
      completions_count: campaign.completions_count
    },
    user: {
      mlpts_balance: user.mlpts_balance
    },
    walletTransaction: walletTx ? {
      type: walletTx.type,
      amount: walletTx.amount,
      currency: walletTx.currency,
      description: walletTx.description
    } : null
  });
")

echo "✓ Database state after approval:"
echo "$APPROVAL_CHECK"
echo

# 7. Verify user balance increased
echo "7. Verifying user balance update..."
FINAL_BALANCE=$(echo "$APPROVAL_CHECK" | grep -o '"mlpts_balance":[0-9.]*' | cut -d':' -f2)
BALANCE_INCREASE=$(echo "$FINAL_BALANCE - $INITIAL_BALANCE" | bc)
echo "  Initial balance: $INITIAL_BALANCE MLPTS"
echo "  Final balance: $FINAL_BALANCE MLPTS"
echo "  Increase: $BALANCE_INCREASE MLPTS"

if (( $(echo "$BALANCE_INCREASE < 0.4" | bc -l) )); then
  echo "✗ Balance did not increase correctly!"
  exit 1
fi

echo "✓ Balance increased correctly"
echo

# 8. Verify campaign budget decreased
echo "8. Verifying campaign budget update..."
FINAL_BUDGET=$(echo "$APPROVAL_CHECK" | grep -o '"budget_remaining":[0-9.]*' | head -1 | cut -d':' -f2)
BUDGET_DECREASE=$(echo "$CAMPAIGN_BUDGET - $FINAL_BUDGET" | bc)
echo "  Initial budget: $CAMPAIGN_BUDGET MLPTS"
echo "  Final budget: $FINAL_BUDGET MLPTS"
echo "  Decrease: $BUDGET_DECREASE MLPTS"

if (( $(echo "$BUDGET_DECREASE < 0.4" | bc -l) )); then
  echo "✗ Budget did not decrease correctly!"
  exit 1
fi

echo "✓ Budget decreased correctly"
echo

# 9. Verify WalletTransaction created
echo "9. Verifying WalletTransaction record..."
WALLET_TX=$(echo "$APPROVAL_CHECK" | grep -A5 '"walletTransaction"')
if echo "$WALLET_TX" | grep -q "null"; then
  echo "✗ WalletTransaction not created!"
  exit 1
fi

echo "✓ WalletTransaction created"
echo "$WALLET_TX"
echo

echo "=== TEST PASSED ==="
echo "Complete mining workflow verified:"
echo "  ✓ Campaign creation"
echo "  ✓ Submission creation and persistence"
echo "  ✓ Submission approval"
echo "  ✓ MLPTS reward credited"
echo "  ✓ Campaign budget decremented"
echo "  ✓ WalletTransaction recorded"
echo "  ✓ User balance updated"
