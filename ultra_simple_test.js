const http = require('http');

function post(path, body) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  console.log('�� Ultra-Simple SMS Test\n');
  
  // 1. Login
  console.log('1. Logging in...');
  const login = await post('/api/auth/login', {
    email: 'test@example.com',
    password: 'Test123!@#'
  });
  console.log(login.user ? '   ✅ OK' : '   ❌ FAIL: ' + login.error);
  
  if (!login.user) process.exit(1);
})();
