// src/generation/generate.js
// Оркестрация генерации: связывает роутер (по типу контента) с записью
// статуса в generated_content (pending → processing → done|error). Это точка
// расширения onJob, подключаемая в src/index.js вместо стаб-заглушки Слайса 1.
import { routeByContentType } from '../router/route.js';
import { createPendingRecord, markProcessing, markDone, markError, markPublishResult, markPendingModeration } from './persistence.js';
import { getTotalUsageBytes, getUsageByUser } from '../quota/storageUsage.js';
import { isOverThreshold, DEFAULT_LIMIT_BYTES } from '../quota/checkQuota.js';
import { selectWarningCandidate } from '../quota/selectWarningCandidate.js';
import { buildContentReport } from '../delivery/buildContentReport.js';

// Проверка квоты хранилища (см. src/quota/*) — только на весь bucket (R2 free
// tier не знает о "пользователях" приложения, см. обсуждение с пользователем
// 2026-07-10), но предупреждается конкретный пользователь, занимающий больше
// всего места. Возвращает null, если предупреждать не о чем (порог не
// достигнут, либо достигнут, но некого предупреждать).
export async function checkQuotaAndWarn(db) {
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
    // limitBytes добавлен явно (найдено живой проверкой 2026-07-10) — раньше
    // порог был только локальной константой, Агент 1 не мог его показать
    // пользователю без догадок/жёсткого хардкода на своей стороне.
    payload: { totalUsageBytes: total, userUsageBytes: candidate.totalBytes, limitBytes: DEFAULT_LIMIT_BYTES, items: candidate.items }
  };
}

export function createGenerationOrchestrator({
  db,
  route = routeByContentType,
  routeDeps,
  enrich,
  notifyAgent1,
  publish,
  r2,
  _checkQuotaAndWarn = checkQuotaAndWarn
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

      // Слайс 8 — публикация, только когда wizard-режим 'publish' (см.
      // DISPATCHABLE_MODES в intake.js). 'content' — как и раньше, публикация
      // вообще не рассматривается.
      let status = 'done';
      let publishReport;

      if (job.mode === 'publish') {
        if (job.moderation_mode) {
          // Пауза перед публикацией — запрос подтверждения у пользователя
          // через Агента 1. Фактическое возобновление после ответа
          // пользователя блокировано отсутствующим каналом согласия от
          // Агента 1 (см. «Доработки для Агентов 1 и 3», пункт E) — та же
          // ситуация, что и с quota_warning выше.
          if (notifyAgent1) {
            // downloadUrl — presigned-ссылка, а не голый ключ R2 (найдено живой
            // проверкой 2026-07-10: пользователь физически не мог открыть
            // r2Url как есть, бакет не публичный).
            const downloadUrl = result.r2Url && r2 ? await r2.getSignedDownloadUrl(result.r2Url).catch(() => null) : null;
            await notifyAgent1({
              telegramId: job.telegram_id,
              messageType: 'moderation_request',
              generatedContentId: id,
              payload: { wizard: job.wizard, r2Url: result.r2Url ?? null, downloadUrl }
            }).catch((err) => console.error('[generate] moderation_request notify failed:', err.message));
          }
          await markPendingModeration(db, id);
          status = 'pending_moderation';
        } else if (publish) {
          try {
            publishReport = await publish({ wizard: job.wizard, r2Url: result.r2Url ?? null });
          } catch (publishErr) {
            publishReport = [{ network: job.wizard.network, accountId: null, status: 'error', reason: publishErr.message }];
          }
          await markPublishResult(db, id, publishReport);
          status = publishReport.some((r) => r.status === 'success') ? 'published' : 'publish_failed';
        } else {
          publishReport = [{ network: job.wizard.network, accountId: null, status: 'error', reason: 'PostMyPost not configured' }];
          await markPublishResult(db, id, publishReport);
          status = 'publish_failed';
        }
      }

      // Слайс 9 — короткий отчёт пользователю через Агента 1. Не отправляется
      // только когда генерация поставлена на паузу ради модерации — там уже
      // ушёл свой moderation_request с превью, дублировать отчётом рано:
      // самого результата (публикации) ещё нет.
      if (status !== 'pending_moderation' && notifyAgent1) {
        try {
          const report = buildContentReport({ wizard: job.wizard, result, publishReport });
          if (result.r2Url && r2) {
            report.downloadUrl = await r2.getSignedDownloadUrl(result.r2Url);
          }
          await notifyAgent1({
            telegramId: job.telegram_id,
            messageType: 'content_ready',
            generatedContentId: id,
            payload: report
          });
        } catch (reportErr) {
          console.error('[generate] content_ready notify failed:', reportErr.message);
        }
      }

      return { id, status, ...result, ...(publishReport ? { publishReport } : {}) };
    } catch (err) {
      await markError(db, id, err.message);
      throw err;
    }
  }

  return { generateContent };
}
