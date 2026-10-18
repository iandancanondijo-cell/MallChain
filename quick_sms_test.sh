#!/bin/bash

echo "🚀 Quick SMS/WhatsApp Test"
echo ""

# User we know exists
EMAIL="test@example.com"
PASS="Test123!@#"
PHONE="+254708199147"

echo "1️⃣  Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  -c /tmp/cookies.txt)

if echo "$LOGIN_RESPONSE" | grep -q "expiresAt"; then
  echo "✅ Login successful"
else
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE" | head -20
  exit 1
fi

echo ""
echo "2️⃣  Getting CSRF token..."
CSRF=$(curl -s -X GET http://localhost:4000/api/csrf-token \
  -b /tmp/cookies.txt | grep -o '"csrfToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$CSRF" ]; then
  echo "❌ No CSRF token"
  exit 1
fi

echo "✅ CSRF obtained"
echo ""
echo "3️⃣  Updating user phone in database..."

node - <<'NODEEOF'
require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/marketplace');

const db = mongoose.connection;
db.on('connected', async () => {
  try {
    const User = require('./backend/src/models/user');
    const { blindIndex } = require('./backend/src/utils/fieldEncryption');
    
    const user = await User.findOne({ 
      email_blind: blindIndex('test@example.com') 
    });
    
    if (user) {
      user.phone = '+254708199147';
      await user.save();
      console.log('✅ Phone updated for user');
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
});
NODEEOF

echo ""
echo "4️⃣  Sending notification..."
NOTIF=$(curl -s -X POST http://localhost:4000/api/notifications/test \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -b /tmp/cookies.txt \
  -d '{}')

echo "$NOTIF" | grep -o '"deliveryStatus":{[^}]*}' || echo "No delivery status"

echo ""
echo "✨ Done! Check phone for SMS/WhatsApp on +254708199147"
echo ""
