// src/inbox/parseEvent.js
// Разбор сообщений из Redis-канала notifications:agent4 — общего для двух
// отправителей: Агент 1 (event: 'wizard_ready', главный триггер работы) и
// Агент 3 (event: 'digest_ready', опциональное обогащение трендами).
// См. «07. Архитектура (Бекенд).md», §4.1 и §5.1.
//
// Намеренно никогда не бросает исключение — недоверенный внешний ввод
// (Redis pub/sub) не должен ронять подписчика; невалидное сообщение просто
// пропускается (вызывающий код логирует и продолжает слушать).

const REQUIRED_FIELDS = {
  wizard_ready: ['telegram_id', 'wizard_hash', 'mode', 'timestamp'],
  digest_ready: ['run_id', 'timestamp']
};

export function parseInboxEvent(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  const requiredFields = REQUIRED_FIELDS[payload?.event];
  if (!requiredFields) {
    return null;
  }

  const hasAllFields = requiredFields.every((field) => payload[field] !== undefined);
  if (!hasAllFields) {
    return null;
  }

  const parsed = { type: payload.event };
  for (const field of requiredFields) {
    parsed[field] = payload[field];
  }
  return parsed;
}
