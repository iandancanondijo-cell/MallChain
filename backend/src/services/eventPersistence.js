/**
 * Event Persistence Service
 * Ensures real-time events are not lost if WebSocket connections drop
 * 
 * Architecture:
 * - Redis Streams for event durability
 * - Consumer groups for processing
 * - Automatic replay on reconnection
 * - Backpressure handling
 */

const redis = require('ioredis');
const logger = require('../utils/logger');
const promClient = require('prom-client');

const STREAM_NAME = process.env.EVENT_STREAM_NAME || 'mallchain:events';
const CONSUMER_GROUP = process.env.EVENT_CONSUMER_GROUP || 'mallchain:backend';
const MAX_BATCH_SIZE = Number(process.env.EVENT_BATCH_SIZE || 100);
const STREAM_TRIM_MS = Number(process.env.EVENT_STREAM_TRIM_MS || 3600000); // 1 hour

// Metrics
const eventsPublishedCounter = new promClient.Counter({
  name: 'events_published_total',
  help: 'Total events published to stream',
  labelNames: ['event_type'],
});

const eventsProcessedCounter = new promClient.Counter({
  name: 'events_processed_total',
  help: 'Total events processed from stream',
  labelNames: ['event_type', 'status'],
});

const eventLagGauge = new promClient.Gauge({
  name: 'event_stream_lag',
  help: 'Number of unprocessed events in consumer group',
});

const eventReplayCounter = new promClient.Counter({
  name: 'event_replays_total',
  help: 'Total events replayed on reconnection',
  labelNames: ['reason'],
});

class EventPersistence {
  constructor(redisClient = null) {
    this.redis = redisClient || new redis(process.env.REDIS_URL || {});
    this.subscribers = new Map(); // Map of eventType -> [callback, ...]
    this.isProcessing = false;
    this.lastProcessedId = '0'; // Track position in stream
  }

  /**
   * Initialize consumer group and begin processing
   */
  async initialize() {
    try {
      // Create consumer group if it doesn't exist
      try {
        await this.redis.xgroupCreate(STREAM_NAME, CONSUMER_GROUP, '0', 'MKSTREAM');
        logger.info('events', 'Created Redis Stream consumer group', {
          stream: STREAM_NAME,
          group: CONSUMER_GROUP,
        });
      } catch (err) {
        if (!err.message.includes('BUSYGROUP')) {
          throw err;
        }
        // Group already exists
      }

      // Start processing
      await this.startProcessing();
      logger.info('events', 'Event persistence initialized');
    } catch (err) {
      logger.error('events', 'Failed to initialize event persistence', err);
      throw err;
    }
  }

  /**
   * Publish event to stream
   */
  async publish(eventType, data, metadata = {}) {
    try {
      const eventId = await this.redis.xadd(
        STREAM_NAME,
        '*', // Auto-generate ID
        'type', eventType,
        'data', JSON.stringify(data),
        'timestamp', Date.now(),
        'metadata', JSON.stringify(metadata),
      );

      eventsPublishedCounter.inc({ event_type: eventType });

      logger.debug('events', 'Event published', {
        eventType,
        eventId,
        dataSize: JSON.stringify(data).length,
      });

      return eventId;
    } catch (err) {
      logger.error('events', 'Failed to publish event', err, {
        eventType,
      });
      throw err;
    }
  }

  /**
   * Subscribe to event type
   */
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(callback);

    logger.debug('events', 'Subscribed to event type', { eventType });

    return () => {
      const subscribers = this.subscribers.get(eventType);
      const index = subscribers.indexOf(callback);
      if (index >= 0) {
        subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Process stream events
   */
  async startProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    logger.info('events', 'Starting event stream processing');

    while (this.isProcessing) {
      try {
        // Read from consumer group
        // Use > to only get new messages, or a specific ID to replay
        const messages = await this.redis.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          'consumer-' + process.pid,
          'COUNT',
          MAX_BATCH_SIZE,
          'BLOCK',
          '5000', // 5 second timeout
          'STREAMS',
          STREAM_NAME,
          '>', // Only new messages
        );

        if (messages && messages.length > 0) {
          const [streamName, streamMessages] = messages[0];

          for (const [messageId, fields] of streamMessages) {
            await this.processMessage(messageId, fields);
          }

          // Update lag metric
          await this.updateLag();
        }
      } catch (err) {
        logger.error('events', 'Error processing event stream', err);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Process individual message
   */
  async processMessage(messageId, fields) {
    try {
      const eventType = fields[fields.indexOf('type') + 1];
      const data = JSON.parse(fields[fields.indexOf('data') + 1]);

      // Call all subscribers
      const callbacks = this.subscribers.get(eventType) || [];
      const promises = callbacks.map(callback =>
        Promise.resolve()
          .then(() => callback(data))
          .catch(err => {
            logger.error('events', 'Subscriber error', err, {
              eventType,
              subscriber: callback.name || 'anonymous',
            });
          }),
      );

      await Promise.all(promises);

      // Acknowledge message
      await this.redis.xack(STREAM_NAME, CONSUMER_GROUP, messageId);

      eventsProcessedCounter.inc({ event_type: eventType, status: 'success' });

      logger.debug('events', 'Event processed', {
        eventType,
        messageId,
        subscribers: callbacks.length,
      });
    } catch (err) {
      logger.error('events', 'Failed to process event message', err, {
        messageId,
      });

      eventsProcessedCounter.inc({ event_type: 'unknown', status: 'error' });

      // Acknowledge anyway to avoid stuck messages
      await this.redis.xack(STREAM_NAME, CONSUMER_GROUP, messageId);
    }
  }

  /**
   * Get pending messages (for reconnected clients)
   */
  async getPendingMessages(eventType = null) {
    try {
      // Get consumer group info
      const info = await this.redis.xpending(STREAM_NAME, CONSUMER_GROUP);

      const pending = [];
      if (info && info[0] > 0) {
        // Get actual pending messages
        const messages = await this.redis.xclaim(
          STREAM_NAME,
          CONSUMER_GROUP,
          'consumer-' + process.pid,
          0, // Claim with 0 timeout (immediate)
          ...info, // All pending message IDs
        );

        for (const message of messages) {
          const [messageId, fields] = message;
          const type = fields[fields.indexOf('type') + 1];

          if (!eventType || type === eventType) {
            pending.push({
              id: messageId,
              type,
              data: JSON.parse(fields[fields.indexOf('data') + 1]),
            });
          }
        }
      }

      return pending;
    } catch (err) {
      logger.error('events', 'Failed to get pending messages', err);
      return [];
    }
  }

  /**
   * Replay missed events
   */
  async replayMissedEvents(clientId, since = null) {
    try {
      const startId = since ? since : '0';
      const messages = await this.redis.xrange(STREAM_NAME, startId, '+', 'COUNT', 100);

      const events = [];
      for (const [messageId, fields] of messages) {
        const eventType = fields[fields.indexOf('type') + 1];
        const data = JSON.parse(fields[fields.indexOf('data') + 1]);

        events.push({
          id: messageId,
          type: eventType,
          data,
          timestamp: fields[fields.indexOf('timestamp') + 1],
        });
      }

      eventReplayCounter.inc({ reason: 'client_reconnect' });

      logger.info('events', 'Replaying missed events', {
        clientId,
        count: events.length,
        since: startId,
      });

      return events;
    } catch (err) {
      logger.error('events', 'Failed to replay missed events', err);
      return [];
    }
  }

  /**
   * Update consumer lag metric
   */
  async updateLag() {
    try {
      const info = await this.redis.xinfo('GROUPS', STREAM_NAME);
      if (info && info.length > 0) {
        const groupInfo = info[0];
        const pendingIndex = groupInfo.indexOf('pending');
        const pending = pendingIndex >= 0 ? groupInfo[pendingIndex + 1] : 0;

        eventLagGauge.set(pending);
      }
    } catch (err) {
      logger.debug('events', 'Failed to update lag metric', { error: err.message });
    }
  }

  /**
   * Trim stream to keep only recent events
   */
  async trimStream() {
    try {
      const now = Date.now();
      const cutoff = now - STREAM_TRIM_MS;

      // Get stream length before trim
      const lengthBefore = await this.redis.xlen(STREAM_NAME);

      // Trim events older than cutoff
      await this.redis.xtrim(STREAM_NAME, 'MINID', Math.floor(cutoff));

      const lengthAfter = await this.redis.xlen(STREAM_NAME);

      logger.debug('events', 'Event stream trimmed', {
        before: lengthBefore,
        after: lengthAfter,
        removed: lengthBefore - lengthAfter,
        keepMs: STREAM_TRIM_MS,
      });
    } catch (err) {
      logger.error('events', 'Failed to trim event stream', err);
    }
  }

  /**
   * Stop processing
   */
  async stop() {
    this.isProcessing = false;
    logger.info('events', 'Event processing stopped');
  }

  /**
   * Get stream statistics
   */
  async getStats() {
    try {
      const length = await this.redis.xlen(STREAM_NAME);
      const info = await this.redis.xinfo('STREAM', STREAM_NAME);
      const groups = await this.redis.xinfo('GROUPS', STREAM_NAME);

      return {
        streamName: STREAM_NAME,
        length,
        groups: groups?.map(g => ({
          name: g[1],
          consumers: g[3],
          pending: g[5],
        })),
        info: {
          firstEntry: info?.find((_, i) => info[i - 1] === 'first-entry')?.[0],
          lastEntry: info?.find((_, i) => info[i - 1] === 'last-entry')?.[0],
        },
      };
    } catch (err) {
      logger.error('events', 'Failed to get stream stats', err);
      return null;
    }
  }
}

// Singleton instance
let eventPersistence = null;

function getInstance(redisClient = null) {
  if (!eventPersistence) {
    eventPersistence = new EventPersistence(redisClient);
  }
  return eventPersistence;
}

// Periodic stream trimming
setInterval(async () => {
  if (eventPersistence) {
    await eventPersistence.trimStream();
  }
}, 60000); // Every minute

module.exports = {
  EventPersistence,
  getInstance,
  eventsPublishedCounter,
  eventsProcessedCounter,
  eventLagGauge,
  eventReplayCounter,
};
