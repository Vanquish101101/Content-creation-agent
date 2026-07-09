// src/generation/generate.js
// Оркестрация генерации: связывает роутер (по типу контента) с записью
// статуса в generated_content (pending → processing → done|error). Это точка
// расширения onJob, подключаемая в src/index.js вместо стаб-заглушки Слайса 1.
import { routeByContentType } from '../router/route.js';
import { createPendingRecord, markProcessing, markDone, markError } from './persistence.js';

export function createGenerationOrchestrator({ db, route = routeByContentType, routeDeps } = {}) {
  async function generateContent(job) {
    const id = await createPendingRecord(db, {
      telegramId: job.telegram_id,
      wizardHash: job.wizard_hash,
      type: job.wizard.content_type
    });

    await markProcessing(db, id);

    try {
      const generate = route(job.wizard.content_type, routeDeps);
      const result = await generate(job.wizard);
      await markDone(db, id, {
        costUsd: result.costUsd,
        metadata: { tier: result.tier, model: result.model, text: result.text },
        r2Url: result.r2Url ?? null
      });
      return { id, status: 'done', ...result };
    } catch (err) {
      await markError(db, id, err.message);
      throw err;
    }
  }

  return { generateContent };
}
