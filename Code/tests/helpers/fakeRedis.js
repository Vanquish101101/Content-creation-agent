// tests/helpers/fakeRedis.js
//
// Minimal fake for the subset of the ioredis API this project uses on the
// consumer side: `subscribe(channel)` + `on('message', (channel, message) => {})`.
// Records subscribed channels in `redis.subscribedChannels` and published
// messages in `redis.published` (for symmetry with the producer side, e.g.
// a future Agent4->Agent1 notifier mirroring Agent 3's agent4Handoff.js).
// `_emitMessage(channel, message)` lets a test simulate an incoming pub/sub
// message without a real Redis connection.
export function makeFakeRedis() {
  const messageHandlers = [];
  const redis = {
    subscribedChannels: [],
    published: [],
    async subscribe(channel) {
      redis.subscribedChannels.push(channel);
    },
    on(event, handler) {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
      return redis;
    },
    async publish(channel, message) {
      redis.published.push({ channel, message });
    },
    _emitMessage(channel, message) {
      for (const handler of messageHandlers) {
        handler(channel, message);
      }
    }
  };
  return redis;
}
