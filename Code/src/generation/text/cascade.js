// src/generation/text/cascade.js
// Каскад генерации текста: дешёвая модель первой попыткой, эскалация на
// основную только при сбое/пустом ответе — тот же принцип «дёшево → дорого»,
// что уже применяют Агент 2 (парсинг) и Агент 3 (эскалация анализа). Текст —
// «простой случай» в терминологии Агента 2 (нет объективного эталона для
// параллельного сравнения) — обычный каскад, без LLM-судьи.
// См. «05. ТЗ», §4.1, «07. Архитектура (Бекенд).md», §8.3.
import { buildTrendParts } from '../buildTrendParts.js';

const CHEAP_MODEL = 'anthropic/claude-haiku-4-5';
const MAIN_MODEL = 'anthropic/claude-sonnet-4-6';

export function createTextCascade({
  apiKey,
  cheapModel = CHEAP_MODEL,
  mainModel = MAIN_MODEL,
  heliconeApiKey,
  fetchImpl = fetch
} = {}) {
  if (!apiKey) {
    throw new Error('createTextCascade: apiKey is required');
  }

  const url = heliconeApiKey
    ? 'https://openrouter.helicone.ai/api/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  async function callModel(model, wizard) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vanquish.content-creation-agent',
        'X-Title': 'Content Creation Agent',
        ...(heliconeApiKey ? { 'Helicone-Auth': `Bearer ${heliconeApiKey}` } : {})
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(wizard) }],
        max_tokens: 800,
        usage: { include: true }
      })
    });

    if (!response.ok) {
      throw new Error(`generateText: LLM HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    const costUsd = data.usage?.cost ?? 0;
    if (!text) {
      throw new Error('generateText: LLM returned empty content');
    }
    return { text, costUsd };
  }

  return async function generateText(wizard) {
    try {
      const result = await callModel(cheapModel, wizard);
      return { ...result, tier: 'cheap', model: cheapModel };
    } catch (cheapErr) {
      console.warn(`[textCascade] cheap tier (${cheapModel}) failed: ${cheapErr.message} — escalating to ${mainModel}`);
      const result = await callModel(mainModel, wizard);
      return { ...result, tier: 'main', model: mainModel, escalatedFrom: cheapModel };
    }
  };
}

function buildPrompt(wizard) {
  return `Ты — копирайтер, который создаёт посты для социальных сетей.

Соцсеть: ${wizard.network}
Тип контента: ${wizard.content_type}
Формат: ${wizard.format}
Стиль подачи: ${wizard.style}
Задача: ${wizard.description}
${buildTrendSection(wizard.trendContext)}
Напиши готовый текст поста под эту задачу. Ответ — только текст поста, без пояснений и заголовков.`;
}

// Обогащение трендами (Слайс 7) — используем структуру референсного
// вирусного контента (хук/триггер/оффер/причина виральности), не его
// буквальное содержание — сохраняем механику, применяем к материалу
// пользователя. См. «02. Анализ», §2.4 (Hook–Retention–Payoff).
function buildTrendSection(trendContext) {
  const parts = buildTrendParts(trendContext);
  if (!parts.length) {
    return '';
  }
  return `\nОриентируйся на структуру похожего успешного контента (сохраняй механику, не копируй дословно):\n${parts.join('\n')}\n`;
}
