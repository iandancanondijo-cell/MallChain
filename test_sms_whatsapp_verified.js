/**
 * SMS/WhatsApp Notification Test with Phone Verification
 * 
 * This script:
 * 1. Registers user with email/password
 * 2. Adds phone number +254708199147
 * 3. Verifies phone with OTP
 * 4. Sends test notification via SMS/WhatsApp
 * 5. Verifies delivery
 */

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

async function testSmsWhatsAppWithVerification() {
  try {
    console.log('📱 SMS/WhatsApp Notification Test (Full Flow)\n');
    console.log('Testing with phone: +254708199147\n');
    
    // Step 1: Register user
    console.log('📝 Step 1: Registering user...');
    const testEmail = `smstest-${Date.now()}@mallchain.test`;
    const testPassword = 'Test@Password123!';
    const phoneNumber = '+254708199147';
    
    let registerResponse;
    try {
      registerResponse = await makeRequest('POST', '/api/auth/register', {
        email: testEmail,
        password: testPassword,
      });
      
      if (registerResponse.status !== 200) {
        console.error('  ❌ Registration failed:', registerResponse.data);
        return;
      }
      
      console.log('  ✅ User registered:', testEmail);
      console.log('  User ID:', registerResponse.data.user._id);
    } catch (err) {
      console.error('  ❌ Registration error:', err.message);
      return;
    }
    
    // Step 2: Login
    console.log('\n🔐 Step 2: Logging in...');
    let loginResponse;
    let cookies = '';
    try {
      loginResponse = await makeRequest('POST', '/api/auth/login', {
        email: testEmail,
        password: testPassword,
      });
      
      if (loginResponse.status !== 200) {
        console.error('  ❌ Login failed:', loginResponse.data);
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
    
    // Step 3: Get CSRF token
    console.log('\n🔑 Step 3: Getting CSRF token...');
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
    
    // Step 4: Add phone number
    console.log('\n📞 Step 4: Adding phone number...');
    try {
      const phoneResponse = await makeRequest(
        'PUT',
        '/api/settings/contact',
        { phoneNumber },
        { cookies, csrfToken }
      );
      
      if (phoneResponse.status !== 200) {
        console.error('  ❌ Failed to add phone:', phoneResponse.data);
        return;
      }
      
      console.log('  ✅ Phone number added:', phoneNumber);
    } catch (err) {
      console.error('  ❌ Phone update error:', err.message);
      return;
    }
    
    // Step 5: Request OTP
    console.log('\n📨 Step 5: Requesting phone verification OTP...');
    let otp = null;
    try {
      const otpResponse = await makeRequest(
        'POST',
        '/api/settings/contact/phone/send-otp',
        {},
        { cookies, csrfToken }
      );
      
      if (otpResponse.status !== 200) {
        console.error('  ❌ Failed to request OTP:', otpResponse.data);
        return;
      }
      
      console.log('  ✅ OTP requested');
      
      // In development mode, the API returns the OTP directly
      if (otpResponse.data.otp) {
        otp = otpResponse.data.otp;
        console.log('  💡 Dev Mode OTP:', otp);
      } else if (otpResponse.data.sent) {
        console.log('  💡 OTP sent to phone (production mode)');
        // For demo, use a test OTP if available
        console.log('  ℹ️  Note: In production, check SMS for OTP');
      }
    } catch (err) {
      console.error('  ❌ OTP request error:', err.message);
      return;
    }
    
    // Step 6: Verify phone with OTP
    if (otp) {
      console.log('\n✔️  Step 6: Verifying phone with OTP...');
      try {
        const verifyResponse = await makeRequest(
          'POST',
          '/api/settings/contact/phone/verify',
          { otp },
          { cookies, csrfToken }
        );
        
        if (verifyResponse.status !== 200) {
          console.error('  ❌ Failed to verify phone:', verifyResponse.data);
          return;
        }
        
        console.log('  ✅ Phone verified successfully');
      } catch (err) {
        console.error('  ❌ Phone verification error:', err.message);
        return;
      }
    } else {
      console.log('\n⚠️  Step 6: Skipping OTP verification (no OTP in response)');
      console.log('  Note: In production, you would receive OTP via SMS');
    }
    
    // Step 7: Enable SMS/WhatsApp in preferences
    console.log('\n⚙️  Step 7: Enabling SMS/WhatsApp in preferences...');
    try {
      const prefsResponse = await makeRequest(
        'PATCH',
        '/api/notification-preferences',
        {
          channels: {
            email: true,
            sms: true,
            whatsapp: true,
            inApp: true,
          },
        },
        { cookies, csrfToken }
      );
      
      if (prefsResponse.status === 200 || prefsResponse.status === 204) {
        console.log('  ✅ SMS/WhatsApp enabled in preferences');
      } else {
        console.log('  ℹ️  Preferences update status:', prefsResponse.status);
      }
    } catch (err) {
      console.log('  ℹ️  Preferences endpoint error (may not affect notification sending)');
    }
    
    // Step 8: Send test notification
    console.log('\n📬 Step 8: Sending test notification...');
    try {
      const testResponse = await makeRequest('POST', '/api/notifications/test', {}, { cookies, csrfToken });
      
      if (testResponse.status !== 200) {
        console.error('  ❌ Notification test failed:', testResponse.data);
        return;
      }
      
      console.log('  ✅ Test notification sent!');
      console.log('  Notification ID:', testResponse.data.notificationId);
      
      if (testResponse.data.channels) {
        console.log('  Channels:');
        Object.entries(testResponse.data.channels).forEach(([channel, attempted]) => {
          console.log(`    - ${channel}: ${attempted ? '✓ attempted' : '✗ skipped'}`);
        });
      }
      
      if (testResponse.data.deliveryStatus) {
        console.log('  Delivery Status:');
        Object.entries(testResponse.data.deliveryStatus).forEach(([channel, status]) => {
          const icon = status === 'sent' ? '✓' : status === 'failed' ? '✗' : '○';
          console.log(`    - ${channel}: ${icon} ${status}`);
        });
      }
    } catch (err) {
      console.error('  ❌ Notification test error:', err.message);
      return;
    }
    
    // Step 9: List notifications to verify storage
    console.log('\n📋 Step 9: Retrieving notifications...');
    try {
      const listResponse = await makeRequest('GET', '/api/notifications?limit=5', null, { cookies });
      
      if (listResponse.status === 200) {
        console.log('  ✅ Notifications retrieved');
        console.log('  Total:', listResponse.data.total);
        console.log('  Unread:', listResponse.data.unreadCount);
        
        if (listResponse.data.notifications && listResponse.data.notifications.length > 0) {
          console.log('\n  Latest notification:');
          const latest = listResponse.data.notifications[0];
          console.log(`    Title: ${latest.title}`);
          console.log(`    Message: ${latest.message}`);
          console.log(`    Channels: ${Object.keys(latest.channels || {}).filter(k => latest.channels[k]).join(', ')}`);
        }
      }
    } catch (err) {
      console.error('  ❌ Failed to retrieve notifications:', err.message);
    }
    
    console.log('\n✨ Test Complete!\n');
    console.log('🎯 Expected Results:');
    console.log('  ✓ In-app notification created and stored');
    console.log('  ✓ SMS notification sent to +254708199147');
    console.log('  ✓ WhatsApp notification sent to +254708199147 (if Twilio configured)\n');
    console.log('📱 What to check:');
    console.log('  1. SMS: Check your phone for Mallchain message');
    console.log('  2. WhatsApp: Check WhatsApp app for message from Twilio number');
    console.log('  3. In-app: Check notifications in UI');
    console.log('  4. Note: SMS/WhatsApp may take 30-120 seconds to arrive\n');
    
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testSmsWhatsAppWithVerification().catch(console.error);
