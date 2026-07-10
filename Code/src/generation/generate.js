// src/generation/generate.js
// Оркестрация генерации: связывает роутер (по типу контента) с записью
// статуса в generated_content (pending → processing → done|error). Это точка
// расширения onJob, подключаемая в src/index.js вместо стаб-заглушки Слайса 1.
import { routeByContentType } from '../router/route.js';
import { createPendingRecord, markProcessing, markDone, markError } from './persistence.js';
import { getTotalUsageBytes, getUsageByUser } from '../quota/storageUsage.js';
import { isOverThreshold } from '../quota/checkQuota.js';
import { selectWarningCandidate } from '../quota/selectWarningCandidate.js';

// Проверка квоты хранилища (см. src/quota/*) — только на весь bucket (R2 free
// tier не знает о "пользователях" приложения, см. обсуждение с пользователем
// 2026-07-10), но предупреждается конкретный пользователь, занимающий больше
// всего места. Возвращает null, если предупреждать не о чем (порог не
// достигнут, либо достигнут, но некого предупреждать).
async function defaultCheckQuotaAndWarn(db) {
  const total = await getTotalUsageBytes(db);
  if (!isOverThreshold(total)) {
    return null;
  }
  const usageByUser = await getUsageByUser(db);
  const candidate = await selectWarningCandidate(db, usageByUser);
  if (!candidate) {
    return null;
  }
  return {
    telegramId: candidate.telegramId,
    messageType: 'quota_warning',
    payload: { totalUsageBytes: total, userUsageBytes: candidate.totalBytes, items: candidate.items }
  };
}

export function createGenerationOrchestrator({
  db,
  route = routeByContentType,
  routeDeps,
  enrich,
  notifyAgent1,
  _checkQuotaAndWarn = defaultCheckQuotaAndWarn
} = {}) {
  async function generateContent(job) {
    const id = await createPendingRecord(db, {
      telegramId: job.telegram_id,
      wizardHash: job.wizard_hash,
      type: job.wizard.content_type
    });

    await markProcessing(db, id);

    try {
      // Обогащение трендами (Слайс 7) — опционально, best-effort: enrich()
      // сам решает, нужно ли оно (wantsTrendEnrichment) и никогда не бросает
      // исключение (см. enrichWithTrends.js) — здесь просто null, если enrich
      // не передан вообще (например, MCP Агента 3 не настроен).
      const trendContext = enrich ? await enrich(job.wizard) : null;
      const generate = route(job.wizard.content_type, routeDeps);
      const result = await generate({ ...job.wizard, telegram_id: job.telegram_id, trendContext });
      await markDone(db, id, {
        costUsd: result.costUsd,
        metadata: { tier: result.tier, model: result.model, text: result.text },
        r2Url: result.r2Url ?? null,
        sizeBytes: result.sizeBytes ?? null
      });

      // Квота хранилища — только когда реально загружен файл (текст ничего
      // не хранит в R2). Ошибка самой проверки не должна портить уже
      // успешную генерацию — гасится здесь, не даём ей всплыть в общий catch.
      if (result.r2Url && notifyAgent1) {
        try {
          const warning = await _checkQuotaAndWarn(db);
          if (warning) {
            await notifyAgent1(warning);
          }
        } catch (quotaErr) {
          console.error('[generate] quota check failed:', quotaErr.message);
        }
      }

      return { id, status: 'done', ...result };
    } catch (err) {
      await markError(db, id, err.message);
      throw err;
    }
  }

  return { generateContent };
}
