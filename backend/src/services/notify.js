/**
 * Backward-compatible notification entry point.
 *
 * Re-exports from the unified notificationEngine so all existing callers
 * (adminPanel, taskAssignment, badge, badgeSnapshot, etc.) continue to
 * work without modification.
 *
 * New code should prefer: const { dispatchEvent } = require('./notificationEngine');
 */
const { notify, notifyUser } = require('./notificationEngine');

module.exports = { notify, notifyUser };
