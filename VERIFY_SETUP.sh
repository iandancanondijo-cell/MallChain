#!/bin/bash

# Mallchain App - Setup Verification Script
# This script verifies that the dev server and all components are ready

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Mallchain App - Setup Verification                        ║"
echo "║     September 20, 2026                                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counter
PASSED=0
FAILED=0

# Test 1: Check if port 3000 is in use
echo -e "${BLUE}[TEST 1]${NC} Checking if dev server is running on port 3000..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ PASS${NC}: Dev server is running"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Dev server is not running"
    echo "  Run: cd mallchain-app && npm run dev"
    ((FAILED++))
fi

# Test 2: Check if HTTP server is responding
echo ""
echo -e "${BLUE}[TEST 2]${NC} Checking if HTTP server responds..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: HTTP server responding with 200 OK"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: HTTP server returned status $RESPONSE"
    ((FAILED++))
fi

# Test 3: Check Vite client module
echo ""
echo -e "${BLUE}[TEST 3]${NC} Checking if Vite client module is accessible..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/@vite/client)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Vite client module accessible (HTTP $RESPONSE)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Vite client module returned status $RESPONSE"
    ((FAILED++))
fi

# Test 4: Check main app entry point
echo ""
echo -e "${BLUE}[TEST 4]${NC} Checking if main app entry is accessible..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/src/main.tsx)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: App entry point accessible (HTTP $RESPONSE)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: App entry point returned status $RESPONSE"
    ((FAILED++))
fi

# Test 5: Check dashboard CSS
echo ""
echo -e "${BLUE}[TEST 5]${NC} Checking if dashboard CSS is loaded..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/src/styles/dashboard.css)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Dashboard CSS accessible (HTTP $RESPONSE)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Dashboard CSS returned status $RESPONSE"
    ((FAILED++))
fi

# Test 6: Check index CSS
echo ""
echo -e "${BLUE}[TEST 6]${NC} Checking if index CSS is loaded..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/src/index.css)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: Index CSS accessible (HTTP $RESPONSE)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Index CSS returned status $RESPONSE"
    ((FAILED++))
fi

# Test 7: Check if MallchainDashboard file exists
echo ""
echo -e "${BLUE}[TEST 7]${NC} Checking if MallchainDashboard component exists..."
if [ -f "mallchain-app/src/layouts/MallchainDashboard.tsx" ]; then
    LINES=$(wc -l < "mallchain-app/src/layouts/MallchainDashboard.tsx")
    echo -e "${GREEN}✓ PASS${NC}: MallchainDashboard.tsx found ($LINES lines)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: MallchainDashboard.tsx not found"
    ((FAILED++))
fi

# Test 8: Check if dashboard CSS file exists
echo ""
echo -e "${BLUE}[TEST 8]${NC} Checking if dashboard CSS file exists..."
if [ -f "mallchain-app/src/styles/dashboard.css" ]; then
    SIZE=$(du -h "mallchain-app/src/styles/dashboard.css" | cut -f1)
    echo -e "${GREEN}✓ PASS${NC}: dashboard.css found ($SIZE)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: dashboard.css not found"
    ((FAILED++))
fi

# Test 9: Check React Refresh module
echo ""
echo -e "${BLUE}[TEST 9]${NC} Checking if React Refresh module is accessible..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/@react-refresh)
if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC}: React Refresh module accessible (HTTP $RESPONSE)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: React Refresh module returned status $RESPONSE"
    ((FAILED++))
fi

# Test 10: Check npm and build status
echo ""
echo -e "${BLUE}[TEST 10]${NC} Checking if dist build exists..."
if [ -d "mallchain-app/dist" ] && [ -f "mallchain-app/dist/index.html" ]; then
    ASSETS=$(ls -1 mallchain-app/dist/assets/ 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ PASS${NC}: Production build exists ($ASSETS assets)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}: Production build not found"
    echo "  Run: cd mallchain-app && npm run build"
    ((FAILED++))
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo -e "║ ${GREEN}Results${NC}                                                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${GREEN}✓ PASSED${NC}: $PASSED/10"
echo -e "${RED}✗ FAILED${NC}: $FAILED/10"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    echo ""
    echo "Your development environment is ready:"
    echo "  1. Dev server: http://localhost:3000"
    echo "  2. Open in browser and refresh (Ctrl+Shift+R)"
    echo "  3. If still loading, clear cache and disable extensions"
    echo "  4. See IMMEDIATE_ACTION_PLAN.md for troubleshooting"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Please fix the issues above.${NC}"
    echo ""
    echo "Quick fix commands:"
    echo "  1. Start dev server: cd mallchain-app && npm run dev"
    echo "  2. Clean rebuild: cd mallchain-app && npm run build"
    echo "  3. Kill port 3000: kill \$(lsof -t -i:3000)"
    exit 1
fi
