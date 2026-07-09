// src/enrichment/classifyTrendRequest.js
// Определяет, просит ли пользователь опору на тренды — wizard сейчас не
// имеет отдельного переключателя (см. открытый вопрос «07. Архитектура»,
// §9), единственный сигнал — свободный текст wizard.description.
//
// MVP — эвристика по ключевым словам (RU/EN), не LLM-классификатор: для
// бинарного решения "нужно ли обогащение" вызывать отдельную LLM ради одного
// да/нет — overkill по стоимости и задержке. Если эвристика на практике
// окажется ненадёжной (много ложных отрицательных) — заменить на LLM-вызов,
// не меняя сигнатуру функции.
const TREND_KEYWORDS = [
  'тренд', 'trend', 'виральн', 'viral', 'выстрел', 'популярн', 'popular',
  'хайп', 'hype', 'заходит', 'вирус'
];

export function wantsTrendEnrichment(description) {
  if (!description) {
    return false;
  }
  const normalized = description.toLowerCase();
  return TREND_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
