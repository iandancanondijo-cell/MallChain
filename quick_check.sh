#!/bin/bash

EMAIL="test@example.com"
PASS="Test123!@#"

# Login
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  -c /tmp/cookies.txt > /dev/null

# Get CSRF
CSRF=$(curl -s -X GET http://localhost:4000/api/csrf-token \
  -b /tmp/cookies.txt | grep -o '"csrfToken":"[^"]*' | cut -d'"' -f4)

# Send notification and show full response
echo "📬 Sending notification..."
curl -s -X POST http://localhost:4000/api/notifications/test \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b /tmp/cookies.txt \
  -d '{}' | jq .
