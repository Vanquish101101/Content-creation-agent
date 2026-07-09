// src/wizard/hash.js
// Детерминированный хеш wizard-полей — используется для дедупликации
// (content_creation_agent.processed_wizard_requests, UNIQUE(telegram_id, wizard_hash))
// и для сверки, что wizard не изменился между публикацией события и обработкой
// (см. «07. Архитектура (Бекенд).md», §4.3).

import { createHash } from 'node:crypto';

const FIELDS = ['network', 'content_type', 'format', 'style', 'description'];

export function computeWizardHash(wizard) {
  const ordered = FIELDS.map((key) => `${key}=${wizard[key] ?? ''}`).join('\n');
  return createHash('sha256').update(ordered).digest('hex');
}
