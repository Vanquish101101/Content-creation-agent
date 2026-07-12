// src/generation/audio/buildScript.js
// Обогащение трендами для аудио (2026-07-12, по прямому запросу пользователя)
// — сознательно НЕ тем же способом, что у image/video (buildTrendParts.js +
// компактная приписка к промпту). У аудио wizard.description — не
// генеративный промпт, а буквальный текст, который TTS (Deepgram/ElevenLabs)
// озвучит целиком, слово в слово. Приписка вида "хук: ...; триггеры: ..."
// была бы ПРОЧИТАНА ВСЛУХ — порча результата, а не улучшение.
//
// Вместо этого — дешёвый LLM-шаг (тот же OpenRouter, что и у text-каскада),
// который органично переписывает задачу в один связный текст для озвучки,
// впитывая структуру референса (хук/триггеры/оффер), не перечисляя её
// ярлыками. Best-effort: любая ошибка — откат на исходное описание, аудио
// каскад не должен падать из-за сбоя этого необязательного шага.
import { buildTrendParts } from '../buildTrendParts.js';

const MODEL = 'anthropic/claude-haiku-4-5';

export function createScriptBuilder({ apiKey, model = MODEL, heliconeApiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    throw new Error('createScriptBuilder: apiKey is required');
  }

  const url = heliconeApiKey
    ? 'https://openrouter.helicone.ai/api/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  return async function buildScript(wizard) {
    const parts = buildTrendParts(wizard.trendContext);
    if (!parts.length) {
      return { text: wizard.description, costUsd: 0 };
    }

    const prompt =
      `Перепиши задачу в ОДИН связный текст для озвучки вслух — без заголовков, без списков, ` +
      `без меток вроде "хук:"/"триггеры:", только сам текст, который будет прочитан целиком от начала до конца.\n\n` +
      `Задача: ${wizard.description}\n\n` +
      `Впитай структуру похожего успешного контента, не копируй дословно и не перечисляй как список: ${parts.join('; ')}\n\n` +
      `Ответь только готовым текстом для озвучки, без пояснений и без кавычек.`;

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(heliconeApiKey ? { 'Helicone-Auth': `Bearer ${heliconeApiKey}` } : {})
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600
        })
      });
      if (!response.ok) {
        console.warn(`[buildScript] LLM HTTP ${response.status} — falling back to the raw description`);
        return { text: wizard.description, costUsd: 0 };
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        console.warn('[buildScript] LLM returned empty content — falling back to the raw description');
        return { text: wizard.description, costUsd: 0 };
      }
      return { text, costUsd: data.usage?.cost ?? 0 };
    } catch (err) {
      console.warn(`[buildScript] best-effort script rewrite failed, falling back to the raw description: ${err.message}`);
      return { text: wizard.description, costUsd: 0 };
    }
  };
}
