// src/quota/selectWarningCandidate.js
// Кого предупредить, когда общий bucket приближается к лимиту (см.
// checkQuota.js): пользователь, занимающий больше всего места — usageByUser
// уже отсортирован по убыванию (см. storageUsage.getUsageByUser), поэтому
// нужен только первый элемент. Список его файлов возвращается от старых к
// новым — пользователь сам решает, какой старый контент удалить (не мы
// удаляем автоматически, см. Доработки для Агентов 1 и 3, пункт E).

export async function selectWarningCandidate(db, usageByUser) {
  if (usageByUser.length === 0) {
    return null;
  }

  const heaviest = usageByUser[0];
  const { data, error } = await db
    .from('generated_content')
    .select('id, type, r2_url, size_bytes, created_at')
    .eq('telegram_id', heaviest.telegramId)
    .eq('status', 'done')
    .order('created_at');

  if (error) {
    throw new Error(`selectWarningCandidate: ${error.message}`);
  }

  return { telegramId: heaviest.telegramId, totalBytes: heaviest.totalBytes, items: data };
}
