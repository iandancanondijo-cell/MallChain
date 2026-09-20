#!/usr/bin/env node
/**
 * Priority 2: Browser Automation Test Execution
 * Using Playwright to execute tests against running dev server
 */

import { chromium } from 'playwright';

async function runBrowserTests() {
  console.log('\n=== PRIORITY 2: BROWSER AUTOMATION TEST EXECUTION ===\n');
  
  let browser;
  let page;
  
  try {
    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    
    // Navigate to dev server
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    
    console.log('✅ Page loaded successfully\n');
    
    // Execute test suite in browser context
    console.log('Executing tests in browser context...\n');
    
    const testResults = await page.evaluate(async () => {
      const results = [];
      
      // Test 1: getNetworkStatus - Simulator
      try {
        console.log('Test 1: getNetworkStatus() - Simulator');
        const { mallchainClient } = window.__modules__ || {};
        
        if (!mallchainClient) {
          console.log('❌ mallchainClient not available on window');
          return { error: 'mallchainClient not found' };
        }
        
        mallchainClient.switchNetwork('mallchain-simulator');
        const status = await mallchainClient.getNetworkStatus();
        
        console.log('Response:', JSON.stringify(status, null, 2));
        
        const passed = 
          status &&
          typeof status.status === 'string' &&
          typeof status.connected === 'boolean' &&
          status.isSimulator === true &&
          typeof status.latestBlock === 'number' &&
          status.latestBlock > 0;
        
        results.push({
          test: 'Test 1: getNetworkStatus() - Simulator',
          passed,
          data: {
            status: status.status,
            connected: status.connected,
            isSimulator: status.isSimulator,
            latestBlock: status.latestBlock,
            chainId: status.chainId,
          },
        });
        
        console.log(passed ? '✅ PASS' : '❌ FAIL\n');
        
      } catch (err) {
        console.log('❌ FAIL - Error:', err.message);
        results.push({
          test: 'Test 1: getNetworkStatus() - Simulator',
          passed: false,
          error: err.message,
        });
      }
      
      // Test 2: getBlockHeight - Simulator
      try {
        console.log('\nTest 2: getBlockHeight() - Simulator');
        const { mallchainClient } = window.__modules__ || {};
        
        const height = await mallchainClient.getBlockHeight();
        console.log('Block Height:', height, `(type: ${typeof height})`);
        
        const passed = typeof height === 'number' && height > 0;
        
        results.push({
          test: 'Test 2: getBlockHeight() - Simulator',
          passed,
          data: { height, type: typeof height },
        });
        
        console.log(passed ? '✅ PASS' : '❌ FAIL\n');
        
      } catch (err) {
        console.log('❌ FAIL - Error:', err.message);
        results.push({
          test: 'Test 2: getBlockHeight() - Simulator',
          passed: false,
          error: err.message,
        });
      }
      
      // Test 3: getBalances - Simulator
      try {
        console.log('\nTest 3: getBalances() - Simulator');
        const { mallchainClient } = window.__modules__ || {};
        
        const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
        const balances = await mallchainClient.getBalances(genesisAddr);
        
        console.log('Balances count:', balances.length);
        console.log('Sample:', JSON.stringify(balances.slice(0, 1), null, 2));
        
        const passed =
          Array.isArray(balances) &&
          balances.length > 0 &&
          balances.every(b => 
            typeof b.denom === 'string' &&
            typeof b.amount === 'string'
          );
        
        results.push({
          test: 'Test 3: getBalances() - Simulator',
          passed,
          data: {
            count: balances.length,
            sample: balances.slice(0, 1),
          },
        });
        
        console.log(passed ? '✅ PASS' : '❌ FAIL\n');
        
      } catch (err) {
        console.log('❌ FAIL - Error:', err.message);
        results.push({
          test: 'Test 3: getBalances() - Simulator',
          passed: false,
          error: err.message,
        });
      }
      
      // Test 4: getTransactions - Simulator
      try {
        console.log('\nTest 4: getTransactions() - Simulator');
        const { mallchainClient } = window.__modules__ || {};
        
        const genesisAddr = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
        const txs = await mallchainClient.getTransactions(genesisAddr);
        
        console.log('Transactions count:', txs.length);
        if (txs.length > 0) {
          console.log('Sample:', JSON.stringify(txs.slice(0, 1), null, 2));
        }
        
        const passed = Array.isArray(txs);
        
        results.push({
          test: 'Test 4: getTransactions() - Simulator',
          passed,
          data: { count: txs.length },
        });
        
        console.log(passed ? '✅ PASS' : '❌ FAIL\n');
        
      } catch (err) {
        console.log('❌ FAIL - Error:', err.message);
        results.push({
          test: 'Test 4: getTransactions() - Simulator',
          passed: false,
          error: err.message,
        });
      }
      
      // Test 5: Offline Behavior - Testnet
      try {
        console.log('\nTest 5: Offline Behavior - Testnet');
        const { mallchainClient } = window.__modules__ || {};
        
        mallchainClient.switchNetwork('mallchain-testnet');
        const status = await mallchainClient.getNetworkStatus();
        
        console.log('Status:', status.status);
        console.log('Connected:', status.connected);
        console.log('IsSimulator:', status.isSimulator);
        
        const passed =
          status.connected === false &&
          status.isSimulator === false &&
          (status.status === 'OFFLINE' || status.status === 'DEGRADED');
        
        results.push({
          test: 'Test 5: Offline Behavior - Testnet',
          passed,
          data: {
            status: status.status,
            connected: status.connected,
            isSimulator: status.isSimulator,
          },
        });
        
        console.log(passed ? '✅ PASS' : '❌ FAIL\n');
        
      } catch (err) {
        console.log('❌ FAIL - Error:', err.message);
        results.push({
          test: 'Test 5: Offline Behavior - Testnet',
          passed: false,
          error: err.message,
        });
      }
      
      return results;
    });
    
    // Print results
    console.log('\n=== RESULTS ===\n');
    
    testResults.forEach((r, i) => {
      const status = r.passed ? '✅' : '❌';
      console.log(`${i + 1}. ${status} ${r.test}`);
      if (r.data) {
        console.log('   Data:', JSON.stringify(r.data).substring(0, 100));
      }
      if (r.error) {
        console.log('   Error:', r.error.substring(0, 100));
      }
    });
    
    const passed = testResults.filter(r => r.passed).length;
    const total = testResults.length;
    
    console.log(`\n${passed}/${total} tests passed\n`);
    
    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED\n');
    } else if (passed > 0) {
      console.log(`⚠️  ${total - passed} test(s) failed\n`);
    } else {
      console.log('❌ ALL TESTS FAILED\n');
    }
    
    return { passed, total, results: testResults };
    
  } catch (err) {
    console.error('ERROR:', err.message);
    return { error: err.message };
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Run tests
const results = await runBrowserTests();
process.exit(results.error ? 1 : 0);
