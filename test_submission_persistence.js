#!/usr/bin/env node
const axios = require('axios');
const { MongoClient } = require('mongodb');

const API = 'http://localhost:4000';
const MONGO_URI = 'mongodb://127.0.0.1:27018/marketplace';

async function test() {
  console.log('=== Submission Persistence Test ===\n');

  // 1. Login
  console.log('1. Logging in...');
  const loginRes = await axios.post(`${API}/api/auth/login`, {
    email: 'admin@mallchain.com',
    password: 'Admin123!'
  }, { maxBodyLength: Infinity });

  if (!loginRes.data?.user) {
    console.error('Login failed:', loginRes.data);
    process.exit(1);
  }

  const cookies = loginRes.headers['set-cookie'];
  const authToken = cookies?.find(c => c.startsWith('auth_token='))?.split(';')[0];
  const csrfToken = cookies?.find(c => c.startsWith('XSRF-TOKEN='))?.split(';')[0]?.replace('XSRF-TOKEN=', '');

  console.log('✓ Logged in');
  console.log('  Auth token:', authToken?.substring(0, 30) + '...');
  console.log('  CSRF token:', csrfToken?.substring(0, 20) + '...\n');

  const headers = {
    'Cookie': `${authToken}; XSRF-TOKEN=${csrfToken}`,
    'x-csrf-token': csrfToken,
    'Content-Type': 'application/json'
  };

  // 2. Create campaign
  console.log('2. Creating campaign...');
  const campaignRes = await axios.post(`${API}/api/mines/campaigns`, {
    title: 'Test Campaign ' + Date.now(),
    task_type: 'survey',
    description: 'Test description',
    rate_per_task: 0.5,
    budget_remaining: 100,
    max_completions_per_user: 5
  }, { headers });

  if (!campaignRes.data?.ok) {
    console.error('Campaign creation failed:', campaignRes.data);
    process.exit(1);
  }

  const campaignId = campaignRes.data.data._id;
  console.log('✓ Campaign created:', campaignId);
  console.log('  Budget:', campaignRes.data.data.budget_remaining, 'MLPTS\n');

  // 3. Create submission
  console.log('3. Creating submission...');
  const submissionRes = await axios.post(`${API}/api/mines/submissions`, {
    campaign_id: campaignId,
    title: 'Test Submission',
    task_type: 'survey',
    description: 'Test submission description',
    proof_url: 'https://example.com/proof'
  }, { headers });

  if (!submissionRes.data?.ok) {
    console.error('Submission creation failed:', submissionRes.data);
    process.exit(1);
  }

  const submissionId = submissionRes.data.data._id;
  console.log('✓ Submission created:', submissionId);
  console.log('  Status:', submissionRes.data.data.status);
  console.log('  Response:', JSON.stringify(submissionRes.data.data, null, 2).substring(0, 200) + '...\n');

  // 4. Verify in database
  console.log('4. Verifying submission in database...');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('marketplace');

  const submission = await db.collection('tasksubmissions').findOne({ _id: new require('mongodb').ObjectId(submissionId) });

  if (!submission) {
    console.error('✗ SUBMISSION NOT FOUND IN DATABASE!');
    console.error('  This confirms the persistence bug.');
    await client.close();
    process.exit(1);
  }

  console.log('✓ Submission found in database');
  console.log('  _id:', submission._id.toString());
  console.log('  status:', submission.status);
  console.log('  miner_id:', submission.miner_id.toString());
  console.log('  campaign_id:', submission.campaign_id.toString());
  console.log('  reward_amount:', submission.reward_amount);
  console.log('  created_at:', submission.created_at);

  // 5. Verify via API
  console.log('\n5. Verifying submission via API...');
  const mySubmissionsRes = await axios.get(`${API}/api/mines/submissions/me`, { headers });

  if (!mySubmissionsRes.data?.ok) {
    console.error('Failed to fetch submissions:', mySubmissionsRes.data);
    await client.close();
    process.exit(1);
  }

  const found = mySubmissionsRes.data.data.find(s => s._id === submissionId);
  if (!found) {
    console.error('✗ Submission not found in API response!');
    await client.close();
    process.exit(1);
  }

  console.log('✓ Submission found via API');
  console.log('  Total submissions:', mySubmissionsRes.data.data.length);

  await client.close();
  console.log('\n=== TEST PASSED ===');
  console.log('Submission persistence is working correctly.');
}

test().catch(err => {
  console.error('\n=== TEST FAILED ===');
  console.error(err.message);
  if (err.response) {
    console.error('Response:', err.response.data);
  }
  process.exit(1);
});
