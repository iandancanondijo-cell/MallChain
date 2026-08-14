const express = require('express');
const router = express.Router();
const notificationsCtrl = require('../controllers/notificationsController');
const auth = require('../middleware/auth');

// Get the authenticated user's notifications
router.get('/me', auth, notificationsCtrl.list);

// Mark notification as read
router.post('/read/:id', auth, notificationsCtrl.markRead);

// Mark all notifications as read
router.post('/read-all', auth, notificationsCtrl.markAllRead);

module.exports = router;
