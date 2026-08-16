const express = require('express');
const router = express.Router();
const governanceCtrl = require('../controllers/governanceController');
const { preventNoSQLInjection, limitPayloadSize } = require('../middleware/inputValidation');

// Task 8.6: Apply input validation to governance routes to prevent NoSQL injection and XSS
// List proposals
router.get('/proposals', preventNoSQLInjection, governanceCtrl.listProposals);

// Get proposal details
router.get('/proposal/:id', preventNoSQLInjection, governanceCtrl.getProposal);

// Vote on proposal (broadcast signed tx)
router.post('/vote', 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  governanceCtrl.vote
);

router.post('/broadcast', 
  limitPayloadSize(0.5),
  preventNoSQLInjection,
  governanceCtrl.broadcast
);

// User vote on a proposal
router.get('/proposal/:id/vote/:voter',
  preventNoSQLInjection,
  governanceCtrl.getUserVote
);

// Minimum deposit needed to submit/activate a proposal
router.get('/deposit-params', preventNoSQLInjection, governanceCtrl.getDepositParams);

// Real x/staking bonded delegation for an address — this, not the off-chain
// MLCNS staking pool, is what determines real governance vote weight.
router.get('/voting-power/:address', preventNoSQLInjection, governanceCtrl.getVotingPower);

module.exports = router;
