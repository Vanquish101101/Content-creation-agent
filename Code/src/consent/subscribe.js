// src/consent/subscribe.js
// Быстрый слой приёма решения пользователя (пункт G) — канал
// notifications:agent4_from_agent1, симметричный уже существующему
// notifications:agent1_from_agent4 (см. delivery/agent1Notifier.js).
// Best-effort по своей природе — надёжный catch-up слой см. poller.js.
import Redis from 'ioredis';
import { parseDecisionEvent } from './parseDecisionEvent.js';

const CHANNEL = 'notifications:agent4_from_agent1';

export async function subscribeToConsent({ redisUrl, _redis, onDecision } = {}) {
  const redis = _redis ?? new Redis(redisUrl);

  redis.on('message', (channel, message) => {
    if (channel !== CHANNEL) {
      return;
    }
    const event = parseDecisionEvent(message);
    if (!event) {
      console.warn('[consent/subscribe] ignoring malformed/unrecognized message on', CHANNEL);
      return;
    }
    onDecision(event);
  });

  await redis.subscribe(CHANNEL);
  return redis;
}
