// Gate 61.2 — Re-login, generate fresh ADR-036 signature, link wallet
const { Secp256k1HdWallet, makeSignDoc } = require('@cosmjs/amino');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');
const { writeFileSync, readFileSync } = require('fs');
const http = require('http');

const EMAIL = 'gate61u1_1790820280@test.com';
const PASSWORD = 'SimplePass123';

function postJson(path, body, authToken) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 4000, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${authToken}`,
      },
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        const setCookies = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, body: buf, setCookies, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path, authToken) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 4000, path, method: 'GET',
      headers: { 'Authorization': `Bearer ${authToken}` },
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Step 1: Login
  console.log('=== STEP 1: LOGIN ===');
  const loginRes = await postJson('/api/auth/login', { email: EMAIL, password: PASSWORD });
  console.log('Login status:', loginRes.status);
  if (loginRes.status !== 200) {
    console.log('Login failed:', loginRes.body);
    process.exit(1);
  }
  const loginData = JSON.parse(loginRes.body);
  // Token is in set-cookie header, not body
  const authCookie = loginRes.setCookies.find(c => c.startsWith('auth_token='));
  const authToken = authCookie ? authCookie.split(';')[0].split('=')[1] : null;
  if (!authToken) {
    console.log('No auth_token in cookies:', loginRes.setCookies);
    process.exit(1);
  }
  console.log('Auth token obtained:', authToken.substring(0, 80) + '...');

  // Verify login
  const meRes = await getJson('/api/auth/me', authToken);
  console.log('Auth/me status:', meRes.status);
  const meData = JSON.parse(meRes.body);
  console.log('User ID:', meData._id || meData.user?._id);

  // Step 2: Generate fresh keypair + signature
  console.log('\n=== STEP 2: GENERATE KEYPAIR + SIGN ===');
  const wallet = await Secp256k1HdWallet.generate(12, { prefix: 'mall' });
  const [account] = await wallet.getAccounts();
  const address = account.address;
  const pubKeyBase64 = toBase64(account.pubkey);
  console.log('Address:', address);
  console.log('PubKey:', pubKeyBase64);

  const timestamp = new Date().toISOString();
  const message = `Link wallet ${address} to my Mallchain account at ${timestamp}`;
  const msg = {
    type: 'sign/MsgSignData',
    value: { signer: address, data: toBase64(toUtf8(message)) },
  };
  const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);
  const signResult = await wallet.signAmino(address, signDoc);
  const signatureBase64 = signResult.signature.signature;
  console.log('Timestamp:', timestamp);
  console.log('Signature:', signatureBase64.substring(0, 40) + '...');

  // Step 3: Link wallet immediately
  console.log('\n=== STEP 3: LINK WALLET ===');
  const linkBody = { address, timestamp, pubKey: pubKeyBase64, signature: signatureBase64 };
  const linkRes = await postJson('/api/auth/link-wallet', linkBody, authToken);
  console.log('Link status:', linkRes.status);
  console.log('Link response:', linkRes.body);

  // Save state
  const state = {
    email: EMAIL, password: PASSWORD, user_id: meData._id || meData.user?._id,
    address, pubKey: pubKeyBase64, mnemonic: wallet.mnemonic,
    authToken, timestamp, signature: signatureBase64,
  };
  writeFileSync('/tmp/gate61/user1_linked.json', JSON.stringify(state, null, 2));
  console.log('\nState saved to /tmp/gate61/user1_linked.json');
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
