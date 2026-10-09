const express = require('express');
const router = express.Router();
const notificationsCtrl = require('../controllers/notificationsController');
const auth = require('../middleware/auth');
const { limiters } = require('../middleware/rateLimiter');

// Get the authenticated user's notifications
router.get('/me', auth, notificationsCtrl.list);

// Which channel/provider is active and configured (secret-free).
router.get('/providers', auth, notificationsCtrl.providers);

// Mark notification as read
router.post('/read/:id', auth, notificationsCtrl.markRead);

// Mark all notifications as read
router.post('/read-all', auth, notificationsCtrl.markAllRead);

// Send a one-off test notification to the caller across their available
// channels. Strictly rate-limited — each send can incur provider cost.
router.post('/test', auth, limiters.strict, notificationsCtrl.test);

module.exports = router;
