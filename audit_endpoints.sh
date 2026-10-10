#!/bin/bash
# Forensic Audit: Backend Endpoint Testing
# Tests all major endpoints and captures evidence

BACKEND="http://127.0.0.1:4000"
REPORT="/tmp/endpoint_audit_report.txt"

echo "=== MALLCHAIN BACKEND ENDPOINT FORENSIC AUDIT ===" > $REPORT
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> $REPORT
echo "" >> $REPORT

# Get auth token
echo "[*] Obtaining auth token..." >> $REPORT
LOGIN_RESP=$(curl -s -X POST $BACKEND/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"audit_test@mallchain.com","password":"AuditTest123!"}' \
  -c /tmp/audit_cookies.txt)
TOKEN=$(grep auth_token /tmp/audit_cookies.txt | awk '{print $NF}')
echo "Token obtained: ${TOKEN:0:20}..." >> $REPORT
echo "" >> $REPORT

# Test 1: Health endpoints
echo "=== TEST 1: Health Endpoints ===" >> $REPORT
echo "[GET /api/health]" >> $REPORT
curl -s $BACKEND/api/health | jq -c '.' >> $REPORT 2>&1
echo "" >> $REPORT

echo "[GET /api/ready]" >> $REPORT
curl -s $BACKEND/api/ready | jq -c '.' >> $REPORT 2>&1
echo "" >> $REPORT

# Test 2: Auth lifecycle
echo "=== TEST 2: Authentication Lifecycle ===" >> $REPORT
echo "[POST /api/auth/register - duplicate]" >> $REPORT
curl -s -X POST $BACKEND/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"audit_test@mallchain.com","password":"AuditTest123!"}' >> $REPORT
echo "" >> $REPORT

echo "[GET /api/auth/me - authenticated]" >> $REPORT
curl -s $BACKEND/api/auth/me -b "auth_token=$TOKEN" | jq -c '.user.email' >> $REPORT 2>&1
echo "" >> $REPORT

echo "[GET /api/auth/me - unauthenticated]" >> $REPORT
curl -s $BACKEND/api/auth/me >> $REPORT
echo "" >> $REPORT

# Test 3: Wallet endpoints
echo "=== TEST 3: Wallet Endpoints ===" >> $REPORT
echo "[GET /api/wallet/balance - authenticated]" >> $REPORT
curl -s $BACKEND/api/wallet/balance -b "auth_token=$TOKEN" | jq -c '.' >> $REPORT 2>&1
echo "" >> $REPORT

echo "[GET /api/wallet/balance - unauthenticated]" >> $REPORT
curl -s $BACKEND/api/wallet/balance | jq -c '.' >> $REPORT 2>&1
echo "" >> $REPORT

# Test 4: Mallpoints
echo "=== TEST 4: Mallpoints Endpoints ===" >> $REPORT
echo "[GET /api/mallpoints/balance]" >> $REPORT
curl -s $BACKEND/api/mallpoints/balance -b "auth_token=$TOKEN" | jq -c '.balance' >> $REPORT 2>&1
echo "" >> $REPORT

# Test 5: Transaction history
echo "=== TEST 5: Transaction Endpoints ===" >> $REPORT
echo "[GET /api/tx/history - with valid address]" >> $REPORT
curl -s "http://127.0.0.1:4000/api/tx/history?address=mall1abc123&limit=5" -b "auth_token=$TOKEN" | jq -c '.ok' >> $REPORT 2>&1
echo "" >> $REPORT

# Test 6: Admin endpoints (should require admin role)
echo "=== TEST 6: Admin Endpoints (Authorization) ===" >> $REPORT
echo "[GET /api/admin/users - regular user]" >> $REPORT
curl -s $BACKEND/api/admin/users -b "auth_token=$TOKEN" >> $REPORT
echo "" >> $REPORT

# Test 7: Blockchain endpoints
echo "=== TEST 7: Blockchain Endpoints ===" >> $REPORT
echo "[GET /api/blockchain/validators]" >> $REPORT
curl -s $BACKEND/api/blockchain/validators | jq -c '.ok' >> $REPORT 2>&1
echo "" >> $REPORT

# Test 8: Rate limiting headers
echo "=== TEST 8: Rate Limiting ===" >> $REPORT
echo "[Checking rate limit headers on /api/auth/login]" >> $REPORT
curl -sI -X POST $BACKEND/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' | grep -i 'ratelimit' >> $REPORT
echo "" >> $REPORT

# Test 9: Security headers
echo "=== TEST 9: Security Headers ===" >> $REPORT
echo "[Checking security headers]" >> $REPORT
curl -sI $BACKEND/api/health | grep -E '(X-Frame|X-Content|Content-Security|Strict-Transport)' >> $REPORT
echo "" >> $REPORT

# Test 10: CORS
echo "=== TEST 10: CORS Configuration ===" >> $REPORT
echo "[OPTIONS request with Origin header]" >> $REPORT
curl -sI -X OPTIONS $BACKEND/api/health \
  -H "Origin: http://evil.com" \
  -H "Access-Control-Request-Method: GET" | grep -i 'access-control' >> $REPORT
echo "" >> $REPORT

echo "=== AUDIT COMPLETE ===" >> $REPORT
echo "Report saved to: $REPORT"
