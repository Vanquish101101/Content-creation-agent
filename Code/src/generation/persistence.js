// src/generation/persistence.js
// Запись результата генерации в content_creation_agent.generated_content —
// см. «07. Архитектура (Бекенд).md», §6. Статус проходит pending → processing
// → done|error.
export async function createPendingRecord(db, { telegramId, wizardHash, type }) {
  const { data, error } = await db
    .from('generated_content')
    .insert({
      telegram_id: telegramId,
      wizard_hash: wizardHash,
      type,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`createPendingRecord: ${error.message}`);
  }
  return data.id;
}

export async function markProcessing(db, id) {
  const { error } = await db.from('generated_content').update({ status: 'processing' }).eq('id', id);
  if (error) {
    throw new Error(`markProcessing: ${error.message}`);
  }
}

export async function markDone(db, id, { costUsd, metadata, r2Url = null, sizeBytes = null }) {
  const { error } = await db
    .from('generated_content')
    .update({ status: 'done', cost_usd: costUsd, metadata, r2_url: r2Url, size_bytes: sizeBytes })
    .eq('id', id);
  if (error) {
    throw new Error(`markDone: ${error.message}`);
  }
}

// Слайс 8 (публикация) — status: 'published' если хотя бы один аккаунт из
// отчёта опубликован успешно (частичный успех всё равно считается
// published — пользователь видит по publish_report, где именно не вышло),
// иначе 'publish_failed'.
export async function markPublishResult(db, id, publishReport) {
  const status = publishReport.some((r) => r.status === 'success') ? 'published' : 'publish_failed';
  const { error } = await db
    .from('generated_content')
    .update({ status, publish_report: publishReport })
    .eq('id', id);
  if (error) {
    throw new Error(`markPublishResult: ${error.message}`);
  }
}

// Слайс 8 — moderation_mode === true: публикация приостановлена, ждёт
// подтверждения пользователя через Агента 1 (запрос уходит через
// notifyAgent1, message_type 'moderation_request', см. generate.js).
// Возобновление после ответа пользователя блокировано отсутствующим каналом
// согласия от Агента 1, см. «Доработки для Агентов 1 и 3», пункт E.
export async function markPendingModeration(db, id) {
  const { error } = await db.from('generated_content').update({ status: 'pending_moderation' }).eq('id', id);
  if (error) {
    throw new Error(`markPendingModeration: ${error.message}`);
  }
}

export async function markError(db, id, message) {
  const { error } = await db
    .from('generated_content')
    .update({ status: 'error', metadata: { error: message } })
    .eq('id', id);
  if (error) {
    throw new Error(`markError: ${error.message}`);
  }
}
