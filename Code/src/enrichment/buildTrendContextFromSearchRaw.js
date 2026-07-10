// src/enrichment/buildTrendContextFromSearchRaw.js
// Найдено живой проверкой 2026-07-10 (полная цепочка Агент1→2→3→4): факты
// дайджеста Агента 3 часто ссылаются на сырые данные Агента 1 (веб-поиск —
// intelligence_agent.search_results.result.raw = { perplexity, youtube,
// firecrawl }), не только на парсинг Агента 2 (deep_parsing_agent.
// parsing_results.result_json.combined_analysis). У поисковых сырых данных
// нет и не может быть структуры hooks/triggers/offers/viral_reasons — это
// специфика Агента 2 (см. cascade.js buildTrendSection). Вместо того чтобы
// молча возвращать null для этого (частого) случая, строим более простой,
// но реальный content_ideas — единственное поле buildTrendSection, которое
// осмысленно для голого справочного материала без структуры "виральности".
const MAX_IDEAS = 5;

export function buildTrendContextFromSearchRaw(raw) {
  if (!raw) {
    return null;
  }

  const ideas = [];
  if (raw.perplexity?.summary) {
    ideas.push(raw.perplexity.summary);
  }
  for (const video of raw.youtube ?? []) {
    if (video?.title) ideas.push(video.title);
  }
  for (const page of raw.firecrawl ?? []) {
    if (page?.title) ideas.push(page.title);
  }

  if (!ideas.length) {
    return null;
  }

  return { content_ideas: ideas.slice(0, MAX_IDEAS) };
}
