/**
 * Test script for Mallpoint conversion functionality
 * Tests conversion window logic for badge holders (15th of month) and non-badge holders (Dec 27)
 * Usage: MALLPOINTS_CONVERT_ANY_DAY=true node test_mallpoints_conversion.js
 */

require('dotenv').config();
const axios = require('axios');

const BACKEND_URL = 'http://localhost:4000';

// Test addresses from genesis
const FOUNDER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const AFA_ADDRESS = 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6';

async function testMallpointsBalance(address) {
  console.log(`\n=== Testing Mallpoints Balance for ${address} ===`);
  try {
    const response = await axios.get(`${BACKEND_URL}/api/mallpoints/${address}`);
    console.log('Mallpoints Info:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Mallpoints balance check failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testMallpointsSync(address) {
  console.log(`\n=== Testing Mallpoints Sync for ${address} ===`);
  try {
    const response = await axios.post(`${BACKEND_URL}/api/mallpoints/sync`, { address });
    console.log('Sync Result:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Mallpoints sync failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testAwardMallpoints(address, amount = 100) {
  console.log(`\n=== Testing Award Mallpoints to ${address} ===`);
  try {
    const response = await axios.post(`${BACKEND_URL}/api/mallpoints/award`, { address, amount });
    console.log('Award Result:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Mallpoints award failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testConvertMallpoints(address) {
  console.log(`\n=== Testing Convert Mallpoints for ${address} ===`);
  try {
    const response = await axios.post(`${BACKEND_URL}/api/mallpoints/convert`, { address });
    console.log('Conversion Result:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Mallpoints conversion failed:', error.response?.data || error.message);
    return error.response?.data || { error: error.message };
  }
}

async function testConversionWindowLogic() {
  console.log('\n=== Testing Conversion Window Logic ===');
  
  const { buildConversionStatus } = require('./src/services/mallpointsService');
  
  // Test scenarios
  const scenarios = [
    {
      name: 'Badge holder on 15th of month',
      hasBadge: true,
      date: new Date('2026-07-15T00:00:00Z'),
      expectedCanConvert: true
    },
    {
      name: 'Badge holder on 14th of month',
      hasBadge: true,
      date: new Date('2026-07-14T00:00:00Z'),
      expectedCanConvert: false
    },
    {
      name: 'Badge holder on 16th of month',
      hasBadge: true,
      date: new Date('2026-07-16T00:00:00Z'),
      expectedCanConvert: false
    },
    {
      name: 'Non-badge holder on December 27th',
      hasBadge: false,
      date: new Date('2026-12-27T00:00:00Z'),
      expectedCanConvert: true
    },
    {
      name: 'Non-badge holder on December 26th',
      hasBadge: false,
      date: new Date('2026-12-26T00:00:00Z'),
      expectedCanConvert: false
    },
    {
      name: 'Non-badge holder on December 28th',
      hasBadge: false,
      date: new Date('2026-12-28T00:00:00Z'),
      expectedCanConvert: false
    },
    {
      name: 'Non-badge holder on July 15th',
      hasBadge: false,
      date: new Date('2026-07-15T00:00:00Z'),
      expectedCanConvert: false
    },
    {
      name: 'Developer override enabled',
      hasBadge: false,
      date: new Date('2026-07-26T00:00:00Z'),
      allowAnyDay: true,
      expectedCanConvert: true
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    const status = buildConversionStatus({
      hasBadge: scenario.hasBadge,
      now: scenario.date,
      allowAnyDay: scenario.allowAnyDay || false
    });

    const testPassed = status.canConvert === scenario.expectedCanConvert;
    if (testPassed) {
      passed++;
      console.log(`✅ ${scenario.name}: canConvert=${status.canConvert} (expected: ${scenario.expectedCanConvert})`);
    } else {
      failed++;
      console.log(`❌ ${scenario.name}: canConvert=${status.canConvert} (expected: ${scenario.expectedCanConvert})`);
      console.log(`   Reason: ${status.reason}`);
      console.log(`   Next allowed: ${status.nextAllowedConversionAt}`);
    }
  }

  console.log(`\nConversion Logic Tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function main() {
  console.log('=== Mallpoint Conversion Functionality Tests ===');
  console.log('Backend URL:', BACKEND_URL);
  console.log('Developer Override:', process.env.MALLPOINTS_CONVERT_ANY_DAY === 'true' ? 'ENABLED' : 'DISABLED');

  try {
    // Test 1: Conversion window logic
    const logicResults = await testConversionWindowLogic();

    // Test 2: Check current mallpoints balance
    const balanceBefore = await testMallpointsBalance(FOUNDER_ADDRESS);

    // Test 3: Award some mallpoints for testing
    console.log('\n=== Awarding test mallpoints ===');
    const awardResult = await testAwardMallpoints(FOUNDER_ADDRESS, 50);

    // Test 4: Check balance after award
    const balanceAfterAward = await testMallpointsBalance(FOUNDER_ADDRESS);

    // Test 5: Check conversion status
    console.log('\n=== Current Conversion Status ===');
    const currentStatus = balanceAfterAward.conversionStatus;
    console.log('Can Convert:', currentStatus.canConvert);
    console.log('Reason:', currentStatus.reason);
    console.log('Window Rule:', currentStatus.windowRule);
    console.log('Next Allowed:', currentStatus.nextAllowedConversionAt);

    // Test 6: Attempt conversion (may fail if not in conversion window)
    const convertResult = await testConvertMallpoints(FOUNDER_ADDRESS);

    if (convertResult.ok) {
      console.log('\n✅ Conversion successful!');
      console.log('Converted Points:', convertResult.convertedPoints);
      console.log('Mallcoins Received:', convertResult.mallcoins);
    } else {
      console.log('\n⚠️ Conversion blocked (expected if not in conversion window):');
      console.log('Error:', convertResult.error);
      if (convertResult.conversionStatus) {
        console.log('Conversion Status:', JSON.stringify(convertResult.conversionStatus, null, 2));
      }
    }

    // Test 7: Check balance after conversion attempt
    const balanceAfterConvert = await testMallpointsBalance(FOUNDER_ADDRESS);

    console.log('\n=== Summary ===');
    console.log('Conversion Logic Tests:', `${logicResults.passed}/${logicResults.passed + logicResults.failed} passed`);
    console.log('Balance Before:', balanceBefore.balance);
    console.log('Balance After Award:', balanceAfterAward.balance);
    console.log('Balance After Convert:', balanceAfterConvert.balance);
    console.log('\nNote: To test actual conversion, set MALLPOINTS_CONVERT_ANY_DAY=true');

  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

main();
