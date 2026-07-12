// src/quota/deleteContent.js
// Удаление старого контента при превышении квоты хранилища — ТОЛЬКО с согласия
// пользователя. Эта функция сама решения не принимает и НИКЕМ пока не
// вызывается автоматически: канал, по которому согласие/отказ пользователя
// вернётся от Агента 1 обратно к Агенту 4, ещё не спроектирован (см.
// «Доработки для Агентов 1 и 3 (передать).md», пункт E). Готова к вызову,
// когда этот канал появится.

export async function deleteGeneratedContent(db, r2, id) {
  const { data, error } = await db.from('generated_content').select('r2_url, metadata').eq('id', id).single();
  if (error) {
    throw new Error(`deleteGeneratedContent: ${error.message}`);
  }

  // Карусель (2026-07-11) хранит несколько файлов в metadata.files — удалять
  // нужно все, иначе файлы кроме первого навсегда остаются в R2 мусором.
  // Записи, созданные до этой доработки (или любой другой тип с одним
  // файлом), не имеют metadata.files — тогда единственный файл берётся из
  // r2_url, как и раньше.
  const files = data.metadata?.files?.length ? data.metadata.files : (data.r2_url ? [{ r2Url: data.r2_url }] : []);
  for (const file of files) {
    await r2.deleteFile(file.r2Url);
  }

  const { error: updateError } = await db.from('generated_content').update({ status: 'deleted' }).eq('id', id);
  if (updateError) {
    throw new Error(`deleteGeneratedContent: ${updateError.message}`);
  }
}
