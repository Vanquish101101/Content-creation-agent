// src/quota/checkQuota.js
// Порог предупреждения о хранилище — общий на весь bucket, не на пользователя
// (см. src/quota/storageUsage.js и обсуждение с пользователем 2026-07-10):
// Cloudflare R2 free tier = 10 GB-month на весь аккаунт. Предупреждаем на 90%,
// чтобы оставался запас на обработку уже начатых генераций, пока пользователь
// принимает решение об удалении старого контента.

export const DEFAULT_LIMIT_BYTES = 10 * 1024 ** 3;
export const DEFAULT_THRESHOLD_RATIO = 0.9;

export function isOverThreshold(totalBytes, { limitBytes = DEFAULT_LIMIT_BYTES, thresholdRatio = DEFAULT_THRESHOLD_RATIO } = {}) {
  return totalBytes >= limitBytes * thresholdRatio;
}
