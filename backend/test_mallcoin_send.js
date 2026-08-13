/**
 * Test script for Mallcoin sending functionality
 * Usage: ALLOW_INSECURE_PRIVATE_KEY=true node test_mallcoin_send.js
 */

require('dotenv').config();
const axios = require('axios');

const BACKEND_URL = 'http://localhost:4000';
const CHAIN_REST = 'http://localhost:1317';

// Test addresses from genesis
const FOUNDER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const AFA_ADDRESS = 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6';
const TEAM_ADDRESS = 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5';

async function testMlcnsBalance() {
  console.log('\n=== Testing MLCNS Balance ===');
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/mlcns/balance/${FOUNDER_ADDRESS}`);
    console.log('Founder Balance:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Balance check failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testMlcnsPrice() {
  console.log('\n=== Testing MLCNS Price ===');
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/mlcns/price`);
    console.log('MLCNS Price:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Price check failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testAccountInfo(address) {
  console.log(`\n=== Testing Account Info for ${address} ===`);
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/account/${address}`);
    console.log('Account Info:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Account info check failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testValidateRecipient(address) {
  console.log(`\n=== Testing Recipient Validation for ${address} ===`);
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/mlcns/validate/${address}`);
    console.log('Validation Result:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Recipient validation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testGasBalance(address) {
  console.log(`\n=== Testing Gas Balance for ${address} ===`);
  try {
    const response = await axios.get(`${BACKEND_URL}/api/send/gas-balance/${address}`);
    console.log('Gas Balance:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Gas balance check failed:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('=== Mallcoin Sending Functionality Tests ===');
  console.log('Backend URL:', BACKEND_URL);
  console.log('Chain REST:', CHAIN_REST);

  try {
    // Test 1: Check balances
    await testMlcnsBalance();

    // Test 2: Check price
    await testMlcnsPrice();

    // Test 3: Get account info
    await testAccountInfo(FOUNDER_ADDRESS);
    await testAccountInfo(AFA_ADDRESS);

    // Test 4: Validate recipient
    await testValidateRecipient(TEAM_ADDRESS);

    // Test 5: Check gas balance
    await testGasBalance(FOUNDER_ADDRESS);

    console.log('\n✅ All basic tests passed!');
    console.log('\nNote: Actual transfer requires:');
    console.log('  1. Pre-signed txBytes from wallet client, OR');
    console.log('  2. ALLOW_INSECURE_PRIVATE_KEY=true in development mode');
    console.log('  3. Private key for signing (development only)');

  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

main();
