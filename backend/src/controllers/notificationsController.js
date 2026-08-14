const Notification = require('../models/Notification');

// GET /api/notifications/me — list the authenticated user's notifications.
exports.list = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/notifications/read/:id — mark one notification as read.
exports.markRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'notification not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/notifications/read-all — mark every notification as read.
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
