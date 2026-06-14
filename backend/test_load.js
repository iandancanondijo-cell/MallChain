// Quick test to see if modules load correctly
const express = require('express');
const router = express.Router();

// Load controller
const txCtrl = require('./src/controllers/txController');

// Create route
router.get('/', txCtrl.list);

const app = express();
app.use(express.json());
app.use('/api/tx', router);

app.listen(5555, () => {
  console.log('Test server on 5555');
});

// Test directly
const req = { query: {} };
const res = { 
  json: (data) => console.log('Response:', JSON.stringify(data).slice(0, 100)) 
};

setTimeout(() => {
  try {
    txCtrl.list(req, res).catch(e => console.error('Error:', e.message));
  } catch(e) {
    console.error('Sync error:', e.message);
  }
}, 500);
