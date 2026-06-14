// Simple in-memory notifications for demo; replace with DB in production
const notifications = {};

exports.list = async (req, res) => {
  const { address } = req.params;
  res.json({ notifications: notifications[address] || [] });
};

exports.markRead = async (req, res) => {
  const { id } = req.params;
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });
  if (!notifications[address]) return res.json({ ok: true });
  notifications[address] = notifications[address].filter(n => n.id !== id);
  res.json({ ok: true });
};
