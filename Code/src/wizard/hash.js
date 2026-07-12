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
//
// project + networks (2026-07-12, мультивыбор соцсетей + выбор PostMyPost-
// проекта) заменили одиночный network — networks это МАССИВ, и порядок
// выбора пользователем (клики по кнопкам) не должен влиять на хеш, поэтому
// сериализуется через сортировку, а не .toString(). Если это когда-нибудь
// сломается на одной из двух сторон — история с network→networks уже была
// такой (см. «Доработки для агентов»): раньше формат уже расходился между
// Агентом 1 и Агентом 4, найдено и исправлено 2026-07-10.
const FIELDS = ['project', 'networks', 'content_type', 'format', 'style', 'description', 'use_trends'];

function serializeField(value) {
  if (Array.isArray(value)) {
    return [...value].sort().join(',');
  }
  return value ?? '';
}

export function computeWizardHash(wizard) {
  const ordered = FIELDS.map((key) => `${key}=${serializeField(wizard[key])}`).join('\n');
  return createHash('sha256').update(ordered).digest('hex');
}
