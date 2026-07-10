// src/quota/deleteContent.js
// Удаление старого контента при превышении квоты хранилища — ТОЛЬКО с согласия
// пользователя. Эта функция сама решения не принимает и НИКЕМ пока не
// вызывается автоматически: канал, по которому согласие/отказ пользователя
// вернётся от Агента 1 обратно к Агенту 4, ещё не спроектирован (см.
// «Доработки для Агентов 1 и 3 (передать).md», пункт E). Готова к вызову,
// когда этот канал появится.

export async function deleteGeneratedContent(db, r2, id) {
  const { data, error } = await db.from('generated_content').select('r2_url').eq('id', id).single();
  if (error) {
    throw new Error(`deleteGeneratedContent: ${error.message}`);
  }

  if (data.r2_url) {
    await r2.deleteFile(data.r2_url);
  }

  const { error: updateError } = await db.from('generated_content').update({ status: 'deleted' }).eq('id', id);
  if (updateError) {
    throw new Error(`deleteGeneratedContent: ${updateError.message}`);
  }
}
