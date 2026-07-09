// src/dedup/processedWizardRequests.js
// Дедупликация wizard-запросов через content_creation_agent.processed_wizard_requests
// (UNIQUE(telegram_id, wizard_hash)) — не генерировать дважды один и тот же запрос.
// См. «07. Архитектура (Бекенд).md», §6.

const UNIQUE_VIOLATION = '23505';

export async function isWizardProcessed(db, telegramId, wizardHash) {
  const { data, error } = await db
    .from('processed_wizard_requests')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('wizard_hash', wizardHash)
    .single();

  if (error) {
    throw new Error(`isWizardProcessed: ${error.message}`);
  }

  return data != null;
}

export async function markWizardProcessed(db, telegramId, wizardHash) {
  const { error } = await db.from('processed_wizard_requests').insert({
    telegram_id: telegramId,
    wizard_hash: wizardHash
  });

  // Гонка: два параллельных прогона пометили один и тот же запрос почти
  // одновременно — не ошибка с точки зрения дедупликации, цель (запись
  // существует) уже достигнута.
  if (error && error.code !== UNIQUE_VIOLATION) {
    throw new Error(`markWizardProcessed: ${error.message}`);
  }
}
