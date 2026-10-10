#!/usr/bin/env node

import { firefox } from 'playwright';

const TEST_URL = 'http://localhost:3000';

async function runDetailedTests() {
  console.log('Starting detailed runtime tests...\n');

  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();

  // Capture all console output
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  try {
    console.log('Loading app...');
    await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    
    // Wait for React to render
    await page.waitForTimeout(2000);

    console.log('\n=== TEST 1: getNetworkStatus() ===');
    const test1 = await page.evaluate(async () => {
      try {
        const result = await window.mallchainClient.getNetworkStatus();
        return {
          success: true,
          result: JSON.stringify(result, null, 2)
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    console.log(test1.success ? test1.result : `Error: ${test1.error}`);

    console.log('\n=== TEST 2: getBlockHeight() ===');
    const test2 = await page.evaluate(async () => {
      try {
        const result = await window.mallchainClient.getBlockHeight();
        return { success: true, result };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    console.log(test2.success ? `Block Height: ${test2.result}` : `Error: ${test2.error}`);

    console.log('\n=== TEST 3: getValidators() ===');
    const test3 = await page.evaluate(async () => {
      try {
        const result = await window.mallchainClient.getValidators();
        return {
          success: true,
          count: result.length,
          first: result[0] ? JSON.stringify(result[0], null, 2) : 'None'
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    if (test3.success) {
      console.log(`Validators Count: ${test3.count}\nFirst Validator:\n${test3.first}`);
    } else {
      console.log(`Error: ${test3.error}`);
    }

    console.log('\n=== TEST 4: Check window.mallchainClient ===');
    const test4 = await page.evaluate(() => {
      return {
        exists: !!window.mallchainClient,
        type: typeof window.mallchainClient,
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(window.mallchainClient || {}))
      };
    });
    console.log(`mallchainClient exists: ${test4.exists}`);
    console.log(`Type: ${test4.type}`);
    console.log(`Methods: ${test4.methods.slice(0, 10).join(', ')}`);

    console.log('\n=== TEST 5: Check simulator ===');
    const test5 = await page.evaluate(async () => {
      try {
        const isSim = window.mallchainClient.isSimulatorActive();
        return { success: true, isSimulator: isSim };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    console.log(test5.success ? `Is Simulator: ${test5.isSimulator}` : `Error: ${test5.error}`);

    console.log('\n=== APP RENDER STATUS ===');
    const renderStatus = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        rootExists: !!root,
        html: root?.innerHTML.substring(0, 200),
        textPreview: root?.textContent?.substring(0, 100)
      };
    });
    console.log(`Root exists: ${renderStatus.rootExists}`);
    console.log(`HTML preview: ${renderStatus.html}`);
    console.log(`Text preview: ${renderStatus.textPreview}`);

  } finally {
    await browser.close();
  }
}

runDetailedTests().catch(console.error);
