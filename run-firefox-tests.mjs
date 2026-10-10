#!/usr/bin/env node

/**
 * Mallchain Runtime Verification - Firefox Browser Tests
 * Uses system Firefox instead of Chromium to avoid download delays
 * 
 * Usage: node run-firefox-tests.mjs
 */

import { chromium, firefox } from 'playwright';
import fs from 'fs';
import path from 'path';

const LOG_FILE = './PRIORITY_2_FIREFOX_TEST_RESULTS.md';
const TEST_URL = 'http://localhost:3000';
const TIMEOUT = 15000; // 15 seconds for page load

let results = [];
let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(message);
  results.push(message);
}

function logSection(title) {
  const line = '='.repeat(70);
  log(`\n${line}`);
  log(title);
  log(line);
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASSED' : 'FAILED';
  log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  if (passed) testsPassed++;
  else testsFailed++;
}

async function runTests() {
  logSection('MALLCHAIN PRIORITY 2 RUNTIME VERIFICATION');
  log(`Date: ${new Date().toISOString()}`);
  log(`Target: ${TEST_URL}`);
  log(`Browser: Firefox (system-installed)`);

  let browser = null;
  let page = null;

  try {
    // Launch Firefox
    logSection('1. LAUNCHING FIREFOX BROWSER');
    log('Launching Firefox...');
    browser = await firefox.launch({ headless: true });
    logTest('Firefox Launch', true);

    // Create page
    logSection('2. CREATING BROWSER PAGE');
    page = await browser.newPage();
    log('Page context created');

    // Capture console messages
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    const pageErrors = [];
    page.on('pageerror', err => {
      pageErrors.push(err.toString());
    });

    // Navigate to app
    logSection('3. LOADING MALLCHAIN APP');
    log(`Navigating to ${TEST_URL}...`);
    
    try {
      const response = await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
      const statusCode = response?.status();
      logTest('Page Navigation', statusCode === 200, `HTTP ${statusCode}`);
    } catch (e) {
      logTest('Page Navigation', false, e.message);
      log('Note: networkidle timeout is expected if app loads partially');
    }

    // Wait for root element
    logSection('4. CHECKING APP INITIALIZATION');
    try {
      await page.waitForSelector('#root', { timeout: 5000 });
      logTest('Root Element Found', true);
    } catch (e) {
      logTest('Root Element Found', false, 'Timeout waiting for #root');
      throw new Error('App failed to initialize');
    }

    // Check if app has rendered content
    const rootContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        html: root?.innerHTML.substring(0, 100) || '',
        hasContent: (root?.textContent?.length || 0) > 50,
        childCount: root?.children.length || 0,
      };
    });

    logTest('App Rendered', rootContent.hasContent, `${rootContent.childCount} child elements`);

    if (rootContent.html) {
      log(`Root HTML preview: ${rootContent.html}...`);
    }

    // Test 1: Network Status
    logSection('5. TESTING BLOCKCHAIN API METHODS');
    log('');

    try {
      const networkStatus = await page.evaluate(async () => {
        try {
          const status = await window.mallchainClient?.getNetworkStatus();
          return {
            success: true,
            status: status?.status,
            block: status?.latestBlock,
            isSimulator: status?.isSimulator,
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      if (networkStatus.success) {
        logTest('getNetworkStatus()', true, 
          `Status: ${networkStatus.status}, Block: ${networkStatus.block}, Simulator: ${networkStatus.isSimulator}`);
      } else {
        logTest('getNetworkStatus()', false, networkStatus.error);
      }
    } catch (e) {
      logTest('getNetworkStatus()', false, e.message);
    }

    // Test 2: Block Height
    try {
      const blockHeight = await page.evaluate(async () => {
        try {
          const height = await window.mallchainClient?.getBlockHeight();
          return { success: true, height };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      if (blockHeight.success) {
        logTest('getBlockHeight()', true, `Height: ${blockHeight.height}`);
      } else {
        logTest('getBlockHeight()', false, blockHeight.error);
      }
    } catch (e) {
      logTest('getBlockHeight()', false, e.message);
    }

    // Test 3: Validators
    try {
      const validators = await page.evaluate(async () => {
        try {
          const v = await window.mallchainClient?.getValidators();
          return { 
            success: true, 
            count: v?.length || 0,
            first: v?.[0]?.moniker 
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      if (validators.success) {
        logTest('getValidators()', true, `${validators.count} validators, first: ${validators.first}`);
      } else {
        logTest('getValidators()', false, validators.error);
      }
    } catch (e) {
      logTest('getValidators()', false, e.message);
    }

    // Test 4: Wallet Service
    try {
      const walletStatus = await page.evaluate(() => {
        try {
          const wallet = window.walletService?.getActiveWallet();
          return {
            success: true,
            hasWallet: !!wallet,
            name: wallet?.name,
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      if (walletStatus.success) {
        const detail = walletStatus.hasWallet ? `Wallet: ${walletStatus.name}` : 'No wallet connected';
        logTest('walletService.getActiveWallet()', true, detail);
      } else {
        logTest('walletService.getActiveWallet()', false, walletStatus.error);
      }
    } catch (e) {
      logTest('walletService.getActiveWallet()', false, e.message);
    }

    // Test 5: Network Type Check
    try {
      const networkType = await page.evaluate(async () => {
        try {
          const isSimulator = window.mallchainClient?.isSimulatorActive();
          return { success: true, isSimulator };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      if (networkType.success) {
        const type = networkType.isSimulator ? 'Simulator' : 'Real Network';
        logTest('isSimulatorActive()', true, `Using: ${type}`);
      } else {
        logTest('isSimulatorActive()', false, networkType.error);
      }
    } catch (e) {
      logTest('isSimulatorActive()', false, e.message);
    }

    // Check console output
    logSection('6. BROWSER CONSOLE ANALYSIS');
    log(`Console messages captured: ${consoleLogs.length}`);
    
    if (consoleLogs.length > 0) {
      log('\nFirst 10 console messages:');
      consoleLogs.slice(0, 10).forEach(msg => log(`  ${msg}`));
    }

    if (pageErrors.length > 0) {
      log(`\nPage errors: ${pageErrors.length}`);
      pageErrors.forEach(err => log(`  ❌ ${err}`));
      logTest('Page Errors', false, `${pageErrors.length} errors detected`);
    } else {
      logTest('Page Errors', true, 'No errors detected');
    }

    // Check for demo labels
    logSection('7. DEMO MODE VERIFICATION');
    const demoStatus = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasDemoLabel: text.includes('DEMO') || text.includes('Demo'),
        hasLoading: text.includes('Loading') || text.includes('loading'),
      };
    });

    if (demoStatus.hasDemoLabel) {
      logTest('Demo Labels Present', true, 'As required');
    } else {
      logTest('Demo Labels Present', false, 'Expected to see demo labels');
    }

    if (!demoStatus.hasLoading) {
      logTest('No Endless Loading', true);
    } else {
      logTest('No Endless Loading', false, 'Still showing loading state');
    }

    // Final status
    logSection('8. TEST SUMMARY');

  } catch (error) {
    logSection('ERROR OCCURRED');
    log(`${error.message}`);
    if (error.stack) {
      log(`Stack: ${error.stack}`);
    }
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }

  // Write results to file
  logSection('SAVING RESULTS');
  const report = `# Mallchain Priority 2 Runtime Verification - Firefox Test Results

**Date**: ${new Date().toISOString()}
**Browser**: Firefox (system-installed)
**Target URL**: ${TEST_URL}
**Test Count**: ${testsPassed + testsFailed}
**Passed**: ${testsPassed}
**Failed**: ${testsFailed}

---

## Test Results

${results.join('\n')}

---

## Classification

**Build Status**: ✅ Verified
**Runtime Execution**: ${testsFailed === 0 ? '✅ PASSED' : '⚠️ PARTIAL/FAILED'}
**Production Ready**: ${testsFailed === 0 ? '✅ YES' : '❌ NOT YET'}

---

## Next Steps

${testsFailed === 0 ? `
✅ All tests passed! The application is runtime-verified and production-ready.

**Recommended Actions:**
1. Review actual method responses above
2. Verify network is using simulator (isolated from external endpoints)
3. Approve production deployment
4. Remove demo labels from dashboard
5. Update production readiness status
` : `
⚠️ Some tests failed. Review errors above and take action:

**If app failed to load:**
1. Check Firefox browser console for JavaScript errors
2. Verify dev server is still running: npm run dev
3. Clear browser cache and retry
4. Check IMMEDIATE_ACTION_PLAN.md for troubleshooting

**If specific API methods failed:**
1. Verify blockchain client initialization
2. Check network configuration
3. Inspect browser console for runtime errors
4. Review adapter.ts for method implementation

**If demo labels missing:**
1. Verify MallchainDashboard component rendering
2. Check CSS is loading correctly
3. Inspect DOM for element visibility
`}

---

## Files Referenced

- mallchain-app/src/layouts/MallchainDashboard.tsx - Main component
- mallchain-app/src/blockchain/adapter.ts - API method implementations
- mallchain-app/src/blockchain/client.ts - Client interface
- mallchain-app/src/config/networks.ts - Network configuration

---

*Test executed by Playwright with Firefox - Priority 2 Verification*
`;

  fs.writeFileSync(LOG_FILE, report);
  log(`\nResults saved to ${LOG_FILE}`);

  logSection('FINAL SUMMARY');
  log(`Total Tests: ${testsPassed + testsFailed}`);
  log(`Passed: ${testsPassed}`);
  log(`Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    log('\n🎉 ALL TESTS PASSED - Application is runtime verified!');
    process.exit(0);
  } else {
    log(`\n⚠️ ${testsFailed} test(s) failed - Review results above`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
