// src/ingestion/agent1Reader.js
// Читает intelligence_agent.users.settings — wizard-результат пользователя,
// сохранённый Агентом 1 (см. «07. Архитектура (Бекенд).md», §4.3).
//
// users живёт в схеме intelligence_agent (Агент 1), а не в схеме этого проекта
// (content_creation_agent) — без .schema() supabase-js резолвит .from() против
// дефолтной схемы клиента и падает с PGRST205 "table not found" (тот же класс
// бага, что уже дважды случался у Агента 3 при чтении чужих схем — см. «01.
// Идея.md»).
import { isNotFoundError } from '../db/errors.js';

export async function fetchWizardSettings(db, telegramId) {
  const { data, error } = await db
    .schema('intelligence_agent')
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new Error(`fetchWizardSettings: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    mode: data.settings?.mode ?? null,
    wizard: data.settings?.wizard ?? null,
    moderation_mode: data.settings?.moderation_mode ?? false
  };
}
