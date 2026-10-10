#!/bin/bash
set -e

echo "=== Submission Persistence Test ==="
echo

# 1. Login
echo "1. Logging in..."
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
echo "  Fetching CSRF token..."
CSRF_RESPONSE=$(curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt http://localhost:4000/api/csrf-token)
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
  echo "✗ Failed to get CSRF token: $CSRF_RESPONSE"
  exit 1
fi

echo "  CSRF token: ${CSRF_TOKEN:0:20}..."
echo

# 2. Create campaign
echo "2. Creating campaign..."
CAMPAIGN_RESPONSE=$(curl -s -b /tmp/cookies.txt \
  -X POST http://localhost:4000/api/mines/campaigns \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d "{
    \"creator_id\": \"6ab62eb5be6eae0bb64b1dfa\",
    \"title\": \"Test Campaign $(date +%s)\",
    \"task_type\": \"survey\",
    \"description\": \"Test description\",
    \"rate_per_task\": 0.5,
    \"budget_remaining\": 100,
    \"max_completions_per_user\": 5
  }")

if ! echo "$CAMPAIGN_RESPONSE" | grep -q '"ok":true'; then
  echo "Campaign creation failed: $CAMPAIGN_RESPONSE"
  exit 1
fi

CAMPAIGN_ID=$(echo "$CAMPAIGN_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✓ Campaign created: $CAMPAIGN_ID"
echo

# 3. Create submission
echo "3. Creating submission..."
SUBMISSION_RESPONSE=$(curl -s -b /tmp/cookies.txt \
  -X POST http://localhost:4000/api/mines/submissions \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d "{
    \"campaign_id\": \"$CAMPAIGN_ID\",
    \"title\": \"Test Submission\",
    \"task_type\": \"survey\",
    \"description\": \"Test submission description\",
    \"proof_url\": \"https://example.com/proof\"
  }")

if ! echo "$SUBMISSION_RESPONSE" | grep -q '"ok":true'; then
  echo "Submission creation failed: $SUBMISSION_RESPONSE"
  exit 1
fi

SUBMISSION_ID=$(echo "$SUBMISSION_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✓ Submission created: $SUBMISSION_ID"
echo "$SUBMISSION_RESPONSE" | jq '.data' | head -20
echo

# 4. Verify in database
echo "4. Verifying submission in database..."
sleep 1
DB_CHECK=$(mongosh --port 27018 --quiet marketplace --eval "
  const sub = db.tasksubmissions.findOne({_id: ObjectId('$SUBMISSION_ID')});
  if (sub) {
    print('FOUND');
    print('  _id: ' + sub._id);
    print('  status: ' + sub.status);
    print('  miner_id: ' + sub.miner_id);
    print('  campaign_id: ' + sub.campaign_id);
    print('  reward_amount: ' + sub.reward_amount);
  } else {
    print('NOT_FOUND');
  }
")

if echo "$DB_CHECK" | grep -q "NOT_FOUND"; then
  echo "✗ SUBMISSION NOT FOUND IN DATABASE!"
  echo "  This confirms the persistence bug."
  exit 1
fi

echo "✓ Submission found in database"
echo "$DB_CHECK"
echo

# 5. Verify via API
echo "5. Verifying submission via API..."
MY_SUBMISSIONS=$(curl -s -b /tmp/cookies.txt \
  http://localhost:4000/api/mines/submissions/me)

if echo "$MY_SUBMISSIONS" | grep -q "$SUBMISSION_ID"; then
  echo "✓ Submission found via API"
else
  echo "✗ Submission not found in API response!"
  exit 1
fi

echo
echo "=== TEST PASSED ==="
echo "Submission persistence is working correctly."
