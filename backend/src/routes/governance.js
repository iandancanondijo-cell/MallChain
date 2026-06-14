const express = require('express');
const router = express.Router();
const governanceCtrl = require('../controllers/governanceController');

// List proposals
router.get('/proposals', governanceCtrl.listProposals);

// Get proposal details
router.get('/proposal/:id', governanceCtrl.getProposal);

// Vote on proposal (broadcast signed tx)
router.post('/vote', governanceCtrl.vote);
router.post('/broadcast', governanceCtrl.broadcast);

// User vote on a proposal
router.get('/proposal/:id/vote/:voter', governanceCtrl.getUserVote);

module.exports = router;
