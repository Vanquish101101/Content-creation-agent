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

export async function markError(db, id, message) {
  const { error } = await db
    .from('generated_content')
    .update({ status: 'error', metadata: { error: message } })
    .eq('id', id);
  if (error) {
    throw new Error(`markError: ${error.message}`);
  }
}
