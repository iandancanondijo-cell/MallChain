/**
 * Real-time notification system
 * Broadcasts notifications to connected clients
 */

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.subscribers = new Map();
    this.maxHistory = 1000;
  }

  /**
   * Send a notification to all users
   */
  broadcastNotification(data) {
    const notification = {
      id: this.generateId(),
      ...data,
      timestamp: Date.now()
    };

    this.notifications.unshift(notification);

    if (this.notifications.length > this.maxHistory) {
      this.notifications.pop();
    }

    if (global.io) {
      global.io.emit('notification', notification);
    }

    return notification;
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId, data) {
    const notification = {
      id: this.generateId(),
      userId,
      ...data,
      timestamp: Date.now()
    };

    if (global.io) {
      global.io.to(userId).emit('notification', notification);
    }

    return notification;
  }

  /**
   * Success notification
   */
  success(title, message, metadata = {}) {
    return this.broadcastNotification({
      type: 'success',
      title,
      message,
      metadata
    });
  }

  /**
   * Error notification
   */
  error(title, message, metadata = {}) {
    return this.broadcastNotification({
      type: 'error',
      title,
      message,
      metadata
    });
  }

  /**
   * Warning notification
   */
  warning(title, message, metadata = {}) {
    return this.broadcastNotification({
      type: 'warning',
      title,
      message,
      metadata
    });
  }

  /**
   * Info notification
   */
  info(title, message, metadata = {}) {
    return this.broadcastNotification({
      type: 'info',
      title,
      message,
      metadata
    });
  }

  /**
   * Transaction confirmation
   */
  txConfirmed(txHash, amount, address, metadata = {}) {
    return this.success(
      'Transaction Confirmed',
      `${amount} transferred to ${address.slice(0, 12)}...`,
      { txHash, amount, address, ...metadata }
    );
  }

  /**
   * Transaction failed
   */
  txFailed(txHash, error, metadata = {}) {
    return this.error(
      'Transaction Failed',
      error || 'An error occurred while processing your transaction',
      { txHash, ...metadata }
    );
  }

  /**
   * Block produced
   */
  blockProduced(height, txCount) {
    return this.info(
      'New Block',
      `Block #${height} with ${txCount} transactions`,
      { height, txCount }
    );
  }

  /**
   * Get recent notifications
   */
  getRecentNotifications(limit = 50) {
    return this.notifications.slice(0, limit);
  }

  /**
   * Get notifications for user
   */
  getNotificationsForUser(userId, limit = 50) {
    return this.notifications
      .filter(n => !n.userId || n.userId === userId)
      .slice(0, limit);
  }

  /**
   * Generate unique notification ID
   */
  generateId() {
    return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear old notifications
   */
  clearOldNotifications(olderThanMs = 1000 * 60 * 60) { // Default 1 hour
    const cutoff = Date.now() - olderThanMs;
    this.notifications = this.notifications.filter(n => n.timestamp > cutoff);
  }
}

const notificationManager = new NotificationManager();

module.exports = {
  notificationManager,
  NotificationManager
};
