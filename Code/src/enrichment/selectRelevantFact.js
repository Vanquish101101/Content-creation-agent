// src/enrichment/selectRelevantFact.js
// LLM-фильтр сопоставления темы (Слайс 7, «07. Архитектура», §5.2 — до
// 2026-07-11 не реализован, из дайджеста Агента 3 безусловно брался
// facts[0], даже если он был совершенно не по теме wizard-запроса).
//
// Дешёвый классификатор: получает тему запроса + список утверждений фактов
// дайджеста, возвращает индекс наиболее релевантного, либо null — если
// ни один факт не подходит по теме. Best-effort, как и весь остальной путь
// обогащения (enrichWithTrends.js): любая ошибка (HTTP, сеть, мусор в
// ответе LLM, индекс вне диапазона) — не бросает исключение, возвращает
// null. Намеренно НЕ падает обратно на facts[0] при сбое — именно
// безусловный facts[0] и есть тот баг, который этот модуль призван
// исправить; при сбое классификации лучше не обогащать вовсе, чем
// подставить случайный факт не по теме.
const MODEL = 'anthropic/claude-haiku-4-5';

export function createFactSelector({ apiKey, model = MODEL, heliconeApiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    throw new Error('createFactSelector: apiKey is required');
  }

  const url = heliconeApiKey
    ? 'https://openrouter.helicone.ai/api/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  return async function selectRelevantFact(topic, facts) {
    if (!topic || !facts?.length) {
      return null;
    }

    const list = facts.map((f, i) => `${i}. ${f.statement}`).join('\n');
    const prompt =
      `Тема запроса: "${topic}"\n\n` +
      `Список фактов:\n${list}\n\n` +
      `Какой факт (по номеру) наиболее релевантен теме запроса? Если ни один не подходит по теме, ` +
      `ответь словом "none". Ответь ТОЛЬКО числом или словом "none", без пояснений.`;

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
          max_tokens: 10
        })
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim().toLowerCase();
      if (!text || text.includes('none')) {
        return null;
      }
      const index = Number.parseInt(text, 10);
      if (!Number.isInteger(index) || String(index) !== text || index < 0 || index >= facts.length) {
        return null;
      }
      return facts[index];
    } catch (err) {
      console.warn(`[selectRelevantFact] best-effort classification failed, continuing without a match: ${err.message}`);
      return null;
    }
  };
}
