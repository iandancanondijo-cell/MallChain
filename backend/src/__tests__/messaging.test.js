const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({ findOne: jest.fn() }));
jest.mock('../models/Conversation', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../models/Message', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'me1' };
    next();
  })
);

const User = require('../models/user');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const messagingRoutes = require('../routes/messaging');

describe('messaging routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/messaging', messagingRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete global.io;
  });

  test('POST /conversations creates a new conversation when none exists', async () => {
    User.findOne.mockResolvedValue({ _id: 'them1', email: 'them@x.com', username: 'them' });
    Conversation.findOne.mockResolvedValue(null);
    Conversation.create.mockResolvedValue({ _id: 'conv1' });

    const res = await request(app).post('/api/messaging/conversations').send({ recipientEmail: 'them@x.com' });

    expect(res.status).toBe(200);
    expect(Conversation.create).toHaveBeenCalledWith({ participants: ['me1', 'them1'] });
    expect(res.body.conversation).toMatchObject({ id: 'conv1', name: 'them' });
  });

  test('POST /conversations returns the existing conversation instead of duplicating it', async () => {
    User.findOne.mockResolvedValue({ _id: 'them1', email: 'them@x.com', username: 'them' });
    Conversation.findOne.mockResolvedValue({ _id: 'existing1' });

    const res = await request(app).post('/api/messaging/conversations').send({ recipientEmail: 'them@x.com' });

    expect(res.status).toBe(200);
    expect(Conversation.create).not.toHaveBeenCalled();
    expect(res.body.conversation.id).toBe('existing1');
  });

  test('POST /conversations 404s for an unknown recipient email', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/messaging/conversations').send({ recipientEmail: 'nobody@x.com' });

    expect(res.status).toBe(404);
  });

  test('POST /conversations/:id/messages rejects a sender who is not a participant', async () => {
    Conversation.findById.mockResolvedValue({ _id: 'conv1', participants: ['someoneElse', 'them1'] });

    const res = await request(app).post('/api/messaging/conversations/conv1/messages').send({ text: 'hi' });

    expect(res.status).toBe(403);
    expect(Message.create).not.toHaveBeenCalled();
  });

  test('POST /conversations/:id/messages persists the message and pushes it to the conversation room', async () => {
    const conversation = { _id: 'conv1', participants: ['me1', 'them1'], save: jest.fn().mockResolvedValue(undefined) };
    Conversation.findById.mockResolvedValue(conversation);
    Message.create.mockResolvedValue({ _id: 'msg1', text: 'hi', createdAt: new Date() });
    const emit = jest.fn();
    global.io = { to: jest.fn(() => ({ emit })) };

    const res = await request(app).post('/api/messaging/conversations/conv1/messages').send({ text: 'hi' });

    expect(res.status).toBe(200);
    expect(Message.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv1', senderId: 'me1', text: 'hi' }));
    expect(conversation.save).toHaveBeenCalled();
    expect(global.io.to).toHaveBeenCalledWith('conversation:conv1');
    expect(emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ senderId: 'me1', text: 'hi' }));
    // the push payload must not hardcode from:'them' — see the comment in messaging.js
    expect(emit.mock.calls[0][1]).not.toHaveProperty('from');
  });

  test('POST /conversations/:id/messages rejects empty text', async () => {
    Conversation.findById.mockResolvedValue({ _id: 'conv1', participants: ['me1', 'them1'] });

    const res = await request(app).post('/api/messaging/conversations/conv1/messages').send({ text: '   ' });

    expect(res.status).toBe(400);
  });

  test('GET /conversations returns unread counts and last message per conversation', async () => {
    Conversation.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'conv1', participants: [{ _id: 'me1' }, { _id: 'them1', username: 'them' }] },
      ]),
    });
    Message.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue({ text: 'hi', createdAt: new Date(), senderId: 'them1' }) });
    Message.countDocuments.mockResolvedValue(2);

    const res = await request(app).get('/api/messaging/conversations');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 'conv1', name: 'them', unread: 2 });
  });

  test('PUT /conversations/:id/read marks only the counterpart\'s messages as read', async () => {
    Conversation.findById.mockResolvedValue({ _id: 'conv1', participants: ['me1', 'them1'] });
    Message.updateMany.mockResolvedValue({});

    const res = await request(app).put('/api/messaging/conversations/conv1/read');

    expect(res.status).toBe(200);
    expect(Message.updateMany).toHaveBeenCalledWith(
      { conversationId: 'conv1', senderId: { $ne: 'me1' }, readBy: { $ne: 'me1' } },
      { $push: { readBy: 'me1' } }
    );
  });
});
