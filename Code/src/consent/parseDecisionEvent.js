// src/consent/parseDecisionEvent.js
// Разбор сообщений из notifications:agent4_from_agent1 — канал согласия
// пользователя (пункт G, «Доработки для Агентов 1 и 3»). Зеркало
// inbox/parseEvent.js: никогда не бросает исключение, невалидное сообщение
// просто пропускается.

const REQUIRED_FIELDS = ['telegram_id', 'generated_content_id', 'decision_type', 'decision', 'timestamp'];
const VALID_DECISION_TYPES = ['quota_deletion', 'publish_moderation'];
const VALID_DECISIONS = ['approved', 'rejected'];

export function parseDecisionEvent(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (payload?.event !== 'decision_ready') {
    return null;
  }
  if (!REQUIRED_FIELDS.every((field) => payload[field] !== undefined)) {
    return null;
  }
  if (!VALID_DECISION_TYPES.includes(payload.decision_type)) {
    return null;
  }
  if (!VALID_DECISIONS.includes(payload.decision)) {
    return null;
  }

  return {
    queueId: payload.queue_id ?? null,
    telegramId: payload.telegram_id,
    generatedContentId: payload.generated_content_id,
    decisionType: payload.decision_type,
    decision: payload.decision,
    timestamp: payload.timestamp
  };
}
