/**
 * Messaging/Chat routes — real Conversation/Message persistence + Socket.IO
 * room-based delivery (see index.js's `subscribe:conversation` handler).
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

async function requireParticipant(req, res, next) {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!conversation.participants.some((p) => String(p) === String(req.user._id))) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }
    req.conversation = conversation;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
}

/**
 * GET /api/messaging/conversations - List user's conversations
 */
router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .sort({ lastMessageAt: -1 })
      .populate('participants', 'username email')
      .lean();

    const result = await Promise.all(
      conversations.map(async (c) => {
        const other = c.participants.find((p) => String(p._id) !== String(req.user._id));
        const lastMessage = await Message.findOne({ conversationId: c._id }).sort({ createdAt: -1 }).lean();
        const unread = await Message.countDocuments({
          conversationId: c._id,
          senderId: { $ne: req.user._id },
          readBy: { $ne: req.user._id },
        });
        return {
          id: c._id,
          name: other?.username || other?.email || 'Unknown',
          unread,
          lastMessage: lastMessage ? { text: lastMessage.text, ts: lastMessage.createdAt, mine: String(lastMessage.senderId) === String(req.user._id) } : null,
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/messaging/conversations/:id - Get conversation messages
 */
router.get('/conversations/:id', auth, requireParticipant, async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.conversation._id })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    res.json({
      id: req.conversation._id,
      messages: messages.map((m) => ({
        id: m._id,
        from: String(m.senderId) === String(req.user._id) ? 'me' : 'them',
        text: m.text,
        ts: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * POST /api/messaging/conversations/:id/messages - Send message
 */
router.post('/conversations/:id/messages', auth, requireParticipant, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text required' });
    }

    const message = await Message.create({
      conversationId: req.conversation._id,
      senderId: req.user._id,
      text: text.trim(),
      readBy: [req.user._id],
    });

    req.conversation.lastMessageAt = new Date();
    await req.conversation.save();

    // Note: no "from" field here — the socket room broadcasts to every
    // subscriber including the sender's own open tab, so "them" would be
    // wrong for the sender. Clients derive from/me by comparing senderId.
    const payload = { id: message._id, conversationId: req.conversation._id, senderId: req.user._id, text: message.text, ts: message.createdAt };
    if (global.io) {
      global.io.to(`conversation:${req.conversation._id}`).emit('message:new', payload);
    }

    res.json({ success: true, message: { id: message._id, from: 'me', text: message.text, ts: message.createdAt } });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/messaging/conversations - Start (or return existing) conversation
 */
router.post('/conversations', auth, async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail required' });
    }

    const recipient = await User.findOne({ email: recipientEmail });
    if (!recipient) {
      return res.status(404).json({ error: 'No user found with that email' });
    }
    if (String(recipient._id) === String(req.user._id)) {
      return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, recipient._id], $size: 2 },
    });
    if (!conversation) {
      conversation = await Conversation.create({ participants: [req.user._id, recipient._id] });
    }

    res.json({ success: true, conversation: { id: conversation._id, name: recipient.username || recipient.email, unread: 0 } });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * PUT /api/messaging/conversations/:id/read - Mark conversation as read
 */
router.put('/conversations/:id/read', auth, requireParticipant, async (req, res) => {
  try {
    await Message.updateMany(
      { conversationId: req.conversation._id, senderId: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
      { $push: { readBy: req.user._id } }
    );
    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;
