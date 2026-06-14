// Quick test of transaction parameters
const onchainCode = require('./frontend/src/utils/onchain-transactions.js');

// Check the constants
import('file:///home/avasta/Documents/TMPChain_MGP-20/marketplace/frontend/src/utils/onchain-transactions.js').then(mod => {
  console.log('✓ Module imported successfully');
}).catch(e => {
  console.error('Error importing module:', e.message);
});
