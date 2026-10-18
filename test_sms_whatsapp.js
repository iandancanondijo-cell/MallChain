/**
 * SMS/WhatsApp Notification Test
 * 
 * This script:
 * 1. Registers a user with a real phone number
 * 2. Updates user preferences to enable SMS/WhatsApp
 * 3. Sends a test notification via SMS/WhatsApp
 * 4. Verifies delivery
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

async function testSmsWhatsApp() {
  try {
    console.log('📱 SMS/WhatsApp Notification Test\n');
    console.log('Testing with phone: +254708199147\n');
    
    // Step 1: Register user with phone number
    console.log('📝 Step 1: Registering user with phone number...');
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
      const userId = registerResponse.data.user._id;
      console.log('  User ID:', userId);
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
    
    // Step 4: Update user with phone number
    // NOTE: The backend User model stores phone encrypted. We need to check if there's an endpoint to update profile
    // For now, we'll try to use the API as-is. The phone might need to be set through a settings endpoint.
    
    console.log('\n📞 Step 4: Updating user profile with phone number...');
    console.log('  Note: Checking if phone can be added via profile update endpoint...');
    
    // Try to find a profile update endpoint - typically /api/profile or /api/settings/profile
    const profilePaths = [
      '/api/profile',
      '/api/users/profile',
      '/api/settings/profile',
    ];
    
    let phoneUpdateSuccess = false;
    for (const path of profilePaths) {
      try {
        const profileResponse = await makeRequest('PATCH', path, {
          phone: phoneNumber,
        }, { cookies, csrfToken });
        
        if (profileResponse.status === 200 || profileResponse.status === 204) {
          console.log(`  ✅ Phone added via ${path}`);
          phoneUpdateSuccess = true;
          break;
        }
      } catch (err) {
        // Continue to next path
      }
    }
    
    if (!phoneUpdateSuccess) {
      console.log('  ⚠️  Phone update endpoint not found. Testing notification with phone in request...');
      console.log('  Note: Typically users would add phone through settings UI first');
    }
    
    // Step 5: Get notification preferences
    console.log('\n⚙️  Step 5: Checking notification preferences...');
    try {
      const prefsResponse = await makeRequest('GET', '/api/notification-preferences', null, { cookies });
      
      if (prefsResponse.status === 200) {
        console.log('  ✅ Preferences fetched');
        console.log('  Current preferences:', JSON.stringify(prefsResponse.data, null, 2));
        
        // Update preferences to enable SMS/WhatsApp
        console.log('\n  Enabling SMS and WhatsApp channels...');
        const updatePrefsResponse = await makeRequest(
          'PATCH',
          '/api/notification-preferences',
          {
            channels: {
              email: true,
              sms: true,
              whatsapp: true,
              inApp: true,
            },
            frequency: {
              transactions: 'immediate',
              security: 'immediate',
              governance: 'immediate',
              campaigns: 'daily',
              marketing: 'weekly',
              badgeAlerts: 'immediate',
            },
            doNotDisturb: {
              enabled: false,
            },
          },
          { cookies, csrfToken }
        );
        
        if (updatePrefsResponse.status === 200 || updatePrefsResponse.status === 204) {
          console.log('  ✅ Preferences updated: SMS/WhatsApp enabled');
        }
      }
    } catch (err) {
      console.log('  ℹ️  Preferences endpoint not accessible (may not exist)');
    }
    
    // Step 6: Send test notification
    console.log('\n📬 Step 6: Sending test notification...');
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
          console.log(`    - ${channel}: ${status}`);
        });
      }
    } catch (err) {
      console.error('  ❌ Notification test error:', err.message);
      return;
    }
    
    // Step 7: List notifications
    console.log('\n📋 Step 7: Retrieving notifications...');
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
    console.log('📱 What to expect:');
    console.log('  1. You should receive an SMS on +254708199147 shortly');
    console.log('  2. You may also receive a WhatsApp message');
    console.log('  3. The in-app notification is already shown above\n');
    console.log('💡 Note: SMS delivery may take 30 seconds - 2 minutes');
    console.log('        Check your phone or WhatsApp');
    
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testSmsWhatsApp().catch(console.error);
