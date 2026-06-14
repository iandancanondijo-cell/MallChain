const express = require('express');
const router = express.Router();
const notificationsCtrl = require('../controllers/notificationsController');
const auth = require('../middleware/auth');

// Get notifications for a user
router.get('/:address', notificationsCtrl.list);

// Mark notification as read
router.post('/read/:id', auth, notificationsCtrl.markRead);

module.exports = router;
