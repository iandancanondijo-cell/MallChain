const express = require('express');
const router = express.Router();
const governanceCtrl = require('../controllers/governanceController');
const { preventNoSQLInjection, sanitizeInputs, limitPayloadSize } = require('../middleware/inputValidation');

// Task 8.6: Apply input validation to governance routes to prevent NoSQL injection and XSS
// List proposals
router.get('/proposals', preventNoSQLInjection, governanceCtrl.listProposals);

// Get proposal details
router.get('/proposal/:id', preventNoSQLInjection, governanceCtrl.getProposal);

// Vote on proposal (broadcast signed tx)
router.post('/vote', 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  governanceCtrl.vote
);

router.post('/broadcast', 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  sanitizeInputs,
  governanceCtrl.broadcast
);

// User vote on a proposal
router.get('/proposal/:id/vote/:voter', 
  preventNoSQLInjection, 
  governanceCtrl.getUserVote
);

module.exports = router;
