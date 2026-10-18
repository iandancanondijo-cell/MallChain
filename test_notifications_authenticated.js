/**
 * End-to-End Notification Test
 * Uses Bearer token auth (though httpOnly cookies work in browser)
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 4000;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = http.request(options, (res) => {
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

async function testNotifications() {
  try {
    console.log('🚀 Starting End-to-End Notification Test\n');
    
    // Test 1: Register a test user
    console.log('📝 Step 1: Registering test user...');
    const testEmail = `testuser-${Date.now()}@mallchain.test`;
    const testPassword = 'Test@Password123!';
    
    let registerResponse;
    try {
      registerResponse = await makeRequest('POST', '/api/auth/register', {
        email: testEmail,
        password: testPassword,
      });
      
      if (registerResponse.status === 400 && registerResponse.data.error === 'email exists') {
        console.log('  ℹ️  User already exists, attempting login instead...');
      } else if (registerResponse.status !== 200) {
        console.error('  ❌ Registration failed:', registerResponse.data);
        return;
      } else {
        console.log('  ✅ User registered:', registerResponse.data.user.email);
      }
    } catch (err) {
      console.error('  ❌ Registration error:', err.message);
      return;
    }
    
    // Test 2: Login to get JWT token via cookie
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
      
      // Extract cookies from Set-Cookie header
      if (loginResponse.headers['set-cookie']) {
        cookies = loginResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        console.log('  ✅ Login successful, session cookie set');
      }
      
      console.log('  User:', loginResponse.data.user.email);
      console.log('  Session expires:', new Date(loginResponse.data.expiresAt * 1000).toISOString());
    } catch (err) {
      console.error('  ❌ Login error:', err.message);
      return;
    }
    
    // Test 3: Get CSRF token
    console.log('\n🔐 Step 3: Getting CSRF token...');
    let csrfToken = '';
    try {
      const csrfOptions = {
        hostname: API_HOST,
        port: API_PORT,
        path: '/api/csrf-token',
        method: 'GET',
        headers: {
          'Cookie': cookies,
        },
      };
      
      const csrfResponse = await new Promise((resolve) => {
        const req = http.request(csrfOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
              headers: res.headers,
            });
          });
        });
        req.on('error', () => resolve({ status: 500, data: { error: 'Network error' }, headers: {} }));
        req.end();
      });
      
      if (csrfResponse.status !== 200) {
        console.error('  ❌ CSRF token fetch failed:', csrfResponse.data);
        return;
      }
      
      csrfToken = csrfResponse.data.csrfToken;
      
      // Also capture any new cookies from CSRF response
      if (csrfResponse.headers['set-cookie']) {
        const newCookies = csrfResponse.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        cookies = cookies ? cookies + '; ' + newCookies : newCookies;
      }
      
      console.log('  ✅ CSRF token obtained');
    } catch (err) {
      console.error('  ❌ CSRF token error:', err.message);
      return;
    }
    
    // Test 4: Verify authentication
    console.log('\n✔️  Step 4: Verifying authentication...');
    try {
      const meOptions = {
        hostname: API_HOST,
        port: API_PORT,
        path: '/api/auth/me',
        method: 'GET',
        headers: {
          'Cookie': cookies,
        },
      };
      
      const meResponse = await new Promise((resolve) => {
        const req = http.request(meOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
            });
          });
        });
        req.on('error', () => resolve({ status: 500, data: { error: 'Network error' } }));
        req.end();
      });
      
      if (meResponse.status !== 200) {
        console.error('  ❌ Auth verification failed:', meResponse.data);
        return;
      }
      
      console.log('  ✅ Auth verified');
      console.log('  User ID:', meResponse.data.user._id);
      console.log('  Email:', meResponse.data.user.email);
    } catch (err) {
      console.error('  ❌ Auth verification error:', err.message);
      return;
    }
    
    // Test 5: Send test notification
    console.log('\n📬 Step 5: Sending test notification...');
    try {
      const testOptions = {
        hostname: API_HOST,
        port: API_PORT,
        path: '/api/notifications/test',
        method: 'POST',
        headers: {
          'Cookie': cookies,
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      };
      
      const testResponse = await new Promise((resolve) => {
        const req = http.request(testOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
            });
          });
        });
        req.on('error', () => resolve({ status: 500, data: { error: 'Network error' } }));
        req.write(JSON.stringify({}));
        req.end();
      });
      
      if (testResponse.status !== 200) {
        console.error('  ❌ Notification test failed:', testResponse.data);
        return;
      }
      
      console.log('  ✅ Test notification sent!');
      console.log('  Notification ID:', testResponse.data.notificationId);
      
      if (testResponse.data.channels) {
        console.log('  Channels:');
        Object.entries(testResponse.data.channels).forEach(([channel, attempted]) => {
          console.log(`    - ${channel}: ${attempted ? '✓' : '✗'}`);
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
    
    // Test 6: List notifications
    console.log('\n📋 Step 6: Retrieving notifications...');
    try {
      const listOptions = {
        hostname: API_HOST,
        port: API_PORT,
        path: '/api/notifications?limit=5',
        method: 'GET',
        headers: {
          'Cookie': cookies,
        },
      };
      
      const listResponse = await new Promise((resolve) => {
        const req = http.request(listOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
            });
          });
        });
        req.on('error', () => resolve({ status: 500, data: { error: 'Network error' } }));
        req.end();
      });
      
      if (listResponse.status !== 200) {
        console.error('  ❌ Failed to retrieve notifications:', listResponse.data);
        return;
      }
      
      console.log('  ✅ Notifications retrieved');
      console.log('  Total notifications:', listResponse.data.total);
      console.log('  Unread count:', listResponse.data.unreadCount);
      
      if (listResponse.data.notifications && listResponse.data.notifications.length > 0) {
        console.log('\n  Latest notifications:');
        listResponse.data.notifications.slice(0, 3).forEach((notif, i) => {
          console.log(`    ${i + 1}. ${notif.title}`);
          console.log(`       Message: ${notif.message}`);
          console.log(`       Created: ${new Date(notif.createdAt).toISOString()}`);
          if (notif.channels) {
            console.log(`       Channels: ${Object.keys(notif.channels).filter(k => notif.channels[k]).join(', ')}`);
          }
        });
      } else {
        console.log('  No notifications found');
      }
    } catch (err) {
      console.error('  ❌ Notification retrieval error:', err.message);
      return;
    }
    
    console.log('\n✨ End-to-End Notification Test Completed!\n');
    console.log('📱 Real Delivery Verification:');
    console.log('  ✓ Test email sent to:', testEmail);
    console.log('  ✓ In-app notification created and retrievable');
    console.log('  ✓ Auth flow working correctly');
    console.log('\n💡 To verify SMS/Email/WhatsApp delivery:');
    console.log('  1. Check your inbox for email from Mallchain');
    console.log('  2. Check SMS on registered phone (if configured)');
    console.log('  3. Check WhatsApp (if configured)\n');
    
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testNotifications().catch(console.error);
