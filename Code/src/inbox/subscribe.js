// src/inbox/subscribe.js
// Быстрый слой приёма: подписка на общий канал notifications:agent4, которым
// пользуются оба отправителя — Агент 1 (event: wizard_ready, главный триггер)
// и Агент 3 (event: digest_ready, опциональное обогащение трендами). См.
// «07. Архитектура (Бекенд).md», §4.1/§5.1.
//
// Best-effort по своей природе (pub/sub без сохранения) — надёжный catch-up
// слой на случай потерянных сообщений реализован отдельно, см.
// pollHandoffQueue.js.
import Redis from 'ioredis';
import { parseInboxEvent } from './parseEvent.js';

const CHANNEL = 'notifications:agent4';

export async function subscribeToInbox({ redisUrl, _redis, onWizardReady, onDigestReady } = {}) {
  const redis = _redis ?? new Redis(redisUrl);

  redis.on('message', (channel, message) => {
    if (channel !== CHANNEL) {
      return;
    }
    const event = parseInboxEvent(message);
    if (!event) {
      console.warn('[subscribe] ignoring malformed/unrecognized message on', CHANNEL);
      return;
    }
    if (event.type === 'wizard_ready') {
      onWizardReady(event);
    } else if (event.type === 'digest_ready') {
      onDigestReady(event);
    }
  });

  await redis.subscribe(CHANNEL);
  return redis;
}
