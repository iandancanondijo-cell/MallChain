const Notification = require('../models/Notification');

/**
 * Persist a notification for a user and push it live over Socket.IO if a
 * client is subscribed to that user's room (see index.js `subscribe:user`
 * handler — mirrors the existing `wallet:*` room pattern used by
 * blockchainListener.js's `global.io.emit('tx:update', ...)`).
 *
 * Failures are logged, never thrown — a notification is a side effect of a
 * real action (submission resolved, ban applied, etc.) and must never block
 * or fail that action.
 */
async function notify(userId, { kind = 'system', title, body = '' } = {}) {
  if (!userId || !title) return null;
  try {
    const doc = await Notification.create({ userId, kind, title, body });
    if (global.io) {
      global.io.to(`user:${userId}`).emit('notification', {
        _id: doc._id,
        kind: doc.kind,
        title: doc.title,
        body: doc.body,
        read: doc.read,
        createdAt: doc.createdAt,
      });
    }
    return doc;
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('notify', 'Failed to create notification', err, { userId, kind, title });
    return null;
  }
}

module.exports = { notify };
