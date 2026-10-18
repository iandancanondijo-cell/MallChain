/**
 * Final SMS/WhatsApp Test
 * Tests notification delivery to +254708199147
 */

require('dotenv').config({ path: './backend/.env' });

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 4000;

function makeRequest(method, path, body = null, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.cookies ? { 'Cookie': options.cookies } : {}),
        ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
      },
    };
    
    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: parsed,
            headers: res.headers,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers,
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testSmsWhatsAppFinal() {
  try {
    console.log('📱 Final SMS/WhatsApp Notification Test\n');
    console.log('🔧 Configuration:');
    console.log('   Twilio SID: '+process.env.TWILIO_ACCOUNT_SID?.substring(0,8)+'...');
    console.log('   Twilio Phone: '+process.env.TWILIO_PHONE_NUMBER);
    console.log('   WhatsApp Number: '+process.env.TWILIO_WHATSAPP_NUMBER);
    console.log('   Target Phone: +254708199147\n');
    
    const testEmail = 'smstest@mallchain.test';
    const testPassword = 'Test@Password123!';
    
    // Step 1: Login with existing user
    console.log('🔐 Step 1: Logging in...');
    let loginResponse;
    let cookies = '';
    try {
      loginResponse = await makeRequest('POST', '/api/auth/login', {
        email: testEmail,
        password: testPassword,
      });
      
      if (loginResponse.status !== 200) {
        console.error('  ❌ Login failed:', loginResponse.data);
        console.log('\n💡 Note: Make sure user exists in database.');
        console.log('   Run: node test_direct_db_update.js');
        return;
      }
      
      if (loginResponse.headers['set-cookie']) {
        cookies = loginResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        console.log('  ✅ Login successful');
      }
    } catch (err) {
      console.error('  ❌ Login error:', err.message);
      return;
    }
    
    // Step 2: Get CSRF token
    console.log('\n🔑 Step 2: Getting CSRF token...');
    let csrfToken = '';
    try {
      const csrfResponse = await makeRequest('GET', '/api/csrf-token', null, { cookies });
      
      if (csrfResponse.status !== 200) {
        console.error('  ❌ CSRF token fetch failed:', csrfResponse.data);
        return;
      }
      
      csrfToken = csrfResponse.data.csrfToken;
      
      if (csrfResponse.headers['set-cookie']) {
        const newCookies = csrfResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        cookies = cookies ? cookies + '; ' + newCookies : newCookies;
      }
      
      console.log('  ✅ CSRF token obtained');
    } catch (err) {
      console.error('  ❌ CSRF token error:', err.message);
      return;
    }
    
    // Step 3: Verify user profile
    console.log('\n👤 Step 3: Verifying user profile...');
    try {
      const meResponse = await makeRequest('GET', '/api/auth/me', null, { cookies });
      
      if (meResponse.status !== 200) {
        console.error('  ❌ Auth verification failed:', meResponse.data);
        return;
      }
      
      console.log('  ✅ User verified');
      console.log('  User ID: '+meResponse.data.user._id);
      console.log('  Email: '+meResponse.data.user.email);
    } catch (err) {
      console.error('  ❌ Auth verification error:', err.message);
      return;
    }
    
    // Step 4: Send test notification
    console.log('\n📬 Step 4: Sending test notification with SMS/WhatsApp...');
    try {
      const testResponse = await makeRequest('POST', '/api/notifications/test', {}, { cookies, csrfToken });
      
      if (testResponse.status !== 200) {
        console.error('  ❌ Notification test failed:', testResponse.data);
        return;
      }
      
      console.log('  ✅ Test notification sent!');
      console.log('  Notification ID: '+testResponse.data.notificationId);
      
      if (testResponse.data.channels) {
        console.log('\n  Channels:');
        Object.entries(testResponse.data.channels).forEach(([channel, attempted]) => {
          console.log(`    ${attempted ? '✓' : '✗'} ${channel}: ${attempted ? 'attempted' : 'skipped'}`);
        });
      }
      
      if (testResponse.data.deliveryStatus) {
        console.log('\n  Delivery Status:');
        Object.entries(testResponse.data.deliveryStatus).forEach(([channel, status]) => {
          let icon = '●';
          if (status === 'sent') icon = '✓';
          if (status === 'failed') icon = '✗';
          if (status === 'skipped') icon = '○';
          console.log(`    ${icon} ${channel}: ${status}`);
        });
      }
    } catch (err) {
      console.error('  ❌ Notification test error:', err.message);
      return;
    }
    
    // Step 5: Retrieve notifications
    console.log('\n📋 Step 5: Verifying in-app notification...');
    try {
      const listResponse = await makeRequest('GET', '/api/notifications?limit=5', null, { cookies });
      
      if (listResponse.status === 200) {
        console.log('  ✅ Notifications retrieved');
        console.log('  Total: '+listResponse.data.total);
        console.log('  Unread: '+listResponse.data.unreadCount);
        
        if (listResponse.data.notifications && listResponse.data.notifications.length > 0) {
          console.log('\n  Latest notification:');
          const latest = listResponse.data.notifications[0];
          console.log(`    Title: ${latest.title}`);
          console.log(`    Message: ${latest.message.substring(0, 60)}...`);
          const channels = Object.keys(latest.channels || {}).filter(k => latest.channels[k]);
          console.log(`    Channels: ${channels.join(', ')}`);
        }
      }
    } catch (err) {
      console.error('  ❌ Notification retrieval error:', err.message);
    }
    
    console.log('\n✨ Test Complete!\n');
    console.log('🎯 Expected Delivery:');
    console.log('  ✓ SMS to +254708199147 (via Twilio)');
    console.log('  ✓ WhatsApp to +254708199147 (via Twilio)');
    console.log('  ✓ In-app notification created\n');
    console.log('📱 Check within 2 minutes:');
    console.log('  1. SMS app on phone: +254708199147');
    console.log('  2. WhatsApp app: Check for message');
    console.log('  3. In-app: Notifications tab (already verified above)\n');
    
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testSmsWhatsAppFinal().catch(console.error);
