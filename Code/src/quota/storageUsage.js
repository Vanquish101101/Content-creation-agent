// src/quota/storageUsage.js
// Подсчёт использования хранилища R2 — общего (для проверки порога 10 ГБ,
// free tier Cloudflare R2 — Storage/Pricing, «свободные» 10 GB-month на весь
// аккаунт целиком, НЕ на пользователя, см. обсуждение с пользователем
// 2026-07-10) и по каждому telegram_id (чтобы решить, кого предупреждать).
// Простой .select()+JS-агрегация, а не Postgres RPC — проект нигде больше не
// использует .rpc(), а строк в generated_content на данном масштабе немного.

export async function getTotalUsageBytes(db) {
  const { data, error } = await db.from('generated_content').select('size_bytes').eq('status', 'done');
  if (error) {
    throw new Error(`getTotalUsageBytes: ${error.message}`);
  }
  return data.reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
}

export async function getUsageByUser(db) {
  const { data, error } = await db.from('generated_content').select('telegram_id, size_bytes').eq('status', 'done');
  if (error) {
    throw new Error(`getUsageByUser: ${error.message}`);
  }

  const totals = new Map();
  for (const row of data) {
    const bytes = row.size_bytes ?? 0;
    if (bytes === 0) continue;
    totals.set(row.telegram_id, (totals.get(row.telegram_id) ?? 0) + bytes);
  }

  return [...totals.entries()]
    .map(([telegramId, totalBytes]) => ({ telegramId, totalBytes }))
    .sort((a, b) => b.totalBytes - a.totalBytes);
}
