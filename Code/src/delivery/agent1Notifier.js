// src/delivery/agent1Notifier.js
// Push-уведомление Агенту 1 о готовом отчёте (Слайс 8/9/квота — общий обратный канал).
// Зеркало src/inbox/... (приём от Агента 1/3) и agent4Handoff.js Агента 3 (та же пара
// слоёв: надёжный Supabase-insert с ретраями + быстрый Redis pub/sub, best-effort).
// Independent от notifications:agent1, которым уже пользуется Агент 2 — свой канал,
// свой формат payload, не зависит от семантики чужого кода.
// message_type различает разные поводы обратиться к Агенту 1 (content_ready — Слайс 9,
// quota_warning — квота R2, в будущем возможны другие) через один и тот же канал/таблицу.

import Redis from 'ioredis';

const AGENT1_CHANNEL = 'notifications:agent1_from_agent4';
const RETRY_DELAYS_MS = [500, 2000, 8000];

async function withRetry(fn, delays) {
  let lastErr;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < delays.length) {
        await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
  }
  throw lastErr;
}

export function createAgent1Notifier({ db, redisUrl, _redis, _retryDelaysMs = RETRY_DELAYS_MS } = {}) {
  const redis = _redis ?? (redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 0, connectTimeout: 3000 }) : null);

  return async function notifyAgent1({ telegramId, messageType, payload, generatedContentId = null }) {
    // Надёжный слой: Supabase insert с ретраями/бэкоффом
    try {
      await withRetry(async () => {
        const { error } = await db.from('agent1_delivery_queue').insert({
          telegram_id: telegramId,
          message_type: messageType,
          generated_content_id: generatedContentId,
          payload,
          attempt_count: 0,
          status: 'pending'
        });
        if (error) throw new Error(error.message);
      }, _retryDelaysMs);
    } catch (err) {
      console.error('[agent1Notifier] Supabase insert failed after retries:', err.message);
    }

    // Быстрый слой: Redis pub/sub (best-effort, некритичная ошибка)
    if (redis) {
      try {
        await redis.publish(AGENT1_CHANNEL, JSON.stringify({
          event: 'delivery_ready',
          telegram_id: telegramId,
          message_type: messageType,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('[agent1Notifier] Redis publish failed:', err.message);
      }
    }
  };
}
