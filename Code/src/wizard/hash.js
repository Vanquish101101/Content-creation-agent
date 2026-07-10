// src/wizard/hash.js
// Детерминированный хеш wizard-полей — используется для дедупликации
// (content_creation_agent.processed_wizard_requests, UNIQUE(telegram_id, wizard_hash))
// и для сверки, что wizard не изменился между публикацией события и обработкой
// (см. «07. Архитектура (Бекенд).md», §4.3).

import { createHash } from 'node:crypto';

// use_trends добавлен 2026-07-10 (явный вопрос в wizard'е, заменивший
// эвристику по ключевым словам, см. enrichWithTrends.js) — обязательно
// входит в хеш: одно и то же описание с разным выбором "на основе
// трендов"/"просто по описанию" — это разные запросы, дедуп не должен их
// путать. Порядок и формат полей — точное зеркало Intelligence agent/Code/
// src/handoff/agent4Handoff.js::wizardHash(), иначе wizard_hash никогда не
// совпадает между отправителем и получателем (см. «Доработки для агентов»).
const FIELDS = ['network', 'content_type', 'format', 'style', 'description', 'use_trends'];

export function computeWizardHash(wizard) {
  const ordered = FIELDS.map((key) => `${key}=${wizard[key] ?? ''}`).join('\n');
  return createHash('sha256').update(ordered).digest('hex');
}
